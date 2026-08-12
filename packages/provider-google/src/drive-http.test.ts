import { describe, expect, it, vi } from 'vitest';

import { GoogleDriveHttpGateway } from './drive-http.js';

describe('Google Drive HTTP gateway', () => {
  it('短命tokenとfields maskでfolder metadataだけを要求する', async () => {
    const execute = vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: '{"id":"folder/id"}',
    });
    const gateway = new GoogleDriveHttpGateway(
      { execute },
      {
        refresh: vi.fn().mockResolvedValue({
          accessToken: 'access-token',
          expiresAt: '2026-08-12T01:00:00.000Z',
          scopes: ['https://www.googleapis.com/auth/drive.metadata.readonly'],
        }),
      },
      () => new Date('2026-08-12T00:00:00.000Z'),
    );
    await expect(
      gateway.getFolderMetadata({
        folderId: 'folder/id',
        credential: {
          credentialSecret: 'SECRET',
          scopes: ['https://www.googleapis.com/auth/drive.metadata.readonly'],
        },
        secrets: { get: vi.fn().mockResolvedValue(credentialSource()) },
      }),
    ).resolves.toEqual({ id: 'folder/id' });
    const request = execute.mock.calls[0]?.[0];
    const url = new URL(request.url);
    expect(url.origin + url.pathname).toBe(
      'https://www.googleapis.com/drive/v3/files/folder%2Fid',
    );
    expect(url.searchParams.get('fields')).toBe(
      'id,name,mimeType,parents,trashed,capabilities(canAddChildren,canListChildren)',
    );
    expect(url.searchParams.get('supportsAllDrives')).toBe('true');
    expect(request.headers.authorization).toBe('Bearer access-token');
    expect(request.url).not.toContain('access-token');
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
