import type { ApplicationModel } from '@gstack/application';

import type { MigrationFile } from './file.js';

export type MigrationStatus =
  'pending' | 'applying' | 'applied' | 'failed' | 'rolled_back';

export interface MigrationHistoryEntry {
  readonly version: string;
  readonly name: string;
  readonly checksum: string;
  readonly status: MigrationStatus;
  readonly operationCount: number;
  readonly completedOperationCount: number;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly rolledBackAt: string | null;
  readonly failedOperationId: string | null;
  readonly errorCode: string | null;
  readonly appliedSnapshot: ApplicationModel | null;
}

export class MigrationHistoryError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'MigrationHistoryError';
  }
}

export function createPendingHistory(
  file: MigrationFile,
): MigrationHistoryEntry {
  return freeze({
    version: file.version,
    name: file.name,
    checksum: file.checksum,
    status: 'pending',
    operationCount: file.operations.length,
    completedOperationCount: 0,
    startedAt: null,
    completedAt: null,
    rolledBackAt: null,
    failedOperationId: null,
    errorCode: null,
    appliedSnapshot: null,
  });
}

export function startMigration(
  entry: MigrationHistoryEntry,
  startedAt: string,
): MigrationHistoryEntry {
  requireStatus(entry, 'pending');
  isoUtc(startedAt);
  return freeze({ ...entry, status: 'applying', startedAt });
}

export function recordOperationCompleted(
  entry: MigrationHistoryEntry,
): MigrationHistoryEntry {
  requireStatus(entry, 'applying');
  if (entry.completedOperationCount >= entry.operationCount) {
    throw new MigrationHistoryError(
      'All Migration Operations are already complete.',
    );
  }
  return freeze({
    ...entry,
    completedOperationCount: entry.completedOperationCount + 1,
  });
}

export function completeMigration(
  entry: MigrationHistoryEntry,
  completedAt: string,
  appliedSnapshot: ApplicationModel,
): MigrationHistoryEntry {
  requireStatus(entry, 'applying');
  isoUtc(completedAt);
  if (entry.completedOperationCount !== entry.operationCount) {
    throw new MigrationHistoryError(
      'Migration cannot be applied before all Operations complete.',
    );
  }
  return freeze({
    ...entry,
    status: 'applied',
    completedAt,
    appliedSnapshot,
  });
}

export function failMigration(
  entry: MigrationHistoryEntry,
  completedAt: string,
  failedOperationId: string,
  errorCode: string,
): MigrationHistoryEntry {
  requireStatus(entry, 'applying');
  isoUtc(completedAt);
  if (!failedOperationId || !errorCode) {
    throw new MigrationHistoryError(
      'Failed Migration requires an Operation ID and safe error code.',
    );
  }
  return freeze({
    ...entry,
    status: 'failed',
    completedAt,
    failedOperationId,
    errorCode,
  });
}

export function recordRollback(
  entry: MigrationHistoryEntry,
  completedAt: string,
): MigrationHistoryEntry {
  requireStatus(entry, 'applied');
  isoUtc(completedAt);
  return freeze({ ...entry, status: 'rolled_back', rolledBackAt: completedAt });
}

function requireStatus(
  entry: MigrationHistoryEntry,
  expected: MigrationStatus,
): void {
  if (entry.status !== expected) {
    throw new MigrationHistoryError(
      `Migration status must be ${expected}, received ${entry.status}.`,
    );
  }
}

function isoUtc(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) {
    throw new MigrationHistoryError(
      'Migration timestamp must be ISO 8601 UTC.',
    );
  }
}

function freeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}
