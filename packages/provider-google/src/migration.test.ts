import { describe, expect, it } from 'vitest';

import {
  applyCapabilityResults,
  createMigrationPlan,
  type MigrationOperation,
} from '@gstack/migration';

import { evaluateGoogleMigrationCapabilities } from './migration.js';

describe('Google Migration capability mapping', () => {
  it('Manifest supportを全Operationへ過不足なく反映する', () => {
    const operations = [
      operation('create:user', 'create_model'),
      operation('add:user:name', 'add_column'),
      operation('index:user:name', 'add_index'),
    ];
    const results = evaluateGoogleMigrationCapabilities(operations);
    expect(results).toEqual([
      { operationId: 'create:user', capability: 'unsupported' },
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
