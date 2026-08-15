import { describe, expect, it, vi } from 'vitest';

import type { GoogleProviderConfig } from './config.js';
import { GoogleScriptReadService } from './script.js';
import { GoogleScriptHttpGateway } from './script-http.js';

const config: GoogleProviderConfig = {
  spreadsheetId: 'sheet-id',
  appsScriptProjectId: 'script/id',
  driveFolderId: 'folder-id',
  authentication: { mode: 'user_oauth', credentialSecret: 'SECRET' },
};

describe('Google Apps Script metadata', () => {
  it('user profileやsourceを含めずproject metadataを正規化する', async () => {
    const service = new GoogleScriptReadService(
      {
        getProjectMetadata: vi.fn().mockResolvedValue({
          scriptId: 'script/id',
          title: 'Application API',
          parentId: null,
          createTime: '2026-08-11T00:00:00Z',
          updateTime: '2026-08-12T00:00:00.123Z',
          creator: { email: 'must-not-be-exposed@example.com' },
          files: [{ source: 'must not be exposed' }],
        }),
      },
      config,
      { get: vi.fn() },
    );
    await expect(service.getProjectMetadata()).resolves.toEqual({
      scriptId: 'script/id',
      title: 'Application API',
      parentId: null,
      createTime: '2026-08-11T00:00:00.000Z',
      updateTime: '2026-08-12T00:00:00.123Z',
    });
  });

  it('HTTP adapterがreadonly scopeとfields maskだけで取得する', async () => {
    const execute = vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: '{"scriptId":"script/id"}',
    });
    const gateway = new GoogleScriptHttpGateway(
      { execute },
      {
        refresh: vi.fn().mockResolvedValue({
          accessToken: 'token',
          expiresAt: '2026-08-12T01:00:00.000Z',
          scopes: ['https://www.googleapis.com/auth/script.projects.readonly'],
        }),
      },
      () => new Date('2026-08-12T00:00:00.000Z'),
    );
    await gateway.getProjectMetadata({
      scriptId: 'script/id',
      credential: {
        credentialSecret: 'SECRET',
        scopes: ['https://www.googleapis.com/auth/script.projects.readonly'],
      },
      secrets: { get: vi.fn().mockResolvedValue(credentialSource()) },
    });
    const request = execute.mock.calls[0]?.[0];
    const url = new URL(request.url);
    expect(url.origin + url.pathname).toBe(
      'https://script.googleapis.com/v1/projects/script%2Fid',
    );
    expect(url.searchParams.get('fields')).toBe(
      'scriptId,title,parentId,createTime,updateTime',
    );
    expect(request.headers.authorization).toBe('Bearer token');
  });

  it('ID不一致と不正timestampを拒否する', async () => {
    for (const value of [
      {
        scriptId: 'other',
        title: 'API',
        parentId: null,
        createTime: '2026-01-01T00:00:00Z',
        updateTime: '2026-01-01T00:00:00Z',
      },
      {
        scriptId: 'script/id',
        title: 'API',
        parentId: null,
        createTime: 'invalid',
        updateTime: '2026-01-01T00:00:00Z',
      },
    ]) {
      await expect(
        new GoogleScriptReadService(
          { getProjectMetadata: vi.fn().mockResolvedValue(value) },
          config,
          { get: vi.fn() },
        ).getProjectMetadata(),
      ).rejects.toMatchObject({ code: 'GOOGLE_SCRIPT_METADATA_INVALID' });
    }
  });
});

describe('Google Apps Script content HTTP', () => {
  it('reads content with a retryable GET', async () => {
    const http = {
      execute: vi.fn().mockResolvedValue({ body: '{"files":[]}' }),
    };
    const tokens = {
      refresh: vi.fn().mockResolvedValue({
        accessToken: 'token',
        expiresAt: '2099-01-01T00:00:00.000Z',
        scopes: ['scope'],
      }),
    };
    const gateway = new GoogleScriptHttpGateway(http, tokens);
    await gateway.getProjectContent({
      scriptId: 'script/id',
      credential: { credentialSecret: 'GOOGLE_CREDENTIALS', scopes: ['scope'] },
      secrets: { get: vi.fn().mockResolvedValue(credentialSource()) },
    });
    expect(http.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'https://script.googleapis.com/v1/projects/script%2Fid/content',
        body: null,
        retryable: true,
      }),
    );
  });

  it('updates complete content with a non-retryable PUT', async () => {
    const http = {
      execute: vi.fn().mockResolvedValue({ body: '{"files":[]}' }),
    };
    const tokens = {
      refresh: vi.fn().mockResolvedValue({
        accessToken: 'token',
        expiresAt: '2099-01-01T00:00:00.000Z',
        scopes: ['scope'],
      }),
    };
    const gateway = new GoogleScriptHttpGateway(http, tokens);
    const files = [{ name: 'appsscript', type: 'JSON' as const, source: '{}' }];
    await gateway.updateProjectContent({
      scriptId: 'script/id',
      files,
      credential: { credentialSecret: 'GOOGLE_CREDENTIALS', scopes: ['scope'] },
      secrets: { get: vi.fn().mockResolvedValue(credentialSource()) },
    });
    expect(http.execute).toHaveBeenCalledWith({
      method: 'PUT',
      url: 'https://script.googleapis.com/v1/projects/script%2Fid/content',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ files }),
      retryable: false,
    });
  });
});

function credentialSource(): string {
  return JSON.stringify({
    formatVersion: 1,
    type: 'authorized_user',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    refreshToken: 'refresh-token',
  });
}
