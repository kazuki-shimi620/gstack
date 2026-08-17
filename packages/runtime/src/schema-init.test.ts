import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadStandardProject } from './index.js';
import { initializeLocalProject } from './project-init.js';
import { initializeSchemaModel } from './schema-init.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('Schema Model Initialization', () => {
  it('最小Schemaを生成しCore semantic validationまで完了する', async () => {
    const project = await projectFixture();
    const result = await initializeSchemaModel({
      project,
      model: 'user_profiles',
    });
    expect(result).toEqual({
      model: 'user_profiles',
      path: 'schema/user_profiles.yaml',
    });
    const content = await readFile(
      path.join(project.root, result.path),
      'utf8',
    );
    expect(content).toBe(`name: user_profiles
model:
  displayName: UserProfiles
database:
  primaryKey: id
  columns:
    id:
      type: uuid
`);
    await expect(project.validateSchema()).resolves.toMatchObject({
      valid: true,
      level: 'semantic',
    });
  });

  it.each(['Users', 'user-profiles', '../users', '.', 'a/b'])(
    '非canonicalなModel名 %s を拒否する',
    async (model) => {
      const project = await projectFixture();
      await expect(
        initializeSchemaModel({ project, model }),
      ).rejects.toMatchObject({
        details: { code: 'SCHEMA_INIT_NAME_INVALID' },
      });
    },
  );

  it('既存targetを上書きしない', async () => {
    const project = await projectFixture();
    await initializeSchemaModel({ project, model: 'users' });
    const target = path.join(project.root, 'schema/users.yaml');
    const before = await readFile(target, 'utf8');
    await expect(
      initializeSchemaModel({ project, model: 'users' }),
    ).rejects.toMatchObject({
      details: { code: 'SCHEMA_INIT_TARGET_EXISTS' },
    });
    expect(await readFile(target, 'utf8')).toBe(before);
  });

  it('Schema directory symlinkを拒否する', async () => {
    const project = await projectFixture();
    const schema = path.join(project.root, 'schema');
    const outside = path.join(path.dirname(project.root), 'outside-schema');
    await rm(schema, { recursive: true });
    await rm(outside, { recursive: true, force: true });
    await symlink(outside, schema);
    await expect(
      initializeSchemaModel({ project, model: 'users' }),
    ).rejects.toMatchObject({
      details: { code: 'SCHEMA_INIT_SYMLINK_FORBIDDEN' },
    });
  });

  it('Schema target symlinkを拒否する', async () => {
    const project = await projectFixture();
    const outside = path.join(path.dirname(project.root), 'outside.yaml');
    await writeFile(outside, 'outside', 'utf8');
    await symlink(outside, path.join(project.root, 'schema/users.yaml'));
    await expect(
      initializeSchemaModel({ project, model: 'users' }),
    ).rejects.toMatchObject({
      details: { code: 'SCHEMA_INIT_SYMLINK_FORBIDDEN' },
    });
    expect(await readFile(outside, 'utf8')).toBe('outside');
  });

  it('既存Schemaがinvalidならwrite前に拒否する', async () => {
    const project = await projectFixture();
    await writeFile(
      path.join(project.root, 'schema/broken.yaml'),
      'name: broken\n',
      'utf8',
    );
    await expect(
      initializeSchemaModel({ project, model: 'users' }),
    ).rejects.toMatchObject({
      details: { code: 'SCHEMA_INIT_PROJECT_INVALID' },
    });
    await expect(
      readFile(path.join(project.root, 'schema/users.yaml'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

async function projectFixture() {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'gstack-schema-init-'));
  roots.push(parent);
  const initialized = await initializeLocalProject({
    name: 'sample-app',
    parentDirectory: parent,
  });
  return loadStandardProject({ root: initialized.root });
}
