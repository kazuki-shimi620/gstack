import type { MigrationHistoryEntry, MigrationStatus } from './history.js';
import { parseApplicationModelSnapshot } from './snapshot.js';

const KEYS = [
  'appliedSnapshot',
  'checksum',
  'completedAt',
  'completedOperationCount',
  'completedRollbackOperationCount',
  'errorCode',
  'failedOperationId',
  'name',
  'operationCount',
  'rolledBackAt',
  'startedAt',
  'status',
  'version',
] as const;
const STATUSES = new Set<MigrationStatus>([
  'pending',
  'applying',
  'applied',
  'failed',
  'rolling_back',
  'rollback_failed',
  'rolled_back',
]);
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

export class MigrationHistoryJsonError extends Error {
  public constructor(
    public readonly code:
      'MIGRATION_HISTORY_JSON_INVALID' | 'MIGRATION_HISTORY_FORMAT_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'MigrationHistoryJsonError';
  }
}

export function serializeMigrationHistory(
  entry: MigrationHistoryEntry,
): string {
  validate(entry);
  return JSON.stringify(entry);
}

export function parseMigrationHistory(content: string): MigrationHistoryEntry {
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch {
    throw new MigrationHistoryJsonError(
      'MIGRATION_HISTORY_JSON_INVALID',
      'Migration History JSON is invalid.',
    );
  }
  validate(value);
  return deepFreeze(value);
}

function validate(value: unknown): asserts value is MigrationHistoryEntry {
  if (
    !record(value) ||
    Object.keys(value).sort().join(',') !== [...KEYS].sort().join(',')
  )
    invalid();
  if (
    typeof value.version !== 'string' ||
    !/^\d{8}_\d{6}$/u.test(value.version) ||
    typeof value.name !== 'string' ||
    !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(value.name) ||
    typeof value.checksum !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value.checksum) ||
    typeof value.status !== 'string' ||
    !STATUSES.has(value.status as MigrationStatus) ||
    !integer(value.operationCount) ||
    !integer(value.completedOperationCount) ||
    !integer(value.completedRollbackOperationCount) ||
    (value.completedOperationCount as number) >
      (value.operationCount as number) ||
    !nullableUtc(value.startedAt) ||
    !nullableUtc(value.completedAt) ||
    !nullableUtc(value.rolledBackAt) ||
    !nullableText(value.failedOperationId) ||
    !nullableText(value.errorCode)
  )
    invalid();
  const status = value.status as MigrationStatus;
  const count = value.operationCount as number;
  const completed = value.completedOperationCount as number;
  const rollbackCompleted = value.completedRollbackOperationCount as number;
  if (value.appliedSnapshot !== null) {
    try {
      parseApplicationModelSnapshot(JSON.stringify(value.appliedSnapshot));
    } catch {
      invalid();
    }
  }
  const noFailure =
    value.failedOperationId === null && value.errorCode === null;
  if (
    status === 'pending' &&
    !(
      completed === 0 &&
      rollbackCompleted === 0 &&
      value.startedAt === null &&
      value.completedAt === null &&
      value.rolledBackAt === null &&
      noFailure &&
      value.appliedSnapshot === null &&
      rollbackCompleted === 0
    )
  )
    invalid();
  if (
    status === 'applying' &&
    !(
      value.startedAt !== null &&
      value.completedAt === null &&
      value.rolledBackAt === null &&
      noFailure &&
      value.appliedSnapshot === null
    )
  )
    invalid();
  if (
    status === 'failed' &&
    !(
      value.startedAt !== null &&
      value.completedAt !== null &&
      value.rolledBackAt === null &&
      value.failedOperationId !== null &&
      value.errorCode !== null &&
      value.appliedSnapshot === null &&
      completed < count &&
      rollbackCompleted === 0
    )
  )
    invalid();
  if (
    status === 'applied' &&
    !(
      value.startedAt !== null &&
      value.completedAt !== null &&
      value.rolledBackAt === null &&
      noFailure &&
      value.appliedSnapshot !== null &&
      completed === count &&
      rollbackCompleted === 0
    )
  )
    invalid();
  if (
    status === 'rolling_back' &&
    !(
      value.startedAt !== null &&
      value.completedAt !== null &&
      value.rolledBackAt === null &&
      noFailure &&
      value.appliedSnapshot !== null &&
      completed === count &&
      rollbackCompleted <= count
    )
  )
    invalid();
  if (
    status === 'rollback_failed' &&
    !(
      value.startedAt !== null &&
      value.completedAt !== null &&
      value.rolledBackAt === null &&
      value.failedOperationId !== null &&
      value.errorCode !== null &&
      value.appliedSnapshot !== null &&
      completed === count &&
      rollbackCompleted < count
    )
  )
    invalid();
  if (
    status === 'rolled_back' &&
    !(
      value.startedAt !== null &&
      value.completedAt !== null &&
      value.rolledBackAt !== null &&
      noFailure &&
      value.appliedSnapshot !== null &&
      completed === count &&
      rollbackCompleted === count
    )
  )
    invalid();
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function integer(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
function nullableText(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length > 0);
}
function nullableUtc(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && UTC.test(value));
}
function invalid(): never {
  throw new MigrationHistoryJsonError(
    'MIGRATION_HISTORY_FORMAT_INVALID',
    'Migration History format is invalid.',
  );
}
function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
