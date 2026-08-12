import { describe, expect, it } from 'vitest';

import {
  createMigrationFile,
  migrationChecksum,
  verifyMigrationChecksum,
} from './file.js';
import type { CreateModelOperation } from './types.js';

const operation: CreateModelOperation = {
  id: 'create_model:users:users',
  type: 'create_model',
  model: 'users',
  definition: {
    name: 'users',
    displayName: 'User',
    description: null,
    primaryKey: 'id',
    fields: [],
    indexes: [],
    relations: [],
    api: { resource: null, create: false, update: false, delete: false },
    ui: { list: { columns: [] }, form: { fields: [] } },
    permissions: { read: [], create: [], update: [], delete: [] },
    workflow: { enabled: false },
    events: { enabled: false },
    metadata: {},
  },
  risk: 'safe',
  destructive: false,
  reversible: true,
  capability: 'not_evaluated',
};

describe('Migration File', () => {
  it('canonical payloadからSHA-256 checksumを生成する', () => {
    const file = createMigrationFile('20260812_000001', 'create_users', [
      operation,
    ]);
    expect(file.checksum).toMatch(/^[a-f0-9]{64}$/u);
    expect(verifyMigrationChecksum(file)).toBe(true);
    const first = file.operations[0];
    expect(first?.type).toBe('create_model');
    expect(
      first?.type === 'create_model' && Object.isFrozen(first.definition),
    ).toBe(true);
  });

  it('object key順序に依存せず同じchecksumを返す', () => {
    const first = migrationChecksum({
      formatVersion: 1,
      version: '20260812_000001',
      name: 'create_users',
      operations: [operation],
    });
    const reordered = migrationChecksum({
      operations: [operation],
      name: 'create_users',
      version: '20260812_000001',
      formatVersion: 1,
    });
    expect(first).toBe(reordered);
  });

  it('payload改変を検出する', () => {
    const file = createMigrationFile('20260812_000001', 'create_users', [
      operation,
    ]);
    expect(verifyMigrationChecksum({ ...file, name: 'changed_name' })).toBe(
      false,
    );
  });

  it.each([
    ['2026-08-12', 'create_users', 'YYYYMMDD_NNNNNN'],
    ['20260812_000001', 'CreateUsers', 'snake_case'],
  ])('versionとnameの形式を検証する', (version, name, expected) => {
    expect(() => createMigrationFile(version, name, [])).toThrow(expected);
  });
});
