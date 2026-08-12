import { describe, expect, it } from 'vitest';

import type { ApplicationModel } from '@gstack/application';

import { createMigrationFile } from './file.js';
import {
  completeMigration,
  createPendingHistory,
  failMigration,
  startMigration,
} from './history.js';
import type { MigrationHistoryEntry } from './history.js';
import { MigrationReadService } from './read.js';
import { createApplicationModelSnapshot } from './snapshot.js';
import {
  MigrationHistoryRepository,
  type MigrationHistoryStorage,
} from './storage.js';

const empty: ApplicationModel = {
  schemaVersion: 1,
  name: 'app',
  models: [],
  metadata: {},
};

describe('Migration Read Service', () => {
  it('Historyの状態と最新attempt／appliedを集約する', async () => {
    const first = applied('20260812_000001', empty);
    const secondFile = createMigrationFile('20260812_000002', 'second', []);
    const second = failMigration(
      startMigration(createPendingHistory(secondFile), '2026-08-12T02:00:00Z'),
      '2026-08-12T02:00:01Z',
      'create_model:users:users',
      'PROVIDER_OPERATION_FAILED',
    );
    const reader = createService([second, first]);

    await expect(reader.getStatus()).resolves.toMatchObject({
      totalCount: 2,
      appliedCount: 1,
      failedCount: 1,
      latestAttempt: { version: '20260812_000002', status: 'failed' },
      latestApplied: { version: '20260812_000001', status: 'applied' },
    });
    await expect(reader.listHistory()).resolves.toEqual([first, second]);
  });

  it('最後に正常適用されたsnapshotからPlanを生成する', async () => {
    const target: ApplicationModel = {
      ...empty,
      models: [
        {
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
      ],
    };
    const result = await createService([
      applied('20260812_000001', empty),
    ]).previewPlan(target);

    expect(result.baselineVersion).toBe('20260812_000001');
    expect(result.plan.operations.map(({ id }) => id)).toEqual([
      'create_model:users:users',
    ]);
    expect(result.plan).toMatchObject({
      capabilityStatus: 'not_evaluated',
      applicable: false,
    });
  });

  it('applied Historyがない場合はnull baselineを使う', async () => {
    const result = await createService([]).previewPlan(empty);
    expect(result).toMatchObject({
      baselineVersion: null,
      plan: { operations: [], capabilityStatus: 'supported', applicable: true },
    });
  });
});

function applied(version: string, application: ApplicationModel) {
  const file = createMigrationFile(version, 'migration', []);
  return completeMigration(
    startMigration(createPendingHistory(file), '2026-08-12T01:00:00Z'),
    '2026-08-12T01:00:01Z',
    createApplicationModelSnapshot(application),
  );
}

function createService(entries: readonly MigrationHistoryEntry[]) {
  const values = new Map(entries.map((entry) => [entry.version, entry]));
  const storage: MigrationHistoryStorage = {
    get: async (version) => values.get(version) ?? null,
    list: async () => [...values.values()],
    save: async (entry) => {
      values.set(entry.version, entry);
    },
  };
  return new MigrationReadService(new MigrationHistoryRepository(storage));
}
