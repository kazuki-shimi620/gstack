import { describe, expect, it } from 'vitest';

import type { ApplicationModel, Field, Model } from '@gstack/application';

import { generateOpenApiArtifact } from './openapi.js';

describe('OpenAPI Generator', () => {
  it('公開API flagからcollection／item operationを生成する', () => {
    const artifact = generateOpenApiArtifact(
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
    const document = JSON.parse(artifact.content) as OpenApiDocument;

    expect(artifact.path).toBe('generated/openapi/openapi.json');
    expect(document.openapi).toBe('3.1.0');
    expect(document.paths['/users']).toHaveProperty('get');
    expect(document.paths['/users']).toHaveProperty('post');
    expect(document.paths['/users/{id}']).toHaveProperty('patch');
    expect(document.paths['/users/{id}']).toHaveProperty('delete');
    expect(document.paths['/users/{id}']).not.toHaveProperty('get');
    expect(document.paths).not.toHaveProperty('/internal');
  });

  it('Field typeとValidationをcomponent schemaへ変換する', () => {
    const users = model('users', {
      resource: 'users',
      create: false,
      update: false,
      delete: false,
    });
    const artifact = generateOpenApiArtifact(
      application([
        {
          ...users,
          fields: [
            field('id', 'uuid', { required: true }),
            field('created_at', 'datetime'),
            field('age', 'integer', {
              validation: { ...validation, min: 0, max: 120 },
            }),
            field('role', 'enum', { enumValues: ['member', 'admin'] }),
            field('profile', 'json'),
          ],
        },
      ]),
    );
    const document = JSON.parse(artifact.content) as OpenApiDocument;
    const schema = document.components.schemas.Users;
    if (!schema) throw new Error('Expected Users component schema');

    expect(schema.required).toEqual(['id']);
    expect(schema.properties).toEqual({
      age: { type: 'integer', minimum: 0, maximum: 120 },
      created_at: { type: 'string', format: 'date-time' },
      id: { type: 'string', format: 'uuid' },
      profile: {},
      role: { type: 'string', enum: ['admin', 'member'] },
    });
    expect(document.paths['/users/{id}']).toBeUndefined();
  });

  it('Model順序に関係なく同じJSONを生成する', () => {
    const accounts = model('accounts', {
      resource: 'accounts',
      create: false,
      update: false,
      delete: false,
    });
    const users = model('users', {
      resource: 'users',
      create: false,
      update: false,
      delete: false,
    });
    expect(
      generateOpenApiArtifact(application([users, accounts])).content,
    ).toBe(generateOpenApiArtifact(application([accounts, users])).content);
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
  overrides: Partial<Field> = {},
): Field {
  return {
    name,
    type,
    required: false,
    unique: false,
    enumValues: [],
    validation,
    ...overrides,
  };
}

function model(name: string, api: Model['api']): Model {
  return {
    name,
    displayName: name,
    description: null,
    primaryKey: 'id',
    fields: [field('id', 'uuid', { required: true })],
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
  return { schemaVersion: 1, name: 'sample-app', models, metadata: {} };
}

interface OpenApiDocument {
  readonly openapi: string;
  readonly paths: Record<string, Record<string, unknown>>;
  readonly components: {
    readonly schemas: Record<
      string,
      {
        readonly required?: readonly string[];
        readonly properties: Record<string, unknown>;
      }
    >;
  };
}
