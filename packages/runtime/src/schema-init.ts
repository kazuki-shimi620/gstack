import { link, lstat, mkdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { GstackError, type GstackProject } from '@gstack/core';

const MODEL_NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u;

export interface SchemaInitializationResult {
  readonly model: string;
  readonly path: string;
}

export async function initializeSchemaModel(input: {
  readonly project: GstackProject;
  readonly model: string;
}): Promise<SchemaInitializationResult> {
  if (!MODEL_NAME.test(input.model)) {
    throw schemaError(
      'SCHEMA_INIT_NAME_INVALID',
      'Schema Model name must use snake_case.',
    );
  }
  const config = await input.project.getConfig();
  const root = path.resolve(input.project.root);
  await requireDirectory(root);
  const directory = path.resolve(root, config.schema.directory);
  if (!isInsideOrEqual(root, directory)) invalidPath();
  await ensureDirectory(root, directory);
  const filename = `${input.model}.yaml`;
  const target = path.join(directory, filename);
  if (!isInside(directory, target)) invalidPath();
  const targetStatus = await safeLstat(target);
  if (targetStatus?.isSymbolicLink()) symlink();
  if (targetStatus) {
    throw schemaError(
      'SCHEMA_INIT_TARGET_EXISTS',
      'Schema Model target already exists.',
    );
  }
  const before = await input.project.validateSchema();
  if (!before.valid) {
    throw schemaError(
      'SCHEMA_INIT_PROJECT_INVALID',
      'Existing Project Schema must be valid before creating a Model.',
    );
  }
  const temporary = path.join(
    directory,
    `.${filename}.gstack-${process.pid}-${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, schemaTemplate(input.model), {
      encoding: 'utf8',
      flag: 'wx',
    });
    await link(temporary, target);
  } catch (cause: unknown) {
    if (isErrorCode(cause, 'EEXIST')) {
      throw schemaError(
        'SCHEMA_INIT_TARGET_EXISTS',
        'Schema Model target already exists.',
        cause,
      );
    }
    throw schemaError(
      'SCHEMA_INIT_WRITE_FAILED',
      'Schema Model could not be created.',
      cause,
    );
  } finally {
    await unlink(temporary).catch(() => undefined);
  }

  const after = await input.project.validateSchema();
  if (!after.valid) {
    throw schemaError(
      'SCHEMA_INIT_VALIDATION_FAILED',
      'Created Schema Model did not pass Project validation.',
    );
  }
  return Object.freeze({
    model: input.model,
    path: path.relative(root, target).split(path.sep).join(path.posix.sep),
  });
}

function schemaTemplate(model: string): string {
  const displayName = model
    .split('_')
    .map((segment) => segment[0]!.toUpperCase() + segment.slice(1))
    .join('');
  return `name: ${model}
model:
  displayName: ${displayName}
database:
  primaryKey: id
  columns:
    id:
      type: uuid
`;
}

async function ensureDirectory(root: string, directory: string): Promise<void> {
  const relative = path.relative(root, directory);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const status = await safeLstat(current);
    if (status?.isSymbolicLink()) symlink();
    if (status && !status.isDirectory()) invalidPath();
    if (!status) await mkdir(current);
  }
}

async function requireDirectory(directory: string): Promise<void> {
  const status = await safeLstat(directory);
  if (status?.isSymbolicLink()) symlink();
  if (!status?.isDirectory()) invalidPath();
}

async function safeLstat(filename: string) {
  return lstat(filename).catch((error: unknown) =>
    isErrorCode(error, 'ENOENT') ? null : Promise.reject(error),
  );
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative !== '' &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
}

function isInsideOrEqual(root: string, target: string): boolean {
  return root === target || isInside(root, target);
}

function invalidPath(): never {
  throw schemaError(
    'SCHEMA_INIT_PATH_INVALID',
    'Schema Model path must remain inside a regular Project directory.',
  );
}

function symlink(): never {
  throw schemaError(
    'SCHEMA_INIT_SYMLINK_FORBIDDEN',
    'Schema Model paths must not contain symbolic links.',
  );
}

function schemaError(
  code:
    | 'SCHEMA_INIT_NAME_INVALID'
    | 'SCHEMA_INIT_PROJECT_INVALID'
    | 'SCHEMA_INIT_TARGET_EXISTS'
    | 'SCHEMA_INIT_PATH_INVALID'
    | 'SCHEMA_INIT_SYMLINK_FORBIDDEN'
    | 'SCHEMA_INIT_WRITE_FAILED'
    | 'SCHEMA_INIT_VALIDATION_FAILED',
  message: string,
  cause?: unknown,
): GstackError {
  return new GstackError(
    { code, category: 'schema', message },
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
