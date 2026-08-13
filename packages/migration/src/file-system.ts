import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import type { MigrationFile } from './file.js';
import { parseMigrationFile } from './yaml.js';

export const MIGRATION_FILE_MAX_BYTES = 1_048_576;

export class MigrationFileSystemError extends Error {
  public constructor(
    public readonly code:
      | 'MIGRATION_FILE_NOT_FOUND'
      | 'MIGRATION_FILE_PATH_INVALID'
      | 'MIGRATION_FILE_TOO_LARGE',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MigrationFileSystemError';
  }
}

export async function loadMigrationFile(
  projectRoot: string,
  filePath: string,
): Promise<MigrationFile> {
  if (!filePath || path.isAbsolute(filePath) || !/\.ya?ml$/u.test(filePath)) {
    throw invalidPath();
  }
  const root = await safeRealpath(projectRoot);
  const migrations = path.join(root, 'migrations');
  const requested = path.resolve(root, filePath);
  if (!isInside(migrations, requested)) throw invalidPath();
  let migrationsReal: string;
  let fileReal: string;
  let stats: Awaited<ReturnType<typeof lstat>>;
  try {
    migrationsReal = await realpath(migrations);
    fileReal = await realpath(requested);
    stats = await lstat(requested);
  } catch (error: unknown) {
    throw new MigrationFileSystemError(
      'MIGRATION_FILE_NOT_FOUND',
      'Migration File was not found.',
      { cause: error },
    );
  }
  if (
    migrationsReal !== migrations ||
    fileReal !== requested ||
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    !isInside(migrationsReal, fileReal)
  ) {
    throw invalidPath();
  }
  if (stats.size > MIGRATION_FILE_MAX_BYTES) {
    throw new MigrationFileSystemError(
      'MIGRATION_FILE_TOO_LARGE',
      'Migration File exceeds the size limit.',
    );
  }
  return parseMigrationFile(await readFile(fileReal, 'utf8'));
}

async function safeRealpath(value: string): Promise<string> {
  try {
    return await realpath(path.resolve(value));
  } catch (error: unknown) {
    throw new MigrationFileSystemError(
      'MIGRATION_FILE_NOT_FOUND',
      'Migration project root was not found.',
      { cause: error },
    );
  }
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative.length > 0 &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
}

function invalidPath(): MigrationFileSystemError {
  return new MigrationFileSystemError(
    'MIGRATION_FILE_PATH_INVALID',
    'Migration File path must reference a YAML file inside migrations/.',
  );
}
