import { describe, expect, it } from 'vitest';

import type { ApplicationModel, Field, Model } from '@gstack/application';

import { generateValidationArtifacts } from './validation.js';

describe('Validation Generator', () => {
  it('Field ruleをname順で構造化validatorへ変換する', () => {
    const artifacts = generateValidationArtifacts(
      application([
        model('users', [
          field('score', 'number', {
            validation: { ...validation, min: 0, max: 100 },
          }),
          field('name', 'string', {
            required: true,
            validation: {
              ...validation,
              minLength: 2,
              maxLength: 20,
              pattern: '^[a-z]+$',
            },
          }),
          field('role', 'enum', { enumValues: ['member', 'admin'] }),
        ]),
      ]),
    );
    const modelArtifact = artifacts.find(
      ({ path }) => path === 'generated/validation/users.ts',
    );

    expect(artifacts.map(({ path }) => path)).toEqual([
      'generated/validation/runtime.ts',
      'generated/validation/users.ts',
      'generated/validation/index.ts',
    ]);
    expect(modelArtifact?.content).toContain(
      '{ name: "name", type: "string", required: true, minLength: 2, maxLength: 20, pattern: "^[a-z]+$" }',
    );
    expect(modelArtifact?.content).toContain(
      '{ name: "role", type: "enum", required: false, enumValues: ["admin","member"] }',
    );
    expect(modelArtifact?.content.indexOf('name: "name"')).toBeLessThan(
      modelArtifact?.content.indexOf('name: "role"') ?? 0,
    );
  });

  it('runtimeへstable issue、非coercion、全MVP ruleを生成する', () => {
    const [runtime] = generateValidationArtifacts(application([]));
    expect(runtime?.path).toBe('generated/validation/runtime.ts');
    expect(runtime?.content).toContain(
      "readonly code: 'VALIDATION_OBJECT_REQUIRED'",
    );
    expect(runtime?.content).toContain("rule.name, 'VALIDATION_REQUIRED'");
    expect(runtime?.content).toContain('Number.isInteger(value)');
    expect(runtime?.content).toContain("typeof value === 'string'");
    expect(runtime?.content).toContain('Array.isArray(value)');
    expect(runtime?.content).toContain('Number.isFinite(value)');
    expect(runtime?.content).not.toContain('parseInt');
    expect(runtime?.content).not.toContain('Number(value)');
  });

  it('Modelをname順で生成してindexからexportする', () => {
    const artifacts = generateValidationArtifacts(
      application([model('z_items', []), model('accounts', [])]),
    );
    expect(artifacts.map(({ path }) => path)).toEqual([
      'generated/validation/runtime.ts',
      'generated/validation/accounts.ts',
      'generated/validation/z_items.ts',
      'generated/validation/index.ts',
    ]);
    expect(artifacts.at(-1)?.content).toContain(
      "export { validateAccounts } from './accounts.js';\nexport { validateZItems } from './z_items.js';",
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

function model(name: string, fields: readonly Field[]): Model {
  return {
    name,
    displayName: name,
    description: null,
    primaryKey: fields[0]?.name ?? 'id',
    fields,
    indexes: [],
    relations: [],
    api: { resource: null, create: false, update: false, delete: false },
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
