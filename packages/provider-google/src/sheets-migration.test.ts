import { describe, expect, it, vi } from 'vitest';

import type {
  AddColumnOperation,
  CreateModelOperation,
  DropColumnOperation,
  DropModelOperation,
  RenameColumnOperation,
} from '@gstack/migration';

import type { GoogleProviderConfig } from './config.js';
import {
  addColumnBatchRequests,
  createModelBatchRequests,
  dropColumnBatchRequests,
  dropModelBatchRequests,
  GoogleSheetsAddColumnService,
  GoogleSheetsCreateModelService,
  GoogleSheetsDropColumnService,
  GoogleSheetsDropModelService,
  GoogleSheetsRenameColumnService,
  inspectAddColumnState,
  inspectCreateModelState,
  inspectDropColumnState,
  inspectDropModelState,
  inspectRenameColumnState,
  renameColumnBatchRequests,
  stableSheetId,
} from './sheets-migration.js';

const checksum = 'a'.repeat(64);
const operation = {
  id: 'create_model:users:users',
  type: 'create_model',
  model: 'users',
  definition: {
    fields: [{ name: 'id' }, { name: 'email' }],
  },
} as unknown as CreateModelOperation;
const addColumn = {
  id: 'add_column:users:email',
  type: 'add_column',
  model: 'users',
  column: { name: 'email' },
} as unknown as AddColumnOperation;
const renameColumn = {
  id: 'rename_column:users:email:contact_email',
  type: 'rename_column',
  model: 'users',
  from: 'email',
  to: 'contact_email',
} as unknown as RenameColumnOperation;
const dropColumn = {
  id: 'drop_column:users:legacy',
  type: 'drop_column',
  model: 'users',
  risk: 'destructive',
  destructive: true,
  reversible: false,
  previous: { name: 'legacy' },
} as unknown as DropColumnOperation;
const dropModel = {
  id: 'drop_model:users:users',
  type: 'drop_model',
  model: 'users',
  risk: 'destructive',
  destructive: true,
  reversible: false,
  previous: {
    name: 'users',
    fields: [{ name: 'id' }, { name: 'email' }],
  },
} as unknown as DropModelOperation;

describe('Google Sheets create_model mapper', () => {
  it('決定的なSheet、header、管理markerを1 batchへ変換する', () => {
    const sheetId = stableSheetId('users');
    expect(sheetId).toBe(stableSheetId('users'));
    expect(sheetId).toBeGreaterThan(0);
    expect(createModelBatchRequests(operation, checksum)).toEqual([
      {
        addSheet: {
          properties: {
            sheetId,
            title: 'users',
            gridProperties: { rowCount: 1000, columnCount: 2 },
          },
        },
      },
      {
        updateCells: {
          start: { sheetId, rowIndex: 0, columnIndex: 0 },
          rows: [
            {
              values: [
                { userEnteredValue: { stringValue: 'id' } },
                { userEnteredValue: { stringValue: 'email' } },
              ],
            },
          ],
          fields: 'userEnteredValue',
        },
      },
      {
        createDeveloperMetadata: {
          developerMetadata: {
            metadataKey: 'gstack_model',
            metadataValue: `${checksum}:${operation.id}`,
            location: { sheetId },
            visibility: 'DOCUMENT',
          },
        },
      },
    ]);
  });

  it('不正checksumをwrite前に拒否する', () => {
    expect(() => createModelBatchRequests(operation, 'invalid')).toThrow(
      'Migration checksum is invalid.',
    );
  });
});

describe('Google Sheets create_model service', () => {
  it('database_write credentialでbatchを実行する', async () => {
    const batchUpdate = vi.fn().mockResolvedValue({ spreadsheetId: 'sheet-1' });
    const get = vi.fn();
    const service = new GoogleSheetsCreateModelService(
      {
        inspectCreateModel: vi.fn().mockResolvedValue({ sheets: [] }),
        batchUpdate,
      },
      config,
      { get },
    );
    await service.execute(operation, checksum);
    expect(batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: 'sheet-1',
        secrets: { get },
        credential: {
          credentialSecret: 'GOOGLE_CREDENTIALS',
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        },
      }),
    );
  });

  it('外部errorと不正responseをsafe errorへ変換する', async () => {
    const failed = new GoogleSheetsCreateModelService(
      {
        inspectCreateModel: vi.fn().mockResolvedValue({ sheets: [] }),
        batchUpdate: vi.fn().mockRejectedValue(new Error('secret')),
      },
      config,
      { get: vi.fn() },
    );
    await expect(failed.execute(operation, checksum)).rejects.toMatchObject({
      code: 'GOOGLE_SHEETS_WRITE_FAILED',
      message: 'Google Sheets Migration Operation failed.',
    });
    const invalid = new GoogleSheetsCreateModelService(
      {
        inspectCreateModel: vi.fn().mockResolvedValue({ sheets: [] }),
        batchUpdate: vi.fn().mockResolvedValue({ spreadsheetId: 'other' }),
      },
      config,
      { get: vi.fn() },
    );
    await expect(invalid.execute(operation, checksum)).rejects.toMatchObject({
      code: 'GOOGLE_SHEETS_WRITE_RESPONSE_INVALID',
    });
  });

  it('一致markerを適用済みとしてskipし競合状態を拒否する', async () => {
    const sheetId = stableSheetId('users');
    expect(
      inspectCreateModelState(
        {
          sheets: [
            {
              sheetId,
              title: 'users',
              metadata: [
                {
                  key: 'gstack_model',
                  value: `${checksum}:${operation.id}`,
                },
              ],
            },
          ],
        },
        operation,
        checksum,
      ),
    ).toBe('applied');
    expect(() =>
      inspectCreateModelState(
        { sheets: [{ sheetId, title: 'users', metadata: [] }] },
        operation,
        checksum,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_SHEETS_MIGRATION_CONFLICT' }),
    );

    const batchUpdate = vi.fn();
    const service = new GoogleSheetsCreateModelService(
      {
        inspectCreateModel: vi.fn().mockResolvedValue({
          sheets: [
            {
              sheetId,
              title: 'users',
              metadata: [
                {
                  key: 'gstack_model',
                  value: `${checksum}:${operation.id}`,
                },
              ],
            },
          ],
        }),
        batchUpdate,
      },
      config,
      { get: vi.fn() },
    );
    await service.execute(operation, checksum);
    expect(batchUpdate).not.toHaveBeenCalled();
  });
});

describe('Google Sheets add_column mapper', () => {
  it('空きgrid位置では列挿入、header、列markerを1 batchへ変換する', () => {
    const sheetId = stableSheetId('users');
    expect(
      addColumnBatchRequests(addColumn, checksum, {
        status: 'absent',
        sheetId,
        columnIndex: 1,
        columnCount: 10,
      }),
    ).toEqual([
      {
        insertDimension: {
          range: {
            sheetId,
            dimension: 'COLUMNS',
            startIndex: 1,
            endIndex: 2,
          },
          inheritFromBefore: false,
        },
      },
      {
        updateCells: {
          start: { sheetId, rowIndex: 0, columnIndex: 1 },
          rows: [
            {
              values: [{ userEnteredValue: { stringValue: 'email' } }],
            },
          ],
          fields: 'userEnteredValue',
        },
      },
      {
        createDeveloperMetadata: {
          developerMetadata: {
            metadataKey: 'gstack_operation',
            metadataValue: `${checksum}:${addColumn.id}`,
            location: {
              dimensionRange: {
                sheetId,
                dimension: 'COLUMNS',
                startIndex: 1,
                endIndex: 2,
              },
            },
            visibility: 'DOCUMENT',
          },
        },
      },
    ]);
  });

  it('grid末尾では1列appendする', () => {
    expect(
      addColumnBatchRequests(addColumn, checksum, {
        status: 'absent',
        sheetId: stableSheetId('users'),
        columnIndex: 1,
        columnCount: 1,
      })[0],
    ).toEqual({
      appendDimension: {
        sheetId: stableSheetId('users'),
        dimension: 'COLUMNS',
        length: 1,
      },
    });
  });

  it('管理Modelと連続headerから追加位置を決定する', () => {
    expect(
      inspectAddColumnState(addColumnState(), addColumn, checksum),
    ).toEqual({
      status: 'absent',
      sheetId: stableSheetId('users'),
      columnIndex: 1,
      columnCount: 10,
    });
  });

  it('一致する列markerを適用済みとしてskipし競合を拒否する', () => {
    const applied = addColumnState({
      headers: ['id', 'email'],
      metadata: [operationMarker(1)],
    });
    expect(inspectAddColumnState(applied, addColumn, checksum)).toEqual({
      status: 'applied',
    });
    expect(() =>
      inspectAddColumnState(
        addColumnState({ headers: ['id', 'email'] }),
        addColumn,
        checksum,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_SHEETS_MIGRATION_CONFLICT' }),
    );
    expect(() =>
      inspectAddColumnState(
        addColumnState({ headers: ['id', null] }),
        addColumn,
        checksum,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'GOOGLE_SHEETS_MIGRATION_STATE_INVALID',
      }),
    );
  });
});

describe('Google Sheets add_column service', () => {
  it('state read後にdatabase_write credentialでatomic batchを実行する', async () => {
    const batchUpdate = vi.fn().mockResolvedValue({ spreadsheetId: 'sheet-1' });
    const service = new GoogleSheetsAddColumnService(
      {
        inspectAddColumn: vi.fn().mockResolvedValue(addColumnState()),
        batchUpdate,
      },
      config,
      { get: vi.fn() },
    );
    await service.execute(addColumn, checksum);
    expect(batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: 'sheet-1',
        credential: {
          credentialSecret: 'GOOGLE_CREDENTIALS',
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        },
        requests: expect.arrayContaining([
          expect.objectContaining({ updateCells: expect.any(Object) }),
        ]),
      }),
    );
  });

  it('一致markerがあればresponse喪失後の再開でwriteをskipする', async () => {
    const batchUpdate = vi.fn();
    const service = new GoogleSheetsAddColumnService(
      {
        inspectAddColumn: vi.fn().mockResolvedValue(
          addColumnState({
            headers: ['id', 'email'],
            metadata: [operationMarker(1)],
          }),
        ),
        batchUpdate,
      },
      config,
      { get: vi.fn() },
    );
    await service.execute(addColumn, checksum);
    expect(batchUpdate).not.toHaveBeenCalled();
  });
});

describe('Google Sheets rename_column mapper', () => {
  it('同じ列位置のheader更新とOperation markerを1 batchへ変換する', () => {
    const sheetId = stableSheetId('users');
    expect(
      renameColumnBatchRequests(renameColumn, checksum, {
        status: 'absent',
        sheetId,
        columnIndex: 1,
      }),
    ).toEqual([
      {
        updateCells: {
          start: { sheetId, rowIndex: 0, columnIndex: 1 },
          rows: [
            {
              values: [{ userEnteredValue: { stringValue: 'contact_email' } }],
            },
          ],
          fields: 'userEnteredValue',
        },
      },
      {
        createDeveloperMetadata: {
          developerMetadata: {
            metadataKey: 'gstack_operation',
            metadataValue: `${checksum}:${renameColumn.id}`,
            location: {
              dimensionRange: {
                sheetId,
                dimension: 'COLUMNS',
                startIndex: 1,
                endIndex: 2,
              },
            },
            visibility: 'DOCUMENT',
          },
        },
      },
    ]);
  });

  it('旧headerだけがある状態を未適用として同じ列位置を返す', () => {
    expect(
      inspectRenameColumnState(renameColumnState(), renameColumn, checksum),
    ).toEqual({
      status: 'absent',
      sheetId: stableSheetId('users'),
      columnIndex: 1,
    });
  });

  it('新headerと一致markerを適用済みとして扱い競合を拒否する', () => {
    expect(
      inspectRenameColumnState(
        renameColumnState({
          headers: ['id', 'contact_email'],
          metadata: [renameOperationMarker(1)],
        }),
        renameColumn,
        checksum,
      ),
    ).toEqual({ status: 'applied' });
    expect(() =>
      inspectRenameColumnState(
        renameColumnState({ headers: ['id', 'contact_email'] }),
        renameColumn,
        checksum,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_SHEETS_MIGRATION_CONFLICT' }),
    );
    expect(() =>
      inspectRenameColumnState(
        renameColumnState({ headers: ['id', 'email', 'contact_email'] }),
        renameColumn,
        checksum,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_SHEETS_MIGRATION_CONFLICT' }),
    );
  });
});

describe('Google Sheets rename_column service', () => {
  it('state read後にdatabase_write credentialでatomic batchを実行する', async () => {
    const batchUpdate = vi.fn().mockResolvedValue({ spreadsheetId: 'sheet-1' });
    const service = new GoogleSheetsRenameColumnService(
      {
        inspectRenameColumn: vi.fn().mockResolvedValue(renameColumnState()),
        batchUpdate,
      },
      config,
      { get: vi.fn() },
    );
    await service.execute(renameColumn, checksum);
    expect(batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: 'sheet-1',
        credential: {
          credentialSecret: 'GOOGLE_CREDENTIALS',
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        },
        requests: expect.arrayContaining([
          expect.objectContaining({ updateCells: expect.any(Object) }),
        ]),
      }),
    );
  });

  it('一致markerがあればresponse喪失後の再開でwriteをskipする', async () => {
    const batchUpdate = vi.fn();
    const service = new GoogleSheetsRenameColumnService(
      {
        inspectRenameColumn: vi.fn().mockResolvedValue(
          renameColumnState({
            headers: ['id', 'contact_email'],
            metadata: [renameOperationMarker(1)],
          }),
        ),
        batchUpdate,
      },
      config,
      { get: vi.fn() },
    );
    await service.execute(renameColumn, checksum);
    expect(batchUpdate).not.toHaveBeenCalled();
  });
});

describe('Google Sheets drop_column mapper', () => {
  it('対象column削除とsheet-level markerを1 batchへ変換する', () => {
    const sheetId = stableSheetId('users');
    expect(
      dropColumnBatchRequests(dropColumn, checksum, {
        status: 'absent',
        sheetId,
        columnIndex: 1,
      }),
    ).toEqual([
      {
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'COLUMNS',
            startIndex: 1,
            endIndex: 2,
          },
        },
      },
      {
        createDeveloperMetadata: {
          developerMetadata: {
            metadataKey: 'gstack_operation',
            metadataValue: `${checksum}:${dropColumn.id}`,
            location: { sheetId },
            visibility: 'DOCUMENT',
          },
        },
      },
    ]);
  });

  it('対象headerの位置を決定しmarker一致を適用済みとする', () => {
    expect(
      inspectDropColumnState(dropColumnState(), dropColumn, checksum),
    ).toEqual({
      status: 'absent',
      sheetId: stableSheetId('users'),
      columnIndex: 1,
    });
    expect(
      inspectDropColumnState(
        dropColumnState({
          headers: ['id'],
          metadata: [dropOperationMarker()],
        }),
        dropColumn,
        checksum,
      ),
    ).toEqual({ status: 'applied' });
  });

  it('markerなしの欠落、markerと残存header、位置付きmarkerを競合拒否する', () => {
    expect(() =>
      inspectDropColumnState(
        dropColumnState({ headers: ['id'] }),
        dropColumn,
        checksum,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_SHEETS_MIGRATION_CONFLICT' }),
    );
    expect(() =>
      inspectDropColumnState(
        dropColumnState({ metadata: [dropOperationMarker()] }),
        dropColumn,
        checksum,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_SHEETS_MIGRATION_CONFLICT' }),
    );
    expect(() =>
      inspectDropColumnState(
        dropColumnState({
          headers: ['id'],
          metadata: [dropOperationMarker(1)],
        }),
        dropColumn,
        checksum,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_SHEETS_MIGRATION_CONFLICT' }),
    );
  });
});

describe('Google Sheets drop_column service', () => {
  it('database_write scopeでatomic batchを実行し一致markerではskipする', async () => {
    const batchUpdate = vi.fn().mockResolvedValue({ spreadsheetId: 'sheet-1' });
    const inspectDropColumn = vi
      .fn()
      .mockResolvedValueOnce(dropColumnState())
      .mockResolvedValueOnce(
        dropColumnState({
          headers: ['id'],
          metadata: [dropOperationMarker()],
        }),
      );
    const service = new GoogleSheetsDropColumnService(
      { inspectDropColumn, batchUpdate },
      config,
      { get: vi.fn() },
    );
    await service.execute(dropColumn, checksum);
    expect(batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        credential: {
          credentialSecret: 'GOOGLE_CREDENTIALS',
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        },
      }),
    );
    await service.execute(dropColumn, checksum);
    expect(batchUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('Google Sheets drop_model mapper', () => {
  it('Sheet削除とSpreadsheet-level markerを1 batchへ変換する', () => {
    const sheetId = stableSheetId('users');
    expect(
      dropModelBatchRequests(dropModel, checksum, {
        status: 'absent',
        sheetId,
      }),
    ).toEqual([
      { deleteSheet: { sheetId } },
      {
        createDeveloperMetadata: {
          developerMetadata: {
            metadataKey: 'gstack_operation',
            metadataValue: `${checksum}:${dropModel.id}`,
            location: { spreadsheet: true },
            visibility: 'DOCUMENT',
          },
        },
      },
    ]);
  });

  it('管理markerと過去headerが一致するSheetだけを削除可能とする', () => {
    expect(
      inspectDropModelState(dropModelState(), dropModel, checksum),
    ).toEqual({
      status: 'absent',
      sheetId: stableSheetId('users'),
    });
    expect(() =>
      inspectDropModelState(
        dropModelState({ headers: ['id', 'changed'] }),
        dropModel,
        checksum,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_SHEETS_MIGRATION_CONFLICT' }),
    );
  });

  it('Sheet消失とSpreadsheet-level marker一致を適用済みとする', () => {
    expect(
      inspectDropModelState(
        dropModelState({ absent: true, rootMetadata: [dropModelMarker()] }),
        dropModel,
        checksum,
      ),
    ).toEqual({ status: 'applied' });
    expect(() =>
      inspectDropModelState(
        dropModelState({ absent: true }),
        dropModel,
        checksum,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_SHEETS_MIGRATION_CONFLICT' }),
    );
    expect(() =>
      inspectDropModelState(
        dropModelState({ rootMetadata: [dropModelMarker()] }),
        dropModel,
        checksum,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_SHEETS_MIGRATION_CONFLICT' }),
    );
  });
});

describe('Google Sheets drop_model service', () => {
  it('atomic batchを実行しSpreadsheet marker一致ではskipする', async () => {
    const batchUpdate = vi.fn().mockResolvedValue({ spreadsheetId: 'sheet-1' });
    const inspectDropModel = vi
      .fn()
      .mockResolvedValueOnce(dropModelState())
      .mockResolvedValueOnce(
        dropModelState({ absent: true, rootMetadata: [dropModelMarker()] }),
      );
    const service = new GoogleSheetsDropModelService(
      { inspectDropModel, batchUpdate },
      config,
      { get: vi.fn() },
    );
    await service.execute(dropModel, checksum);
    await service.execute(dropModel, checksum);
    expect(batchUpdate).toHaveBeenCalledTimes(1);
  });
});

function addColumnState(
  overrides: {
    headers?: readonly unknown[];
    metadata?: readonly unknown[];
  } = {},
): unknown {
  return {
    sheets: [
      {
        sheetId: stableSheetId('users'),
        title: 'users',
        columnCount: 10,
        headers: overrides.headers ?? ['id'],
        metadata: [
          {
            key: 'gstack_model',
            value: `${'c'.repeat(64)}:create_model:users:users`,
            location: { sheetId: stableSheetId('users') },
          },
          ...(overrides.metadata ?? []),
        ],
      },
    ],
  };
}

function operationMarker(columnIndex: number): unknown {
  return {
    key: 'gstack_operation',
    value: `${checksum}:${addColumn.id}`,
    location: {
      sheetId: stableSheetId('users'),
      dimension: 'COLUMNS',
      startIndex: columnIndex,
      endIndex: columnIndex + 1,
    },
  };
}

function renameColumnState(
  overrides: {
    headers?: readonly unknown[];
    metadata?: readonly unknown[];
  } = {},
): unknown {
  return {
    sheets: [
      {
        sheetId: stableSheetId('users'),
        title: 'users',
        columnCount: 10,
        headers: overrides.headers ?? ['id', 'email'],
        metadata: [
          {
            key: 'gstack_model',
            value: `${'c'.repeat(64)}:create_model:users:users`,
            location: { sheetId: stableSheetId('users') },
          },
          ...(overrides.metadata ?? []),
        ],
      },
    ],
  };
}

function renameOperationMarker(columnIndex: number): unknown {
  return {
    key: 'gstack_operation',
    value: `${checksum}:${renameColumn.id}`,
    location: {
      sheetId: stableSheetId('users'),
      dimension: 'COLUMNS',
      startIndex: columnIndex,
      endIndex: columnIndex + 1,
    },
  };
}

function dropColumnState(
  overrides: {
    headers?: readonly unknown[];
    metadata?: readonly unknown[];
  } = {},
): unknown {
  return {
    sheets: [
      {
        sheetId: stableSheetId('users'),
        title: 'users',
        columnCount: 10,
        headers: overrides.headers ?? ['id', 'legacy'],
        metadata: [
          {
            key: 'gstack_model',
            value: `${'c'.repeat(64)}:create_model:users:users`,
            location: { sheetId: stableSheetId('users') },
          },
          ...(overrides.metadata ?? []),
        ],
      },
    ],
  };
}

function dropOperationMarker(columnIndex?: number): unknown {
  return {
    key: 'gstack_operation',
    value: `${checksum}:${dropColumn.id}`,
    location:
      columnIndex === undefined
        ? { sheetId: stableSheetId('users') }
        : {
            sheetId: stableSheetId('users'),
            dimension: 'COLUMNS',
            startIndex: columnIndex,
            endIndex: columnIndex + 1,
          },
  };
}

function dropModelState(
  overrides: {
    absent?: boolean;
    headers?: readonly unknown[];
    rootMetadata?: readonly unknown[];
  } = {},
): unknown {
  return {
    metadata: overrides.rootMetadata ?? [],
    sheets: [
      ...(overrides.absent
        ? []
        : [
            {
              sheetId: stableSheetId('users'),
              title: 'users',
              headers: overrides.headers ?? ['id', 'email'],
              metadata: [
                {
                  key: 'gstack_model',
                  value: `${'c'.repeat(64)}:create_model:users:users`,
                  location: { sheetId: stableSheetId('users') },
                },
              ],
            },
          ]),
      { sheetId: 999, title: 'other', headers: [], metadata: [] },
    ],
  };
}

function dropModelMarker(): unknown {
  return {
    key: 'gstack_operation',
    value: `${checksum}:${dropModel.id}`,
    location: { spreadsheet: true },
  };
}

const config: GoogleProviderConfig = {
  spreadsheetId: 'sheet-1',
  appsScriptProjectId: 'script-1',
  driveFolderId: 'folder-1',
  authentication: {
    mode: 'user_oauth',
    credentialSecret: 'GOOGLE_CREDENTIALS',
  },
};
