import { describe, expect, it } from 'vitest';

import { migrationPlanFingerprint, type MigrationLock } from './apply.js';
import {
  applyMigration,
  type MigrationOperationExecutor,
} from './apply-engine.js';
import { applyCapabilityResults } from './capability.js';
import { createMigrationFile } from './file.js';
import type { MigrationHistoryEntry } from './history.js';
import { createMigrationPlan } from './plan.js';
import { createApplicationModelSnapshot } from './snapshot.js';
import {
  MigrationHistoryRepository,
  type MigrationHistoryStorage,
} from './storage.js';
import type { MigrationOperation } from './types.js';

const operation = {
  id: 'create_model:users:users',
  type: 'create_model',
  model: 'users',
  risk: 'safe',
  destructive: false,
  reversible: true,
  capability: 'not_evaluated',
} as unknown as MigrationOperation;
const file = createMigrationFile('20260812_000010', 'create_users', [
  operation,
]);
const plan = applyCapabilityResults(createMigrationPlan(file.operations), [
  { operationId: operation.id, capability: 'native' },
]);
const snapshot = createApplicationModelSnapshot({
  schemaVersion: 1,
  name: 'app',
  models: [],
  metadata: {},
});

describe('Migration Apply orchestration', () => {
  it('lock内でOperationを逐次実行し進捗とsnapshotを保存する', async () => {
    const fixture = createFixture();
    const result = await applyMigration(request(), fixture.dependencies);

    expect(result.outcome).toBe('applied');
    expect(result.history).toMatchObject({
      status: 'applied',
      completedOperationCount: 1,
      appliedSnapshot: snapshot,
    });
    expect(fixture.events).toEqual([
      'lock:google:sheet:20260812_000010',
      `execute:${file.checksum}:${operation.id}`,
      'release',
    ]);
  });

  it('失敗をsafe codeで保存し、明示resumeでは失敗Operationから続行する', async () => {
    let fail = true;
    const fixture = createFixture({
      execute: async () => {
        if (fail) {
          fail = false;
          throw new Error('secret provider response');
        }
      },
    });
    await expect(
      applyMigration(request(), fixture.dependencies),
    ).rejects.toMatchObject({
      code: 'PROVIDER_OPERATION_FAILED',
      operationId: operation.id,
    });
    expect(await fixture.history.get(file.version)).toMatchObject({
      status: 'failed',
      completedOperationCount: 0,
      errorCode: 'PROVIDER_OPERATION_FAILED',
    });

    await expect(
      applyMigration(request({ resume: false }), fixture.dependencies),
    ).rejects.toMatchObject({ code: 'MIGRATION_RESUME_REQUIRED' });
    const resumed = await applyMigration(
      request({ resume: true }),
      fixture.dependencies,
    );
    expect(resumed.history.status).toBe('applied');
  });

  it('適用済みの同一Migrationを再実行せずskipする', async () => {
    const fixture = createFixture();
    await applyMigration(request(), fixture.dependencies);
    fixture.events.length = 0;
    const result = await applyMigration(request(), fixture.dependencies);
    expect(result.outcome).toBe('skipped');
    expect(fixture.events).toEqual([
      'lock:google:sheet:20260812_000010',
      'release',
    ]);
  });
});

function request(overrides: { resume?: boolean } = {}) {
  return {
    file,
    plan,
    targetSnapshot: snapshot,
    providerContext: 'google:sheet',
    approval: {
      token: migrationPlanFingerprint(file, plan),
      allowDestructive: false,
    },
    resume: overrides.resume ?? false,
  };
}

function createFixture(executor?: MigrationOperationExecutor) {
  const entries = new Map<string, MigrationHistoryEntry>();
  const storage: MigrationHistoryStorage = {
    get: async (version) => entries.get(version) ?? null,
    list: async () => [...entries.values()],
    save: async (entry) => {
      entries.set(entry.version, entry);
    },
  };
  const history = new MigrationHistoryRepository(storage);
  const events: string[] = [];
  const lock: MigrationLock = {
    acquire: async (key) => {
      events.push(`lock:${key}`);
      return { release: async () => void events.push('release') };
    },
  };
  const defaultExecutor: MigrationOperationExecutor = {
    execute: async (_operation, context) => {
      events.push(`execute:${context.idempotencyKey}`);
    },
  };
  const timestamps = [
    '2026-08-12T02:00:00Z',
    '2026-08-12T02:00:01Z',
    '2026-08-12T02:01:00Z',
    '2026-08-12T02:01:01Z',
  ];
  return {
    history,
    events,
    dependencies: {
      history,
      lock,
      executor: executor ?? defaultExecutor,
      now: () => timestamps.shift() ?? '2026-08-12T02:02:00Z',
    },
  };
}
