import { withMigrationLock, type MigrationLock } from './apply.js';
import type {
  MigrationOperationContext,
  MigrationOperationExecutor,
} from './apply-engine.js';
import type { MigrationFile } from './file.js';
import {
  failRollback,
  recordRollback,
  recordRollbackOperationCompleted,
  resumeRollback,
  startRollback,
  type MigrationHistoryEntry,
} from './history.js';
import {
  migrationRollbackFingerprint,
  previewMigrationRollback,
} from './rollback.js';
import type { MigrationHistoryRepository } from './storage.js';
import type { MigrationPlan } from './types.js';

export interface MigrationRollbackRequest {
  readonly file: MigrationFile;
  readonly plan: MigrationPlan;
  readonly providerContext: string;
  readonly approval: string;
  readonly allowDestructive: boolean;
  readonly resume: boolean;
}

export interface MigrationRollbackDependencies {
  readonly history: MigrationHistoryRepository;
  readonly lock: MigrationLock;
  readonly executor: MigrationOperationExecutor;
  readonly now: () => string;
}

export interface MigrationRollbackResult {
  readonly outcome: 'rolled_back';
  readonly history: MigrationHistoryEntry;
}

export class MigrationRollbackExecutionError extends Error {
  public constructor(
    public readonly code:
      | 'MIGRATION_ROLLBACK_APPROVAL_INVALID'
      | 'MIGRATION_ROLLBACK_DESTRUCTIVE_NOT_ALLOWED'
      | 'MIGRATION_ROLLBACK_HISTORY_CONFLICT'
      | 'MIGRATION_ROLLBACK_IN_PROGRESS'
      | 'MIGRATION_ROLLBACK_RESUME_REQUIRED'
      | 'MIGRATION_ROLLBACK_PLAN_NOT_APPLICABLE'
      | 'PROVIDER_OPERATION_FAILED',
    message: string,
    public readonly operationId: string | null = null,
  ) {
    super(message);
    this.name = 'MigrationRollbackExecutionError';
  }
}

export async function rollbackMigration(
  request: MigrationRollbackRequest,
  dependencies: MigrationRollbackDependencies,
): Promise<MigrationRollbackResult> {
  if (!request.providerContext.trim()) historyConflict();
  if (
    !request.plan.applicable ||
    request.plan.capabilityStatus !== 'supported'
  ) {
    throw new MigrationRollbackExecutionError(
      'MIGRATION_ROLLBACK_PLAN_NOT_APPLICABLE',
      'Migration Rollback Plan is not applicable.',
    );
  }
  if (request.plan.destructive && !request.allowDestructive) {
    throw new MigrationRollbackExecutionError(
      'MIGRATION_ROLLBACK_DESTRUCTIVE_NOT_ALLOWED',
      'Destructive Migration Rollback requires explicit approval.',
    );
  }

  const initialHistory = await dependencies.history.list();
  const initialPreview = previewMigrationRollback({
    file: request.file,
    history: initialHistory,
  });
  assertPlan(initialPreview.plan, request.plan);
  const fingerprint = migrationRollbackFingerprint({
    ...initialPreview,
    plan: request.plan,
  });
  if (request.approval !== fingerprint) {
    throw new MigrationRollbackExecutionError(
      'MIGRATION_ROLLBACK_APPROVAL_INVALID',
      'Migration Rollback approval does not match the evaluated Plan.',
    );
  }

  return withMigrationLock(
    dependencies.lock,
    `${request.providerContext}:${request.file.version}`,
    async () => {
      const history = await dependencies.history.list();
      const preview = previewMigrationRollback({ file: request.file, history });
      assertPlan(preview.plan, request.plan);
      if (
        migrationRollbackFingerprint({ ...preview, plan: request.plan }) !==
        fingerprint
      ) {
        historyConflict();
      }
      const source = history.find(
        ({ version }) => version === request.file.version,
      );
      if (!source) historyConflict();
      let entry: MigrationHistoryEntry;
      if (source.status === 'applied') {
        if (request.resume) historyConflict();
        entry = startRollback(source);
      } else if (source.status === 'rollback_failed') {
        if (!request.resume) {
          throw new MigrationRollbackExecutionError(
            'MIGRATION_ROLLBACK_RESUME_REQUIRED',
            'Failed Migration Rollback requires an explicit resume request.',
          );
        }
        entry = resumeRollback(source);
      } else if (source.status === 'rolling_back') {
        throw new MigrationRollbackExecutionError(
          'MIGRATION_ROLLBACK_IN_PROGRESS',
          'Migration Rollback is already in progress.',
        );
      } else {
        historyConflict();
      }
      await dependencies.history.update(entry);

      for (
        let index = entry.completedRollbackOperationCount;
        index < request.plan.operations.length;
        index += 1
      ) {
        const operation = request.plan.operations[index];
        if (!operation) historyConflict();
        const context: MigrationOperationContext = Object.freeze({
          migrationVersion: request.file.version,
          migrationChecksum: fingerprint,
          operationId: operation.id,
          idempotencyKey: `${fingerprint}:${operation.id}`,
        });
        try {
          await dependencies.executor.execute(operation, context);
        } catch {
          entry = failRollback(
            entry,
            operation.id,
            'PROVIDER_OPERATION_FAILED',
          );
          await dependencies.history.update(entry);
          throw new MigrationRollbackExecutionError(
            'PROVIDER_OPERATION_FAILED',
            'Provider failed to execute a Migration Rollback Operation.',
            operation.id,
          );
        }
        entry = recordRollbackOperationCompleted(entry);
        await dependencies.history.update(entry);
      }
      entry = recordRollback(entry, dependencies.now());
      await dependencies.history.update(entry);
      return Object.freeze({ outcome: 'rolled_back', history: entry });
    },
  );
}

function assertPlan(expected: MigrationPlan, actual: MigrationPlan): void {
  const expectedOperations = JSON.stringify(expected.operations);
  const actualOperations = JSON.stringify(
    actual.operations.map((operation) => ({
      ...operation,
      capability: 'not_evaluated',
    })),
  );
  if (expectedOperations !== actualOperations) historyConflict();
}

function historyConflict(): never {
  throw new MigrationRollbackExecutionError(
    'MIGRATION_ROLLBACK_HISTORY_CONFLICT',
    'Migration Rollback state does not match the approved Plan.',
  );
}
