import { parseDocument, stringify } from 'yaml';

import { verifyMigrationChecksum, type MigrationFile } from './file.js';
import type { MigrationOperation } from './types.js';

const ROOT_KEYS = new Set([
  'formatVersion',
  'version',
  'name',
  'checksum',
  'operations',
]);
const COMMON_OPERATION_KEYS = new Set([
  'id',
  'type',
  'model',
  'risk',
  'destructive',
  'reversible',
  'capability',
]);
const TYPE_KEYS: Readonly<
  Record<MigrationOperation['type'], ReadonlySet<string>>
> = {
  create_model: new Set(['definition']),
  drop_model: new Set(['previous']),
  add_column: new Set(['column']),
  drop_column: new Set(['previous']),
  rename_column: new Set(['from', 'to']),
  alter_column: new Set(['column', 'previous', 'target', 'changes']),
  add_index: new Set(['index']),
  drop_index: new Set(['previous']),
  add_relation: new Set(['relation']),
  drop_relation: new Set(['previous']),
};
const OPERATION_TYPES = new Set(Object.keys(TYPE_KEYS));
const RISKS = new Set(['safe', 'caution', 'destructive']);
const CAPABILITIES = new Set([
  'not_evaluated',
  'native',
  'emulated',
  'unsupported',
]);

export class MigrationFileError extends Error {
  public constructor(
    public readonly code:
      | 'MIGRATION_FILE_YAML_INVALID'
      | 'MIGRATION_FILE_INVALID'
      | 'MIGRATION_CHECKSUM_MISMATCH',
    message: string,
  ) {
    super(message);
    this.name = 'MigrationFileError';
  }
}

export function serializeMigrationFile(file: MigrationFile): string {
  return stringify(file, { lineWidth: 0, sortMapEntries: true });
}

export function parseMigrationFile(content: string): MigrationFile {
  const document = parseDocument(content, {
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
    version: '1.2',
  });
  if (document.errors.length > 0 || document.warnings.length > 0) {
    throw new MigrationFileError(
      'MIGRATION_FILE_YAML_INVALID',
      [...document.errors, ...document.warnings]
        .map((problem) => problem.message)
        .join('; '),
    );
  }
  const value = document.toJS() as unknown;
  validateMigrationFile(value);
  if (!verifyMigrationChecksum(value)) {
    throw new MigrationFileError(
      'MIGRATION_CHECKSUM_MISMATCH',
      `Migration checksum mismatch: ${value.version}`,
    );
  }
  return deepFreeze(value);
}

function validateMigrationFile(value: unknown): asserts value is MigrationFile {
  const root = record(value, '$');
  knownKeys(root, ROOT_KEYS, '$');
  exact(root.formatVersion, 1, 'formatVersion');
  text(root.version, 'version');
  if (!/^\d{8}_\d{6}$/u.test(root.version as string)) invalid('version');
  text(root.name, 'name');
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(root.name as string))
    invalid('name');
  text(root.checksum, 'checksum');
  if (!/^[a-f0-9]{64}$/u.test(root.checksum as string)) invalid('checksum');
  if (!Array.isArray(root.operations)) invalid('operations');
  root.operations.forEach(validateOperation);
}

function validateOperation(value: unknown, index: number): void {
  const path = `operations[${index}]`;
  const operation = record(value, path);
  text(operation.type, `${path}.type`);
  if (!OPERATION_TYPES.has(operation.type as string)) invalid(`${path}.type`);
  const type = operation.type as MigrationOperation['type'];
  knownKeys(
    operation,
    new Set([...COMMON_OPERATION_KEYS, ...TYPE_KEYS[type]]),
    path,
  );
  for (const key of ['id', 'model']) text(operation[key], `${path}.${key}`);
  text(operation.risk, `${path}.risk`);
  if (!RISKS.has(operation.risk as string)) invalid(`${path}.risk`);
  boolean(operation.destructive, `${path}.destructive`);
  boolean(operation.reversible, `${path}.reversible`);
  text(operation.capability, `${path}.capability`);
  if (!CAPABILITIES.has(operation.capability as string))
    invalid(`${path}.capability`);
  for (const key of TYPE_KEYS[type]) {
    if (!(key in operation)) invalid(`${path}.${key}`);
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    invalid(path);
  return value as Record<string, unknown>;
}

function knownKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) invalid(`${path}.${key}`);
  }
}

function text(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) invalid(path);
}

function boolean(value: unknown, path: string): asserts value is boolean {
  if (typeof value !== 'boolean') invalid(path);
}

function exact(value: unknown, expected: unknown, path: string): void {
  if (value !== expected) invalid(path);
}

function invalid(path: string): never {
  throw new MigrationFileError(
    'MIGRATION_FILE_INVALID',
    `Migration File value is invalid at ${path}.`,
  );
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
