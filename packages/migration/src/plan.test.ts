import { describe, expect, it } from 'vitest';

import { createMigrationPlan, operationId } from './plan.js';
import type { MigrationOperation } from './types.js';

function operation(
  id: string,
  risk: MigrationOperation['risk'],
  reversible: boolean,
): MigrationOperation {
  return {
    id,
    type: 'drop_column',
    model: 'users',
    previous: {
      name: 'temp',
      type: 'string',
      required: false,
      unique: false,
      enumValues: [],
      validation: {
        minLength: null,
        maxLength: null,
        pattern: null,
        min: null,
        max: null,
      },
    },
    risk,
    destructive: risk === 'destructive',
    reversible,
    capability: 'not_evaluated',
  };
}

describe('Migration Plan契約', () => {
  it('同種OperationをID順に並べてaggregate safetyを計算する', () => {
    const plan = createMigrationPlan([
      operation('drop_column:users:z', 'destructive', false),
      operation('drop_column:users:a', 'safe', true),
    ]);

    expect(plan.operations.map(({ id }) => id)).toEqual([
      'drop_column:users:a',
      'drop_column:users:z',
    ]);
    expect(plan).toMatchObject({
      risk: 'destructive',
      destructive: true,
      reversible: false,
      warnings: [],
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.operations)).toBe(true);
  });

  it('参照解除、構造作成、制約追加、破壊操作の依存順へ決定的に並べる', () => {
    const types: readonly MigrationOperation['type'][] = [
      'drop_model',
      'add_relation',
      'drop_column',
      'add_index',
      'alter_column',
      'add_column',
      'rename_column',
      'create_model',
      'drop_index',
      'drop_relation',
    ];
    const plan = createMigrationPlan(
      types.map(
        (type) =>
          ({
            ...operation(`${type}:users:item`, 'safe', true),
            type,
          }) as MigrationOperation,
      ),
    );
    expect(plan.operations.map(({ type }) => type)).toEqual([
      'drop_relation',
      'drop_index',
      'create_model',
      'rename_column',
      'add_column',
      'alter_column',
      'add_index',
      'add_relation',
      'drop_column',
      'drop_model',
    ]);
  });

  it('重複Operation IDを拒否する', () => {
    expect(() =>
      createMigrationPlan([
        operation('drop_column:users:temp', 'destructive', false),
        operation('drop_column:users:temp', 'destructive', false),
      ]),
    ).toThrow('Migration Operation ID must be unique');
  });

  it('canonical Operation IDを生成する', () => {
    expect(operationId('create_model', 'users')).toBe(
      'create_model:users:users',
    );
    expect(operationId('add_column', 'users', 'email')).toBe(
      'add_column:users:email',
    );
  });
});
