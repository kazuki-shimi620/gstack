import { describe, expect, it, vi } from 'vitest';

import type { GoogleHttpClient } from './http.js';
import { GoogleSheetsHttpGateway } from './sheets-http.js';

const credentialSource = JSON.stringify({
  formatVersion: 1,
  type: 'authorized_user',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  refreshToken: 'refresh-token',
});

describe('Google Sheets HTTP gateway', () => {
  it('短命tokenでmetadataだけを要求してGoogle responseを変換する', async () => {
    const execute = vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: JSON.stringify({
        spreadsheetId: 'spreadsheet/id',
        properties: {
          title: 'Database',
          locale: 'ja_JP',
          timeZone: 'Asia/Tokyo',
        },
        sheets: [
          {
            properties: {
              sheetId: 1,
              title: 'users',
              gridProperties: { rowCount: 1000, columnCount: 20 },
            },
          },
        ],
        data: [{ rowData: [{ values: ['must-not-be-requested'] }] }],
      }),
    });
    const refresh = vi.fn().mockResolvedValue({
      accessToken: 'access-token',
      expiresAt: '2026-08-12T01:00:00.000Z',
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const get = vi.fn().mockResolvedValue(credentialSource);
    const gateway = new GoogleSheetsHttpGateway(
      { execute },
      { refresh },
      () => new Date('2026-08-12T00:00:00.000Z'),
    );

    await expect(
      gateway.getSpreadsheetMetadata({
        spreadsheetId: 'spreadsheet/id',
        credential: {
          credentialSecret: 'GOOGLE_CREDENTIALS',
          scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        },
        secrets: { get },
      }),
    ).resolves.toEqual({
      spreadsheetId: 'spreadsheet/id',
      title: 'Database',
      locale: 'ja_JP',
      timeZone: 'Asia/Tokyo',
      sheets: [{ sheetId: 1, title: 'users', rowCount: 1000, columnCount: 20 }],
    });
    const request = execute.mock.calls[0]?.[0];
    const url = new URL(request.url);
    expect(url.origin + url.pathname).toBe(
      'https://sheets.googleapis.com/v4/spreadsheets/spreadsheet%2Fid',
    );
    expect(url.searchParams.get('includeGridData')).toBe('false');
    expect(url.searchParams.get('fields')).toBe(
      'spreadsheetId,properties(title,locale,timeZone),sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))',
    );
    expect(request).toMatchObject({
      method: 'GET',
      retryable: true,
      headers: {
        accept: 'application/json',
        authorization: 'Bearer access-token',
      },
      body: null,
    });
    expect(request.url).not.toContain('access-token');
    expect(get).toHaveBeenCalledWith('GOOGLE_CREDENTIALS');
  });

  it.each(['not-json', '{}', '{"properties":{},"sheets":[{}]}'])(
    '不正Google responseを拒否する',
    async (body) => {
      const gateway = gatewayWithResponse(body);
      await expect(call(gateway)).rejects.toThrow(
        'Google Sheets metadata response is invalid.',
      );
    },
  );
});

function gatewayWithResponse(body: string): GoogleSheetsHttpGateway {
  const http: GoogleHttpClient = {
    execute: vi.fn().mockResolvedValue({ status: 200, headers: {}, body }),
  };
  return new GoogleSheetsHttpGateway(
    http,
    {
      refresh: vi.fn().mockResolvedValue({
        accessToken: 'token',
        expiresAt: '2026-08-12T01:00:00.000Z',
        scopes: ['scope'],
      }),
    },
    () => new Date('2026-08-12T00:00:00.000Z'),
  );
}

function call(gateway: GoogleSheetsHttpGateway): Promise<unknown> {
  return gateway.getSpreadsheetMetadata({
    spreadsheetId: 'id',
    credential: { credentialSecret: 'SECRET', scopes: ['scope'] },
    secrets: { get: vi.fn().mockResolvedValue(credentialSource) },
  });
}
