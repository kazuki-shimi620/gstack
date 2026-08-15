import { describe, expect, it, vi } from 'vitest';

import {
  applyCapabilityResults,
  createMigrationPlan,
  type MigrationOperation,
} from '@gstack/migration';

import { evaluateGoogleMigrationCapabilities } from './migration.js';
import { GoogleMigrationOperationExecutor } from './migration.js';
import type { GoogleMigrationOperationError } from './migration.js';

describe('Google Migration capability mapping', () => {
  it('Manifest supportを全Operationへ過不足なく反映する', () => {
    const operations = [
      operation('create:user', 'create_model'),
      operation('add:user:name', 'add_column'),
      operation('rename:user:name:display_name', 'rename_column'),
      operation('drop:user:legacy', 'drop_column'),
      operation('drop-model:user', 'drop_model'),
      operation('alter:user:name', 'alter_column'),
      operation('drop-index:user:name', 'drop_index'),
      operation('index:user:name', 'add_index'),
    ];
    const results = evaluateGoogleMigrationCapabilities(operations);
    expect(results).toEqual([
      { operationId: 'create:user', capability: 'native' },
      { operationId: 'add:user:name', capability: 'native' },
      {
        operationId: 'rename:user:name:display_name',
        capability: 'native',
      },
      { operationId: 'drop:user:legacy', capability: 'native' },
      { operationId: 'drop-model:user', capability: 'native' },
      { operationId: 'alter:user:name', capability: 'emulated' },
      { operationId: 'drop-index:user:name', capability: 'emulated' },
      { operationId: 'index:user:name', capability: 'emulated' },
    ]);
    expect(Object.isFrozen(results)).toBe(true);
    expect(
      applyCapabilityResults(createMigrationPlan(operations), results),
    ).toMatchObject({
      capabilityStatus: 'supported',
      applicable: true,
    });
  });

  it('native Operationを対応するSheets Serviceへdispatchする', async () => {
    const createModel = vi.fn();
    const addColumn = vi.fn();
    const renameColumn = vi.fn();
    const dropColumn = vi.fn();
    const dropModel = vi.fn();
    const alterColumn = vi.fn();
    const index = vi.fn();
    const executor = new GoogleMigrationOperationExecutor(
      { execute: createModel } as never,
      { execute: addColumn } as never,
      { execute: renameColumn } as never,
      { execute: dropColumn } as never,
      { execute: dropModel } as never,
      { execute: alterColumn } as never,
      { execute: index } as never,
    );
    const create = operation('create:user', 'create_model');
    await executor.execute(create, {
      migrationVersion: '20260813_000001',
      migrationChecksum: 'a'.repeat(64),
      operationId: create.id,
      idempotencyKey: `key:${create.id}`,
    });
    expect(createModel).toHaveBeenCalledWith(create, 'a'.repeat(64));

    const add = operation('add:user:name', 'add_column');
    await executor.execute(add, {
      migrationVersion: '20260813_000001',
      migrationChecksum: 'a'.repeat(64),
      operationId: 'add:user:name',
      idempotencyKey: 'key:add:user:name',
    });
    expect(addColumn).toHaveBeenCalledWith(add, 'a'.repeat(64));

    const rename = operation('rename:user:name:display_name', 'rename_column');
    await executor.execute(rename, {
      migrationVersion: '20260813_000001',
      migrationChecksum: 'a'.repeat(64),
      operationId: rename.id,
      idempotencyKey: `key:${rename.id}`,
    });
    expect(renameColumn).toHaveBeenCalledWith(rename, 'a'.repeat(64));

    const drop = operation('drop:user:legacy', 'drop_column');
    await executor.execute(drop, {
      migrationVersion: '20260813_000001',
      migrationChecksum: 'a'.repeat(64),
      operationId: drop.id,
      idempotencyKey: `key:${drop.id}`,
    });
    expect(dropColumn).toHaveBeenCalledWith(drop, 'a'.repeat(64));

    const dropModelOperation = operation('drop-model:user', 'drop_model');
    await executor.execute(dropModelOperation, {
      migrationVersion: '20260813_000001',
      migrationChecksum: 'a'.repeat(64),
      operationId: dropModelOperation.id,
      idempotencyKey: `key:${dropModelOperation.id}`,
    });
    expect(dropModel).toHaveBeenCalledWith(dropModelOperation, 'a'.repeat(64));

    const alter = operation('alter:user:name', 'alter_column');
    await executor.execute(alter, {
      migrationVersion: '20260813_000001',
      migrationChecksum: 'a'.repeat(64),
      operationId: alter.id,
      idempotencyKey: `key:${alter.id}`,
    });
    expect(alterColumn).toHaveBeenCalledWith(alter, 'a'.repeat(64));

    const addIndex = operation('index:user:name', 'add_index');
    await executor.execute(addIndex, {
      migrationVersion: '20260813_000001',
      migrationChecksum: 'a'.repeat(64),
      operationId: addIndex.id,
      idempotencyKey: `key:${addIndex.id}`,
    });
    expect(index).toHaveBeenCalledWith(addIndex, 'a'.repeat(64));

    await expect(
      executor.execute(operation('relation:user:account', 'add_relation'), {
        migrationVersion: '20260813_000001',
        migrationChecksum: 'a'.repeat(64),
        operationId: 'relation:user:account',
        idempotencyKey: 'key:relation:user:account',
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<GoogleMigrationOperationError>>({
        code: 'GOOGLE_MIGRATION_OPERATION_UNSUPPORTED',
      }),
    );
  });
});

function operation(
  id: string,
  type: MigrationOperation['type'],
): MigrationOperation {
  return {
    id,
    type,
    model: 'users',
    risk: 'safe',
    destructive: false,
    reversible: true,
    capability: 'not_evaluated',
  } as MigrationOperation;
}
