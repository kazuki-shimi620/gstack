import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { validateStandardPluginPackage } from './plugin-package.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('Plugin package validation', () => {
  it('package、Manifest、pack収録物が一致する配布物を検証する', async () => {
    const directory = await pluginPackage();
    await expect(
      validateStandardPluginPackage({
        directory,
        packInspector: inspector([
          'package.json',
          'dist/index.js',
          'dist/index.d.ts',
        ]),
      }),
    ).resolves.toEqual({
      valid: true,
      packageName: '@example/generator',
      version: '1.2.3',
      pluginId: 'example',
      kind: 'generator',
      minimumGstackVersion: '0.0.0',
      entry: 'dist/index.js',
      types: 'dist/index.d.ts',
      fileCount: 3,
      unpackedSize: 100,
    });
  });

  it('export entryがpack対象外なら拒否する', async () => {
    const directory = await pluginPackage();
    await expect(
      validateStandardPluginPackage({
        directory,
        packInspector: inspector(['package.json', 'dist/index.d.ts']),
      }),
    ).rejects.toMatchObject({ details: { code: 'CONFIG_INVALID' } });
  });

  it('secretらしいfileがpack対象なら拒否する', async () => {
    const directory = await pluginPackage();
    await expect(
      validateStandardPluginPackage({
        directory,
        packInspector: inspector([
          'package.json',
          'dist/index.js',
          'dist/index.d.ts',
          '.env.production',
        ]),
      }),
    ).rejects.toMatchObject({ details: { code: 'CONFIG_INVALID' } });
  });

  it('package versionとManifest versionの不一致を拒否する', async () => {
    const directory = await pluginPackage('1.2.4');
    await expect(
      validateStandardPluginPackage({
        directory,
        packInspector: inspector([
          'package.json',
          'dist/index.js',
          'dist/index.d.ts',
        ]),
      }),
    ).rejects.toMatchObject({ details: { code: 'CONFIG_INVALID' } });
  });
});

async function pluginPackage(manifestVersion = '1.2.3'): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'gstack-plugin-package-'));
  roots.push(root);
  await mkdir(path.join(root, 'dist'));
  await Promise.all([
    writeFile(
      path.join(root, 'package.json'),
      `${JSON.stringify(
        {
          name: '@example/generator',
          version: '1.2.3',
          type: 'module',
          exports: './dist/index.js',
          types: './dist/index.d.ts',
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(
      path.join(root, 'dist/index.js'),
      `export const gstackPlugin = {
  manifest: {
    formatVersion: 1,
    id: 'example',
    kind: 'generator',
    packageName: '@example/generator',
    version: '${manifestVersion}',
    minimumGstackVersion: '0.0.0'
  },
  generate: () => []
};
`,
    ),
    writeFile(path.join(root, 'dist/index.d.ts'), 'export {};\n'),
  ]);
  return root;
}

function inspector(files: readonly string[]) {
  return {
    inspect: async () => [
      {
        name: '@example/generator',
        version: '1.2.3',
        unpackedSize: 100,
        files: files.map((filePath) => ({ path: filePath })),
      },
    ],
  };
}
