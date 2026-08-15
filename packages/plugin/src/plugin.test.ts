import { describe, expect, it, vi } from 'vitest';

import {
  isPluginCompatible,
  PluginRegistry,
  validatePluginManifest,
} from './index.js';

const manifest = {
  formatVersion: 1 as const,
  id: 'example',
  kind: 'generator' as const,
  packageName: '@example/gstack-generator',
  version: '1.2.3',
  minimumGstackVersion: '0.5.0',
};

describe('Plugin Manifest and Registry', () => {
  it('strict manifestをfreezeしてminimum version互換性を評価する', () => {
    const parsed = validatePluginManifest({ ...manifest });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(isPluginCompatible(parsed, '0.5.0')).toBe(true);
    expect(isPluginCompatible(parsed, '0.4.9')).toBe(false);
    expect(
      isPluginCompatible(
        { ...parsed, minimumGstackVersion: '0.5.0' },
        '0.5.0-beta.1',
      ),
    ).toBe(false);
    expect(() =>
      validatePluginManifest({ ...manifest, entrypoint: './index.js' }),
    ).toThrow();
  });

  it('kind別に決定的に登録しID／package重複を拒否する', () => {
    const registry = new PluginRegistry();
    registry.register({ manifest, generate: vi.fn(() => []) });
    registry.register({
      manifest: {
        ...manifest,
        id: 'zeta',
        packageName: '@example/zeta-generator',
      },
      generate: vi.fn(() => []),
    });
    expect(registry.list().map(({ manifest: item }) => item.id)).toEqual([
      'example',
      'zeta',
    ]);
    expect(registry.generators()).toHaveLength(2);
    expect(() =>
      registry.register({ manifest, generate: vi.fn(() => []) }),
    ).toThrow();
    expect(() =>
      registry.register({
        manifest: { ...manifest, id: 'other' },
        generate: vi.fn(() => []),
      }),
    ).toThrow();
  });

  it('Provider pluginとProvider Manifestのidentity不一致を拒否する', () => {
    const registry = new PluginRegistry();
    expect(() =>
      registry.register({
        manifest: { ...manifest, kind: 'provider' },
        provider: {
          manifest: {
            formatVersion: 1,
            name: 'different',
            packageName: manifest.packageName,
            version: manifest.version,
            minimumGstackVersion: manifest.minimumGstackVersion,
            capabilities: {
              database: false,
              api: false,
              authentication: false,
              storage: false,
              deploy: false,
            },
            migrationSupport: {} as never,
          },
          initialize: vi.fn(),
        },
      }),
    ).toThrow();
  });
});
