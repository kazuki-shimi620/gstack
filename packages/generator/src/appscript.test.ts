import { describe, expect, it } from 'vitest';

import { generateAppsScriptBackendArtifacts } from './appscript.js';

describe('Apps Script backend generator', () => {
  it('generates a private web app manifest and schema-derived CRUD runtime', () => {
    const artifacts = generateAppsScriptBackendArtifacts({
      schemaVersion: 1,
      name: 'sample',
      metadata: {},
      models: [model('internal', null), model('users', 'users')],
    });
    expect(artifacts.map(({ path }) => path)).toEqual([
      'generated/backend/appsscript/appsscript.json',
      'generated/backend/appsscript/main.gs',
    ]);
    expect(JSON.parse(artifacts[0]!.content)).toMatchObject({
      runtimeVersion: 'V8',
      webapp: { access: 'MYSELF', executeAs: 'USER_DEPLOYING' },
    });
    expect(artifacts[1]!.content).toContain('function doGet(event)');
    expect(artifacts[1]!.content).toContain('__gstack_method');
    expect(artifacts[1]!.content).toContain(
      '"model":"users","resource":"users","primaryKey":"id"',
    );
    expect(artifacts[1]!.content).not.toContain('internal');
    expect(artifacts[1]!.content).not.toContain('credential');
  });

  it('is deterministic regardless of model order', () => {
    const left = generateAppsScriptBackendArtifacts({
      schemaVersion: 1,
      name: 'sample',
      metadata: {},
      models: [model('z', 'z'), model('a', 'a')],
    });
    const right = generateAppsScriptBackendArtifacts({
      schemaVersion: 1,
      name: 'sample',
      metadata: {},
      models: [model('a', 'a'), model('z', 'z')],
    });
    expect(left).toEqual(right);
  });
});

function model(name: string, resource: string | null) {
  return {
    name,
    displayName: name,
    description: null,
    primaryKey: 'id',
    fields: [
      {
        name: 'id',
        type: 'uuid' as const,
        required: true,
        unique: true,
        enumValues: [],
        validation: {
          minLength: null,
          maxLength: null,
          pattern: null,
          min: null,
          max: null,
        },
      },
    ],
    indexes: [],
    relations: [],
    api: { resource, create: true, update: true, delete: true },
    ui: { list: { columns: [] }, form: { fields: [] } },
    permissions: { read: [], create: [], update: [], delete: [] },
    workflow: { enabled: false },
    events: { enabled: false },
    metadata: {},
  };
}
