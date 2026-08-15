import type { MigrationFile } from './file.js';
import { verifyMigrationChecksum } from './file.js';
import { createMigrationPlanPreservingOrder, operationId } from './plan.js';
import { snapshotChecksum, type ApplicationModelSnapshot } from './snapshot.js';
import type { MigrationOperation, MigrationPlan } from './types.js';
import type { MigrationHistoryEntry } from './history.js';

export interface MigrationRollbackPlan {
  readonly sourceVersion: string;
  readonly sourceChecksum: string;
  readonly completedOperationCount: number;
  readonly targetSnapshot: ApplicationModelSnapshot | null;
  readonly plan: MigrationPlan;
}

export interface MigrationRollbackPreview extends MigrationRollbackPlan {
  readonly targetVersion: string | null;
}

export class MigrationRollbackError extends Error {
  public constructor(
    public readonly code:
      | 'MIGRATION_CHECKSUM_INVALID'
      | 'MIGRATION_ROLLBACK_PROGRESS_INVALID'
      | 'MIGRATION_ROLLBACK_SNAPSHOT_INVALID'
      | 'MIGRATION_ROLLBACK_HISTORY_CONFLICT'
      | 'MIGRATION_ROLLBACK_NOT_LATEST'
      | 'MIGRATION_IRREVERSIBLE',
    message: string,
    public readonly operationId: string | null = null,
  ) {
    super(message);
    this.name = 'MigrationRollbackError';
  }
}

export function previewMigrationRollback(input: {
  readonly file: MigrationFile;
  readonly history: readonly MigrationHistoryEntry[];
}): MigrationRollbackPreview {
  const ordered = [...input.history].sort((left, right) =>
    left.version.localeCompare(right.version),
  );
  const sourceIndex = ordered.findIndex(
    ({ version }) => version === input.file.version,
  );
  const source = ordered[sourceIndex];
  if (!source) {
    throw new MigrationRollbackError(
      'MIGRATION_ROLLBACK_HISTORY_CONFLICT',
      'Rollback source Migration does not exist in History.',
    );
  }
  if (sourceIndex !== ordered.length - 1) {
    throw new MigrationRollbackError(
      'MIGRATION_ROLLBACK_NOT_LATEST',
      'Rollback source must be the latest Migration History attempt.',
    );
  }
  if (
    source.status !== 'applied' ||
    source.version !== input.file.version ||
    source.name !== input.file.name ||
    source.checksum !== input.file.checksum ||
    source.operationCount !== input.file.operations.length ||
    source.completedOperationCount !== source.operationCount ||
    source.appliedSnapshot === null
  ) {
    throw new MigrationRollbackError(
      'MIGRATION_ROLLBACK_HISTORY_CONFLICT',
      'Rollback source does not match an applied Migration File.',
    );
  }
  const previous = ordered
    .slice(0, sourceIndex)
    .reverse()
    .find(({ status }) => status === 'applied');
  if (previous && previous.appliedSnapshot === null) {
    throw new MigrationRollbackError(
      'MIGRATION_ROLLBACK_HISTORY_CONFLICT',
      'Previous applied Migration snapshot is missing.',
    );
  }
  return deepFreeze({
    ...createMigrationRollbackPlan({
      file: input.file,
      completedOperationCount: source.completedOperationCount,
      previousSnapshot: previous?.appliedSnapshot ?? null,
    }),
    targetVersion: previous?.version ?? null,
  });
}

export function createMigrationRollbackPlan(input: {
  readonly file: MigrationFile;
  readonly completedOperationCount: number;
  readonly previousSnapshot: ApplicationModelSnapshot | null;
}): MigrationRollbackPlan {
  if (!verifyMigrationChecksum(input.file)) {
    throw new MigrationRollbackError(
      'MIGRATION_CHECKSUM_INVALID',
      'Rollback requires a valid Migration File checksum.',
    );
  }
  if (
    !Number.isSafeInteger(input.completedOperationCount) ||
    input.completedOperationCount < 0 ||
    input.completedOperationCount > input.file.operations.length
  ) {
    throw new MigrationRollbackError(
      'MIGRATION_ROLLBACK_PROGRESS_INVALID',
      'Rollback progress does not match the Migration File.',
    );
  }
  validatePreviousSnapshot(input.previousSnapshot);
  const completed = input.file.operations.slice(
    0,
    input.completedOperationCount,
  );
  const irreversible = completed.find((operation) => !operation.reversible);
  if (irreversible) {
    throw new MigrationRollbackError(
      'MIGRATION_IRREVERSIBLE',
      'Migration contains a completed Operation that cannot be safely rolled back.',
      irreversible.id,
    );
  }
  const operations = [...completed].reverse().map(invertOperation);
  return deepFreeze({
    sourceVersion: input.file.version,
    sourceChecksum: input.file.checksum,
    completedOperationCount: input.completedOperationCount,
    targetSnapshot: input.previousSnapshot,
    plan: createMigrationPlanPreservingOrder(operations),
  });
}

function invertOperation(operation: MigrationOperation): MigrationOperation {
  switch (operation.type) {
    case 'create_model':
      return {
        id: operationId('drop_model', operation.model),
        type: 'drop_model',
        model: operation.model,
        previous: operation.definition,
        risk: 'destructive',
        destructive: true,
        reversible: false,
        capability: 'not_evaluated',
      };
    case 'add_column':
      return {
        id: operationId('drop_column', operation.model, operation.column.name),
        type: 'drop_column',
        model: operation.model,
        previous: operation.column,
        risk: 'destructive',
        destructive: true,
        reversible: false,
        capability: 'not_evaluated',
      };
    case 'rename_column':
      return {
        id: operationId(
          'rename_column',
          operation.model,
          `${operation.to}->${operation.from}`,
        ),
        type: 'rename_column',
        model: operation.model,
        from: operation.to,
        to: operation.from,
        risk: 'caution',
        destructive: false,
        reversible: true,
        capability: 'not_evaluated',
      };
    case 'add_index':
      return {
        id: operationId('drop_index', operation.model, operation.index.name),
        type: 'drop_index',
        model: operation.model,
        previous: operation.index,
        risk: 'safe',
        destructive: false,
        reversible: true,
        capability: 'not_evaluated',
      };
    case 'drop_index':
      return {
        id: operationId('add_index', operation.model, operation.previous.name),
        type: 'add_index',
        model: operation.model,
        index: operation.previous,
        risk: 'safe',
        destructive: false,
        reversible: true,
        capability: 'not_evaluated',
      };
    case 'add_relation':
      return {
        id: operationId(
          'drop_relation',
          operation.model,
          operation.relation.name,
        ),
        type: 'drop_relation',
        model: operation.model,
        previous: operation.relation,
        risk: 'safe',
        destructive: false,
        reversible: true,
        capability: 'not_evaluated',
      };
    case 'drop_relation':
      return {
        id: operationId(
          'add_relation',
          operation.model,
          operation.previous.name,
        ),
        type: 'add_relation',
        model: operation.model,
        relation: operation.previous,
        risk: 'safe',
        destructive: false,
        reversible: true,
        capability: 'not_evaluated',
      };
    case 'drop_model':
    case 'drop_column':
    case 'alter_column':
      throw new MigrationRollbackError(
        'MIGRATION_IRREVERSIBLE',
        'Migration Operation cannot be safely rolled back.',
        operation.id,
      );
  }
}

function validatePreviousSnapshot(
  snapshot: ApplicationModelSnapshot | null,
): void {
  if (snapshot === null) return;
  if (
    snapshot.formatVersion !== 1 ||
    snapshot.checksum !==
      snapshotChecksum({
        formatVersion: snapshot.formatVersion,
        application: snapshot.application,
      })
  ) {
    throw new MigrationRollbackError(
      'MIGRATION_ROLLBACK_SNAPSHOT_INVALID',
      'Rollback target snapshot is invalid.',
    );
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
