import { describe, expect, it, vi } from 'vitest';

import type { Field } from '@gstack/application';
import type { AlterColumnOperation } from '@gstack/migration';

import type { GoogleProviderConfig } from './config.js';
import {
  alterColumnBatchRequests,
  GoogleSheetsAlterColumnService,
  inspectAlterColumnState,
  validateAlterColumnValues,
} from './sheets-alter-column.js';
import { stableSheetId } from './sheets-migration.js';

const checksum = 'a'.repeat(64);
const baseField = (overrides: Partial<Field> = {}): Field => ({
  name: 'role',
  type: 'string',
  required: false,
  unique: false,
  enumValues: [],
  validation: {
    minLength: null,
    maxLength: null,
    pattern: null,
    min: null,
    max: null,
  },
  ...overrides,
});
const operation: AlterColumnOperation = {
  id: 'alter_column:users:role',
  type: 'alter_column',
  model: 'users',
  column: 'role',
  previous: baseField(),
  target: baseField({
    type: 'enum',
    required: true,
    unique: true,
    enumValues: ['admin', 'member'],
  }),
  changes: [
    {
      property: 'type',
      previous: 'string',
      target: 'enum',
      risk: 'caution',
    },
    {
      property: 'required',
      previous: false,
      target: true,
      risk: 'caution',
    },
    {
      property: 'unique',
      previous: false,
      target: true,
      risk: 'caution',
    },
    {
      property: 'enumValues',
      previous: [],
      target: ['admin', 'member'],
      risk: 'safe',
    },
  ],
  risk: 'caution',
  destructive: false,
  reversible: false,
  capability: 'emulated',
};

describe('Google Sheets alter_column', () => {
  it('Operationと管理状態を検証して対象列を返す', () => {
    expect(
      inspectAlterColumnState(
        state([operationMarker(`${'c'.repeat(64)}:add_column:users:role`)]),
        operation,
        checksum,
      ),
    ).toEqual({
      status: 'absent',
      sheetId: stableSheetId('users'),
      columnIndex: 1,
    });
  });

  it('Operation markerが同じ列にあれば適用済みとする', () => {
    expect(
      inspectAlterColumnState(
        state([operationMarker(`${checksum}:${operation.id}`)]),
        operation,
        checksum,
      ),
    ).toEqual({ status: 'applied' });
  });

  it('非canonical差分と壊れたstateを安全側で拒否する', () => {
    expect(() =>
      inspectAlterColumnState(
        state(),
        { ...operation, id: 'alter_column:users:other' },
        checksum,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_MIGRATION_OPERATION_INVALID' }),
    );
    const malformed = state() as {
      sheets: [{ metadata: unknown[] }];
    };
    malformed.sheets[0].metadata.push({ key: 'unknown' });
    expect(() =>
      inspectAlterColumnState(malformed, operation, checksum),
    ).toThrowError(
      expect.objectContaining({
        code: 'GOOGLE_SHEETS_MIGRATION_STATE_INVALID',
      }),
    );
  });

  it('値を露出せずrequired、unique、型、Enum違反を拒否する', () => {
    for (const rows of [
      [{ rowNumber: 2, value: undefined }],
      [
        { rowNumber: 2, value: 'admin' },
        { rowNumber: 5, value: 'admin' },
      ],
      [{ rowNumber: 2, value: 1 }],
      [{ rowNumber: 2, value: 'owner-secret' }],
    ]) {
      expect(() =>
        validateAlterColumnValues(rows, operation.target),
      ).toThrowError(
        expect.objectContaining({
          code: 'GOOGLE_SHEETS_MIGRATION_CONFLICT',
          message: expect.not.stringContaining('owner-secret'),
        }),
      );
    }
  });

  it('全Field型をcoerceせず判定する', () => {
    const cases: readonly [Field['type'], unknown, readonly string[]][] = [
      ['string', 'value', []],
      ['text', 'value', []],
      ['integer', 1, []],
      ['number', 1.5, []],
      ['boolean', true, []],
      ['uuid', '123e4567-e89b-12d3-a456-426614174000', []],
      ['date', '2026-08-15', []],
      ['datetime', '2026-08-15T10:00:00Z', []],
      ['json', '{"safe":true}', []],
      ['enum', 'member', ['member']],
    ];
    for (const [type, value, enumValues] of cases) {
      expect(() =>
        validateAlterColumnValues(
          [{ rowNumber: 2, value }],
          baseField({ type, required: true, enumValues }),
        ),
      ).not.toThrow();
    }
    expect(() =>
      validateAlterColumnValues(
        [{ rowNumber: 2, value: '1' }],
        baseField({ type: 'integer', required: true }),
      ),
    ).toThrow();
  });

  it('cellを変更せずcolumn markerだけを作る', () => {
    expect(
      alterColumnBatchRequests(operation, checksum, {
        status: 'absent',
        sheetId: stableSheetId('users'),
        columnIndex: 1,
      }),
    ).toEqual([
      {
        createDeveloperMetadata: {
          developerMetadata: {
            metadataKey: 'gstack_operation',
            metadataValue: `${checksum}:${operation.id}`,
            location: {
              dimensionRange: {
                sheetId: stableSheetId('users'),
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

  it('write直前に再readしてから非retry gatewayへ渡す', async () => {
    const inspectAlterColumn = vi.fn().mockResolvedValue(state());
    const batchUpdate = vi
      .fn()
      .mockResolvedValue({ spreadsheetId: 'spreadsheet-id' });
    const service = new GoogleSheetsAlterColumnService(
      { inspectAlterColumn, batchUpdate },
      config,
      { get: vi.fn() },
    );
    await expect(service.execute(operation, checksum)).resolves.toBeUndefined();
    expect(inspectAlterColumn).toHaveBeenCalledTimes(2);
    expect(batchUpdate).toHaveBeenCalledTimes(1);
  });

  it('再readで適用済みmarkerを検出したらwriteしない', async () => {
    const inspectAlterColumn = vi
      .fn()
      .mockResolvedValueOnce(state())
      .mockResolvedValueOnce(
        state([operationMarker(`${checksum}:${operation.id}`)]),
      );
    const batchUpdate = vi.fn();
    const service = new GoogleSheetsAlterColumnService(
      { inspectAlterColumn, batchUpdate },
      config,
      { get: vi.fn() },
    );
    await expect(service.execute(operation, checksum)).resolves.toBeUndefined();
    expect(batchUpdate).not.toHaveBeenCalled();
  });
});

const config: GoogleProviderConfig = {
  spreadsheetId: 'spreadsheet-id',
  appsScriptProjectId: 'script-id',
  driveFolderId: 'folder-id',
  authentication: {
    mode: 'user_oauth',
    credentialSecret: 'GOOGLE_CREDENTIALS',
  },
};

function state(extraMetadata: readonly unknown[] = []): unknown {
  const sheetId = stableSheetId('users');
  return {
    sheets: [
      {
        sheetId,
        title: 'users',
        headers: ['id', 'role'],
        metadata: [
          {
            key: 'gstack_model',
            value: `${'b'.repeat(64)}:create_model:users:users`,
            location: { sheetId },
          },
          ...extraMetadata,
        ],
        rows: [
          { rowNumber: 2, value: 'admin' },
          { rowNumber: 4, value: 'member' },
        ],
      },
    ],
  };
}

function operationMarker(value: string): unknown {
  return {
    key: 'gstack_operation',
    value,
    location: {
      sheetId: stableSheetId('users'),
      dimension: 'COLUMNS',
      startIndex: 1,
      endIndex: 2,
    },
  };
}
