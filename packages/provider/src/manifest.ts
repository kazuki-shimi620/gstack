import type { MigrationOperation } from '@gstack/migration';

import type { ProviderManifest } from './types.js';

const ROOT_KEYS = new Set([
  'formatVersion',
  'name',
  'packageName',
  'version',
  'minimumGstackVersion',
  'capabilities',
  'migrationSupport',
]);
const CAPABILITY_KEYS = new Set([
  'database',
  'api',
  'authentication',
  'storage',
  'deploy',
]);
const OPERATION_TYPES: readonly MigrationOperation['type'][] = [
  'create_model',
  'drop_model',
  'add_column',
  'drop_column',
  'rename_column',
  'alter_column',
  'add_index',
  'drop_index',
  'add_relation',
  'drop_relation',
];
const MIGRATION_KEYS = new Set(OPERATION_TYPES);
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

export class ProviderManifestError extends Error {
  public constructor(
    public readonly code: 'PROVIDER_MANIFEST_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'ProviderManifestError';
  }
}

export function validateProviderManifest(value: unknown): ProviderManifest {
  const root = record(value, '$');
  exactKeys(root, ROOT_KEYS, '$');
  if (root.formatVersion !== 1) invalid('formatVersion');
  string(root.name, 'name');
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(root.name)) invalid('name');
  string(root.packageName, 'packageName');
  if (
    !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(
      root.packageName,
    )
  )
    invalid('packageName');
  for (const key of ['version', 'minimumGstackVersion'] as const) {
    string(root[key], key);
    if (!VERSION.test(root[key])) invalid(key);
  }
  const capabilities = record(root.capabilities, 'capabilities');
  exactKeys(capabilities, CAPABILITY_KEYS, 'capabilities');
  for (const key of CAPABILITY_KEYS) {
    if (typeof capabilities[key] !== 'boolean') invalid(`capabilities.${key}`);
  }
  const migrationSupport = record(root.migrationSupport, 'migrationSupport');
  exactKeys(migrationSupport, MIGRATION_KEYS, 'migrationSupport');
  for (const key of OPERATION_TYPES) {
    if (
      !['native', 'emulated', 'unsupported'].includes(
        String(migrationSupport[key]),
      )
    )
      invalid(`migrationSupport.${key}`);
  }
  return deepFreeze(value as ProviderManifest);
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: ReadonlySet<string>,
  path: string,
): void {
  const actual = Object.keys(value);
  if (
    actual.length !== expected.size ||
    actual.some((key) => !expected.has(key))
  )
    invalid(path);
}

function string(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) invalid(path);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    invalid(path);
  return value as Record<string, unknown>;
}

function invalid(path: string): never {
  throw new ProviderManifestError(
    'PROVIDER_MANIFEST_INVALID',
    `Provider Manifest is invalid at ${path}.`,
  );
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
