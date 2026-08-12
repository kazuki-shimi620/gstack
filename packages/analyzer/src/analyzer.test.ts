import { describe, expect, it } from 'vitest';

import { parseSchemaSource, type SchemaAst } from '@gstack/parser';
import type { SchemaSource } from '@gstack/schema';
import { analyzeSchemas } from './analyzer.js';

function ast(id: string, content: string): SchemaAst {
  const source: SchemaSource = { id, name: id, path: `/schema/${id}`, content };
  const result = parseSchemaSource(source);
  if (!result.document) throw new Error(JSON.stringify(result.errors));
  return result.document.ast;
}

describe('analyzeSchemas', () => {
  it('normalizes defaults, metadata, ordering, and source references', () => {
    const users = ast(
      'users.yaml',
      `name: users
description: Users
model: { displayName: User }
database:
  primaryKey: id
  columns:
    id: { type: uuid }
    role: { type: enum, required: true, values: [admin, user] }
    nickname: { type: string }
  indexes:
    - { name: users_role, columns: [role] }
api: { resource: users, create: true }
ui: { list: { columns: [role] } }
permissions: { read: [admin] }
validation: { nickname: { minLength: 1 } }
metadata: { owner: team-a, nested: { active: true }, tags: [one, 2] }
`,
    );
    const accounts = ast(
      'accounts.yaml',
      `name: accounts
model: { displayName: Account }
database:
  primaryKey: id
  columns: { id: { type: uuid } }
`,
    );

    const result = analyzeSchemas([users, accounts], {
      applicationName: 'sample-app',
      schemaVersion: 1,
    });

    expect(result.errors).toEqual([]);
    expect(result.application?.models.map((model) => model.name)).toEqual([
      'accounts',
      'users',
    ]);
    expect(result.application?.models[0]).toMatchObject({
      description: null,
      indexes: [],
      relations: [],
      api: { resource: null, create: false, update: false, delete: false },
      ui: { list: { columns: [] }, form: { fields: [] } },
      permissions: { read: [], create: [], update: [], delete: [] },
      workflow: { enabled: false },
      events: { enabled: false },
      metadata: {},
    });
    expect(result.application?.models[1]?.metadata).toEqual({
      owner: 'team-a',
      nested: { active: true },
      tags: ['one', 2],
    });
    expect(result.application?.models[1]?.fields[1]).toMatchObject({
      name: 'role',
      required: true,
      unique: false,
      enumValues: ['admin', 'user'],
      validation: {
        minLength: null,
        maxLength: null,
        pattern: null,
        min: null,
        max: null,
      },
      source: { sourceId: 'users.yaml' },
    });
    expect(result.application?.models[1]?.fields[2]?.validation.minLength).toBe(
      1,
    );
    expect(Object.isFrozen(result.application)).toBe(true);
    expect(Object.isFrozen(result.application?.models)).toBe(true);
    expect(Object.isFrozen(result.application?.models[1]?.metadata)).toBe(true);
  });

  it('does not construct an Application Model when semantics are invalid', () => {
    const invalid = ast(
      'users.yaml',
      'name: users\nmodel: {}\ndatabase: { primaryKey: id, columns: {} }\n',
    );

    const result = analyzeSchemas([invalid], {
      applicationName: 'sample-app',
      schemaVersion: 1,
    });

    expect(result.application).toBeUndefined();
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
