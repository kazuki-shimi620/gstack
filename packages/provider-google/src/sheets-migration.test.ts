import { describe, expect, it, vi } from 'vitest';

import type { CreateModelOperation } from '@gstack/migration';

import type { GoogleProviderConfig } from './config.js';
import {
  createModelBatchRequests,
  GoogleSheetsCreateModelService,
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
      { batchUpdate },
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
      { batchUpdate: vi.fn().mockRejectedValue(new Error('secret')) },
      config,
      { get: vi.fn() },
    );
    await expect(failed.execute(operation, checksum)).rejects.toMatchObject({
      code: 'GOOGLE_SHEETS_WRITE_FAILED',
      message: 'Google Sheets Migration Operation failed.',
    });
    const invalid = new GoogleSheetsCreateModelService(
      { batchUpdate: vi.fn().mockResolvedValue({ spreadsheetId: 'other' }) },
      config,
      { get: vi.fn() },
    );
    await expect(invalid.execute(operation, checksum)).rejects.toMatchObject({
      code: 'GOOGLE_SHEETS_WRITE_RESPONSE_INVALID',
    });
  });
});

const config: GoogleProviderConfig = {
  spreadsheetId: 'sheet-1',
  appsScriptProjectId: 'script-1',
  driveFolderId: 'folder-1',
  authentication: {
    mode: 'user_oauth',
    credentialSecret: 'GOOGLE_CREDENTIALS',
  },
};
