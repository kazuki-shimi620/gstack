import { createHash } from 'node:crypto';

import type { MigrationFile } from './file.js';
import {
  completeMigration,
  interruptMigration,
  interruptRollback,
  recordRollback,
  type MigrationHistoryEntry,
} from './history.js';
import { createMigrationRollbackPlan } from './rollback.js';
import type { ApplicationModelSnapshot } from './snapshot.js';
import type { MigrationHistoryRepository } from './storage.js';

export type MigrationRecoveryAction =
  | 'mark_failed'
  | 'mark_rollback_failed'
  | 'complete_apply'
  | 'complete_rollback'
  | 'remove_lock_only';

export interface MigrationLockRecoveryPreview {
  readonly version: string;
  readonly checksum: string;
  readonly status: MigrationHistoryEntry['status'];
  readonly completedOperationCount: number;
  readonly completedRollbackOperationCount: number;
  readonly nextOperationId: string | null;
  readonly action: MigrationRecoveryAction;
  readonly lockChecksum: string;
  readonly fingerprint: string;
  readonly warnings: readonly string[];
}

export interface MigrationRecoveryLock {
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}

export interface MigrationLockRecoveryDependencies {
  readonly history: MigrationHistoryRepository;
  readonly lock: MigrationRecoveryLock;
  readonly now: () => string;
}

export class MigrationLockRecoveryError extends Error {
  public constructor(
    public readonly code:
      | 'MIGRATION_UNLOCK_APPROVAL_INVALID'
      | 'MIGRATION_UNLOCK_HISTORY_CONFLICT'
      | 'MIGRATION_UNLOCK_LOCK_NOT_FOUND'
      | 'MIGRATION_UNLOCK_FAILED',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MigrationLockRecoveryError';
  }
}

export async function prepareMigrationLockRecovery(input: {
  readonly file: MigrationFile;
  readonly history: readonly MigrationHistoryEntry[];
  readonly lock: MigrationRecoveryLock;
  readonly lockKey: string;
  readonly forwardTargetSnapshot: ApplicationModelSnapshot;
}): Promise<MigrationLockRecoveryPreview> {
  const entry = latestMatchingEntry(input.file, input.history);
  if (!(await input.lock.exists(input.lockKey))) {
    throw new MigrationLockRecoveryError(
      'MIGRATION_UNLOCK_LOCK_NOT_FOUND',
      'Migration lock does not exist for the selected Migration.',
    );
  }
  const recovery = recoveryState(
    input.file,
    input.history,
    entry,
    input.forwardTargetSnapshot,
  );
  const lockChecksum = sha256(input.lockKey);
  const fingerprint = sha256(
    JSON.stringify({
      version: entry.version,
      checksum: entry.checksum,
      status: entry.status,
      completedOperationCount: entry.completedOperationCount,
      completedRollbackOperationCount: entry.completedRollbackOperationCount,
      nextOperationId: recovery.nextOperationId,
      action: recovery.action,
      lockChecksum,
    }),
  );
  return deepFreeze({
    version: entry.version,
    checksum: entry.checksum,
    status: entry.status,
    completedOperationCount: entry.completedOperationCount,
    completedRollbackOperationCount: entry.completedRollbackOperationCount,
    ...recovery,
    lockChecksum,
    fingerprint,
    warnings: [
      'Confirm that no Migration process is still running before unlocking.',
      'Unlock does not resume Migration operations automatically.',
    ],
  });
}

export async function recoverMigrationLock(input: {
  readonly file: MigrationFile;
  readonly lockKey: string;
  readonly forwardTargetSnapshot: ApplicationModelSnapshot;
  readonly approval: string;
  readonly dependencies: MigrationLockRecoveryDependencies;
}): Promise<MigrationLockRecoveryPreview> {
  const history = await input.dependencies.history.list();
  const preview = await prepareMigrationLockRecovery({
    file: input.file,
    history,
    lock: input.dependencies.lock,
    lockKey: input.lockKey,
    forwardTargetSnapshot: input.forwardTargetSnapshot,
  });
  if (preview.fingerprint !== input.approval) {
    throw new MigrationLockRecoveryError(
      'MIGRATION_UNLOCK_APPROVAL_INVALID',
      'Migration unlock approval does not match the current recovery state.',
    );
  }
  const entry = latestMatchingEntry(input.file, history);
  const recovered = recoverHistory(
    entry,
    preview,
    input.forwardTargetSnapshot,
    history,
    input.file,
    input.dependencies.now(),
  );
  if (recovered !== entry) await input.dependencies.history.update(recovered);
  try {
    await input.dependencies.lock.remove(input.lockKey);
  } catch (cause: unknown) {
    throw new MigrationLockRecoveryError(
      'MIGRATION_UNLOCK_FAILED',
      'Migration History was recovered, but the Migration lock could not be removed.',
      { cause },
    );
  }
  return preview;
}

function recoveryState(
  file: MigrationFile,
  history: readonly MigrationHistoryEntry[],
  entry: MigrationHistoryEntry,
  forwardTargetSnapshot: ApplicationModelSnapshot,
): {
  readonly action: MigrationRecoveryAction;
  readonly nextOperationId: string | null;
} {
  if (entry.status === 'applying') {
    if (entry.completedOperationCount === entry.operationCount) {
      void forwardTargetSnapshot;
      return { action: 'complete_apply', nextOperationId: null };
    }
    return {
      action: 'mark_failed',
      nextOperationId:
        file.operations[entry.completedOperationCount]?.id ?? null,
    };
  }
  if (entry.status === 'rolling_back') {
    if (entry.completedRollbackOperationCount === entry.operationCount) {
      return { action: 'complete_rollback', nextOperationId: null };
    }
    const target = previousAppliedSnapshot(history, entry.version);
    const rollback = createMigrationRollbackPlan({
      file,
      completedOperationCount: entry.completedOperationCount,
      previousSnapshot: target,
    });
    return {
      action: 'mark_rollback_failed',
      nextOperationId:
        rollback.plan.operations[entry.completedRollbackOperationCount]?.id ??
        null,
    };
  }
  if (
    (entry.status === 'failed' || entry.status === 'rollback_failed') &&
    entry.errorCode === 'MIGRATION_INTERRUPTED'
  ) {
    return {
      action: 'remove_lock_only',
      nextOperationId: entry.failedOperationId,
    };
  }
  conflict();
}

function recoverHistory(
  entry: MigrationHistoryEntry,
  preview: MigrationLockRecoveryPreview,
  forwardTargetSnapshot: ApplicationModelSnapshot,
  history: readonly MigrationHistoryEntry[],
  file: MigrationFile,
  now: string,
): MigrationHistoryEntry {
  switch (preview.action) {
    case 'mark_failed':
      if (!preview.nextOperationId) conflict();
      return interruptMigration(entry, now, preview.nextOperationId);
    case 'mark_rollback_failed':
      if (!preview.nextOperationId) conflict();
      return interruptRollback(entry, preview.nextOperationId);
    case 'complete_apply':
      return completeMigration(entry, now, forwardTargetSnapshot);
    case 'complete_rollback': {
      createMigrationRollbackPlan({
        file,
        completedOperationCount: entry.completedOperationCount,
        previousSnapshot: previousAppliedSnapshot(history, entry.version),
      });
      return recordRollback(entry, now);
    }
    case 'remove_lock_only':
      return entry;
  }
}

function latestMatchingEntry(
  file: MigrationFile,
  history: readonly MigrationHistoryEntry[],
): MigrationHistoryEntry {
  const ordered = [...history].sort((left, right) =>
    left.version.localeCompare(right.version),
  );
  const entry = ordered.at(-1);
  if (
    !entry ||
    entry.version !== file.version ||
    entry.name !== file.name ||
    entry.checksum !== file.checksum ||
    entry.operationCount !== file.operations.length ||
    entry.completedOperationCount > entry.operationCount ||
    entry.completedRollbackOperationCount > entry.operationCount
  )
    conflict();
  return entry;
}

function previousAppliedSnapshot(
  history: readonly MigrationHistoryEntry[],
  version: string,
): ApplicationModelSnapshot | null {
  return (
    [...history]
      .filter((entry) => entry.version < version && entry.status === 'applied')
      .sort((left, right) => right.version.localeCompare(left.version))[0]
      ?.appliedSnapshot ?? null
  );
}

function conflict(): never {
  throw new MigrationLockRecoveryError(
    'MIGRATION_UNLOCK_HISTORY_CONFLICT',
    'Migration History cannot be safely recovered for unlock.',
  );
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
