import { describe, expect, it, vi } from 'vitest';

import type { GoogleHttpClient } from './http.js';
import { GoogleMigrationHistoryHttpGateway } from './migration-history-http.js';

const secret = JSON.stringify({
  formatVersion: 1,
  type: 'authorized_user',
  clientId: 'id',
  clientSecret: 'secret',
  refreshToken: 'refresh',
});
const common = {
  folderId: "folder'id",
  credential: { credentialSecret: 'CREDENTIAL', scopes: ['scope'] },
  secrets: { get: vi.fn().mockResolvedValue(secret) },
};

describe('Google Migration History HTTP gateway', () => {
  it('folderとmarkerに限定してfile metadataを検索する', async () => {
    const execute = vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: JSON.stringify({
        files: [
          {
            id: 'file-1',
            name: '.gstack-migration-20260813_000001.json',
            parents: ["folder'id"],
            appProperties: {
              gstackType: 'migration_history_v1',
              version: '20260813_000001',
            },
          },
        ],
      }),
    });
    const gateway = createGateway(execute);
    await expect(gateway.list(common)).resolves.toEqual([
      {
        id: 'file-1',
        name: '.gstack-migration-20260813_000001.json',
        parentId: "folder'id",
        version: '20260813_000001',
      },
    ]);
    const request = execute.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      method: 'GET',
      retryable: true,
      body: null,
    });
    const url = new URL(request.url);
    expect(url.searchParams.get('q')).toContain("'folder\\'id' in parents");
    expect(url.searchParams.get('q')).toContain(
      "key='gstackType' and value='migration_history_v1'",
    );
  });

  it('content readはretry可能、create/updateは非retryで送信する', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: '{"history":true}',
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: '{"id":"created"}',
      })
      .mockResolvedValueOnce({ status: 200, headers: {}, body: '{}' });
    const gateway = createGateway(execute);
    await expect(gateway.read({ ...common, fileId: 'file/id' })).resolves.toBe(
      '{"history":true}',
    );
    await expect(
      gateway.create({
        ...common,
        name: '.gstack-migration-20260813_000001.json',
        version: '20260813_000001',
        content: '{"history":true}',
      }),
    ).resolves.toEqual({ id: 'created' });
    await gateway.update({
      ...common,
      fileId: 'file/id',
      content: '{"history":false}',
    });
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      method: 'GET',
      retryable: true,
    });
    expect(execute.mock.calls[1]?.[0]).toMatchObject({
      method: 'POST',
      retryable: false,
      headers: {
        'content-type':
          'multipart/related; boundary=gstack_migration_history_v1',
      },
    });
    expect(execute.mock.calls[1]?.[0].body).toContain(
      '"gstackType":"migration_history_v1"',
    );
    expect(execute.mock.calls[2]?.[0]).toMatchObject({
      method: 'PATCH',
      retryable: false,
      body: '{"history":false}',
    });
  });
});

function createGateway(execute: GoogleHttpClient['execute']) {
  return new GoogleMigrationHistoryHttpGateway(
    { execute },
    {
      refresh: vi.fn().mockResolvedValue({
        accessToken: 'token',
        expiresAt: '2026-08-13T10:00:00.000Z',
        scopes: ['scope'],
      }),
    },
    () => new Date('2026-08-13T09:00:00.000Z'),
  );
}
