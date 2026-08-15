import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  prepareStandardPluginInstall,
  prepareStandardPluginRemove,
} from './plugin-management.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('Plugin management plan', () => {
  it('exact versionのinstallを副作用なしで計画する', async () => {
    const root = await project([], {});
    const before = await snapshot(root);
    const plan = await prepareStandardPluginInstall({
      root,
      packageSpec: '@example/generator@1.2.3',
    });
    expect(plan).toMatchObject({
      action: 'install',
      packageName: '@example/generator',
      version: '1.2.3',
      pluginId: null,
      command: {
        executable: 'npm',
        arguments: [
          'install',
          '--save-exact',
          '--ignore-scripts',
          '@example/generator@1.2.3',
        ],
      },
      currentPackages: [],
      nextPackages: ['@example/generator'],
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    await expect(snapshot(root)).resolves.toEqual(before);
    await expect(
      prepareStandardPluginInstall({ root, packageSpec: '@example/generator' }),
    ).rejects.toMatchObject({ details: { code: 'CONFIG_INVALID' } });
  });

  it('未使用PluginのremoveをManifest検証後に計画する', async () => {
    const root = await project(['@example/generator'], {
      '@example/generator': '1.2.3',
    });
    const plan = await prepareStandardPluginRemove({
      root,
      packageName: '@example/generator',
      pluginImporter: importer(),
    });
    expect(plan).toMatchObject({
      action: 'remove',
      packageName: '@example/generator',
      version: '1.2.3',
      pluginId: 'example',
      command: {
        executable: 'npm',
        arguments: ['uninstall', '--ignore-scripts', '@example/generator'],
      },
      currentPackages: ['@example/generator'],
      nextPackages: [],
    });
  });

  it('configurationが残るPluginのremoveを拒否する', async () => {
    const root = await project(
      ['@example/generator'],
      { '@example/generator': '1.2.3' },
      '    example: {}',
    );
    await expect(
      prepareStandardPluginRemove({
        root,
        packageName: '@example/generator',
        pluginImporter: importer(),
      }),
    ).rejects.toMatchObject({ details: { code: 'CONFIG_INVALID' } });
  });
});

async function project(
  packages: readonly string[],
  dependencies: Readonly<Record<string, string>>,
  configuration = '    {}',
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'gstack-plugin-plan-'));
  roots.push(root);
  await Promise.all([
    writeFile(
      path.join(root, 'gstack.yaml'),
      `version: 1
name: sample
schemaVersion: 1
schema: { directory: schema }
plugins:
  packages: ${JSON.stringify(packages)}
  configuration:
${configuration}
`,
    ),
    writeFile(
      path.join(root, 'package.json'),
      `${JSON.stringify({ name: 'sample', private: true, dependencies }, null, 2)}\n`,
    ),
  ]);
  return root;
}

function importer() {
  return vi.fn().mockResolvedValue({
    gstackPlugin: {
      manifest: {
        formatVersion: 1,
        id: 'example',
        kind: 'generator',
        packageName: '@example/generator',
        version: '1.2.3',
        minimumGstackVersion: '0.0.0',
      },
      generate: vi.fn(() => []),
    },
  });
}

async function snapshot(root: string): Promise<readonly string[]> {
  const { readFile } = await import('node:fs/promises');
  return Promise.all(
    ['gstack.yaml', 'package.json'].map((file) =>
      readFile(path.join(root, file), 'utf8'),
    ),
  );
}
