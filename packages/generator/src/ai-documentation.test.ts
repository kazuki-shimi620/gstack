import { describe, expect, it } from 'vitest';

import type { ApplicationModel, Model } from '@gstack/application';

import { generateAiDocumentationArtifacts } from './ai-documentation.js';

describe('AI Documentation Generator', () => {
  it('生成領域だけにAgent ruleとProject Contextを生成する', () => {
    const artifacts = generateAiDocumentationArtifacts(
      application([
        model('users', {
          api: {
            resource: 'users',
            create: true,
            update: false,
            delete: true,
          },
          ui: { list: { columns: ['name'] }, form: { fields: ['name'] } },
          permissions: {
            read: ['viewer', 'admin'],
            create: ['admin'],
            update: [],
            delete: [],
          },
          workflow: { enabled: true },
        }),
      ]),
    );

    expect(artifacts.map(({ path }) => path)).toEqual([
      'generated/ai/AGENTS.md',
      'generated/ai/PROJECT_CONTEXT.md',
    ]);
    expect(artifacts[0]?.content).toContain('Do not edit files here manually');
    expect(artifacts[0]?.content).toContain('Do not store or add secrets');
    expect(artifacts[1]?.content).toContain('Application: `sample-app`');
    expect(artifacts[1]?.content).toContain(
      'API: `users` [list, create, delete]',
    );
    expect(artifacts[1]?.content).toContain(
      'Permissions: read=`admin`, `viewer`; create=`admin`',
    );
    expect(artifacts[1]?.content).toContain('Workflow: enabled');
  });

  it('Metadata、source path、Provider情報を出力しない', () => {
    const users = model('users', {
      metadata: { secretLike: 'do-not-output' },
      source: {
        sourceId: 'schema/users.yaml',
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 2, offset: 1 },
        },
      },
    });
    const content = generateAiDocumentationArtifacts(application([users]))[1]
      ?.content;
    expect(content).not.toContain('do-not-output');
    expect(content).not.toContain('schema/users.yaml');
    expect(content).not.toMatch(/provider/iu);
  });

  it('空Applicationを明示する', () => {
    expect(
      generateAiDocumentationArtifacts(application([]))[1]?.content,
    ).toContain('Models: none');
  });
});

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
