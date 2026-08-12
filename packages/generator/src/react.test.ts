import { describe, expect, it } from 'vitest';

import type { ApplicationModel, Field, Model } from '@gstack/application';

import { generateReactArtifacts } from './react.js';

describe('React UI Generator', () => {
  it('宣言済みcolumnだけをsemantic tableへ生成する', () => {
    const artifacts = generateReactArtifacts(
      application([
        model('users', {
          list: { columns: ['id', 'name'] },
          form: { fields: [] },
        }),
      ]),
    );
    const list = artifacts.find(({ path }) => path.endsWith('/list.tsx'));
    expect(list?.path).toBe('generated/frontend/users/list.tsx');
    expect(list?.content).toContain('<table className={className}>');
    expect(list?.content).toContain('<th scope="col">id</th>');
    expect(list?.content).toContain('item["name"]');
    expect(list?.content).toContain('key={String(item["id"])}');
  });

  it('Field typeをcontrolled form inputへmappingする', () => {
    const users = model('users', {
      list: { columns: [] },
      form: {
        fields: ['active', 'bio', 'role', 'age', 'birthday', 'created_at'],
      },
    });
    const form = generateReactArtifacts(
      application([
        {
          ...users,
          fields: [
            field('active', 'boolean'),
            field('bio', 'text'),
            field('role', 'enum', ['admin', 'member']),
            field('age', 'integer'),
            field('birthday', 'date'),
            field('created_at', 'datetime'),
          ],
        },
      ]),
    ).find(({ path }) => path.endsWith('/form.tsx'));
    expect(form?.content).toContain('type="checkbox"');
    expect(form?.content).toContain('<textarea');
    expect(form?.content).toContain('<select');
    expect(form?.content).toContain('type="number"');
    expect(form?.content).toContain('type="date"');
    expect(form?.content).toContain('type="datetime-local"');
    expect(form?.content).toContain('string | boolean');
    expect(form?.content).not.toMatch(/fetch|database|provider/iu);
  });

  it('UI宣言がないModelにはcomponentを生成しない', () => {
    expect(generateReactArtifacts(application([model('users')]))).toEqual([
      expect.objectContaining({ path: 'generated/frontend/index.ts' }),
    ]);
  });
});

const validation = {
  minLength: null,
  maxLength: null,
  pattern: null,
  min: null,
  max: null,
};

function field(
  name: string,
  type: Field['type'],
  enumValues: readonly string[] = [],
): Field {
  return {
    name,
    type,
    required: false,
    unique: false,
    enumValues,
    validation,
  };
}

function model(
  name: string,
  ui: Model['ui'] = { list: { columns: [] }, form: { fields: [] } },
): Model {
  return {
    name,
    displayName: name,
    description: null,
    primaryKey: 'id',
    fields: [field('id', 'uuid'), field('name', 'string')],
    indexes: [],
    relations: [],
    api: { resource: null, create: false, update: false, delete: false },
    ui,
    permissions: { read: [], create: [], update: [], delete: [] },
    workflow: { enabled: false },
    events: { enabled: false },
    metadata: {},
  };
}

function application(models: readonly Model[]): ApplicationModel {
  return { schemaVersion: 1, name: 'app', models, metadata: {} };
}
