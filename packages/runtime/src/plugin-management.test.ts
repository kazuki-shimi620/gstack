import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyStandardPluginInstall,
  applyStandardPluginRemove,
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

  it('installはapproval一致後にnpm、Manifest検証、allowlist更新の順で実行する', async () => {
    const root = await project([], {});
    const preview = await prepareStandardPluginInstall({
      root,
      packageSpec: '@example/generator@1.2.3',
    });
    const events: string[] = [];
    const pluginImporter = vi.fn(async () => {
      events.push('manifest');
      return importerResult();
    });
    await applyStandardPluginInstall({
      root,
      packageSpec: '@example/generator@1.2.3',
      approval: preview.fingerprint,
      pluginImporter,
      packageManager: {
        run: vi.fn(async () => {
          events.push('npm');
          return { exitCode: 0 };
        }),
      },
    });
    expect(events).toEqual(['npm', 'manifest']);
    await expect(
      readFile(path.join(root, 'gstack.yaml'), 'utf8'),
    ).resolves.toContain('- "@example/generator"');
  });

  it('removeは先にallowlistを無効化してからnpmを実行する', async () => {
    const root = await project(['@example/generator'], {
      '@example/generator': '1.2.3',
    });
    const preview = await prepareStandardPluginRemove({
      root,
      packageName: '@example/generator',
      pluginImporter: importer(),
    });
    const packageManager = {
      run: vi.fn(async () => {
        const config = await readFile(path.join(root, 'gstack.yaml'), 'utf8');
        expect(config).not.toContain('- "@example/generator"');
        return { exitCode: 0 };
      }),
    };
    await applyStandardPluginRemove({
      root,
      packageName: '@example/generator',
      approval: preview.fingerprint,
      pluginImporter: importer(),
      packageManager,
    });
    expect(packageManager.run).toHaveBeenCalledOnce();
  });

  it('不一致approvalではnpmもConfigも変更しない', async () => {
    const root = await project([], {});
    const before = await snapshot(root);
    const packageManager = { run: vi.fn() };
    await expect(
      applyStandardPluginInstall({
        root,
        packageSpec: '@example/generator@1.2.3',
        approval: 'invalid',
        packageManager,
      }),
    ).rejects.toMatchObject({ details: { code: 'CONFIG_INVALID' } });
    expect(packageManager.run).not.toHaveBeenCalled();
    await expect(snapshot(root)).resolves.toEqual(before);
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
  return vi.fn().mockResolvedValue(importerResult());
}

function importerResult() {
  return {
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
  };
}

async function snapshot(root: string): Promise<readonly string[]> {
  return Promise.all(
    ['gstack.yaml', 'package.json'].map((file) =>
      readFile(path.join(root, file), 'utf8'),
    ),
  );
}
