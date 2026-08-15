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
  it('Relation用にsource／target headerと対象値を別々に取得する', async () => {
    const headerResponse = (
      sheetId: number,
      title: string,
      headers: string[],
    ) => ({
      status: 200,
      headers: {},
      body: JSON.stringify({
        sheets: [
          {
            properties: {
              sheetId,
              title,
              gridProperties: { columnCount: 8, rowCount: 1000 },
            },
            data: [
              {
                rowData: [
                  {
                    values: headers.map((value) => ({
                      userEnteredValue: { stringValue: value },
                    })),
                  },
                ],
              },
            ],
            developerMetadata: [],
          },
        ],
      }),
    });
    const valueResponse = (
      sheetId: number,
      title: string,
      values: readonly string[],
    ) => ({
      status: 200,
      headers: {},
      body: JSON.stringify({
        sheets: [
          {
            properties: { sheetId, title },
            data: [
              {
                rowData: [
                  {
                    values: values.map((value) => ({
                      effectiveValue: { stringValue: value },
                    })),
                  },
                ],
              },
            ],
          },
        ],
      }),
    });
    const execute = vi
      .fn()
      .mockResolvedValueOnce(headerResponse(10, 'users', ['id', 'account_id']))
      .mockResolvedValueOnce(headerResponse(20, 'accounts', ['id']))
      .mockResolvedValueOnce(
        valueResponse(10, 'users', ['user-1', 'account-1']),
      )
      .mockResolvedValueOnce(valueResponse(20, 'accounts', ['account-1']));
    const gateway = migrationGateway(execute);
    await expect(
      gateway.inspectRelation({
        spreadsheetId: 'id',
        sourceSheetTitle: 'users',
        localField: 'account_id',
        targetSheetTitle: 'accounts',
        referenceField: 'id',
        includeValues: true,
        credential: { credentialSecret: 'SECRET', scopes: ['scope'] },
        secrets: { get: vi.fn().mockResolvedValue(credentialSource) },
      }),
    ).resolves.toEqual({
      sheets: [
        expect.objectContaining({
          sheetId: 10,
          title: 'users',
          localValues: [{ rowNumber: 2, value: 'account-1' }],
        }),
        expect.objectContaining({
          sheetId: 20,
          title: 'accounts',
          referenceValues: [{ rowNumber: 2, value: 'account-1' }],
        }),
      ],
    });
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it('unique Index用に論理rowの対象tupleだけを正規化する', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: JSON.stringify({
          sheets: [
            {
              properties: {
                sheetId: 10,
                title: 'users',
                gridProperties: { columnCount: 8, rowCount: 1000 },
              },
              data: [
                {
                  rowData: [
                    {
                      values: [
                        { userEnteredValue: { stringValue: 'id' } },
                        { userEnteredValue: { stringValue: 'tenant' } },
                        { userEnteredValue: { stringValue: 'email' } },
                      ],
                    },
                  ],
                },
              ],
              developerMetadata: [],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: JSON.stringify({
          sheets: [
            {
              properties: { sheetId: 10, title: 'users' },
              data: [
                {
                  rowData: [
                    {
                      values: [
                        { effectiveValue: { stringValue: 'id-1' } },
                        { effectiveValue: { stringValue: 'tenant-a' } },
                        { effectiveValue: { stringValue: 'a@example.test' } },
                      ],
                    },
                    {
                      values: [
                        { effectiveValue: { stringValue: 'id-2' } },
                        {},
                        { effectiveValue: { stringValue: 'b@example.test' } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      });
    const gateway = migrationGateway(execute);
    await expect(
      gateway.inspectIndex({
        spreadsheetId: 'id',
        sheetTitle: 'users',
        columns: ['tenant', 'email'],
        includeValues: true,
        credential: { credentialSecret: 'SECRET', scopes: ['scope'] },
        secrets: { get: vi.fn().mockResolvedValue(credentialSource) },
      }),
    ).resolves.toEqual({
      sheets: [
        expect.objectContaining({
          sheetId: 10,
          title: 'users',
          rows: [
            {
              rowNumber: 2,
              values: ['tenant-a', 'a@example.test'],
            },
            { rowNumber: 3, values: [undefined, 'b@example.test'] },
          ],
        }),
      ],
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('alter_column用にheader確認後、使用中の全rowから対象列だけを正規化する', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: JSON.stringify({
          sheets: [
            {
              properties: {
                sheetId: 10,
                title: 'users',
                gridProperties: { columnCount: 8, rowCount: 1000 },
              },
              data: [
                {
                  rowData: [
                    {
                      values: [
                        { userEnteredValue: { stringValue: 'id' } },
                        { userEnteredValue: { stringValue: 'role' } },
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
              ],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: JSON.stringify({
          sheets: [
            {
              properties: { sheetId: 10, title: 'users' },
              data: [
                {
                  rowData: [
                    {
                      values: [
                        { effectiveValue: { stringValue: 'id-1' } },
                        { effectiveValue: { stringValue: 'admin' } },
                      ],
                    },
                    {
                      values: [{ effectiveValue: { stringValue: 'id-2' } }, {}],
                    },
                    {},
                    {
                      values: [
                        { effectiveValue: { stringValue: 'id-4' } },
                        { effectiveValue: { stringValue: 'member' } },
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
      gateway.inspectAlterColumn({
        spreadsheetId: 'id',
        sheetTitle: 'users',
        columnName: 'role',
        credential: { credentialSecret: 'SECRET', scopes: ['scope'] },
        secrets: { get: vi.fn().mockResolvedValue(credentialSource) },
      }),
    ).resolves.toEqual({
      sheets: [
        {
          sheetId: 10,
          title: 'users',
          columnCount: 8,
          rowCount: 1000,
          headers: ['id', 'role'],
          metadata: [
            {
              key: 'gstack_model',
              value: 'model-marker',
              location: { sheetId: 10 },
            },
          ],
          rows: [
            { rowNumber: 2, value: 'admin' },
            { rowNumber: 3, value: undefined },
            { rowNumber: 5, value: 'member' },
          ],
        },
      ],
    });
    const dataUrl = new URL(execute.mock.calls[1]?.[0].url);
    expect(dataUrl.searchParams.get('ranges')).toBe("'users'!2:1000");
    expect(dataUrl.searchParams.get('fields')).toContain('effectiveValue');
  });

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

function migrationGateway(execute: ReturnType<typeof vi.fn>) {
  return new GoogleSheetsMigrationHttpGateway(
    { execute: execute as never },
    {
      refresh: vi.fn().mockResolvedValue({
        accessToken: 'token',
        expiresAt: '2026-08-13T01:00:00.000Z',
        scopes: ['scope'],
      }),
    },
    () => new Date('2026-08-13T00:00:00.000Z'),
  );
}
