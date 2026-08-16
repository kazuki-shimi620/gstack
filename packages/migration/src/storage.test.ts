import { describe, expect, it, vi } from 'vitest';

import type { MigrationHistoryEntry } from './history.js';
import {
  MigrationHistoryRepository,
  type MigrationHistoryStorage,
} from './storage.js';

const entry = (
  version: string,
  checksum = 'a'.repeat(64),
): MigrationHistoryEntry => ({
  version,
  name: 'migration',
  checksum,
  status: 'pending',
  operationCount: 0,
  completedOperationCount: 0,
  completedRollbackOperationCount: 0,
  startedAt: null,
  completedAt: null,
  rolledBackAt: null,
  failedOperationId: null,
  errorCode: null,
  appliedSnapshot: null,
});

function fakeStorage(initial: readonly MigrationHistoryEntry[] = []) {
  const values = new Map(initial.map((value) => [value.version, value]));
  const storage: MigrationHistoryStorage = {
    get: vi.fn(async (version) => values.get(version) ?? null),
    list: vi.fn(async () => [...values.values()]),
    save: vi.fn(async (value) => {
      values.set(value.version, value);
    }),
  };
  return { storage, values };
}

describe('MigrationHistoryRepository', () => {
  it('Storage結果をversion順へ正規化する', async () => {
    const { storage } = fakeStorage([
      entry('20260812_000002'),
      entry('20260812_000001'),
    ]);
    const repository = new MigrationHistoryRepository(storage);
    await expect(repository.list()).resolves.toEqual([
      expect.objectContaining({ version: '20260812_000001' }),
      expect.objectContaining({ version: '20260812_000002' }),
    ]);
  });

  it('新規versionだけをcreateする', async () => {
    const { storage, values } = fakeStorage();
    const repository = new MigrationHistoryRepository(storage);
    await repository.create(entry('20260812_000001'));
    expect(values.has('20260812_000001')).toBe(true);
    await expect(repository.create(entry('20260812_000001'))).rejects.toThrow(
      'already exists',
    );
  });

  it('既存entryだけを同じchecksumでupdateする', async () => {
    const original = entry('20260812_000001');
    const { storage } = fakeStorage([original]);
    const repository = new MigrationHistoryRepository(storage);
    await expect(
      repository.update({ ...original, status: 'applying' }),
    ).resolves.toBeUndefined();
    await expect(
      repository.update({ ...original, checksum: 'b'.repeat(64) }),
    ).rejects.toThrow('checksum cannot change');
    await expect(repository.update(entry('20260812_000002'))).rejects.toThrow(
      'does not exist',
    );
  });
});
