import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadProjectConfig } from '@gstack/config';

import { initializeLocalProject } from './project-init.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('Local Project Initialization', () => {
  it('有効なConfigと責務別directoryをstaging後に作成する', async () => {
    const parent = await temporary();
    const result = await initializeLocalProject({
      name: 'sample-app',
      parentDirectory: parent,
    });
    expect(result).toEqual({
      name: 'sample-app',
      root: path.join(parent, 'sample-app'),
      createdPaths: [
        'gstack.yaml',
        'package.json',
        'app/',
        'schema/',
        'migrations/',
        'generated/',
        'docs/',
      ],
    });
    await expect(loadProjectConfig(result.root)).resolves.toMatchObject({
      name: 'sample-app',
      providers: [],
      generator: {
        types: true,
        validation: true,
        api: true,
        backend: true,
        frontend: true,
        openapi: true,
        documentation: true,
        aiDocumentation: true,
      },
    });
    expect(
      await readFile(path.join(result.root, 'gstack.yaml'), 'utf8'),
    ).not.toMatch(/credential|secret|spreadsheet|google/iu);
    expect(Object.isFrozen(result.createdPaths)).toBe(true);
  });

  it.each(['Sample', 'sample_app', '../sample', '.', 'a/b', '/tmp/app'])(
    '危険または非canonicalなname %s を拒否する',
    async (name) => {
      const parent = await temporary();
      await expect(
        initializeLocalProject({ name, parentDirectory: parent }),
      ).rejects.toMatchObject({
        details: { code: 'PROJECT_INIT_NAME_INVALID' },
      });
    },
  );

  it('既存directory、file、symlinkを変更しない', async () => {
    const parent = await temporary();
    await initializeLocalProject({ name: 'existing', parentDirectory: parent });
    await expect(
      initializeLocalProject({ name: 'existing', parentDirectory: parent }),
    ).rejects.toMatchObject({
      details: { code: 'PROJECT_INIT_TARGET_EXISTS' },
    });
    expect(
      await readFile(path.join(parent, 'existing', 'gstack.yaml'), 'utf8'),
    ).toContain('name: existing');
    await symlink(path.join(parent, 'existing'), path.join(parent, 'linked'));
    await expect(
      initializeLocalProject({ name: 'linked', parentDirectory: parent }),
    ).rejects.toMatchObject({
      details: { code: 'PROJECT_INIT_TARGET_EXISTS' },
    });
  });
});

async function temporary(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gstack-project-init-'));
  roots.push(root);
  return root;
}
