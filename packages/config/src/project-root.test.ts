import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { findProjectRoot } from './project-root.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('findProjectRoot', () => {
  it('finds the nearest gstack.yaml while walking upward', async () => {
    const base = await createTemporaryDirectory();
    const project = path.join(base, 'project');
    const nested = path.join(project, 'app', 'nested');
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(project, 'gstack.yaml'), 'name: example\n');

    await expect(findProjectRoot(nested)).resolves.toBe(project);
  });

  it('returns null when no project marker exists', async () => {
    const base = await createTemporaryDirectory();
    await expect(findProjectRoot(base)).resolves.toBeNull();
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'gstack-config-test-'));
  temporaryDirectories.push(directory);
  return directory;
}
