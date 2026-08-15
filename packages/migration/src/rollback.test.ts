import { describe, expect, it } from 'vitest';

import { createMigrationFile } from './file.js';
import {
  completeMigration,
  createPendingHistory,
  failMigration,
  recordOperationCompleted,
  startMigration,
} from './history.js';
import {
  createMigrationRollbackPlan,
  previewMigrationRollback,
} from './rollback.js';
import { createApplicationModelSnapshot } from './snapshot.js';
import type { MigrationOperation } from './types.js';

const field = { name: 'email' } as never;
const indexA = { name: 'by_email' } as never;
const indexB = { name: 'by_name' } as never;
const relationA = { name: 'account' } as never;
const relationB = { name: 'team' } as never;

describe('Migration Rollback Plan', () => {
  it('完了済みforward Operationだけを実行順の逆順へ変換する', () => {
    const operations = [
      operation({
        id: 'add_column:users:email',
        type: 'add_column',
        column: field,
      }),
      operation({
        id: 'rename_column:users:name->display_name',
        type: 'rename_column',
        from: 'name',
        to: 'display_name',
      }),
      operation({
        id: 'add_index:users:by_email',
        type: 'add_index',
        index: indexA,
      }),
      operation({
        id: 'drop_index:users:by_name',
        type: 'drop_index',
        previous: indexB,
      }),
      operation({
        id: 'add_relation:users:account',
        type: 'add_relation',
        relation: relationA,
      }),
      operation({
        id: 'drop_relation:users:team',
        type: 'drop_relation',
        previous: relationB,
      }),
    ];
    const file = createMigrationFile(
      '20260815_000001',
      'update_users',
      operations,
    );
    const previousSnapshot = createApplicationModelSnapshot({
      schemaVersion: 1,
      name: 'app',
      models: [],
      metadata: {},
    });
    const rollback = createMigrationRollbackPlan({
      file,
      completedOperationCount: operations.length,
      previousSnapshot,
    });
    expect(rollback).toMatchObject({
      sourceVersion: file.version,
      sourceChecksum: file.checksum,
      completedOperationCount: operations.length,
      targetSnapshot: previousSnapshot,
      plan: {
        destructive: true,
        capabilityStatus: 'not_evaluated',
        applicable: false,
      },
    });
    expect(rollback.plan.operations.map(({ id }) => id)).toEqual([
      'add_relation:users:team',
      'drop_relation:users:account',
      'add_index:users:by_name',
      'drop_index:users:by_email',
      'rename_column:users:display_name->name',
      'drop_column:users:email',
    ]);
    expect(Object.isFrozen(rollback)).toBe(true);
  });

  it('create_modelをModel削除へ変換し初回targetをnullのまま保持する', () => {
    const model = { name: 'users' } as never;
    const file = createMigrationFile('20260815_000002', 'create_users', [
      operation({
        id: 'create_model:users:users',
        type: 'create_model',
        definition: model,
      }),
    ]);
    const rollback = createMigrationRollbackPlan({
      file,
      completedOperationCount: 1,
      previousSnapshot: null,
    });
    expect(rollback.targetSnapshot).toBeNull();
    expect(rollback.plan.operations).toEqual([
      expect.objectContaining({
        id: 'drop_model:users:users',
        type: 'drop_model',
        previous: model,
        destructive: true,
      }),
    ]);
  });

  it('完了済みのirreversible Operationだけをstable errorで拒否する', () => {
    const reversible = operation({
      id: 'add_column:users:email',
      type: 'add_column',
      column: field,
    });
    const irreversible = operation({
      id: 'drop_column:users:legacy',
      type: 'drop_column',
      previous: { name: 'legacy' },
      reversible: false,
    });
    const file = createMigrationFile('20260815_000003', 'drop_legacy', [
      reversible,
      irreversible,
    ]);
    expect(
      createMigrationRollbackPlan({
        file,
        completedOperationCount: 1,
        previousSnapshot: null,
      }).plan.operations,
    ).toHaveLength(1);
    expect(() =>
      createMigrationRollbackPlan({
        file,
        completedOperationCount: 2,
        previousSnapshot: null,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'MIGRATION_IRREVERSIBLE',
        operationId: irreversible.id,
      }),
    );
  });

  it('不正なFile、進捗、previous snapshotを拒否する', () => {
    const file = createMigrationFile('20260815_000004', 'empty', []);
    expect(() =>
      createMigrationRollbackPlan({
        file: { ...file, checksum: '0'.repeat(64) },
        completedOperationCount: 0,
        previousSnapshot: null,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'MIGRATION_CHECKSUM_INVALID' }),
    );
    expect(() =>
      createMigrationRollbackPlan({
        file,
        completedOperationCount: 1,
        previousSnapshot: null,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'MIGRATION_ROLLBACK_PROGRESS_INVALID',
      }),
    );
    const snapshot = createApplicationModelSnapshot({
      schemaVersion: 1,
      name: 'app',
      models: [],
      metadata: {},
    });
    expect(() =>
      createMigrationRollbackPlan({
        file,
        completedOperationCount: 0,
        previousSnapshot: { ...snapshot, checksum: '0'.repeat(64) },
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'MIGRATION_ROLLBACK_SNAPSHOT_INVALID',
      }),
    );
  });

  it('latest applied Historyと直前のapplied snapshotからpreviewする', () => {
    const previousFile = createMigrationFile('20260814_000001', 'previous', []);
    const previousSnapshot = createApplicationModelSnapshot({
      schemaVersion: 1,
      name: 'previous',
      models: [],
      metadata: {},
    });
    const previous = completeMigration(
      startMigration(
        createPendingHistory(previousFile),
        '2026-08-14T00:00:00Z',
      ),
      '2026-08-14T00:00:01Z',
      previousSnapshot,
    );
    const file = createMigrationFile('20260815_000005', 'add_email', [
      operation({
        id: 'add_column:users:email',
        type: 'add_column',
        column: field,
      }),
    ]);
    const current = completeMigration(
      recordOperationCompleted(
        startMigration(createPendingHistory(file), '2026-08-15T00:00:00Z'),
      ),
      '2026-08-15T00:00:01Z',
      createApplicationModelSnapshot({
        schemaVersion: 1,
        name: 'current',
        models: [],
        metadata: {},
      }),
    );
    const preview = previewMigrationRollback({
      file,
      history: [current, previous],
    });
    expect(preview).toMatchObject({
      sourceVersion: file.version,
      targetVersion: previousFile.version,
      targetSnapshot: previousSnapshot,
      plan: { operations: [{ type: 'drop_column' }] },
    });
  });

  it('後続attemptと不整合なsource Historyを拒否する', () => {
    const file = createMigrationFile('20260815_000006', 'empty', []);
    const current = completeMigration(
      startMigration(createPendingHistory(file), '2026-08-15T00:00:00Z'),
      '2026-08-15T00:00:01Z',
      createApplicationModelSnapshot({
        schemaVersion: 1,
        name: 'current',
        models: [],
        metadata: {},
      }),
    );
    const laterFile = createMigrationFile('20260815_000007', 'later', [
      operation({
        id: 'add_column:users:email',
        type: 'add_column',
        column: field,
      }),
    ]);
    const later = failMigration(
      startMigration(createPendingHistory(laterFile), '2026-08-15T01:00:00Z'),
      '2026-08-15T01:00:01Z',
      laterFile.operations[0]!.id,
      'PROVIDER_OPERATION_FAILED',
    );
    expect(() =>
      previewMigrationRollback({ file, history: [current, later] }),
    ).toThrowError(
      expect.objectContaining({ code: 'MIGRATION_ROLLBACK_NOT_LATEST' }),
    );
    expect(() =>
      previewMigrationRollback({
        file,
        history: [{ ...current, checksum: '0'.repeat(64) }],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'MIGRATION_ROLLBACK_HISTORY_CONFLICT',
      }),
    );
  });
});

function operation(
  value: Readonly<Record<string, unknown>> & {
    readonly id: string;
    readonly type: MigrationOperation['type'];
  },
): MigrationOperation {
  return {
    model: 'users',
    risk: 'safe',
    destructive: false,
    reversible: true,
    capability: 'not_evaluated',
    ...value,
  } as MigrationOperation;
}
