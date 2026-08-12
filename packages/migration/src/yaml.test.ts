import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';

import { createMigrationFile } from './file.js';
import type { AddColumnOperation } from './types.js';
import { parseMigrationFile, serializeMigrationFile } from './yaml.js';
import type { MigrationFileError } from './yaml.js';

const operation: AddColumnOperation = {
  id: 'add_column:users:email',
  type: 'add_column',
  model: 'users',
  column: {
    name: 'email',
    type: 'string',
    required: false,
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
  risk: 'safe',
  destructive: false,
  reversible: true,
  capability: 'not_evaluated',
};

describe('Migration YAML', () => {
  it('Migration Fileを決定的なYAMLへ変換して復元する', () => {
    const file = createMigrationFile('20260812_000001', 'add_user_email', [
      operation,
    ]);

    const yaml = serializeMigrationFile(file);
    const parsed = parseMigrationFile(yaml);

    expect(serializeMigrationFile(file)).toBe(yaml);
    expect(parsed).toEqual(file);
    expect(Object.isFrozen(parsed.operations[0])).toBe(true);
  });

  it('YAML formattingとcommentはchecksumへ影響しない', () => {
    const file = createMigrationFile('20260812_000001', 'add_user_email', [
      operation,
    ]);
    const yaml = `# reviewed migration\n${serializeMigrationFile(file).replaceAll(': ', ':    ')}`;

    expect(parseMigrationFile(yaml)).toEqual(file);
  });

  it('payload改変によるchecksum不一致を拒否する', () => {
    const file = createMigrationFile('20260812_000001', 'add_user_email', [
      operation,
    ]);
    const yaml = serializeMigrationFile(file).replace(
      'model: users',
      'model: accounts',
    );

    expect(() => parseMigrationFile(yaml)).toThrow(
      expect.objectContaining({ code: 'MIGRATION_CHECKSUM_MISMATCH' }),
    );
  });

  it.each([
    [
      '未知root key',
      'formatVersion: 1\nversion: 20260812_000001\nname: test\nchecksum: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\noperations: []\nprovider: google\n',
      'MIGRATION_FILE_INVALID',
    ],
    [
      'Provider固有Operation key',
      stringify({
        ...createMigrationFile('20260812_000001', 'test', [operation]),
        operations: [{ ...operation, sql: 'ALTER TABLE' }],
      }),
      'MIGRATION_FILE_INVALID',
    ],
    [
      'duplicate key',
      'formatVersion: 1\nformatVersion: 1\n',
      'MIGRATION_FILE_YAML_INVALID',
    ],
    [
      'custom YAML tag',
      'formatVersion: !custom 1\n',
      'MIGRATION_FILE_YAML_INVALID',
    ],
  ] as const)('%sを拒否する', (_case, yaml, code) => {
    expect(() => parseMigrationFile(yaml)).toThrow(
      expect.objectContaining<Partial<MigrationFileError>>({ code }),
    );
  });
});
