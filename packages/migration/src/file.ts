import { createHash } from 'node:crypto';

import type { MigrationOperation } from './types.js';

export interface MigrationFilePayload {
  readonly formatVersion: 1;
  readonly version: string;
  readonly name: string;
  readonly operations: readonly MigrationOperation[];
}

export interface MigrationFile extends MigrationFilePayload {
  readonly checksum: string;
}

const VERSION_PATTERN = /^\d{8}_\d{6}$/u;
const NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u;

export function createMigrationFile(
  version: string,
  name: string,
  operations: readonly MigrationOperation[],
): MigrationFile {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error('Migration version must use YYYYMMDD_NNNNNN format.');
  }
  if (!NAME_PATTERN.test(name)) {
    throw new Error('Migration name must use snake_case.');
  }
  const payload: MigrationFilePayload = {
    formatVersion: 1,
    version,
    name,
    operations: [...operations],
  };
  return deepFreeze({ ...payload, checksum: migrationChecksum(payload) });
}

export function migrationChecksum(payload: MigrationFilePayload): string {
  return createHash('sha256')
    .update(canonicalJson(payload), 'utf8')
    .digest('hex');
}

export function verifyMigrationChecksum(file: MigrationFile): boolean {
  const { checksum, ...payload } = file;
  return checksum === migrationChecksum(payload);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
