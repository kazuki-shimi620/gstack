import type { MigrationApplyApproval, MigrationLock } from './apply.js';
import { validateMigrationApply, withMigrationLock } from './apply.js';
import type { MigrationFile } from './file.js';
import {
  completeMigration,
  createPendingHistory,
  failMigration,
  recordOperationCompleted,
  resumeMigration,
  startMigration,
  type MigrationHistoryEntry,
} from './history.js';
import type { ApplicationModelSnapshot } from './snapshot.js';
import type { MigrationHistoryRepository } from './storage.js';
import type { MigrationOperation, MigrationPlan } from './types.js';

export interface MigrationOperationContext {
  readonly migrationVersion: string;
  readonly migrationChecksum: string;
  readonly operationId: string;
  readonly idempotencyKey: string;
}

export interface MigrationOperationExecutor {
  execute(
    operation: MigrationOperation,
    context: MigrationOperationContext,
  ): Promise<void>;
}

export interface MigrationApplyRequest {
  readonly file: MigrationFile;
  readonly plan: MigrationPlan;
  readonly targetSnapshot: ApplicationModelSnapshot;
  readonly providerContext: string;
  readonly approval: MigrationApplyApproval;
  readonly resume: boolean;
}

export interface MigrationApplyDependencies {
  readonly history: MigrationHistoryRepository;
  readonly lock: MigrationLock;
  readonly executor: MigrationOperationExecutor;
  readonly now: () => string;
}

export interface MigrationApplyResult {
  readonly outcome: 'applied' | 'skipped';
  readonly history: MigrationHistoryEntry;
}

export class MigrationExecutionError extends Error {
  public constructor(
    public readonly code:
      | 'MIGRATION_ALREADY_IN_PROGRESS'
      | 'MIGRATION_HISTORY_CONFLICT'
      | 'MIGRATION_RESUME_REQUIRED'
      | 'PROVIDER_OPERATION_FAILED',
    message: string,
    public readonly operationId: string | null = null,
  ) {
    super(message);
    this.name = 'MigrationExecutionError';
  }
}

export async function applyMigration(
  request: MigrationApplyRequest,
  dependencies: MigrationApplyDependencies,
): Promise<MigrationApplyResult> {
  const preflight = validateMigrationApply(
    request.file,
    request.plan,
    request.providerContext,
    request.approval,
  );

  return withMigrationLock(dependencies.lock, preflight.lockKey, async () => {
    let entry = await prepareHistory(request, dependencies);
    if (entry.status === 'applied') {
      return Object.freeze({ outcome: 'skipped', history: entry });
    }

    for (
      let index = entry.completedOperationCount;
      index < request.plan.operations.length;
      index += 1
    ) {
      const operation = request.plan.operations[index];
      if (!operation) {
        throw new MigrationExecutionError(
          'MIGRATION_HISTORY_CONFLICT',
          'Migration History progress does not match the Plan.',
        );
      }
      try {
        await dependencies.executor.execute(
          operation,
          Object.freeze({
            migrationVersion: request.file.version,
            migrationChecksum: request.file.checksum,
            operationId: operation.id,
            idempotencyKey: `${request.file.checksum}:${operation.id}`,
          }),
        );
      } catch {
        entry = failMigration(
          entry,
          dependencies.now(),
          operation.id,
          'PROVIDER_OPERATION_FAILED',
        );
        await dependencies.history.update(entry);
        throw new MigrationExecutionError(
          'PROVIDER_OPERATION_FAILED',
          'Provider failed to apply a Migration Operation.',
          operation.id,
        );
      }
      entry = recordOperationCompleted(entry);
      await dependencies.history.update(entry);
    }

    entry = completeMigration(
      entry,
      dependencies.now(),
      request.targetSnapshot,
    );
    await dependencies.history.update(entry);
    return Object.freeze({ outcome: 'applied', history: entry });
  });
}

async function prepareHistory(
  request: MigrationApplyRequest,
  dependencies: MigrationApplyDependencies,
): Promise<MigrationHistoryEntry> {
  const existing = await dependencies.history.get(request.file.version);
  if (!existing) {
    const pending = createPendingHistory(request.file);
    await dependencies.history.create(pending);
    const applying = startMigration(pending, dependencies.now());
    await dependencies.history.update(applying);
    return applying;
  }
  if (existing.checksum !== request.file.checksum) {
    throw new MigrationExecutionError(
      'MIGRATION_HISTORY_CONFLICT',
      'Migration History checksum does not match the Migration File.',
    );
  }
  if (existing.status === 'applied') return existing;
  if (existing.status === 'applying') {
    throw new MigrationExecutionError(
      'MIGRATION_ALREADY_IN_PROGRESS',
      'Migration is already applying.',
    );
  }
  if (existing.status === 'failed') {
    if (!request.resume) {
      throw new MigrationExecutionError(
        'MIGRATION_RESUME_REQUIRED',
        'Failed Migration requires an explicit resume request.',
      );
    }
    const applying = resumeMigration(
      existing,
      request.file,
      dependencies.now(),
    );
    await dependencies.history.update(applying);
    return applying;
  }
  throw new MigrationExecutionError(
    'MIGRATION_HISTORY_CONFLICT',
    `Migration cannot apply from History status: ${existing.status}`,
  );
}
