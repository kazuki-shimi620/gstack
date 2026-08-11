import { describe, expect, it } from 'vitest';

import { parseSchemaSource, type SchemaAst } from '@gstack/parser';
import type { SchemaSource } from '@gstack/schema';
import { validateSchemaBasics } from './basic-rules.js';

function ast(id: string, content: string): SchemaAst {
  const source: SchemaSource = {
    id,
    name: id.replace(/\.yaml$/, ''),
    path: `/project/schema/${id}`,
    content,
  };
  const result = parseSchemaSource(source);
  if (!result.document) {
    throw new Error(
      `Test Schema failed to parse: ${JSON.stringify(result.errors)}`,
    );
  }
  return result.document.ast;
}

describe('validateSchemaBasics', () => {
  it('accepts valid required properties and initial Column types', () => {
    const schema = ast(
      'users.yaml',
      `name: users
model:
  displayName: User
database:
  primaryKey: id
  columns:
    id:
      type: uuid
    role:
      type: enum
      required: true
      unique: false
      values: [admin, user]
`,
    );

    expect(validateSchemaBasics([schema])).toEqual([]);
  });

  it('reports missing required properties deterministically', () => {
    const schema = ast('users.yaml', 'model: {}\ndatabase: {}\n');

    expect(
      validateSchemaBasics([schema]).map(({ code, message }) => ({
        code,
        message,
      })),
    ).toEqual([
      {
        code: 'SCHEMA_PROPERTY_REQUIRED',
        message: 'Required Schema property name is missing.',
      },
      {
        code: 'SCHEMA_PROPERTY_REQUIRED',
        message: 'Required Schema property model.displayName is missing.',
      },
      {
        code: 'SCHEMA_PROPERTY_REQUIRED',
        message: 'Required Schema property database.columns is missing.',
      },
      {
        code: 'SCHEMA_PROPERTY_REQUIRED',
        message: 'Required Schema property database.primaryKey is missing.',
      },
    ]);
  });

  it('validates semantic scalar types, names, and supported Field types', () => {
    const schema = ast(
      'users.yaml',
      `name: UserProfiles
model:
  displayName: 1
database:
  primaryKey: UserID
  columns:
    UserID:
      type: varchar
      required: yes
      unique: 1
    role:
      type: enum
      values: [admin, 1]
`,
    );

    expect(validateSchemaBasics([schema]).map((error) => error.code)).toEqual([
      'SCHEMA_NAME_INVALID',
      'SCHEMA_VALUE_TYPE_INVALID',
      'SCHEMA_NAME_INVALID',
      'SCHEMA_NAME_INVALID',
      'SCHEMA_FIELD_TYPE_UNSUPPORTED',
      'SCHEMA_VALUE_TYPE_INVALID',
      'SCHEMA_VALUE_TYPE_INVALID',
      'SCHEMA_VALUE_TYPE_INVALID',
    ]);
  });

  it('reports every file participating in a duplicate Model name', () => {
    const first = ast(
      'users.yaml',
      'name: users\nmodel: { displayName: User }\ndatabase: { primaryKey: id, columns: { id: { type: uuid } } }\n',
    );
    const second = ast(
      'accounts.yaml',
      'name: users\nmodel: { displayName: Account }\ndatabase: { primaryKey: id, columns: { id: { type: uuid } } }\n',
    );

    const diagnostics = validateSchemaBasics([first, second]);

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.map((diagnostic) => diagnostic.file)).toEqual([
      'accounts.yaml',
      'users.yaml',
    ]);
    expect(
      diagnostics.every(
        (diagnostic) => diagnostic.code === 'SCHEMA_MODEL_DUPLICATE',
      ),
    ).toBe(true);
  });
});
