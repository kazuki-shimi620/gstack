import { describe, expect, it, vi } from 'vitest';

import { ProviderRegistry, ProviderRuntime } from '@gstack/provider';

import { parseGoogleProviderConfig } from './config.js';
import {
  GOOGLE_OAUTH_SCOPES,
  googleCredentialRequest,
} from './authentication.js';
import { createGoogleProvider, googleProviderManifest } from './provider.js';

const configuration = {
  spreadsheetId: 'spreadsheet-id',
  appsScriptProjectId: 'script-id',
  driveFolderId: 'folder-id',
  authentication: {
    mode: 'user_oauth' as const,
    credentialSecret: 'GOOGLE_CREDENTIALS',
  },
};

describe('Google Provider foundation', () => {
  it('operationごとに最小OAuth scopeを固定する', () => {
    expect(GOOGLE_OAUTH_SCOPES.database_read).toEqual([
      'https://www.googleapis.com/auth/spreadsheets.readonly',
    ]);
    expect(GOOGLE_OAUTH_SCOPES.storage_write).toEqual([
      'https://www.googleapis.com/auth/drive.file',
    ]);
    expect(GOOGLE_OAUTH_SCOPES.deploy).toEqual([
      'https://www.googleapis.com/auth/script.deployments',
    ]);
    expect(
      googleCredentialRequest('GOOGLE_CREDENTIALS', 'script_read'),
    ).toEqual({
      credentialSecret: 'GOOGLE_CREDENTIALS',
      scopes: ['https://www.googleapis.com/auth/script.projects.readonly'],
    });
  });

  it('5つのGoogle Workspace capabilityと実装済みMigration supportを宣言する', () => {
    expect(googleProviderManifest).toMatchObject({
      name: 'google',
      packageName: '@gstack/provider-google',
      capabilities: {
        database: true,
        api: true,
        authentication: true,
        storage: true,
        deploy: true,
      },
    });
    expect(
      googleProviderManifest.migrationSupport.create_model === 'native' &&
        googleProviderManifest.migrationSupport.add_column === 'native' &&
        googleProviderManifest.migrationSupport.rename_column === 'native' &&
        Object.entries(googleProviderManifest.migrationSupport)
          .filter(
            ([operation]) =>
              operation !== 'create_model' &&
              operation !== 'add_column' &&
              operation !== 'rename_column',
          )
          .every(([, support]) => support === 'unsupported'),
    ).toBe(true);
  });

  it('非secret参照だけを持つstrictな設定を検証する', () => {
    expect(parseGoogleProviderConfig(configuration)).toEqual({
      config: configuration,
      issues: [],
    });
    expect(
      parseGoogleProviderConfig({ spreadsheetId: '', token: 'secret-value' }),
    ).toMatchObject({
      config: null,
      issues: [
        { path: 'appsScriptProjectId' },
        { path: 'authentication' },
        { path: 'driveFolderId' },
        { path: 'spreadsheetId' },
        { path: 'token' },
      ],
    });
  });

  it('offline validationではGatewayやSecret Resolverを呼ばない', async () => {
    const gateway = { checkHealth: vi.fn() };
    const secrets = { get: vi.fn() };
    const runtime = runtimeFor(gateway);

    await expect(
      runtime.validate('google', {
        projectRoot: '/project',
        configuration,
        secrets,
      }),
    ).resolves.toEqual([]);
    expect(gateway.checkHealth).not.toHaveBeenCalled();
    expect(secrets.get).not.toHaveBeenCalled();
  });

  it('有効な設定だけを注入Gatewayへ渡してsafe healthを返す', async () => {
    const gateway = {
      checkHealth: vi
        .fn()
        .mockResolvedValue({ status: 'healthy', code: 'GOOGLE_READY' }),
    };
    const secrets = { get: vi.fn().mockResolvedValue('not-exposed') };

    await expect(
      runtimeFor(gateway).health('google', {
        projectRoot: '/project',
        configuration,
        secrets,
      }),
    ).resolves.toEqual({ status: 'healthy', code: 'GOOGLE_READY' });
    expect(gateway.checkHealth).toHaveBeenCalledWith({
      projectRoot: '/project',
      config: configuration,
      secrets,
      credential: {
        credentialSecret: 'GOOGLE_CREDENTIALS',
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      },
    });
    expect(secrets.get).not.toHaveBeenCalled();
  });

  it('不正設定では外部接続せずunavailableを返す', async () => {
    const gateway = { checkHealth: vi.fn() };
    await expect(
      runtimeFor(gateway).health('google', {
        projectRoot: '/project',
        configuration: {},
        secrets: { get: vi.fn() },
      }),
    ).resolves.toEqual({
      status: 'unavailable',
      code: 'CONFIGURATION_INVALID',
    });
    expect(gateway.checkHealth).not.toHaveBeenCalled();
  });
});

function runtimeFor(gateway: Parameters<typeof createGoogleProvider>[0]) {
  const registry = new ProviderRegistry();
  registry.register(createGoogleProvider(gateway));
  return new ProviderRuntime(registry);
}
