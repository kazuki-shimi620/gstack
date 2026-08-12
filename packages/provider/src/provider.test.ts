import { describe, expect, it, vi } from 'vitest';

import { ProviderCatalog } from './catalog.js';
import { validateProviderManifest } from './manifest.js';
import { ProviderRegistry } from './registry.js';
import { ProviderInspectionService, ProviderRuntime } from './runtime.js';
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

  it('明示的なvalidateとhealthの後にSessionを破棄する', async () => {
    const dispose = vi.fn().mockResolvedValue(undefined);
    const initialize = vi.fn().mockResolvedValue({
      validate: vi
        .fn()
        .mockResolvedValue([
          { code: 'CONFIG_OK', severity: 'warning', message: 'Safe message.' },
        ]),
      health: vi.fn().mockResolvedValue({ status: 'healthy', code: 'READY' }),
      dispose,
    });
    const registry = new ProviderRegistry();
    registry.register({ manifest: manifest('example'), initialize });
    const runtime = new ProviderRuntime(registry);
    const context = {
      projectRoot: '/project',
      configuration: { database: { region: 'local' } },
      secrets: { get: vi.fn().mockResolvedValue(null) },
    };

    await expect(runtime.validate('example', context)).resolves.toEqual([
      { code: 'CONFIG_OK', severity: 'warning', message: 'Safe message.' },
    ]);
    await expect(runtime.health('example', context)).resolves.toEqual({
      status: 'healthy',
      code: 'READY',
    });
    expect(initialize).toHaveBeenCalledTimes(2);
    expect(initialize.mock.calls[0]?.[0]).not.toBe(context);
    expect(Object.isFrozen(initialize.mock.calls[0]?.[0].configuration)).toBe(
      true,
    );
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it('未登録、初期化、操作、破棄の失敗をstable codeへ変換する', async () => {
    const context = {
      projectRoot: '/project',
      configuration: {},
      secrets: { get: vi.fn().mockResolvedValue(null) },
    };
    await expect(
      new ProviderRuntime(new ProviderRegistry()).health('missing', context),
    ).rejects.toMatchObject({ code: 'PROVIDER_NOT_REGISTERED' });

    const initializeRegistry = new ProviderRegistry();
    initializeRegistry.register({
      manifest: manifest('initialize'),
      initialize: vi.fn().mockRejectedValue(new Error('credential=value')),
    });
    await expect(
      new ProviderRuntime(initializeRegistry).health('initialize', context),
    ).rejects.toMatchObject({
      code: 'PROVIDER_INITIALIZATION_FAILED',
      message: 'Provider initialization failed: initialize',
    });

    const dispose = vi.fn().mockResolvedValue(undefined);
    const operationRegistry = new ProviderRegistry();
    operationRegistry.register({
      manifest: manifest('operation'),
      initialize: vi.fn().mockResolvedValue({
        validate: vi.fn(),
        health: vi.fn().mockRejectedValue(new Error('token=secret')),
        dispose,
      }),
    });
    await expect(
      new ProviderRuntime(operationRegistry).health('operation', context),
    ).rejects.toMatchObject({
      code: 'PROVIDER_OPERATION_FAILED',
      message: 'Provider operation failed: operation',
    });
    expect(dispose).toHaveBeenCalledOnce();

    const disposalRegistry = new ProviderRegistry();
    disposalRegistry.register({
      manifest: manifest('disposal'),
      initialize: vi.fn().mockResolvedValue({
        validate: vi.fn(),
        health: vi.fn().mockResolvedValue({ status: 'healthy', code: 'OK' }),
        dispose: vi.fn().mockRejectedValue(new Error('dispose failed')),
      }),
    });
    await expect(
      new ProviderRuntime(disposalRegistry).health('disposal', context),
    ).rejects.toMatchObject({ code: 'PROVIDER_DISPOSAL_FAILED' });
  });

  it('不正なProvider結果を拒否して破棄する', async () => {
    const dispose = vi.fn().mockResolvedValue(undefined);
    const registry = new ProviderRegistry();
    registry.register({
      manifest: manifest('example'),
      initialize: vi.fn().mockResolvedValue({
        validate: vi.fn().mockResolvedValue([]),
        health: vi
          .fn()
          .mockResolvedValue({ status: 'healthy', code: 'not safe' }),
        dispose,
      }),
    });

    await expect(
      new ProviderRuntime(registry).health('example', {
        projectRoot: '/project',
        configuration: {},
        secrets: { get: vi.fn().mockResolvedValue(null) },
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_RESULT_INVALID' });
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('Core注入用Serviceが固定contextでRuntimeへ委譲する', async () => {
    const registry = new ProviderRegistry();
    registry.register(factory('example'));
    const service = new ProviderInspectionService(
      new ProviderRuntime(registry),
      {
        projectRoot: '/project',
        configuration: {},
        secrets: { get: vi.fn().mockResolvedValue(null) },
      },
    );

    await expect(service.validateProvider('example')).resolves.toEqual([]);
    await expect(service.getProviderHealth('example')).resolves.toEqual({
      status: 'healthy',
      code: 'OK',
    });
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
