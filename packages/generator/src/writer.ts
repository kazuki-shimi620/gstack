import {
  lstat,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { validateGeneratedPath } from './artifact.js';
import {
  GENERATED_MANIFEST_PATH,
  parseGeneratedManifest,
  serializeGeneratedManifest,
} from './manifest.js';
import type { GeneratedArtifactManifest } from './manifest.js';
import type { GenerationPlan } from './plan.js';

export async function loadGeneratedManifest(
  projectRoot: string,
): Promise<GeneratedArtifactManifest | null> {
  if (!path.isAbsolute(projectRoot)) {
    throw new GenerationWriteError(
      'GENERATION_ROOT_INVALID',
      'Generation Project Root must be absolute.',
    );
  }
  try {
    await rejectSymlink(projectRoot);
    const target = path.join(
      projectRoot,
      ...GENERATED_MANIFEST_PATH.split('/'),
    );
    if (!(await existingSafeDirectory(projectRoot, path.dirname(target))))
      return null;
    await rejectSymlinkIfExists(target);
    const content = await readFile(target, 'utf8').catch(
      (error: NodeJS.ErrnoException) =>
        error.code === 'ENOENT' ? null : Promise.reject(error),
    );
    return content === null ? null : parseGeneratedManifest(content);
  } catch (error: unknown) {
    if (error instanceof GenerationWriteError) throw error;
    throw new GenerationWriteError(
      'GENERATION_WRITE_FAILED',
      'Generated Artifact Manifest could not be loaded.',
      { cause: error },
    );
  }
}

async function existingSafeDirectory(
  projectRoot: string,
  directory: string,
): Promise<boolean> {
  const relative = path.relative(projectRoot, directory);
  let current = projectRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const status = await lstat(current).catch((error: NodeJS.ErrnoException) =>
      error.code === 'ENOENT' ? null : Promise.reject(error),
    );
    if (!status) return false;
    if (status.isSymbolicLink()) symlink();
    if (!status.isDirectory()) return false;
  }
  return true;
}

export class GenerationWriteError extends Error {
  public constructor(
    public readonly code:
      | 'GENERATION_ROOT_INVALID'
      | 'GENERATION_SYMLINK_FORBIDDEN'
      | 'GENERATION_WRITE_FAILED',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GenerationWriteError';
  }
}

export async function writeGenerationPlan(
  projectRoot: string,
  plan: GenerationPlan,
): Promise<void> {
  if (!path.isAbsolute(projectRoot)) {
    throw new GenerationWriteError(
      'GENERATION_ROOT_INVALID',
      'Generation Project Root must be absolute.',
    );
  }
  try {
    await rejectSymlink(projectRoot);
    for (const artifact of plan.writes) {
      validateGeneratedPath(artifact.path);
      await atomicWrite(projectRoot, artifact.path, artifact.content);
    }
    for (const relativePath of plan.deletes) {
      validateGeneratedPath(relativePath);
      await safeDelete(projectRoot, relativePath);
    }
    await atomicWrite(
      projectRoot,
      GENERATED_MANIFEST_PATH,
      serializeGeneratedManifest(plan.manifest),
    );
  } catch (error: unknown) {
    if (error instanceof GenerationWriteError) throw error;
    throw new GenerationWriteError(
      'GENERATION_WRITE_FAILED',
      'Generated Artifacts could not be written.',
      { cause: error },
    );
  }
}

async function atomicWrite(
  projectRoot: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const target = path.join(projectRoot, ...relativePath.split('/'));
  const directory = path.dirname(target);
  await ensureSafeDirectory(projectRoot, directory);
  await rejectSymlinkIfExists(target);
  const temporary = path.join(
    directory,
    `.${path.basename(target)}.gstack-${process.pid}-${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function safeDelete(
  projectRoot: string,
  relativePath: string,
): Promise<void> {
  const target = path.join(projectRoot, ...relativePath.split('/'));
  await ensureSafeDirectory(projectRoot, path.dirname(target));
  await rejectSymlinkIfExists(target);
  await unlink(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

async function ensureSafeDirectory(
  projectRoot: string,
  directory: string,
): Promise<void> {
  const relative = path.relative(projectRoot, directory);
  let current = projectRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const status = await lstat(current).catch((error: NodeJS.ErrnoException) =>
      error.code === 'ENOENT' ? null : Promise.reject(error),
    );
    if (status?.isSymbolicLink()) symlink();
    if (status && !status.isDirectory()) {
      throw new GenerationWriteError(
        'GENERATION_WRITE_FAILED',
        'Generated Artifact parent is not a directory.',
      );
    }
    if (!status) await mkdir(current);
  }
}

async function rejectSymlink(target: string): Promise<void> {
  const status = await lstat(target);
  if (status.isSymbolicLink()) symlink();
  if (!status.isDirectory()) {
    throw new GenerationWriteError(
      'GENERATION_ROOT_INVALID',
      'Generation Project Root must be a directory.',
    );
  }
}

async function rejectSymlinkIfExists(target: string): Promise<void> {
  const status = await lstat(target).catch((error: NodeJS.ErrnoException) =>
    error.code === 'ENOENT' ? null : Promise.reject(error),
  );
  if (status?.isSymbolicLink()) symlink();
  if (status?.isDirectory()) {
    throw new GenerationWriteError(
      'GENERATION_WRITE_FAILED',
      'Generated Artifact target is a directory.',
    );
  }
}

function symlink(): never {
  throw new GenerationWriteError(
    'GENERATION_SYMLINK_FORBIDDEN',
    'Generated Artifact paths must not contain symbolic links.',
  );
}
