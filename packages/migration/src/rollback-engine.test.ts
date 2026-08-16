import { describe, expect, it, vi } from 'vitest';

import { applyCapabilityResults } from './capability.js';
import { createMigrationFile } from './file.js';
import {
  completeMigration,
  createPendingHistory,
  recordOperationCompleted,
  startMigration,
  type MigrationHistoryEntry,
} from './history.js';
import {
  migrationRollbackFingerprint,
  previewMigrationRollback,
} from './rollback.js';
import {
  rollbackMigration,
  MigrationRollbackExecutionError,
} from './rollback-engine.js';
import { createApplicationModelSnapshot } from './snapshot.js';
import {
  MigrationHistoryRepository,
  type MigrationHistoryStorage,
} from './storage.js';
import type { MigrationOperation } from './types.js';

const operation = {
  id: 'rename_column:users:name->display_name',
  type: 'rename_column',
  model: 'users',
  from: 'name',
  to: 'display_name',
  risk: 'safe',
  destructive: false,
  reversible: true,
  capability: 'not_evaluated',
} as const satisfies MigrationOperation;
const file = createMigrationFile('20260816_000001', 'rename_user', [operation]);
const snapshot = createApplicationModelSnapshot({
  schemaVersion: 1,
  name: 'app',
  models: [],
  metadata: {},
});

describe('Migration Rollback Engine', () => {
  it('承認済みの逆Operationをlock下で実行してHistoryを完了する', async () => {
    const history = repository([appliedHistory()]);
    const preview = previewMigrationRollback({
      file,
      history: await history.list(),
    });
    const plan = supported(preview.plan);
    const approval = migrationRollbackFingerprint({ ...preview, plan });
    const execute = vi.fn().mockResolvedValue(undefined);
    const release = vi.fn().mockResolvedValue(undefined);

    const result = await rollbackMigration(
      {
        file,
        plan,
        providerContext: 'google:sheet',
        approval,
        allowDestructive: false,
        resume: false,
      },
      {
        history,
        lock: { acquire: vi.fn(async () => ({ release })) },
        executor: { execute },
        now: () => '2026-08-16T01:00:02Z',
      },
    );

    expect(result.history).toMatchObject({
      status: 'rolled_back',
      completedOperationCount: 1,
      completedRollbackOperationCount: 1,
      rolledBackAt: '2026-08-16T01:00:02Z',
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'rename_column:users:display_name->name',
      }),
      expect.objectContaining({ migrationChecksum: approval }),
    );
    expect(release).toHaveBeenCalledOnce();
  });

  it('Provider失敗を記録し、同じPlanの明示resumeで再開する', async () => {
    const history = repository([appliedHistory()]);
    const preview = previewMigrationRollback({
      file,
      history: await history.list(),
    });
    const plan = supported(preview.plan);
    const approval = migrationRollbackFingerprint({ ...preview, plan });
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error('secret provider error'))
      .mockResolvedValue(undefined);
    const dependencies = {
      history,
      lock: {
        acquire: vi.fn(async () => ({
          release: vi.fn().mockResolvedValue(undefined),
        })),
      },
      executor: { execute },
      now: () => '2026-08-16T01:00:02Z',
    };
    const request = {
      file,
      plan,
      providerContext: 'google:sheet',
      approval,
      allowDestructive: false,
      resume: false,
    } as const;

    await expect(rollbackMigration(request, dependencies)).rejects.toEqual(
      expect.objectContaining({
        code: 'PROVIDER_OPERATION_FAILED',
        operationId: 'rename_column:users:display_name->name',
      }),
    );
    await expect(
      rollbackMigration({ ...request, resume: true }, dependencies),
    ).resolves.toMatchObject({ outcome: 'rolled_back' });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('fingerprint不一致をProvider到達前に拒否する', async () => {
    const history = repository([appliedHistory()]);
    const preview = previewMigrationRollback({
      file,
      history: await history.list(),
    });
    const plan = supported(preview.plan);
    const execute = vi.fn();
    await expect(
      rollbackMigration(
        {
          file,
          plan,
          providerContext: 'google:sheet',
          approval: 'invalid',
          allowDestructive: false,
          resume: false,
        },
        {
          history,
          lock: { acquire: vi.fn() },
          executor: { execute },
          now: () => '2026-08-16T01:00:02Z',
        },
      ),
    ).rejects.toBeInstanceOf(MigrationRollbackExecutionError);
    expect(execute).not.toHaveBeenCalled();
  });
});

function appliedHistory(): MigrationHistoryEntry {
  return completeMigration(
    recordOperationCompleted(
      startMigration(createPendingHistory(file), '2026-08-16T01:00:00Z'),
    ),
    '2026-08-16T01:00:01Z',
    snapshot,
  );
}

function supported(plan: ReturnType<typeof previewMigrationRollback>['plan']) {
  return applyCapabilityResults(plan, [
    {
      operationId: 'rename_column:users:display_name->name',
      capability: 'native',
    },
  ]);
}

function repository(initial: readonly MigrationHistoryEntry[]) {
  const values = new Map(initial.map((entry) => [entry.version, entry]));
  const storage: MigrationHistoryStorage = {
    get: vi.fn(async (version) => values.get(version) ?? null),
    list: vi.fn(async () => [...values.values()]),
    save: vi.fn(async (entry) => {
      values.set(entry.version, entry);
    }),
  };
  return new MigrationHistoryRepository(storage);
}
