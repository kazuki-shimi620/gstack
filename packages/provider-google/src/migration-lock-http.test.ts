import { describe, expect, it, vi } from 'vitest';

import { GoogleHttpError } from './http.js';
import type { GoogleHttpClient } from './http.js';
import { GoogleMigrationLockHttpGateway } from './migration-lock-http.js';

const secret = JSON.stringify({
  formatVersion: 1,
  type: 'authorized_user',
  clientId: 'id',
  clientSecret: 'secret',
  refreshToken: 'refresh',
});
const common = {
  spreadsheetId: 'spreadsheet/id',
  credential: { credentialSecret: 'CREDENTIAL', scopes: ['scope'] },
  secrets: { get: vi.fn().mockResolvedValue(secret) },
};

describe('Google Migration lock HTTP gateway', () => {
  it('Named Range stateをreadしadd/remove writeを非retryで送信する', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: JSON.stringify({
          sheets: [{ properties: { sheetId: 7 } }],
          namedRanges: [{ namedRangeId: 'lock-existing' }],
        }),
      })
      .mockResolvedValue({ status: 200, headers: {}, body: '{}' });
    const gateway = createGateway(execute);
    await expect(gateway.inspect(common)).resolves.toEqual({
      sheetIds: [7],
      lockIds: ['lock-existing'],
    });
    await expect(
      gateway.add({ ...common, lockId: 'lock-new', sheetId: 7 }),
    ).resolves.toBe('acquired');
    await gateway.remove({ ...common, lockId: 'lock-new' });
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      method: 'GET',
      retryable: true,
    });
    expect(execute.mock.calls[1]?.[0]).toMatchObject({
      method: 'POST',
      retryable: false,
    });
    expect(JSON.parse(execute.mock.calls[1]?.[0].body)).toMatchObject({
      requests: [
        {
          addNamedRange: {
            namedRange: { namedRangeId: 'lock-new', range: { sheetId: 7 } },
          },
        },
      ],
    });
    expect(JSON.parse(execute.mock.calls[2]?.[0].body)).toMatchObject({
      requests: [{ deleteNamedRange: { namedRangeId: 'lock-new' } }],
    });
  });

  it('addの400を取得競合へ変換する', async () => {
    const gateway = createGateway(
      vi
        .fn()
        .mockRejectedValue(
          new GoogleHttpError('GOOGLE_HTTP_FAILED', 400, 'failed'),
        ),
    );
    await expect(
      gateway.add({ ...common, lockId: 'lock', sheetId: 1 }),
    ).resolves.toBe('conflict');
  });
});

function createGateway(execute: GoogleHttpClient['execute']) {
  return new GoogleMigrationLockHttpGateway(
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
