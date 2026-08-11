import { describe, expect, it } from 'vitest';

import type { SchemaSource } from '@gstack/schema';
import { parseSchemaSource } from './parser.js';

function source(content: string): SchemaSource {
  return {
    id: 'schema/users.yaml',
    name: 'users',
    path: '/project/schema/users.yaml',
    content,
  };
}

describe('parseSchemaSource', () => {
  it('builds a gstack-owned AST with explicit values and source ranges', () => {
    const result = parseSchemaSource(
      source(`name: users
model:
  displayName: User
database:
  primaryKey: id
  columns:
    id:
      type: uuid
api:
  create: true
metadata:
  tags:
    - internal
    - 1
`),
    );

    expect(result.errors).toEqual([]);
    expect(result.document?.ast.source.id).toBe('schema/users.yaml');
    expect(result.document?.ast.root).toMatchObject({
      kind: 'mapping',
      entries: [
        { key: 'name', value: { kind: 'scalar', value: 'users' } },
        {
          key: 'model',
          value: {
            kind: 'mapping',
            entries: [
              {
                key: 'displayName',
                value: { kind: 'scalar', value: 'User' },
              },
            ],
          },
        },
        { key: 'database', value: { kind: 'mapping' } },
        { key: 'api', value: { kind: 'mapping' } },
        {
          key: 'metadata',
          value: {
            kind: 'mapping',
            entries: [
              {
                key: 'tags',
                value: {
                  kind: 'sequence',
                  items: [
                    { kind: 'scalar', value: 'internal' },
                    { kind: 'scalar', value: 1 },
                  ],
                },
              },
            ],
          },
        },
      ],
    });

    const root = result.document?.ast.root;
    expect(root?.range.start).toEqual({ line: 1, column: 1, offset: 0 });
    expect(root?.range.end.offset).toBeGreaterThan(0);
  });

  it.each([
    ['', 'SCHEMA_DOCUMENT_EMPTY'],
    ['value: &shared test\ncopy: *shared\n', 'SCHEMA_ALIAS_NOT_ALLOWED'],
    ['? [invalid, key]\n: value\n', 'SCHEMA_MAPPING_KEY_INVALID'],
  ])('rejects unsupported syntax for %j', (content, code) => {
    const result = parseSchemaSource(source(content));

    expect(result.document).toBeUndefined();
    expect(result.errors.map((error) => error.code)).toContain(code);
  });

  it('reports duplicate YAML keys before AST construction', () => {
    const result = parseSchemaSource(source('name: users\nname: accounts\n'));

    expect(result.document).toBeUndefined();
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'SCHEMA_YAML_ERROR',
        phase: 'syntax',
        severity: 'error',
      }),
    ]);
  });

  it('rejects multiple YAML documents in one Schema file', () => {
    const result = parseSchemaSource(
      source('name: users\n---\nname: accounts\n'),
    );

    expect(result.document).toBeUndefined();
    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'SCHEMA_YAML_ERROR' }),
    ]);
  });

  it('rejects unknown keys at defined framework-owned levels', () => {
    const result = parseSchemaSource(
      source(`name: users
unexpected: true
model:
  displayName: User
  providerName: google
database:
  primaryKey: id
  columns:
    id:
      type: uuid
      sqlType: varchar
  indexes:
    - name: users_id
      columns: [id]
      method: btree
  relations:
    account:
      type: belongs_to
      field: account_id
      model: accounts
      references: id
      cascade: true
validation:
  id:
    pattern: value
    custom: value
`),
    );

    expect(result.document).toBeUndefined();
    expect(
      result.errors.map(({ code, message }) => ({ code, message })),
    ).toEqual([
      {
        code: 'SCHEMA_KEY_UNKNOWN',
        message: 'Unknown Schema key "unexpected" at $.',
      },
      {
        code: 'SCHEMA_KEY_UNKNOWN',
        message: 'Unknown Schema key "providerName" at model.',
      },
      {
        code: 'SCHEMA_KEY_UNKNOWN',
        message: 'Unknown Schema key "sqlType" at columns.id.',
      },
      {
        code: 'SCHEMA_KEY_UNKNOWN',
        message: 'Unknown Schema key "method" at indexes[0].',
      },
      {
        code: 'SCHEMA_KEY_UNKNOWN',
        message: 'Unknown Schema key "cascade" at relations.account.',
      },
      {
        code: 'SCHEMA_KEY_UNKNOWN',
        message: 'Unknown Schema key "custom" at validation.id.',
      },
    ]);
  });

  it('validates structural node kinds without enforcing semantic values', () => {
    const result = parseSchemaSource(
      source(`name: users
model: User
database:
  primaryKey: [id]
  columns:
    id: uuid
  indexes:
    name: users_id
  relations:
    account: accounts
validation:
  id: required
api: true
`),
    );

    expect(result.document).toBeUndefined();
    expect(result.errors).toHaveLength(7);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SCHEMA_NODE_TYPE_INVALID',
          message: 'Schema value at model must be a mapping.',
        }),
        expect.objectContaining({
          message: 'Schema value at database.primaryKey must be a scalar.',
        }),
        expect.objectContaining({
          message: 'Schema value at columns.id must be a mapping.',
        }),
        expect.objectContaining({
          message: 'Schema value at indexes must be a sequence.',
        }),
        expect.objectContaining({
          message: 'Schema value at relations.account must be a mapping.',
        }),
        expect.objectContaining({
          message: 'Schema value at validation.id must be a mapping.',
        }),
        expect.objectContaining({
          message: 'Schema value at api must be a mapping.',
        }),
      ]),
    );
  });

  it('keeps metadata open and leaves required values to semantic analysis', () => {
    const result = parseSchemaSource(
      source(`metadata:
  providerHint:
    arbitrary: [nested, values]
`),
    );

    expect(result.errors).toEqual([]);
    expect(result.document?.ast.root.kind).toBe('mapping');
  });

  it('accepts the documented optional section shapes', () => {
    const result = parseSchemaSource(
      source(`api:
  resource: users
  create: true
  update: true
  delete: false
ui:
  list:
    columns: [name, email]
  form:
    fields: [name, email]
permissions:
  read: [admin, user]
  create: [admin]
workflow:
  enabled: false
events:
  enabled: false
`),
    );

    expect(result.errors).toEqual([]);
    expect(result.document).toBeDefined();
  });

  it('rejects unknown keys and invalid node kinds in optional sections', () => {
    const result = parseSchemaSource(
      source(`api:
  provider: google
ui:
  table:
    columns: [name]
  list:
    columns: name
permissions:
  admin: [admin]
  read: admin
workflow:
  handler: send_email
events:
  enabled: []
metadata:
  arbitrary:
    nested: true
`),
    );

    expect(result.document).toBeUndefined();
    expect(result.errors.map((error) => error.message)).toEqual([
      'Unknown Schema key "provider" at api.',
      'Unknown Schema key "table" at ui.',
      'Schema value at ui.list.columns must be a sequence.',
      'Unknown Schema key "admin" at permissions.',
      'Schema value at permissions.read must be a sequence.',
      'Unknown Schema key "handler" at workflow.',
      'Schema value at events.enabled must be a scalar.',
    ]);
  });
});
