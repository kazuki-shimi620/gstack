import { describe, expect, it, vi } from 'vitest';

import { loadPlugins, PluginRegistry, runGeneratorPlugins } from './index.js';

const manifest = {
  formatVersion: 1 as const,
  id: 'example',
  kind: 'generator' as const,
  packageName: '@example/generator',
  version: '1.0.0',
  minimumGstackVersion: '0.6.0',
};

describe('Plugin Loader', () => {
  it('明示npm packageを注入Importerからloadして互換性を検証する', async () => {
    const plugin = { manifest, generate: vi.fn(() => []) };
    const importer = vi.fn().mockResolvedValue({ gstackPlugin: plugin });
    const registry = await loadPlugins({
      packageNames: ['@example/generator'],
      gstackVersion: '0.6.0',
      importer,
    });
    expect(importer).toHaveBeenCalledWith('@example/generator');
    expect(registry.get('example')).toBe(plugin);
  });

  it.each([
    { packageNames: ['./local.js'], code: 'PLUGIN_SPECIFIER_INVALID' },
    {
      packageNames: ['https://example.com/plugin.js'],
      code: 'PLUGIN_SPECIFIER_INVALID',
    },
    {
      packageNames: ['@example/generator', '@example/generator'],
      code: 'PLUGIN_SPECIFIER_INVALID',
    },
  ])('path／URL／重複specifierを拒否する', async ({ packageNames, code }) => {
    await expect(
      loadPlugins({ packageNames, gstackVersion: '0.6.0', importer: vi.fn() }),
    ).rejects.toMatchObject({ code });
  });

  it('package identity不一致とminimum version未達を拒否する', async () => {
    await expect(
      loadPlugins({
        packageNames: ['@example/other'],
        gstackVersion: '0.6.0',
        importer: async () => ({
          gstackPlugin: { manifest, generate: vi.fn(() => []) },
        }),
      }),
    ).rejects.toMatchObject({ code: 'PLUGIN_PACKAGE_MISMATCH' });
    await expect(
      loadPlugins({
        packageNames: ['@example/generator'],
        gstackVersion: '0.5.9',
        importer: async () => ({
          gstackPlugin: { manifest, generate: vi.fn(() => []) },
        }),
      }),
    ).rejects.toMatchObject({ code: 'PLUGIN_INCOMPATIBLE' });
  });

  it('Generator Plugin outputを専用namespaceへ制限して正規化する', () => {
    const registry = new PluginRegistry();
    const generate = vi.fn(() => [
      { path: 'generated/plugins/example/z.txt', content: 'z' },
      { path: 'generated/plugins/example/a.txt', content: 'a' },
    ]);
    registry.register({ manifest, generate });
    const artifacts = runGeneratorPlugins({
      plugins: registry,
      application: {
        schemaVersion: 1,
        name: 'app',
        models: [],
        metadata: {},
      },
      configuration: { example: { enabled: true } },
    });
    expect(artifacts.map(({ path }) => path)).toEqual([
      'generated/plugins/example/a.txt',
      'generated/plugins/example/z.txt',
    ]);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ configuration: { enabled: true } }),
    );
    const invalid = new PluginRegistry();
    invalid.register({
      manifest,
      generate: () => [{ path: 'generated/types/escape.ts', content: 'x' }],
    });
    expect(() =>
      runGeneratorPlugins({
        plugins: invalid,
        application: {
          schemaVersion: 1,
          name: 'app',
          models: [],
          metadata: {},
        },
        configuration: {},
      }),
    ).toThrow('outside its namespace');
  });
});
