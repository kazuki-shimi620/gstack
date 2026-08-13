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
      operation('index:user:name', 'add_index'),
    ];
    const results = evaluateGoogleMigrationCapabilities(operations);
    expect(results).toEqual([
      { operationId: 'create:user', capability: 'native' },
      { operationId: 'add:user:name', capability: 'unsupported' },
      { operationId: 'index:user:name', capability: 'unsupported' },
    ]);
    expect(Object.isFrozen(results)).toBe(true);
    expect(
      applyCapabilityResults(createMigrationPlan(operations), results),
    ).toMatchObject({
      capabilityStatus: 'unsupported',
      applicable: false,
    });
  });

  it('create_modelだけをSheets Serviceへdispatchする', async () => {
    const execute = vi.fn();
    const executor = new GoogleMigrationOperationExecutor({ execute } as never);
    const create = operation('create:user', 'create_model');
    await executor.execute(create, {
      migrationVersion: '20260813_000001',
      migrationChecksum: 'a'.repeat(64),
      operationId: create.id,
      idempotencyKey: `key:${create.id}`,
    });
    expect(execute).toHaveBeenCalledWith(create, 'a'.repeat(64));

    await expect(
      executor.execute(operation('add:user:name', 'add_column'), {
        migrationVersion: '20260813_000001',
        migrationChecksum: 'a'.repeat(64),
        operationId: 'add:user:name',
        idempotencyKey: 'key:add:user:name',
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
