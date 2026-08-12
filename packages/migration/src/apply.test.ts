import { describe, expect, it } from 'vitest';

import { applyCapabilityResults } from './capability.js';
import { createMigrationFile } from './file.js';
import { createMigrationPlan } from './plan.js';
import { migrationPlanFingerprint, validateMigrationApply } from './apply.js';
import type { MigrationApplyError } from './apply.js';
import type { CreateModelOperation, MigrationOperation } from './types.js';

const operation = {
  id: 'create_model:users:users',
  type: 'create_model',
  model: 'users',
  definition: { name: 'users', fields: [], indexes: [], relations: [] },
  risk: 'safe',
  destructive: false,
  reversible: true,
  capability: 'not_evaluated',
} as unknown as CreateModelOperation;

describe('Migration Apply preflight', () => {
  it('checksum、評価済みPlan、approvalを固定しlock keyを返す', () => {
    const file = createMigrationFile('20260812_000001', 'initial', [operation]);
    const plan = applyCapabilityResults(createMigrationPlan(file.operations), [
      { operationId: operation.id, capability: 'native' },
    ]);
    const token = migrationPlanFingerprint(file, plan);

    expect(
      validateMigrationApply(file, plan, 'google:spreadsheet-1', {
        token,
        allowDestructive: false,
      }),
    ).toEqual({
      version: file.version,
      checksum: file.checksum,
      planFingerprint: token,
      lockKey: 'google:spreadsheet-1:20260812_000001',
      operationIds: [operation.id],
    });
  });

  it('未評価Planと古いapprovalを拒否する', () => {
    const file = createMigrationFile('20260812_000001', 'initial', [operation]);
    expect(() =>
      validateMigrationApply(
        file,
        createMigrationPlan(file.operations),
        'google:spreadsheet-1',
        { token: 'invalid', allowDestructive: false },
      ),
    ).toThrowError(
      expect.objectContaining<Partial<MigrationApplyError>>({
        code: 'MIGRATION_PLAN_NOT_APPLICABLE',
      }),
    );
  });

  it('破壊的Planに追加承認を要求する', () => {
    const destructive = {
      id: 'drop_model:users:users',
      type: 'drop_model',
      model: 'users',
      previous: operation.definition,
      risk: 'destructive',
      destructive: true,
      reversible: false,
      capability: 'not_evaluated',
    } as unknown as MigrationOperation;
    const file = createMigrationFile('20260812_000002', 'drop_users', [
      destructive,
    ]);
    const plan = applyCapabilityResults(createMigrationPlan(file.operations), [
      { operationId: destructive.id, capability: 'native' },
    ]);
    expect(() =>
      validateMigrationApply(file, plan, 'google:spreadsheet-1', {
        token: migrationPlanFingerprint(file, plan),
        allowDestructive: false,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<MigrationApplyError>>({
        code: 'MIGRATION_DESTRUCTIVE_NOT_ALLOWED',
      }),
    );
  });
});
