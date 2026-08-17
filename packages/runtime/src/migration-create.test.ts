import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { parseMigrationFile } from '@gstack/migration';

import { createProjectMigration } from './migration-create.js';
import { initializeLocalProject } from './project-init.js';
import { initializeSchemaModel } from './schema-init.js';
import { loadStandardProject } from './index.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('Migration File Creation', () => {
  it('初回null baselineからProvider非依存Fileをatomicに作成する', async () => {
    const project = await projectFixture();
    const result = await createProjectMigration({
      project,
      name: 'initial_schema',
      now: () => new Date('2026-08-17T23:59:59Z'),
    });
    expect(result).toMatchObject({
      version: '20260817_000001',
      name: 'initial_schema',
      path: 'migrations/20260817_000001_initial_schema.yaml',
      operationCount: 1,
    });
    const file = parseMigrationFile(
      await readFile(path.join(project.root, result.path), 'utf8'),
    );
    expect(file.operations).toEqual([
      expect.objectContaining({
        type: 'create_model',
        model: 'users',
        capability: 'not_evaluated',
      }),
    ]);
    expect(file.checksum).toBe(result.checksum);
  });

  it('Provider Historyなしで2件目を重ねない', async () => {
    const project = await projectFixture();
    await createProjectMigration({
      project,
      name: 'initial',
      now: () => new Date('2026-08-17T00:00:00Z'),
    });
    await expect(
      createProjectMigration({
        project,
        name: 'second',
        now: () => new Date('2026-08-18T00:00:00Z'),
      }),
    ).rejects.toMatchObject({
      details: { code: 'MIGRATION_CREATE_BASELINE_UNAVAILABLE' },
    });
  });

  it.each(['Initial', 'initial-schema', '../initial', '.', 'a/b'])(
    '非canonicalなMigration名 %s を拒否する',
    async (name) => {
      const project = await projectFixture();
      await expect(
        createProjectMigration({ project, name }),
      ).rejects.toMatchObject({
        details: { code: 'MIGRATION_CREATE_NAME_INVALID' },
      });
    },
  );

  it('migrations directory symlinkを拒否する', async () => {
    const project = await projectFixture();
    const migrations = path.join(project.root, 'migrations');
    const outside = path.join(path.dirname(project.root), 'outside-migrations');
    await rm(migrations, { recursive: true });
    await symlink(outside, migrations);
    await expect(
      createProjectMigration({ project, name: 'initial' }),
    ).rejects.toMatchObject({
      details: { code: 'MIGRATION_CREATE_SYMLINK_FORBIDDEN' },
    });
  });
});

async function projectFixture() {
  const parent = await mkdtemp(
    path.join(os.tmpdir(), 'gstack-migration-create-'),
  );
  roots.push(parent);
  const initialized = await initializeLocalProject({
    name: 'sample-app',
    parentDirectory: parent,
  });
  const project = await loadStandardProject({ root: initialized.root });
  await initializeSchemaModel({ project, model: 'users' });
  return project;
}
