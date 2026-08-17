import { lstat, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { GstackError } from '@gstack/core';

const PROJECT_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const DIRECTORIES = [
  'app',
  'schema',
  'migrations',
  'generated',
  'docs',
] as const;

export interface ProjectInitializationResult {
  readonly name: string;
  readonly root: string;
  readonly createdPaths: readonly string[];
}

export async function initializeLocalProject(input: {
  readonly name: string;
  readonly parentDirectory?: string;
}): Promise<ProjectInitializationResult> {
  if (!PROJECT_NAME.test(input.name)) {
    throw projectError(
      'PROJECT_INIT_NAME_INVALID',
      'Project name must use lower kebab case.',
    );
  }
  const parent = path.resolve(input.parentDirectory ?? process.cwd());
  const target = path.join(parent, input.name);
  if (await pathExists(target)) {
    throw projectError(
      'PROJECT_INIT_TARGET_EXISTS',
      'Project target already exists.',
    );
  }

  let temporary: string;
  try {
    temporary = await mkdtemp(path.join(parent, `.gstack-init-${input.name}-`));
  } catch (cause: unknown) {
    throw projectError(
      'PROJECT_INIT_WRITE_FAILED',
      'Project staging directory could not be created.',
      cause,
    );
  }
  let moved = false;
  try {
    await writeFile(
      path.join(temporary, 'gstack.yaml'),
      projectConfig(input.name),
      { encoding: 'utf8', flag: 'wx' },
    );
    await writeFile(
      path.join(temporary, 'package.json'),
      `${JSON.stringify(
        { name: input.name, version: '0.0.0', private: true, type: 'module' },
        null,
        2,
      )}\n`,
      { encoding: 'utf8', flag: 'wx' },
    );
    await Promise.all(
      DIRECTORIES.map((directory) =>
        mkdir(path.join(temporary, directory), { recursive: false }),
      ),
    );
    await rename(temporary, target);
    moved = true;
  } catch (cause: unknown) {
    if (await pathExists(target)) {
      throw projectError(
        'PROJECT_INIT_TARGET_EXISTS',
        'Project target already exists.',
        cause,
      );
    }
    throw projectError(
      'PROJECT_INIT_WRITE_FAILED',
      'Project files could not be created.',
      cause,
    );
  } finally {
    if (!moved) await rm(temporary, { recursive: true, force: true });
  }

  return deepFreeze({
    name: input.name,
    root: target,
    createdPaths: [
      'gstack.yaml',
      'package.json',
      ...DIRECTORIES.map((name) => `${name}/`),
    ],
  });
}

function projectConfig(name: string): string {
  return `version: 1
name: ${name}
schemaVersion: 1
schema:
  directory: schema
generator:
  formatVersion: 1
  types: true
  validation: true
  api: true
  backend: true
  frontend: true
  openapi: true
  documentation: true
  aiDocumentation: true
`;
}

async function pathExists(filename: string): Promise<boolean> {
  try {
    await lstat(filename);
    return true;
  } catch (error: unknown) {
    if (isErrorCode(error, 'ENOENT')) return false;
    throw projectError(
      'PROJECT_INIT_WRITE_FAILED',
      'Project target could not be inspected.',
      error,
    );
  }
}

function projectError(
  code:
    | 'PROJECT_INIT_NAME_INVALID'
    | 'PROJECT_INIT_TARGET_EXISTS'
    | 'PROJECT_INIT_WRITE_FAILED',
  message: string,
  cause?: unknown,
): GstackError {
  return new GstackError(
    { code, category: 'configuration', message },
    cause === undefined ? undefined : { cause },
  );
}

function isErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
