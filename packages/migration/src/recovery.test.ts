import { describe, expect, it, vi } from 'vitest';

import { createMigrationFile } from './file.js';
import {
  completeMigration,
  createPendingHistory,
  recordOperationCompleted,
  startMigration,
  startRollback,
  type MigrationHistoryEntry,
} from './history.js';
import {
  prepareMigrationLockRecovery,
  recoverMigrationLock,
  type MigrationRecoveryLock,
} from './recovery.js';
import { createApplicationModelSnapshot } from './snapshot.js';
import {
  MigrationHistoryRepository,
  type MigrationHistoryStorage,
} from './storage.js';

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
} as const;
const file = createMigrationFile('20260817_000001', 'rename_user', [operation]);
const snapshot = createApplicationModelSnapshot({
  schemaVersion: 1,
  name: 'app',
  models: [],
  metadata: {},
});
const lockKey = 'google:spreadsheet:20260817_000001';

describe('Migration Lock Recovery', () => {
  it('中断したApplyの次Operationを特定し、承認後にfailedへ遷移してlockを外す', async () => {
    const applying = startMigration(
      createPendingHistory(file),
      '2026-08-17T01:00:00Z',
    );
    const history = repository([applying]);
    const lock = memoryLock(true);
    const preview = await prepareMigrationLockRecovery({
      file,
      history: await history.list(),
      lock,
      lockKey,
      forwardTargetSnapshot: snapshot,
    });
    expect(preview).toMatchObject({
      status: 'applying',
      action: 'mark_failed',
      nextOperationId: operation.id,
    });
    expect(preview).not.toHaveProperty('lockKey');

    await recoverMigrationLock({
      file,
      lockKey,
      forwardTargetSnapshot: snapshot,
      approval: preview.fingerprint,
      dependencies: {
        history,
        lock,
        now: () => '2026-08-17T01:00:01Z',
      },
    });
    await expect(history.get(file.version)).resolves.toMatchObject({
      status: 'failed',
      failedOperationId: operation.id,
      errorCode: 'MIGRATION_INTERRUPTED',
    });
    await expect(lock.exists(lockKey)).resolves.toBe(false);
  });

  it('全Apply Operation完了後の中断をappliedへ確定する', async () => {
    const applying = recordOperationCompleted(
      startMigration(createPendingHistory(file), '2026-08-17T01:00:00Z'),
    );
    const history = repository([applying]);
    const lock = memoryLock(true);
    const preview = await prepareMigrationLockRecovery({
      file,
      history: await history.list(),
      lock,
      lockKey,
      forwardTargetSnapshot: snapshot,
    });
    expect(preview.action).toBe('complete_apply');
    await recoverMigrationLock({
      file,
      lockKey,
      forwardTargetSnapshot: snapshot,
      approval: preview.fingerprint,
      dependencies: {
        history,
        lock,
        now: () => '2026-08-17T01:00:01Z',
      },
    });
    await expect(history.get(file.version)).resolves.toMatchObject({
      status: 'applied',
      appliedSnapshot: snapshot,
    });
  });

  it('History回復後のlock削除失敗を安全側に残し、新しい承認で再試行する', async () => {
    const applying = startMigration(
      createPendingHistory(file),
      '2026-08-17T01:00:00Z',
    );
    const history = repository([applying]);
    const lock = memoryLock(true, true);
    const first = await prepareMigrationLockRecovery({
      file,
      history: await history.list(),
      lock,
      lockKey,
      forwardTargetSnapshot: snapshot,
    });
    await expect(
      recoverMigrationLock({
        file,
        lockKey,
        forwardTargetSnapshot: snapshot,
        approval: first.fingerprint,
        dependencies: {
          history,
          lock,
          now: () => '2026-08-17T01:00:01Z',
        },
      }),
    ).rejects.toMatchObject({ code: 'MIGRATION_UNLOCK_FAILED' });
    const recovered = await history.get(file.version);
    expect(recovered).toMatchObject({
      status: 'failed',
      errorCode: 'MIGRATION_INTERRUPTED',
    });

    const retry = await prepareMigrationLockRecovery({
      file,
      history: await history.list(),
      lock,
      lockKey,
      forwardTargetSnapshot: snapshot,
    });
    expect(retry.action).toBe('remove_lock_only');
    expect(retry.fingerprint).not.toBe(first.fingerprint);
    await recoverMigrationLock({
      file,
      lockKey,
      forwardTargetSnapshot: snapshot,
      approval: retry.fingerprint,
      dependencies: {
        history,
        lock,
        now: () => '2026-08-17T01:00:02Z',
      },
    });
    await expect(lock.exists(lockKey)).resolves.toBe(false);
  });

  it('中断Rollbackをrollback_failedへ回復する', async () => {
    const applied = completeMigration(
      recordOperationCompleted(
        startMigration(createPendingHistory(file), '2026-08-17T01:00:00Z'),
      ),
      '2026-08-17T01:00:01Z',
      snapshot,
    );
    const history = repository([startRollback(applied)]);
    const lock = memoryLock(true);
    const preview = await prepareMigrationLockRecovery({
      file,
      history: await history.list(),
      lock,
      lockKey,
      forwardTargetSnapshot: snapshot,
    });
    expect(preview).toMatchObject({
      action: 'mark_rollback_failed',
      nextOperationId: 'rename_column:users:display_name->name',
    });
  });

  it('lock欠落、通常History、古いapprovalを拒否する', async () => {
    const applying = startMigration(
      createPendingHistory(file),
      '2026-08-17T01:00:00Z',
    );
    const history = repository([applying]);
    await expect(
      prepareMigrationLockRecovery({
        file,
        history: await history.list(),
        lock: memoryLock(false),
        lockKey,
        forwardTargetSnapshot: snapshot,
      }),
    ).rejects.toMatchObject({ code: 'MIGRATION_UNLOCK_LOCK_NOT_FOUND' });
    const lock = memoryLock(true);
    await expect(
      recoverMigrationLock({
        file,
        lockKey,
        forwardTargetSnapshot: snapshot,
        approval: 'stale',
        dependencies: {
          history,
          lock,
          now: () => '2026-08-17T01:00:01Z',
        },
      }),
    ).rejects.toMatchObject({ code: 'MIGRATION_UNLOCK_APPROVAL_INVALID' });
  });
});

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

function memoryLock(
  initial: boolean,
  failFirstRemove = false,
): MigrationRecoveryLock {
  let exists = initial;
  let removeCount = 0;
  return {
    exists: vi.fn(async () => exists),
    remove: vi.fn(async () => {
      removeCount += 1;
      if (failFirstRemove && removeCount === 1) throw new Error('failed');
      exists = false;
    }),
  };
}
