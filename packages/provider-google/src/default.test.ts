import { describe, expect, it, vi } from 'vitest';

import { ProviderRegistry, ProviderRuntime } from '@gstack/provider';

import { createDefaultGoogleProvider } from './default.js';

const configuration = {
  spreadsheetId: 'spreadsheet-id',
  appsScriptProjectId: 'script-id',
  driveFolderId: 'folder-id',
  authentication: {
    mode: 'user_oauth',
    credentialSecret: 'GOOGLE_CREDENTIALS',
  },
};
const credential = JSON.stringify({
  formatVersion: 1,
  type: 'authorized_user',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  refreshToken: 'refresh-token',
});

describe('Default Google Provider', () => {
  it('OAuthとSheets metadataの実adapterを組み立ててhealthを返す', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'access-token',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          spreadsheetId: 'spreadsheet-id',
          properties: { title: 'Database' },
          sheets: [
            {
              properties: {
                sheetId: 1,
                title: 'users',
                gridProperties: { rowCount: 1000, columnCount: 20 },
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'access-token',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'https://www.googleapis.com/auth/drive.metadata.readonly',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'folder-id',
          name: 'Files',
          mimeType: 'application/vnd.google-apps.folder',
          parents: [],
          trashed: false,
          capabilities: { canAddChildren: true, canListChildren: true },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'access-token',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'https://www.googleapis.com/auth/script.projects.readonly',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          scriptId: 'script-id',
          title: 'API',
          createTime: '2026-08-11T00:00:00Z',
          updateTime: '2026-08-12T00:00:00Z',
        }),
      );

    await expect(health(fetchImplementation)).resolves.toEqual({
      status: 'healthy',
      code: 'GOOGLE_WORKSPACE_READY',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(6);
    const sheetsRequest = fetchImplementation.mock.calls[1];
    expect(sheetsRequest?.[0]).toContain('sheets.googleapis.com');
    expect(sheetsRequest?.[1]?.headers).toMatchObject({
      authorization: 'Bearer access-token',
    });
  });

  it.each([
    [401, 'unavailable', 'GOOGLE_AUTHENTICATION_FAILED'],
    [403, 'unavailable', 'GOOGLE_PERMISSION_DENIED'],
    [404, 'unavailable', 'GOOGLE_SPREADSHEET_NOT_FOUND'],
    [429, 'degraded', 'GOOGLE_RATE_LIMITED'],
    [503, 'degraded', 'GOOGLE_API_UNAVAILABLE'],
  ])(
    'Sheets status %iをsafe health %s/%sへ分類する',
    async (status, expectedStatus, code) => {
      const fetchImplementation = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            access_token: 'access-token',
            expires_in: 3600,
            token_type: 'Bearer',
            scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
          }),
        )
        .mockResolvedValue(new Response('token=secret', { status }));
      await expect(health(fetchImplementation)).resolves.toEqual({
        status: expectedStatus,
        code,
      });
    },
  );

  it('credential未検出をsafe healthへ分類する', async () => {
    const runtime = runtimeFor(vi.fn());
    await expect(
      runtime.health('google', {
        projectRoot: '/project',
        configuration,
        secrets: { get: vi.fn().mockResolvedValue(null) },
      }),
    ).resolves.toEqual({
      status: 'unavailable',
      code: 'GOOGLE_CREDENTIAL_NOT_FOUND',
    });
  });
});

function health(fetchImplementation: typeof fetch) {
  return runtimeFor(fetchImplementation).health('google', {
    projectRoot: '/project',
    configuration,
    secrets: { get: vi.fn().mockResolvedValue(credential) },
  });
}

function runtimeFor(fetchImplementation: typeof fetch): ProviderRuntime {
  const registry = new ProviderRegistry();
  registry.register(
    createDefaultGoogleProvider({
      fetch: fetchImplementation,
      maxAttempts: 1,
      retryDelaysMilliseconds: [],
      now: () => new Date('2026-08-12T00:00:00.000Z'),
    }),
  );
  return new ProviderRuntime(registry);
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
