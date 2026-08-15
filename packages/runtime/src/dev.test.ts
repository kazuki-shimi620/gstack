import { describe, expect, it } from 'vitest';

import { hasDevDuplicate, validateDevRecord } from './dev.js';

const model = {
  name: 'users',
  displayName: 'Users',
  description: null,
  primaryKey: 'id',
  fields: [
    field('id', 'uuid', true, true),
    field('name', 'string', true, true),
  ],
  indexes: [],
  relations: [],
  api: { resource: 'users', create: true, update: true, delete: true },
  ui: { list: { columns: [] }, form: { fields: [] } },
  permissions: { read: [], create: [], update: [], delete: [] },
  workflow: { enabled: false },
  events: { enabled: false },
  metadata: {},
} as never;

describe('standard local development engine', () => {
  it('validates create and partial update records from the Application Model', () => {
    expect(
      validateDevRecord(
        model,
        { id: '123e4567-e89b-12d3-a456-426614174000', name: 'Alice' },
        false,
      ),
    ).toEqual({ id: '123e4567-e89b-12d3-a456-426614174000', name: 'Alice' });
    expect(validateDevRecord(model, { name: 'Bob' }, true)).toEqual({
      name: 'Bob',
    });
    expect(() =>
      validateDevRecord(model, { id: 'invalid', name: 'Alice' }, false),
    ).toThrow();
    expect(() =>
      validateDevRecord(
        model,
        { id: '123e4567-e89b-12d3-a456-426614174000' },
        false,
      ),
    ).toThrow();
    expect(() =>
      validateDevRecord(model, { name: 'Alice', unknown: true }, true),
    ).toThrow();
  });

  it('detects unique conflicts while excluding the updated record', () => {
    const records = new Map([
      [
        '123e4567-e89b-12d3-a456-426614174000',
        { id: '123e4567-e89b-12d3-a456-426614174000', name: 'Alice' },
      ],
    ]);
    expect(
      hasDevDuplicate(
        model,
        records,
        { id: '223e4567-e89b-12d3-a456-426614174000', name: 'Alice' },
        null,
      ),
    ).toBe(true);
    expect(
      hasDevDuplicate(
        model,
        records,
        { id: '123e4567-e89b-12d3-a456-426614174000', name: 'Alice' },
        '123e4567-e89b-12d3-a456-426614174000',
      ),
    ).toBe(false);
  });
});

function field(
  name: string,
  type: 'uuid' | 'string',
  required: boolean,
  unique: boolean,
) {
  return {
    name,
    type,
    required,
    unique,
    enumValues: [],
    validation: {
      minLength: null,
      maxLength: null,
      pattern: null,
      min: null,
      max: null,
    },
  };
}
