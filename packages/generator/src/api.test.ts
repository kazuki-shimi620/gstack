import { describe, expect, it } from 'vitest';

import type { ApplicationModel, Model } from '@gstack/application';

import { generateApiArtifact } from './api.js';

describe('API Contract Generator', () => {
  it('公開ModelのCRUD contractだけを生成する', () => {
    const artifact = generateApiArtifact(
      application([
        model('users', {
          resource: 'users',
          create: true,
          update: true,
          delete: true,
        }),
        model('internal', {
          resource: null,
          create: true,
          update: true,
          delete: true,
        }),
      ]),
    );
    expect(artifact.path).toBe('generated/api/contracts.ts');
    expect(artifact.content).toContain('method: "GET", path: "/users"');
    expect(artifact.content).toContain('ApiRoute<void, readonly Users[]>');
    expect(artifact.content).toContain('ApiRoute<Users, Users>');
    expect(artifact.content).toContain('ApiRoute<Partial<Users>, Users>');
    expect(artifact.content).toContain('ApiRoute<void, void>');
    expect(artifact.content).not.toContain('Internal');
  });

  it('handler、Provider、business logicを生成しない', () => {
    const content = generateApiArtifact(
      application([
        model('users', {
          resource: 'users',
          create: false,
          update: false,
          delete: false,
        }),
      ]),
    ).content;
    expect(content).not.toMatch(/fastify|express|provider|database/iu);
    expect(content).not.toContain('function handler');
    expect(content).not.toContain('fetch(');
  });
});

function model(name: string, api: Model['api']): Model {
  return {
    name,
    displayName: name,
    description: null,
    primaryKey: 'id',
    fields: [],
    indexes: [],
    relations: [],
    api,
    ui: { list: { columns: [] }, form: { fields: [] } },
    permissions: { read: [], create: [], update: [], delete: [] },
    workflow: { enabled: false },
    events: { enabled: false },
    metadata: {},
  };
}

function application(models: readonly Model[]): ApplicationModel {
  return { schemaVersion: 1, name: 'app', models, metadata: {} };
}
