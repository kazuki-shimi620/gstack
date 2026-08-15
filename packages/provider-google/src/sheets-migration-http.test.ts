import { describe, expect, it, vi } from 'vitest';

import { GoogleSheetsMigrationHttpGateway } from './sheets-migration-http.js';

const credentialSource = JSON.stringify({
  formatVersion: 1,
  type: 'authorized_user',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  refreshToken: 'refresh-token',
});

describe('Google Sheets Migration HTTP gateway', () => {
  it('write scopeでatomic batchを自動retryせず送信する', async () => {
    const execute = vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: JSON.stringify({ spreadsheetId: 'spreadsheet/id', replies: [] }),
    });
    const refresh = vi.fn().mockResolvedValue({
      accessToken: 'access-token',
      expiresAt: '2026-08-13T01:00:00.000Z',
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const requests = [{ addSheet: { properties: { title: 'users' } } }];
    const gateway = new GoogleSheetsMigrationHttpGateway(
      { execute },
      { refresh },
      () => new Date('2026-08-13T00:00:00.000Z'),
    );

    await expect(
      gateway.batchUpdate({
        spreadsheetId: 'spreadsheet/id',
        credential: {
          credentialSecret: 'GOOGLE_CREDENTIALS',
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        },
        secrets: { get: vi.fn().mockResolvedValue(credentialSource) },
        requests,
      }),
    ).resolves.toEqual({ spreadsheetId: 'spreadsheet/id', replies: [] });
    const request = execute.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      method: 'POST',
      retryable: false,
      headers: {
        accept: 'application/json',
        authorization: 'Bearer access-token',
        'content-type': 'application/json',
      },
    });
    expect(new URL(request.url).pathname).toBe(
      '/v4/spreadsheets/spreadsheet%2Fid:batchUpdate',
    );
    expect(JSON.parse(request.body)).toEqual({
      requests,
      includeSpreadsheetInResponse: false,
      responseIncludeGridData: false,
    });
  });

  it('Sheetと管理markerだけを取得して正規化する', async () => {
    const execute = vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: JSON.stringify({
        sheets: [
          {
            properties: { sheetId: 10, title: 'users' },
            developerMetadata: [
              { metadataKey: 'gstack_model', metadataValue: 'marker' },
            ],
          },
        ],
      }),
    });
    const gateway = new GoogleSheetsMigrationHttpGateway(
      { execute },
      {
        refresh: vi.fn().mockResolvedValue({
          accessToken: 'token',
          expiresAt: '2026-08-13T01:00:00.000Z',
          scopes: ['scope'],
        }),
      },
      () => new Date('2026-08-13T00:00:00.000Z'),
    );
    await expect(
      gateway.inspectCreateModel({
        spreadsheetId: 'id',
        credential: { credentialSecret: 'SECRET', scopes: ['scope'] },
        secrets: { get: vi.fn().mockResolvedValue(credentialSource) },
      }),
    ).resolves.toEqual({
      sheets: [
        {
          sheetId: 10,
          title: 'users',
          metadata: [{ key: 'gstack_model', value: 'marker' }],
        },
      ],
    });
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      method: 'GET',
      retryable: true,
      body: null,
    });
  });

  it('add_column用のheaderとmetadata位置をread-only取得する', async () => {
    const execute = vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: JSON.stringify({
        sheets: [
          {
            properties: {
              sheetId: 10,
              title: 'users',
              gridProperties: { columnCount: 20 },
            },
            data: [
              {
                rowData: [
                  {
                    values: [
                      { userEnteredValue: { stringValue: 'id' } },
                      { userEnteredValue: { stringValue: 'email' } },
                    ],
                  },
                ],
              },
            ],
            developerMetadata: [
              {
                metadataKey: 'gstack_model',
                metadataValue: 'model-marker',
                location: { sheetId: 10 },
              },
              {
                metadataKey: 'gstack_operation',
                metadataValue: 'operation-marker',
                location: {
                  dimensionRange: {
                    sheetId: 10,
                    dimension: 'COLUMNS',
                    startIndex: 1,
                    endIndex: 2,
                  },
                },
              },
            ],
          },
        ],
      }),
    });
    const gateway = new GoogleSheetsMigrationHttpGateway(
      { execute },
      {
        refresh: vi.fn().mockResolvedValue({
          accessToken: 'token',
          expiresAt: '2026-08-13T01:00:00.000Z',
          scopes: ['scope'],
        }),
      },
      () => new Date('2026-08-13T00:00:00.000Z'),
    );
    await expect(
      gateway.inspectAddColumn({
        spreadsheetId: 'id',
        sheetTitle: "users'archive",
        credential: { credentialSecret: 'SECRET', scopes: ['scope'] },
        secrets: { get: vi.fn().mockResolvedValue(credentialSource) },
      }),
    ).resolves.toEqual({
      sheets: [
        {
          sheetId: 10,
          title: 'users',
          columnCount: 20,
          headers: ['id', 'email'],
          metadata: [
            {
              key: 'gstack_model',
              value: 'model-marker',
              location: { sheetId: 10 },
            },
            {
              key: 'gstack_operation',
              value: 'operation-marker',
              location: {
                sheetId: 10,
                dimension: 'COLUMNS',
                startIndex: 1,
                endIndex: 2,
              },
            },
          ],
        },
      ],
    });
    const request = execute.mock.calls[0]?.[0];
    const url = new URL(request.url);
    expect(url.searchParams.get('includeGridData')).toBe('true');
    expect(url.searchParams.get('ranges')).toBe("'users''archive'!1:1");
    expect(request).toMatchObject({
      method: 'GET',
      retryable: true,
      body: null,
    });
  });

  it('drop_model用にSpreadsheet markerを先に取得し対象Sheetだけheaderを読む', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: JSON.stringify({
          developerMetadata: [
            {
              metadataKey: 'gstack_operation',
              metadataValue: 'drop-marker',
              location: { spreadsheet: true },
            },
          ],
          sheets: [
            {
              properties: { sheetId: 10, title: 'users' },
              developerMetadata: [
                {
                  metadataKey: 'gstack_model',
                  metadataValue: 'model-marker',
                  location: { sheetId: 10 },
                },
              ],
            },
            { properties: { sheetId: 20, title: 'other' } },
          ],
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: JSON.stringify({
          sheets: [
            {
              properties: {
                sheetId: 10,
                title: 'users',
                gridProperties: { columnCount: 10 },
              },
              data: [
                {
                  rowData: [
                    {
                      values: [
                        { userEnteredValue: { stringValue: 'id' } },
                        { userEnteredValue: { stringValue: 'email' } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      });
    const gateway = new GoogleSheetsMigrationHttpGateway(
      { execute },
      {
        refresh: vi.fn().mockResolvedValue({
          accessToken: 'token',
          expiresAt: '2026-08-13T01:00:00.000Z',
          scopes: ['scope'],
        }),
      },
      () => new Date('2026-08-13T00:00:00.000Z'),
    );
    await expect(
      gateway.inspectDropModel({
        spreadsheetId: 'id',
        sheetTitle: 'users',
        credential: { credentialSecret: 'SECRET', scopes: ['scope'] },
        secrets: { get: vi.fn().mockResolvedValue(credentialSource) },
      }),
    ).resolves.toEqual({
      metadata: [
        {
          key: 'gstack_operation',
          value: 'drop-marker',
          location: { spreadsheet: true },
        },
      ],
      sheets: [
        {
          sheetId: 10,
          title: 'users',
          headers: ['id', 'email'],
          metadata: [
            {
              key: 'gstack_model',
              value: 'model-marker',
              location: { sheetId: 10 },
            },
          ],
        },
        { sheetId: 20, title: 'other', headers: [], metadata: [] },
      ],
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(
      new URL(execute.mock.calls[0]?.[0].url).searchParams.get(
        'includeGridData',
      ),
    ).toBe('false');
    expect(
      new URL(execute.mock.calls[1]?.[0].url).searchParams.get('ranges'),
    ).toBe("'users'!1:1");
  });

  it('不正JSON responseを拒否する', async () => {
    const gateway = new GoogleSheetsMigrationHttpGateway(
      {
        execute: vi.fn().mockResolvedValue({
          status: 200,
          headers: {},
          body: 'not-json',
        }),
      },
      {
        refresh: vi.fn().mockResolvedValue({
          accessToken: 'token',
          expiresAt: '2026-08-13T01:00:00.000Z',
          scopes: ['scope'],
        }),
      },
      () => new Date('2026-08-13T00:00:00.000Z'),
    );
    await expect(
      gateway.batchUpdate({
        spreadsheetId: 'id',
        credential: { credentialSecret: 'SECRET', scopes: ['scope'] },
        secrets: { get: vi.fn().mockResolvedValue(credentialSource) },
        requests: [],
      }),
    ).rejects.toThrow('Google Sheets batch response is invalid.');
  });
});
