import { describe, expect, it, vi } from 'vitest';

import { ProviderCatalog } from './catalog.js';
import { validateProviderManifest } from './manifest.js';
import { ProviderRegistry } from './registry.js';
import type { ProviderFactory, ProviderManifest } from './types.js';

const manifest = (name: string): ProviderManifest => ({
  formatVersion: 1,
  name,
  packageName: `@example/provider-${name}`,
  version: '0.1.0',
  minimumGstackVersion: '0.0.0',
  capabilities: {
    database: true,
    api: false,
    authentication: false,
    storage: false,
    deploy: false,
  },
  migrationSupport: {
    create_model: 'native',
    drop_model: 'unsupported',
    add_column: 'native',
    drop_column: 'unsupported',
    rename_column: 'unsupported',
    alter_column: 'emulated',
    add_index: 'unsupported',
    drop_index: 'unsupported',
    add_relation: 'unsupported',
    drop_relation: 'unsupported',
  },
});

describe('Provider Foundation', () => {
  it('完全なManifestを検証してfreezeする', () => {
    const result = validateProviderManifest(manifest('example'));
    expect(result.capabilities.database).toBe(true);
    expect(result.migrationSupport.alter_column).toBe('emulated');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.capabilities)).toBe(true);
  });

  it.each([
    { ...manifest('example'), provider: 'google' },
    { ...manifest('example'), name: 'Example' },
    { ...manifest('example'), version: 'latest' },
    {
      ...manifest('example'),
      migrationSupport: { create_model: 'native' },
    },
  ])('不正または不完全なManifestを拒否する', (value) => {
    expect(() => validateProviderManifest(value)).toThrow(
      expect.objectContaining({ code: 'PROVIDER_MANIFEST_INVALID' }),
    );
  });

  it('Factoryをname順で管理し重複を拒否する', () => {
    const registry = new ProviderRegistry();
    const zeta = factory('zeta');
    const alpha = factory('alpha');
    registry.register(zeta);
    registry.register(alpha);
    expect(registry.list().map(({ manifest }) => manifest.name)).toEqual([
      'alpha',
      'zeta',
    ]);
    expect(registry.get('alpha')).toBe(alpha);
    expect(registry.get('missing')).toBeNull();
    expect(() => registry.register(factory('alpha'))).toThrow(
      expect.objectContaining({ code: 'PROVIDER_ALREADY_REGISTERED' }),
    );
  });

  it('Factoryを公開せずProvider情報をname順で返す', () => {
    const registry = new ProviderRegistry();
    registry.register(factory('zeta'));
    registry.register(factory('alpha'));
    const catalog = new ProviderCatalog(registry);

    const providers = catalog.listProviders();
    expect(providers.map(({ name }) => name)).toEqual(['alpha', 'zeta']);
    expect(providers[0]).not.toHaveProperty('initialize');
    expect(Object.isFrozen(providers)).toBe(true);
    expect(Object.isFrozen(providers[0])).toBe(true);
    expect(Object.isFrozen(providers[0]?.capabilities)).toBe(true);
    expect(Object.isFrozen(providers[0]?.migrationSupport)).toBe(true);
  });

  it('単一Providerとcapabilityを安全に参照する', () => {
    const registry = new ProviderRegistry();
    registry.register(factory('example'));
    const catalog = new ProviderCatalog(registry);

    expect(catalog.getProvider('example')?.packageName).toBe(
      '@example/provider-example',
    );
    expect(catalog.getProvider('missing')).toBeNull();
    expect(catalog.supportsCapability('example', 'database')).toBe(true);
    expect(catalog.supportsCapability('example', 'deploy')).toBe(false);
    expect(catalog.supportsCapability('missing', 'database')).toBeNull();
  });
});

function factory(name: string): ProviderFactory {
  return {
    manifest: manifest(name),
    initialize: vi.fn(async () => ({
      validate: async () => [],
      health: async () => ({ status: 'healthy' as const, code: 'OK' }),
      dispose: async () => undefined,
    })),
  };
}
