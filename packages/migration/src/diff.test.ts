import { describe, expect, it } from 'vitest';

import type { ApplicationModel, Field, Model } from '@gstack/application';
import { diffApplicationModels } from './diff.js';

const validation = {
  minLength: null,
  maxLength: null,
  pattern: null,
  min: null,
  max: null,
} as const;
const field = (
  name: string,
  type: Field['type'] = 'string',
  overrides: Partial<Field> = {},
): Field => ({
  name,
  type,
  required: false,
  unique: false,
  enumValues: [],
  validation,
  ...overrides,
});
const model = (
  name: string,
  fields: readonly Field[],
  overrides: Partial<Model> = {},
): Model => ({
  name,
  displayName: name,
  description: null,
  primaryKey: fields[0]?.name ?? 'id',
  fields,
  indexes: [],
  relations: [],
  api: { resource: null, create: false, update: false, delete: false },
  ui: { list: { columns: [] }, form: { fields: [] } },
  permissions: { read: [], create: [], update: [], delete: [] },
  workflow: { enabled: false },
  events: { enabled: false },
  metadata: {},
  ...overrides,
});
const application = (models: readonly Model[]): ApplicationModel => ({
  schemaVersion: 1,
  name: 'app',
  models,
  metadata: {},
});

describe('diffApplicationModels', () => {
  it('null baselineではModelごとのcreate_modelだけを生成する', () => {
    const plan = diffApplicationModels(
      null,
      application([model('users', [field('id', 'uuid')])]),
    );
    expect(plan.operations.map(({ id }) => id)).toEqual([
      'create_model:users:users',
    ]);
    expect(plan.risk).toBe('safe');
  });

  it('ModelとColumnの追加・削除・変更を検出する', () => {
    const previous = application([
      model('legacy', [field('id', 'uuid')]),
      model('users', [field('id', 'uuid'), field('temp')]),
    ]);
    const target = application([
      model('accounts', [field('id', 'uuid')]),
      model('users', [
        field('id', 'uuid'),
        field('email', 'string', { required: true }),
      ]),
    ]);
    const plan = diffApplicationModels(previous, target);

    expect(plan.operations.map(({ id }) => id)).toEqual([
      'add_column:users:email',
      'create_model:accounts:accounts',
      'drop_column:users:temp',
      'drop_model:legacy:legacy',
    ]);
    expect(plan).toMatchObject({
      risk: 'destructive',
      destructive: true,
      reversible: false,
    });
  });

  it('Field property変更を1つのalter_columnへ集約する', () => {
    const previous = application([
      model('users', [field('role', 'enum', { enumValues: ['user'] })]),
    ]);
    const target = application([
      model('users', [
        field('role', 'enum', {
          required: true,
          unique: true,
          enumValues: ['user', 'admin'],
        }),
      ]),
    ]);
    const plan = diffApplicationModels(previous, target);
    expect(plan.operations).toEqual([
      expect.objectContaining({
        id: 'alter_column:users:role',
        risk: 'caution',
        reversible: false,
        changes: [
          expect.objectContaining({ property: 'required', risk: 'caution' }),
          expect.objectContaining({ property: 'unique', risk: 'caution' }),
          expect.objectContaining({ property: 'enumValues', risk: 'safe' }),
        ],
      }),
    ]);
  });

  it('既存ModelのPrimary Key変更を専用errorで拒否する', () => {
    const previous = application([
      model('users', [field('id', 'uuid'), field('code')]),
    ]);
    const target = application([
      model('users', [field('id', 'uuid'), field('code')], {
        primaryKey: 'code',
      }),
    ]);

    expect(() => diffApplicationModels(previous, target)).toThrow(
      expect.objectContaining({
        code: 'MIGRATION_PRIMARY_KEY_CHANGE_UNSUPPORTED',
      }),
    );
  });

  it('IndexとRelationの定義変更をdropとaddで表現する', () => {
    const base = model('users', [
      field('id', 'uuid'),
      field('account_id', 'uuid'),
    ]);
    const previous = application([
      {
        ...base,
        indexes: [{ name: 'users_id', columns: ['id'], unique: false }],
        relations: [
          {
            name: 'account',
            type: 'belongs_to',
            field: 'account_id',
            targetModel: 'accounts',
            references: 'id',
          },
        ],
      },
    ]);
    const target = application([
      {
        ...base,
        indexes: [{ name: 'users_id', columns: ['id'], unique: true }],
        relations: [
          {
            name: 'account',
            type: 'belongs_to',
            field: 'id',
            targetModel: 'accounts',
            references: 'id',
          },
        ],
      },
    ]);
    expect(
      diffApplicationModels(previous, target).operations.map(({ id }) => id),
    ).toEqual([
      'add_index:users:users_id',
      'add_relation:users:account',
      'drop_index:users:users_id',
      'drop_relation:users:account',
    ]);
  });

  it('明示renameだけをrename_columnへ変換し、追加変更も保持する', () => {
    const previous = application([
      model('users', [field('id', 'uuid'), field('old_name')]),
    ]);
    const target = application([
      model('users', [field('id', 'uuid'), field('name', 'text')]),
    ]);
    const plan = diffApplicationModels(previous, target, {
      renameColumns: [{ model: 'users', from: 'old_name', to: 'name' }],
    });
    expect(plan.operations.map(({ id }) => id)).toEqual([
      'alter_column:users:name',
      'rename_column:users:old_name->name',
    ]);
  });

  it('不正・重複rename intentを拒否してdrop/addへfallbackしない', () => {
    const previous = application([
      model('users', [field('id', 'uuid'), field('old_name'), field('other')]),
    ]);
    const target = application([
      model('users', [field('id', 'uuid'), field('name'), field('second')]),
    ]);
    expect(() =>
      diffApplicationModels(previous, target, {
        renameColumns: [{ model: 'users', from: 'missing', to: 'name' }],
      }),
    ).toThrow('Invalid rename intent');
    expect(() =>
      diffApplicationModels(previous, target, {
        renameColumns: [
          { model: 'users', from: 'old_name', to: 'name' },
          { model: 'users', from: 'old_name', to: 'second' },
        ],
      }),
    ).toThrow('must not reuse a Column');
  });
});
