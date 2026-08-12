import { describe, expect, it } from 'vitest';

import type { ApplicationModel, Field, Model } from '@gstack/application';

import { generateDocumentationArtifact } from './documentation.js';

describe('Documentation Generator', () => {
  it('Model構造を決定的なMarkdown referenceへ変換する', () => {
    const artifact = generateDocumentationArtifact(
      application([
        model('users', {
          fields: [field('name', 'string'), field('id', 'uuid', true)],
          indexes: [{ name: 'by_name', columns: ['name'], unique: false }],
          relations: [
            {
              name: 'account',
              type: 'belongs_to',
              field: 'account_id',
              targetModel: 'accounts',
              references: 'id',
            },
          ],
          api: {
            resource: 'users',
            create: true,
            update: false,
            delete: true,
          },
        }),
      ]),
    );

    expect(artifact.path).toBe('generated/docs/models.md');
    expect(artifact.content).toContain('# sample-app Models');
    expect(artifact.content).toContain('Primary Key: `id`');
    expect(artifact.content.indexOf('| id |')).toBeLessThan(
      artifact.content.indexOf('| name |'),
    );
    expect(artifact.content).toContain('| by_name | name | no |');
    expect(artifact.content).toContain(
      '| account | belongs_to | account_id | accounts | id |',
    );
    expect(artifact.content).toContain('Operations: list, create, delete');
    expect(artifact.content.endsWith('\n')).toBe(true);
  });

  it('Markdown構造へ影響する値をescapeする', () => {
    const unsafe = model('users', {
      displayName: '# User',
      description: 'first\nsecond | value',
      fields: [field('pipe|field', 'string')],
    });
    const content = generateDocumentationArtifact(
      application([unsafe]),
    ).content;
    expect(content).toContain('## \\# User（users）');
    expect(content).toContain('first<br>second | value');
    expect(content).toContain('| pipe\\|field |');
  });

  it('空Applicationを明示する', () => {
    expect(generateDocumentationArtifact(application([])).content).toContain(
      'Modelはありません。',
    );
  });
});

const validation = {
  minLength: null,
  maxLength: null,
  pattern: null,
  min: null,
  max: null,
};

function field(name: string, type: Field['type'], required = false): Field {
  return {
    name,
    type,
    required,
    unique: false,
    enumValues: [],
    validation,
  };
}

function model(name: string, overrides: Partial<Model> = {}): Model {
  return {
    name,
    displayName: name,
    description: null,
    primaryKey: 'id',
    fields: [],
    indexes: [],
    relations: [],
    api: { resource: null, create: false, update: false, delete: false },
    ui: { list: { columns: [] }, form: { fields: [] } },
    permissions: { read: [], create: [], update: [], delete: [] },
    workflow: { enabled: false },
    events: { enabled: false },
    metadata: {},
    ...overrides,
  };
}

function application(models: readonly Model[]): ApplicationModel {
  return { schemaVersion: 1, name: 'sample-app', models, metadata: {} };
}
