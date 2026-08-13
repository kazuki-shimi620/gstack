import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createMigrationFile } from './file.js';
import { loadMigrationFile, MIGRATION_FILE_MAX_BYTES } from './file-system.js';
import { serializeMigrationFile } from './yaml.js';

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);

describe('Migration File filesystem loader', () => {
  it('Project migrations配下のstrict YAMLだけを読み込む', async () => {
    const root = await project();
    const relative = 'migrations/20260813_000001_initial.yaml';
    const file = createMigrationFile('20260813_000001', 'initial', []);
    await writeFile(path.join(root, relative), serializeMigrationFile(file));
    await expect(loadMigrationFile(root, relative)).resolves.toEqual(file);
  });

  it('絶対path、traversal、symlink、非YAMLを拒否する', async () => {
    const root = await project();
    const outside = path.join(root, 'outside.yaml');
    await writeFile(outside, 'secret');
    await symlink(outside, path.join(root, 'migrations/link.yaml'));
    for (const selected of [
      outside,
      '../outside.yaml',
      'migrations/link.yaml',
      'migrations/file.json',
    ]) {
      await expect(loadMigrationFile(root, selected)).rejects.toMatchObject({
        code: 'MIGRATION_FILE_PATH_INVALID',
      });
    }
  });

  it('過大fileをparse前に拒否する', async () => {
    const root = await project();
    await writeFile(
      path.join(root, 'migrations/large.yaml'),
      'x'.repeat(MIGRATION_FILE_MAX_BYTES + 1),
    );
    await expect(
      loadMigrationFile(root, 'migrations/large.yaml'),
    ).rejects.toMatchObject({ code: 'MIGRATION_FILE_TOO_LARGE' });
  });
});

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'gstack-migration-file-'));
  roots.push(root);
  await mkdir(path.join(root, 'migrations'));
  return root;
}
