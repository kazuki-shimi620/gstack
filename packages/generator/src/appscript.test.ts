import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';

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
      webapp: { access: 'MYSELF', executeAs: 'USER_ACCESSING' },
    });
    expect(artifacts[1]!.content).toContain('function doGet(event)');
    expect(artifacts[1]!.content).toContain('__gstack_method');
    expect(artifacts[1]!.content).toContain(
      '"model":"users","resource":"users","primaryKey":"id"',
    );
    expect(artifacts[1]!.content).toContain(
      '"model":"internal","resource":null',
    );
    expect(artifacts[1]!.content).not.toContain('credential');
    expect(artifacts[1]!.content).toContain('"type":"uuid"');
    expect(artifacts[1]!.content).toContain('gstackValueValid_');
  });

  it('generated runtime validates required field types before write', () => {
    const source = generateAppsScriptBackendArtifacts({
      schemaVersion: 1,
      name: 'sample',
      metadata: {},
      models: [model('users', 'users')],
    })[1]!.content;
    const validContext = { result: undefined as unknown };
    runInNewContext(
      `${source}\nresult = gstackRecord_(GSTACK_MODELS[0], { id: '123e4567-e89b-12d3-a456-426614174000' }, false);`,
      validContext,
    );
    expect(validContext.result).toEqual({
      id: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(() =>
      runInNewContext(
        `${source}\ngstackRecord_(GSTACK_MODELS[0], { id: 'not-a-uuid' }, false);`,
        {},
      ),
    ).toThrow('INVALID');
    expect(() =>
      runInNewContext(
        `${source}\ngstackRecord_(GSTACK_MODELS[0], {}, false);`,
        {},
      ),
    ).toThrow('INVALID');
  });

  it('active user emailとSchema Roleの共通部分だけを許可する', () => {
    const authorized = {
      ...model('users', 'users'),
      permissions: {
        read: ['admin'],
        create: [],
        update: [],
        delete: [],
      },
    };
    const source = generateAppsScriptBackendArtifacts({
      schemaVersion: 1,
      name: 'sample',
      metadata: {},
      models: [authorized],
    })[1]!.content;
    const session = (email: string) => ({
      getActiveUser: () => ({ getEmail: () => email }),
    });
    expect(() =>
      runInNewContext(
        `${source}\ngstackAuthorize_(GSTACK_MODELS[0], 'read');`,
        {
          Session: session(' Admin@Example.com '),
          GSTACK_ROLE_BINDINGS: { 'admin@example.com': ['admin'] },
        },
      ),
    ).not.toThrow();
    expect(() =>
      runInNewContext(
        `${source}\ngstackAuthorize_(GSTACK_MODELS[0], 'read');`,
        {
          Session: session('bad..dot@example.com'),
          GSTACK_ROLE_BINDINGS: { 'bad..dot@example.com': ['admin'] },
        },
      ),
    ).toThrow('FORBIDDEN');
    for (const context of [
      {
        Session: session(''),
        GSTACK_ROLE_BINDINGS: { 'admin@example.com': ['admin'] },
      },
      {
        Session: session('user@example.com'),
        GSTACK_ROLE_BINDINGS: { 'user@example.com': ['user'] },
      },
      {
        Session: session('bad..dot@example.com'),
        GSTACK_ROLE_BINDINGS: { 'bad..dot@example.com': ['admin'] },
      },
      {
        Session: session('admin@example.com'),
        GSTACK_ROLE_BINDINGS: { 'admin@example.com': ['admin'] },
      },
      {
        Session: {
          getActiveUser: () => {
            throw new Error('identity-secret');
          },
        },
        GSTACK_ROLE_BINDINGS: { 'admin@example.com': ['admin'] },
      },
    ]) {
      expect(() =>
        runInNewContext(
          `${source}\ngstackAuthorize_(GSTACK_MODELS[0], 'create');`,
          context,
        ),
      ).toThrow('FORBIDDEN');
    }
    expect(source).not.toContain('getEffectiveUser');
  });

  it('generated runtime enforces composite unique indexes without coercion', () => {
    const indexed = {
      ...model('users', 'users'),
      indexes: [
        { name: 'by_tenant_email', columns: ['tenant', 'email'], unique: true },
      ],
    };
    const source = generateAppsScriptBackendArtifacts({
      schemaVersion: 1,
      name: 'sample',
      metadata: {},
      models: [indexed],
    })[1]!.content;
    expect(() =>
      runInNewContext(
        `${source}\ngstackUnique_(GSTACK_MODELS[0], [{ tenant: 'a', email: 'x' }], { tenant: 'a', email: 'x' }, null);`,
        {},
      ),
    ).toThrow('DUPLICATE');
    expect(() =>
      runInNewContext(
        `${source}\ngstackUnique_(GSTACK_MODELS[0], [{ tenant: 1, email: 'x' }], { tenant: '1', email: 'x' }, null);`,
        {},
      ),
    ).not.toThrow();
    expect(() =>
      runInNewContext(
        `${source}\ngstackUnique_(GSTACK_MODELS[0], [{ tenant: 'a', email: '' }], { tenant: 'a', email: '' }, null);`,
        {},
      ),
    ).not.toThrow();
  });

  it('generated runtime validates relations and restricts referenced deletes', () => {
    const accounts = model('accounts', null);
    const users = {
      ...model('users', 'users'),
      relations: [
        {
          name: 'account',
          type: 'belongs_to' as const,
          field: 'account_id',
          targetModel: 'accounts',
          references: 'id',
        },
      ],
    };
    const source = generateAppsScriptBackendArtifacts({
      schemaVersion: 1,
      name: 'sample',
      metadata: {},
      models: [users, accounts],
    })[1]!.content;
    const setup = `${source}\nconst accounts_ = GSTACK_MODELS.find(function (item) { return item.model === 'accounts'; });\nconst users_ = GSTACK_MODELS.find(function (item) { return item.model === 'users'; });`;
    expect(() =>
      runInNewContext(
        `${setup}\ngstackList_ = function (definition) { return definition.model === 'accounts' ? [{ id: 'account-1' }] : []; };\ngstackRelations_(users_, { account_id: 'account-1' });`,
        {},
      ),
    ).not.toThrow();
    expect(() =>
      runInNewContext(
        `${setup}\ngstackList_ = function () { return []; };\ngstackRelations_(users_, { account_id: 'missing' });`,
        {},
      ),
    ).toThrow('REFERENCE_MISSING');
    expect(() =>
      runInNewContext(
        `${setup}\ngstackList_ = function (definition) { return definition.model === 'users' ? [{ account_id: 'account-1' }] : []; };\ngstackRestrictDelete_(accounts_, { id: 'account-1' }, 0);`,
        {},
      ),
    ).toThrow('REFERENCE_CONFLICT');
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
