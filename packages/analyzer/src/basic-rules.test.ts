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

  it('validates Primary Key and Enum semantics', () => {
    const schema = ast(
      'users.yaml',
      `name: users
model: { displayName: User }
database:
  primaryKey: missing_id
  columns:
    id:
      type: uuid
      values: [unexpected]
    role:
      type: enum
    empty_role:
      type: enum
      values: []
    duplicate_role:
      type: enum
      values: [admin, user, admin]
`,
    );

    const diagnostics = validateSchemaBasics([schema]);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'SCHEMA_PRIMARY_KEY_UNKNOWN',
        'SCHEMA_ENUM_VALUES_FORBIDDEN',
        'SCHEMA_PROPERTY_REQUIRED',
        'SCHEMA_ENUM_VALUES_EMPTY',
        'SCHEMA_ENUM_VALUE_DUPLICATE',
      ]),
    );
    expect(diagnostics).toHaveLength(5);
  });

  it('validates Index identity, Columns, uniqueness, and references', () => {
    const schema = ast(
      'users.yaml',
      `name: users
model: { displayName: User }
database:
  primaryKey: id
  columns:
    id: { type: uuid }
    email: { type: string }
  indexes:
    - {}
    - name: BadIndex
      columns: [missing, id, id]
      unique: yes
    - name: BadIndex
      columns: []
`,
    );

    const diagnostics = validateSchemaBasics([schema]);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'SCHEMA_PROPERTY_REQUIRED',
        'SCHEMA_NAME_INVALID',
        'SCHEMA_INDEX_COLUMN_UNKNOWN',
        'SCHEMA_INDEX_COLUMN_DUPLICATE',
        'SCHEMA_VALUE_TYPE_INVALID',
        'SCHEMA_INDEX_DUPLICATE',
        'SCHEMA_INDEX_COLUMNS_EMPTY',
      ]),
    );
    expect(
      diagnostics.filter(
        (diagnostic) => diagnostic.code === 'SCHEMA_PROPERTY_REQUIRED',
      ),
    ).toHaveLength(2);
    expect(diagnostics).toHaveLength(9);
  });

  it('resolves valid belongs_to Relations across Schema files', () => {
    const users = ast(
      'users.yaml',
      `name: users
model: { displayName: User }
database:
  primaryKey: id
  columns:
    id: { type: uuid }
    account_id: { type: uuid }
  relations:
    account:
      type: belongs_to
      field: account_id
      model: accounts
      references: id
`,
    );
    const accounts = ast(
      'accounts.yaml',
      `name: accounts
model: { displayName: Account }
database:
  primaryKey: id
  columns:
    id: { type: uuid }
`,
    );

    expect(validateSchemaBasics([users, accounts])).toEqual([]);
  });

  it('validates Relation names, required values, kinds, and references', () => {
    const users = ast(
      'users.yaml',
      `name: users
model: { displayName: User }
database:
  primaryKey: id
  columns:
    id: { type: uuid }
  relations:
    BadRelation:
      type: has_many
      field: account_id
      model: missing_accounts
      references: missing_id
    account:
      type: belongs_to
      field: id
      model: accounts
      references: missing_id
    incomplete: {}
`,
    );
    const accounts = ast(
      'accounts.yaml',
      `name: accounts
model: { displayName: Account }
database:
  primaryKey: id
  columns:
    id: { type: uuid }
`,
    );

    const diagnostics = validateSchemaBasics([users, accounts]);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'SCHEMA_NAME_INVALID',
        'SCHEMA_RELATION_TYPE_UNSUPPORTED',
        'SCHEMA_RELATION_FIELD_UNKNOWN',
        'SCHEMA_RELATION_MODEL_UNKNOWN',
        'SCHEMA_RELATION_REFERENCE_UNKNOWN',
        'SCHEMA_PROPERTY_REQUIRED',
      ]),
    );
    expect(
      diagnostics.filter(
        (diagnostic) => diagnostic.code === 'SCHEMA_PROPERTY_REQUIRED',
      ),
    ).toHaveLength(4);
    expect(diagnostics).toHaveLength(9);
  });

  it('rejects Relations between incompatible Column types', () => {
    const users = ast(
      'users.yaml',
      `name: users
model: { displayName: User }
database:
  primaryKey: id
  columns:
    id: { type: uuid }
    account_id: { type: uuid }
  relations:
    account:
      type: belongs_to
      field: account_id
      model: accounts
      references: id
`,
    );
    const accounts = ast(
      'accounts.yaml',
      `name: accounts
model: { displayName: Account }
database:
  primaryKey: id
  columns:
    id: { type: integer }
`,
    );

    expect(validateSchemaBasics([users, accounts])).toEqual([
      expect.objectContaining({
        code: 'SCHEMA_RELATION_TYPE_MISMATCH',
        file: 'users.yaml',
      }),
    ]);
  });

  it('accepts compatible string and numeric Validation rules', () => {
    const schema = ast(
      'users.yaml',
      `name: users
model: { displayName: User }
database:
  primaryKey: id
  columns:
    id: { type: uuid }
    name: { type: string }
    age: { type: integer }
validation:
  name:
    minLength: 1
    maxLength: 100
    pattern: "^[a-z]+$"
  age:
    min: 0
    max: 150
`,
    );

    expect(validateSchemaBasics([schema])).toEqual([]);
  });

  it('validates Validation targets, values, compatibility, and ranges', () => {
    const schema = ast(
      'users.yaml',
      `name: users
model: { displayName: User }
database:
  primaryKey: id
  columns:
    id: { type: uuid }
    name: { type: string }
    age: { type: integer }
validation:
  missing:
    minLength: 1
  name:
    minLength: -1
    maxLength: 2.5
    pattern: "["
    min: 0
  age:
    min: 10
    max: 1
    pattern: valid
  id:
    min: 0
`,
    );

    const diagnostics = validateSchemaBasics([schema]);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'SCHEMA_VALIDATION_FIELD_UNKNOWN',
        'SCHEMA_VALIDATION_LENGTH_INVALID',
        'SCHEMA_VALIDATION_PATTERN_INVALID',
        'SCHEMA_VALIDATION_RULE_INCOMPATIBLE',
        'SCHEMA_VALIDATION_RANGE_INVALID',
      ]),
    );
    expect(
      diagnostics.filter(
        (diagnostic) => diagnostic.code === 'SCHEMA_VALIDATION_LENGTH_INVALID',
      ),
    ).toHaveLength(2);
    expect(
      diagnostics.filter(
        (diagnostic) =>
          diagnostic.code === 'SCHEMA_VALIDATION_RULE_INCOMPATIBLE',
      ),
    ).toHaveLength(3);
    expect(diagnostics).toHaveLength(8);
  });

  it('accepts valid optional sections and UI Column references', () => {
    const schema = ast(
      'users.yaml',
      `name: users
description: User management
model: { displayName: User }
database:
  primaryKey: id
  columns:
    id: { type: uuid }
    name: { type: string }
api:
  resource: users
  create: true
  update: false
  delete: false
ui:
  list: { columns: [id, name] }
  form: { fields: [name] }
permissions:
  read: [admin, user]
  create: [admin]
workflow: { enabled: false }
events: { enabled: false }
`,
    );

    expect(validateSchemaBasics([schema])).toEqual([]);
  });

  it('validates optional section value types, duplicates, and references', () => {
    const schema = ast(
      'users.yaml',
      `name: users
description: 1
model: { displayName: User }
database:
  primaryKey: id
  columns:
    id: { type: uuid }
    name: { type: string }
api:
  resource: ""
  create: yes
ui:
  list: { columns: [name, missing, name, 1] }
  form: { fields: [missing] }
permissions:
  read: [admin, admin, 1, ""]
workflow: { enabled: "false" }
events: { enabled: 1 }
`,
    );

    const diagnostics = validateSchemaBasics([schema]);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'SCHEMA_VALUE_TYPE_INVALID',
        'SCHEMA_VALUE_EMPTY',
        'SCHEMA_SEQUENCE_VALUE_DUPLICATE',
        'SCHEMA_UI_COLUMN_UNKNOWN',
      ]),
    );
    expect(
      diagnostics.filter(
        (diagnostic) => diagnostic.code === 'SCHEMA_UI_COLUMN_UNKNOWN',
      ),
    ).toHaveLength(2);
    expect(
      diagnostics.filter(
        (diagnostic) => diagnostic.code === 'SCHEMA_SEQUENCE_VALUE_DUPLICATE',
      ),
    ).toHaveLength(2);
    expect(diagnostics).toHaveLength(12);
  });
});
