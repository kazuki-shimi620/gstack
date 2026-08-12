import { describe, expect, it } from 'vitest';

import type { ApplicationModel } from '@gstack/application';
import { createMigrationFile } from './file.js';
import {
  completeMigration,
  createPendingHistory,
  failMigration,
  recordOperationCompleted,
  recordRollback,
  startMigration,
} from './history.js';

const snapshot: ApplicationModel = {
  schemaVersion: 1,
  name: 'app',
  models: [],
  metadata: {},
};
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
    expect(recordRollback(applied, '2026-08-12T01:00:02Z')).toMatchObject({
      status: 'rolled_back',
      completedAt: '2026-08-12T01:00:01Z',
      rolledBackAt: '2026-08-12T01:00:02Z',
    });
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
