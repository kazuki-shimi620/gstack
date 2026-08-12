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
]);
const SCHEMA_KEYS = new Set(['directory']);
const GENERATOR_KEYS = new Set([
  'formatVersion',
  'types',
  'validation',
  'api',
  'frontend',
  'openapi',
  'documentation',
  'aiDocumentation',
]);

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

  if (issues.length > 0 || !version || !name || !schemaVersion || !schema) {
    throw new ConfigLoadError(issues);
  }

  return { version, name, schemaVersion, schema, generator };
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
