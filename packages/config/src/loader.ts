import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseDocument } from 'yaml';

import { GSTACK_CONFIG_FILENAME } from './project-root.js';
import {
  ConfigLoadError,
  type ConfigIssue,
  type GstackConfig,
} from './types.js';

const ROOT_KEYS = new Set([
  'version',
  'name',
  'schemaVersion',
  'schema',
  'generator',
  'providers',
]);
const SCHEMA_KEYS = new Set(['directory']);
const GENERATOR_KEYS = new Set([
  'formatVersion',
  'types',
  'validation',
  'api',
  'backend',
  'frontend',
  'openapi',
  'documentation',
  'aiDocumentation',
]);
const PROVIDER_KEYS = new Set(['enabled', 'configuration']);

export async function loadProjectConfig(
  projectRoot: string,
): Promise<GstackConfig> {
  const filename = path.join(projectRoot, GSTACK_CONFIG_FILENAME);
  let content: string;
  try {
    content = await readFile(filename, 'utf8');
  } catch (error: unknown) {
    throw new ConfigLoadError(
      [
        {
          code: 'CONFIG_REQUIRED',
          message: `${GSTACK_CONFIG_FILENAME} could not be read.`,
          path: GSTACK_CONFIG_FILENAME,
        },
      ],
      { cause: error },
    );
  }

  const document = parseDocument(content, {
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
    version: '1.2',
  });
  if (document.errors.length > 0) {
    throw new ConfigLoadError(
      document.errors.map((error) => ({
        code: 'CONFIG_YAML_INVALID',
        message: error.message,
        path: GSTACK_CONFIG_FILENAME,
      })),
    );
  }

  const value = document.toJS() as unknown;
  const issues: ConfigIssue[] = [];
  if (!isRecord(value)) {
    throw new ConfigLoadError([
      {
        code: 'CONFIG_ROOT_INVALID',
        message: 'gstack.yaml must contain a mapping.',
        path: GSTACK_CONFIG_FILENAME,
      },
    ]);
  }

  reportUnknownKeys(value, ROOT_KEYS, '', issues);
  const version = readVersion(value.version, 'version', 'config', issues);
  const name = readNonEmptyString(value.name, 'name', issues);
  const schemaVersion = readVersion(
    value.schemaVersion,
    'schemaVersion',
    'schema',
    issues,
  );
  const schema = readSchema(value.schema, issues);
  const generator = readGenerator(value.generator, issues);
  const providers = readProviders(value.providers, issues);

  if (issues.length > 0 || !version || !name || !schemaVersion || !schema) {
    throw new ConfigLoadError(issues);
  }

  return { version, name, schemaVersion, schema, generator, providers };
}

function readProviders(
  value: unknown,
  issues: ConfigIssue[],
): GstackConfig['providers'] {
  if (value === undefined) return Object.freeze([]);
  if (!isRecord(value)) {
    issues.push({
      code: 'CONFIG_VALUE_INVALID',
      message: 'providers must be a mapping.',
      path: 'providers',
    });
    return Object.freeze([]);
  }
  const providers = Object.keys(value)
    .sort()
    .flatMap((name) => {
      const providerPath = `providers.${name}`;
      if (!/^[a-z][a-z0-9-]*$/u.test(name)) {
        issues.push({
          code: 'CONFIG_VALUE_INVALID',
          message: `${providerPath} has an invalid Provider name.`,
          path: providerPath,
        });
      }
      const entry = value[name];
      if (!isRecord(entry)) {
        issues.push({
          code: 'CONFIG_VALUE_INVALID',
          message: `${providerPath} must be a mapping.`,
          path: providerPath,
        });
        return [];
      }
      reportUnknownKeys(entry, PROVIDER_KEYS, providerPath, issues);
      const enabled = readBoolean(
        entry.enabled,
        `${providerPath}.enabled`,
        issues,
      );
      if (!isRecord(entry.configuration)) {
        issues.push({
          code: 'CONFIG_REQUIRED',
          message: `${providerPath}.configuration must be a mapping.`,
          path: `${providerPath}.configuration`,
        });
        return [];
      }
      if (!isJsonCompatible(entry.configuration)) {
        issues.push({
          code: 'CONFIG_VALUE_INVALID',
          message: `${providerPath}.configuration must contain JSON-compatible values.`,
          path: `${providerPath}.configuration`,
        });
        return [];
      }
      if (enabled === null) return [];
      return [
        Object.freeze({
          name,
          enabled,
          configuration: deepFreeze(structuredClone(entry.configuration)),
        }),
      ];
    });
  return Object.freeze(providers);
}

function readGenerator(
  value: unknown,
  issues: ConfigIssue[],
): GstackConfig['generator'] {
  if (value === undefined) return null;
  if (!isRecord(value)) {
    issues.push({
      code: 'CONFIG_VALUE_INVALID',
      message: 'generator must be a mapping.',
      path: 'generator',
    });
    return null;
  }
  reportUnknownKeys(value, GENERATOR_KEYS, 'generator', issues);
  const formatVersion = readVersion(
    value.formatVersion,
    'generator.formatVersion',
    'config',
    issues,
  );
  const types = readBoolean(value.types, 'generator.types', issues);
  const validation = readBoolean(
    value.validation,
    'generator.validation',
    issues,
  );
  const api = readBoolean(value.api, 'generator.api', issues);
  const backend = readBoolean(value.backend, 'generator.backend', issues);
  const frontend = readBoolean(value.frontend, 'generator.frontend', issues);
  const openapi = readBoolean(value.openapi, 'generator.openapi', issues);
  const documentation = readBoolean(
    value.documentation,
    'generator.documentation',
    issues,
  );
  const aiDocumentation = readBoolean(
    value.aiDocumentation,
    'generator.aiDocumentation',
    issues,
  );
  if (
    !formatVersion ||
    [
      types,
      validation,
      api,
      backend,
      frontend,
      openapi,
      documentation,
      aiDocumentation,
    ].some((item) => item === null)
  )
    return null;
  return {
    formatVersion,
    types: types!,
    validation: validation!,
    api: api!,
    backend: backend!,
    frontend: frontend!,
    openapi: openapi!,
    documentation: documentation!,
    aiDocumentation: aiDocumentation!,
  };
}

function readSchema(
  value: unknown,
  issues: ConfigIssue[],
): GstackConfig['schema'] | null {
  if (!isRecord(value)) {
    issues.push({
      code: 'CONFIG_REQUIRED',
      message: 'schema must be a mapping.',
      path: 'schema',
    });
    return null;
  }
  reportUnknownKeys(value, SCHEMA_KEYS, 'schema', issues);
  const directory = readNonEmptyString(
    value.directory,
    'schema.directory',
    issues,
  );
  if (!directory) {
    return null;
  }
  if (path.isAbsolute(directory) || resolvesOutsideProject(directory)) {
    issues.push({
      code: 'CONFIG_VALUE_INVALID',
      message: 'schema.directory must be a project-relative path.',
      path: 'schema.directory',
    });
    return null;
  }
  return { directory };
}

function readVersion(
  value: unknown,
  propertyPath: string,
  kind: 'config' | 'schema',
  issues: ConfigIssue[],
): 1 | null {
  if (value === undefined) {
    issues.push({
      code: 'CONFIG_REQUIRED',
      message: `${propertyPath} is required.`,
      path: propertyPath,
    });
    return null;
  }
  if (value !== 1) {
    issues.push({
      code:
        kind === 'config'
          ? 'CONFIG_VERSION_UNSUPPORTED'
          : 'SCHEMA_VERSION_UNSUPPORTED',
      message: `${propertyPath} must be 1.`,
      path: propertyPath,
    });
    return null;
  }
  return 1;
}

function readNonEmptyString(
  value: unknown,
  propertyPath: string,
  issues: ConfigIssue[],
): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push({
      code: 'CONFIG_REQUIRED',
      message: `${propertyPath} must be a non-empty string.`,
      path: propertyPath,
    });
    return null;
  }
  return value;
}

function readBoolean(
  value: unknown,
  propertyPath: string,
  issues: ConfigIssue[],
): boolean | null {
  if (typeof value !== 'boolean') {
    issues.push({
      code: 'CONFIG_REQUIRED',
      message: `${propertyPath} must be a boolean.`,
      path: propertyPath,
    });
    return null;
  }
  return value;
}

function reportUnknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  parent: string,
  issues: ConfigIssue[],
): void {
  for (const key of Object.keys(value).sort()) {
    if (!allowed.has(key)) {
      const propertyPath = parent ? `${parent}.${key}` : key;
      issues.push({
        code: 'CONFIG_UNKNOWN_KEY',
        message: `${propertyPath} is not supported.`,
        path: propertyPath,
      });
    }
  }
}

function resolvesOutsideProject(directory: string): boolean {
  const normalized = path.normalize(directory);
  return normalized === '..' || normalized.startsWith(`..${path.sep}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonCompatible(value: unknown, seen = new Set<object>()): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonCompatible(item, seen))
    : Object.values(value).every((item) => isJsonCompatible(item, seen));
  seen.delete(value);
  return valid;
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
