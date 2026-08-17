import { randomUUID } from 'node:crypto';
import {
  link,
  lstat,
  mkdir,
  readdir,
  readFile,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { GstackError, type GstackProject } from '@gstack/core';
import {
  createMigrationFile,
  diffApplicationModels,
  parseMigrationFile,
  serializeMigrationFile,
  type MigrationFile,
  type MigrationHistoryEntry,
  type MigrationPlan,
} from '@gstack/migration';

const MIGRATION_NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u;
const MIGRATION_FILENAME =
  /^(?<version>\d{8}_\d{6})_(?<name>[a-z][a-z0-9]*(?:_[a-z0-9]+)*)\.yaml$/u;

export interface MigrationCreationResult {
  readonly version: string;
  readonly name: string;
  readonly checksum: string;
  readonly path: string;
  readonly operationCount: number;
}

export async function createProjectMigration(input: {
  readonly project: GstackProject;
  readonly name: string;
  readonly now?: () => Date;
}): Promise<MigrationCreationResult> {
  if (!MIGRATION_NAME.test(input.name)) {
    throw migrationError(
      'MIGRATION_CREATE_NAME_INVALID',
      'Migration name must use snake_case.',
    );
  }
  const application = await input.project.getApplicationModel();
  if (!application) {
    throw migrationError(
      'MIGRATION_SCHEMA_INVALID',
      'Migration File cannot be created from an invalid Schema.',
    );
  }
  const root = path.resolve(input.project.root);
  await requireDirectory(root);
  const directory = path.join(root, 'migrations');
  await ensureDirectory(root, directory);
  const localFiles = await loadLocalMigrations(directory);
  const config = await input.project.getConfig();
  const providerConfigured = config.providers.some(({ enabled }) => enabled);
  let plan: MigrationPlan;
  if (providerConfigured) {
    const history = await input.project.listMigrationHistory();
    validateLocalHistory(localFiles, history);
    plan = (await input.project.previewMigrationPlan()).plan;
  } else {
    if (localFiles.length > 0) {
      throw migrationError(
        'MIGRATION_CREATE_BASELINE_UNAVAILABLE',
        'Provider History is required after the initial local Migration File.',
      );
    }
    plan = diffApplicationModels(null, application);
  }
  if (plan.operations.length === 0) {
    throw migrationError(
      'MIGRATION_CREATE_NO_CHANGES',
      'Migration Plan has no Operations to write.',
    );
  }
  const operations = plan.operations.map((operation) =>
    Object.freeze({ ...operation, capability: 'not_evaluated' as const }),
  );
  const version = nextVersion(localFiles, (input.now ?? (() => new Date()))());
  const file = createMigrationFile(version, input.name, operations);
  const filename = `${version}_${input.name}.yaml`;
  const target = path.join(directory, filename);
  const targetStatus = await safeLstat(target);
  if (targetStatus?.isSymbolicLink()) symlink();
  if (targetStatus) targetExists();
  const temporary = path.join(
    directory,
    `.${filename}.gstack-${process.pid}-${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, serializeMigrationFile(file), {
      encoding: 'utf8',
      flag: 'wx',
    });
    await link(temporary, target);
  } catch (cause: unknown) {
    if (isErrorCode(cause, 'EEXIST')) targetExists(cause);
    throw migrationError(
      'MIGRATION_CREATE_WRITE_FAILED',
      'Migration File could not be created.',
      cause,
    );
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
  const stored = parseMigrationFile(await readFile(target, 'utf8'));
  return Object.freeze({
    version: stored.version,
    name: stored.name,
    checksum: stored.checksum,
    path: `migrations/${filename}`,
    operationCount: stored.operations.length,
  });
}

async function loadLocalMigrations(
  directory: string,
): Promise<
  readonly { readonly filename: string; readonly file: MigrationFile }[]
> {
  const entries = await readdir(directory, { withFileTypes: true });
  const migrations = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.name.startsWith('.')) continue;
    if (!entry.name.endsWith('.yaml') && !entry.name.endsWith('.yml')) continue;
    if (!entry.isFile() || entry.isSymbolicLink()) invalidDirectory();
    const match = MIGRATION_FILENAME.exec(entry.name);
    if (!match) invalidDirectory();
    const file = parseMigrationFile(
      await readFile(path.join(directory, entry.name), 'utf8'),
    );
    if (
      match.groups?.version !== file.version ||
      match.groups.name !== file.name
    )
      invalidDirectory();
    migrations.push(Object.freeze({ filename: entry.name, file }));
  }
  return Object.freeze(migrations);
}

function validateLocalHistory(
  local: readonly { readonly file: MigrationFile }[],
  history: readonly MigrationHistoryEntry[],
): void {
  const byVersion = new Map(local.map(({ file }) => [file.version, file]));
  const historyByVersion = new Map(
    history.map((entry) => [entry.version, entry]),
  );
  for (const entry of history) {
    const file = byVersion.get(entry.version);
    if (!file || file.checksum !== entry.checksum) baselineUnavailable();
  }
  for (const { file } of local) {
    const entry = historyByVersion.get(file.version);
    if (
      !entry ||
      entry.checksum !== file.checksum ||
      (entry.status !== 'applied' && entry.status !== 'rolled_back')
    )
      baselineUnavailable();
  }
}

function nextVersion(
  local: readonly { readonly file: MigrationFile }[],
  now: Date,
): string {
  if (Number.isNaN(now.getTime())) {
    throw migrationError(
      'MIGRATION_CREATE_VERSION_INVALID',
      'Migration clock did not provide a valid UTC date.',
    );
  }
  const currentDate = now.toISOString().slice(0, 10).replaceAll('-', '');
  const latest = local.at(-1)?.file.version;
  const latestDate = latest?.slice(0, 8);
  const date =
    latestDate && latestDate > currentDate ? latestDate : currentDate;
  const sequence =
    Math.max(
      0,
      ...local
        .map(({ file }) => file.version)
        .filter((version) => version.startsWith(`${date}_`))
        .map((version) => Number(version.slice(9))),
    ) + 1;
  if (sequence > 999_999) {
    throw migrationError(
      'MIGRATION_CREATE_VERSION_INVALID',
      'Migration sequence is exhausted for the selected UTC date.',
    );
  }
  return `${date}_${String(sequence).padStart(6, '0')}`;
}

async function ensureDirectory(root: string, directory: string): Promise<void> {
  const status = await safeLstat(directory);
  if (status?.isSymbolicLink()) symlink();
  if (status && !status.isDirectory()) invalidDirectory();
  if (!status) await mkdir(directory);
  if (!path.relative(root, directory) || path.dirname(directory) !== root)
    invalidDirectory();
}

async function requireDirectory(directory: string): Promise<void> {
  const status = await safeLstat(directory);
  if (status?.isSymbolicLink()) symlink();
  if (!status?.isDirectory()) invalidDirectory();
}

async function safeLstat(filename: string) {
  return lstat(filename).catch((error: unknown) =>
    isErrorCode(error, 'ENOENT') ? null : Promise.reject(error),
  );
}

function baselineUnavailable(): never {
  throw migrationError(
    'MIGRATION_CREATE_BASELINE_UNAVAILABLE',
    'Local Migration Files and Provider History do not define a safe baseline.',
  );
}

function invalidDirectory(): never {
  throw migrationError(
    'MIGRATION_CREATE_PATH_INVALID',
    'Migration paths must be regular files inside migrations/.',
  );
}

function symlink(): never {
  throw migrationError(
    'MIGRATION_CREATE_SYMLINK_FORBIDDEN',
    'Migration paths must not contain symbolic links.',
  );
}

function targetExists(cause?: unknown): never {
  throw migrationError(
    'MIGRATION_CREATE_TARGET_EXISTS',
    'Migration File target already exists.',
    cause,
  );
}

function migrationError(
  code:
    | 'MIGRATION_CREATE_NAME_INVALID'
    | 'MIGRATION_CREATE_BASELINE_UNAVAILABLE'
    | 'MIGRATION_CREATE_NO_CHANGES'
    | 'MIGRATION_CREATE_VERSION_INVALID'
    | 'MIGRATION_CREATE_PATH_INVALID'
    | 'MIGRATION_CREATE_SYMLINK_FORBIDDEN'
    | 'MIGRATION_CREATE_TARGET_EXISTS'
    | 'MIGRATION_CREATE_WRITE_FAILED'
    | 'MIGRATION_SCHEMA_INVALID',
  message: string,
  cause?: unknown,
): GstackError {
  return new GstackError(
    { code, category: 'migration', message },
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
