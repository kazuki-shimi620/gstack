import { describe, expect, it, vi } from 'vitest';

import type { AddIndexOperation, DropIndexOperation } from '@gstack/migration';

import type { GoogleProviderConfig } from './config.js';
import {
  GoogleSheetsIndexService,
  indexBatchRequests,
  inspectIndexState,
  validateUniqueIndexRows,
} from './sheets-index.js';
import { stableSheetId } from './sheets-migration.js';

const checksum = 'a'.repeat(64);
const definition = {
  name: 'by_tenant_email',
  columns: ['tenant', 'email'],
  unique: true,
};
const addOperation: AddIndexOperation = {
  id: 'add_index:users:by_tenant_email',
  type: 'add_index',
  model: 'users',
  index: definition,
  risk: 'safe',
  destructive: false,
  reversible: true,
  capability: 'emulated',
};
const dropOperation: DropIndexOperation = {
  id: 'drop_index:users:by_tenant_email',
  type: 'drop_index',
  model: 'users',
  previous: definition,
  risk: 'safe',
  destructive: false,
  reversible: true,
  capability: 'emulated',
};

describe('Google Sheets Index Migration', () => {
  it('管理対象SheetとIndex列を検証する', () => {
    expect(inspectIndexState(state(), addOperation, checksum)).toEqual({
      status: 'absent',
      sheetId: stableSheetId('users'),
    });
    expect(inspectIndexState(state(), dropOperation, checksum)).toEqual({
      status: 'absent',
      sheetId: stableSheetId('users'),
    });
  });

  it('複合unique違反を値を露出せず拒否し空tupleを除外する', () => {
    expect(() =>
      validateUniqueIndexRows(
        [
          { rowNumber: 2, values: ['tenant-secret', 'mail-secret'] },
          { rowNumber: 5, values: ['tenant-secret', 'mail-secret'] },
        ],
        2,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'GOOGLE_SHEETS_MIGRATION_CONFLICT',
        message: expect.not.stringContaining('secret'),
      }),
    );
    expect(() =>
      validateUniqueIndexRows(
        [
          { rowNumber: 2, values: ['tenant', ''] },
          { rowNumber: 3, values: ['tenant', ''] },
        ],
        2,
      ),
    ).not.toThrow();
  });

  it('型をcoerceせずtupleを比較する', () => {
    expect(() =>
      validateUniqueIndexRows(
        [
          { rowNumber: 2, values: [1, 'mail'] },
          { rowNumber: 3, values: ['1', 'mail'] },
        ],
        2,
      ),
    ).not.toThrow();
  });

  it('同じOperation markerだけを適用済みと判定する', () => {
    expect(
      inspectIndexState(
        state([operationMarker(`${checksum}:${addOperation.id}`)]),
        addOperation,
        checksum,
      ),
    ).toEqual({ status: 'applied' });
    expect(
      inspectIndexState(
        state([operationMarker(`${'b'.repeat(64)}:add_column:users:email`)]),
        addOperation,
        checksum,
      ),
    ).toEqual({ status: 'absent', sheetId: stableSheetId('users') });
  });

  it('cellを変更せずSheet-level markerだけを作る', () => {
    expect(
      indexBatchRequests(addOperation, checksum, {
        status: 'absent',
        sheetId: stableSheetId('users'),
      }),
    ).toEqual([
      {
        createDeveloperMetadata: {
          developerMetadata: {
            metadataKey: 'gstack_operation',
            metadataValue: `${checksum}:${addOperation.id}`,
            location: { sheetId: stableSheetId('users') },
            visibility: 'DOCUMENT',
          },
        },
      },
    ]);
  });

  it('unique addだけ値を要求しwrite直前に再readする', async () => {
    const inspectIndex = vi.fn().mockResolvedValue(state());
    const batchUpdate = vi
      .fn()
      .mockResolvedValue({ spreadsheetId: 'spreadsheet-id' });
    const service = new GoogleSheetsIndexService(
      { inspectIndex, batchUpdate },
      config,
      { get: vi.fn() },
    );
    await service.execute(addOperation, checksum);
    expect(inspectIndex).toHaveBeenCalledTimes(2);
    expect(inspectIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: ['tenant', 'email'],
        includeValues: true,
      }),
    );
    expect(batchUpdate).toHaveBeenCalledTimes(1);
  });

  it('dropでは値を読まず再read済みmarkerをskipする', async () => {
    const inspectIndex = vi
      .fn()
      .mockResolvedValueOnce(state())
      .mockResolvedValueOnce(
        state([operationMarker(`${checksum}:${dropOperation.id}`)]),
      );
    const batchUpdate = vi.fn();
    const service = new GoogleSheetsIndexService(
      { inspectIndex, batchUpdate },
      config,
      { get: vi.fn() },
    );
    await service.execute(dropOperation, checksum);
    expect(inspectIndex).toHaveBeenCalledWith(
      expect.objectContaining({ includeValues: false }),
    );
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
        headers: ['id', 'tenant', 'email'],
        metadata: [
          {
            key: 'gstack_model',
            value: `${'c'.repeat(64)}:create_model:users:users`,
            location: { sheetId },
          },
          ...extraMetadata,
        ],
        rows: [
          { rowNumber: 2, values: ['tenant-a', 'a@example.test'] },
          { rowNumber: 4, values: ['tenant-a', 'b@example.test'] },
        ],
      },
    ],
  };
}

function operationMarker(value: string): unknown {
  return {
    key: 'gstack_operation',
    value,
    location: { sheetId: stableSheetId('users') },
  };
}
