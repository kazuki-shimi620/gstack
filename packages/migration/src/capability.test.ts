import { describe, expect, it } from 'vitest';

import { applyCapabilityResults } from './capability.js';
import type { MigrationCapabilityError } from './capability.js';
import { createMigrationPlan } from './plan.js';
import type { MigrationOperation } from './types.js';

const operations = [
  {
    id: 'add_column:User:name',
    type: 'add_column',
    model: 'User',
    risk: 'safe',
    destructive: false,
    reversible: true,
    capability: 'not_evaluated',
    column: {},
  },
  {
    id: 'add_index:User:by_name',
    type: 'add_index',
    model: 'User',
    risk: 'safe',
    destructive: false,
    reversible: true,
    capability: 'not_evaluated',
    index: {},
  },
] as unknown as readonly MigrationOperation[];

describe('Migration capability check', () => {
  it('全Operationの評価をPlanへ反映する', () => {
    const result = applyCapabilityResults(createMigrationPlan(operations), [
      { operationId: operations[0]!.id, capability: 'native' },
      { operationId: operations[1]!.id, capability: 'emulated' },
    ]);

    expect(result.capabilityStatus).toBe('supported');
    expect(result.applicable).toBe(true);
    expect(result.operations.map(({ capability }) => capability)).toEqual([
      'native',
      'emulated',
    ]);
  });

  it('unsupported Operationを適用不可にしてwarningへ集約する', () => {
    const result = applyCapabilityResults(createMigrationPlan(operations), [
      { operationId: operations[0]!.id, capability: 'native' },
      { operationId: operations[1]!.id, capability: 'unsupported' },
    ]);

    expect(result.capabilityStatus).toBe('unsupported');
    expect(result.applicable).toBe(false);
    expect(result.warnings).toContain(
      'Provider does not support Migration Operation: add_index:User:by_name',
    );
  });

  it.each([
    {
      results: [{ operationId: operations[0]!.id, capability: 'native' }],
      code: 'CAPABILITY_RESULT_MISSING',
    },
    {
      results: [
        { operationId: operations[0]!.id, capability: 'native' },
        { operationId: operations[0]!.id, capability: 'native' },
      ],
      code: 'CAPABILITY_RESULT_DUPLICATE',
    },
    {
      results: [{ operationId: 'unknown', capability: 'native' }],
      code: 'CAPABILITY_RESULT_UNKNOWN',
    },
  ] as const)('$codeを検出する', ({ results, code }) => {
    expect(() =>
      applyCapabilityResults(createMigrationPlan(operations), results),
    ).toThrowError(
      expect.objectContaining<Partial<MigrationCapabilityError>>({ code }),
    );
  });

  it('OperationがないPlanは評価なしでも適用可能である', () => {
    const plan = createMigrationPlan([]);
    expect(plan).toMatchObject({
      capabilityStatus: 'supported',
      applicable: true,
    });
    expect(applyCapabilityResults(plan, [])).toMatchObject({
      capabilityStatus: 'supported',
      applicable: true,
    });
  });
});
