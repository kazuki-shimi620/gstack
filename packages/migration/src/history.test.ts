import { describe, expect, it } from 'vitest';

import { createMigrationFile } from './file.js';
import {
  completeMigration,
  createPendingHistory,
  failMigration,
  failRollback,
  interruptMigration,
  interruptRollback,
  recordOperationCompleted,
  recordRollback,
  recordRollbackOperationCompleted,
  resumeMigration,
  resumeRollback,
  startRollback,
  startMigration,
} from './history.js';
import { createApplicationModelSnapshot } from './snapshot.js';

const snapshot = createApplicationModelSnapshot({
  schemaVersion: 1,
  name: 'app',
  models: [],
  metadata: {},
});
const file = createMigrationFile('20260812_000001', 'initial', []);

describe('Migration History', () => {
  it('pendingからappliedまでの状態を決定的に記録する', () => {
    const pending = createPendingHistory(file);
    const applying = startMigration(pending, '2026-08-12T01:00:00.000Z');
    const applied = completeMigration(
      applying,
      '2026-08-12T01:00:01.000Z',
      snapshot,
    );

    expect(applied).toEqual({
      version: '20260812_000001',
      name: 'initial',
      checksum: file.checksum,
      status: 'applied',
      operationCount: 0,
      completedOperationCount: 0,
      completedRollbackOperationCount: 0,
      startedAt: '2026-08-12T01:00:00.000Z',
      completedAt: '2026-08-12T01:00:01.000Z',
      rolledBackAt: null,
      failedOperationId: null,
      errorCode: null,
      appliedSnapshot: snapshot,
    });
    expect(Object.isFrozen(applied)).toBe(true);
  });

  it('Operation進捗とfailed状態へsafe error codeだけを記録する', () => {
    const oneOperationFile = {
      ...file,
      operations: [{ id: 'one' }] as never,
    };
    const applying = startMigration(
      createPendingHistory(oneOperationFile),
      '2026-08-12T01:00:00Z',
    );
    const progressed = recordOperationCompleted(applying);
    const failed = failMigration(
      progressed,
      '2026-08-12T01:00:01Z',
      'one',
      'PROVIDER_OPERATION_FAILED',
    );

    expect(failed).toMatchObject({
      status: 'failed',
      completedOperationCount: 1,
      failedOperationId: 'one',
      errorCode: 'PROVIDER_OPERATION_FAILED',
      appliedSnapshot: null,
    });
    expect(failed).not.toHaveProperty('message');
    expect(failed).not.toHaveProperty('stack');
  });

  it('appliedからrolled_backへ遷移する', () => {
    const applied = completeMigration(
      startMigration(createPendingHistory(file), '2026-08-12T01:00:00Z'),
      '2026-08-12T01:00:01Z',
      snapshot,
    );
    const rollingBack = startRollback(applied);
    expect(recordRollback(rollingBack, '2026-08-12T01:00:02Z')).toMatchObject({
      status: 'rolled_back',
      completedAt: '2026-08-12T01:00:01Z',
      rolledBackAt: '2026-08-12T01:00:02Z',
    });
  });

  it('Rollbackの進捗、失敗、明示再開をforward進捗と分離する', () => {
    const oneOperationFile = createMigrationFile(
      '20260812_000004',
      'rollback_progress',
      [{ id: 'one' }] as never,
    );
    const applied = completeMigration(
      recordOperationCompleted(
        startMigration(
          createPendingHistory(oneOperationFile),
          '2026-08-12T01:00:00Z',
        ),
      ),
      '2026-08-12T01:00:01Z',
      snapshot,
    );
    const failed = failRollback(
      startRollback(applied),
      'inverse-one',
      'PROVIDER_OPERATION_FAILED',
    );
    expect(failed).toMatchObject({
      status: 'rollback_failed',
      completedOperationCount: 1,
      completedRollbackOperationCount: 0,
      failedOperationId: 'inverse-one',
    });
    const progressed = recordRollbackOperationCompleted(resumeRollback(failed));
    expect(recordRollback(progressed, '2026-08-12T01:00:02Z')).toMatchObject({
      status: 'rolled_back',
      completedRollbackOperationCount: 1,
    });
  });

  it('中断状態をsafe error code付きの再開可能状態へ変換する', () => {
    const oneOperationFile = createMigrationFile(
      '20260812_000005',
      'interrupted',
      [{ id: 'one' }] as never,
    );
    const applying = startMigration(
      createPendingHistory(oneOperationFile),
      '2026-08-12T01:00:00Z',
    );
    expect(
      interruptMigration(applying, '2026-08-12T01:00:01Z', 'one'),
    ).toMatchObject({
      status: 'failed',
      failedOperationId: 'one',
      errorCode: 'MIGRATION_INTERRUPTED',
    });

    const applied = completeMigration(
      recordOperationCompleted(applying),
      '2026-08-12T01:00:01Z',
      snapshot,
    );
    expect(
      interruptRollback(startRollback(applied), 'inverse-one'),
    ).toMatchObject({
      status: 'rollback_failed',
      failedOperationId: 'inverse-one',
      errorCode: 'MIGRATION_INTERRUPTED',
    });
  });

  it('同一Migration Fileの失敗地点から明示的に再開する', () => {
    const twoOperationFile = createMigrationFile(
      '20260812_000002',
      'two_operations',
      [{ id: 'one' }, { id: 'two' }] as never,
    );
    const failed = failMigration(
      recordOperationCompleted(
        startMigration(
          createPendingHistory(twoOperationFile),
          '2026-08-12T01:00:00Z',
        ),
      ),
      '2026-08-12T01:00:01Z',
      'two',
      'PROVIDER_OPERATION_FAILED',
    );

    expect(
      resumeMigration(failed, twoOperationFile, '2026-08-12T01:01:00Z'),
    ).toMatchObject({
      status: 'applying',
      completedOperationCount: 1,
      startedAt: '2026-08-12T01:01:00Z',
      completedAt: null,
      failedOperationId: null,
      errorCode: null,
    });
  });

  it('変更されたFileや不整合な進捗からの再開を拒否する', () => {
    const oneOperationFile = createMigrationFile(
      '20260812_000003',
      'one_operation',
      [{ id: 'one' }] as never,
    );
    const failed = failMigration(
      startMigration(
        createPendingHistory(oneOperationFile),
        '2026-08-12T01:00:00Z',
      ),
      '2026-08-12T01:00:01Z',
      'one',
      'PROVIDER_OPERATION_FAILED',
    );
    expect(() =>
      resumeMigration(
        failed,
        { ...oneOperationFile, checksum: 'changed' },
        '2026-08-12T01:01:00Z',
      ),
    ).toThrow('invalid checksum');
    expect(() =>
      resumeMigration(
        { ...failed, completedOperationCount: 1 },
        oneOperationFile,
        '2026-08-12T01:01:00Z',
      ),
    ).toThrow('no remaining Operation');
  });

  it('不正な状態遷移・時刻・未完了applyを拒否する', () => {
    const pending = createPendingHistory(file);
    expect(() => recordOperationCompleted(pending)).toThrow(
      'Migration status must be applying',
    );
    expect(() => startMigration(pending, '2026-08-12 01:00:00')).toThrow(
      'ISO 8601 UTC',
    );

    const oneOperationFile = {
      ...file,
      operations: [{ id: 'one' }] as never,
    };
    const applying = startMigration(
      createPendingHistory(oneOperationFile),
      '2026-08-12T01:00:00Z',
    );
    expect(() =>
      completeMigration(applying, '2026-08-12T01:00:01Z', snapshot),
    ).toThrow('before all Operations complete');
  });
});
