import { describe, expect, it, vi } from 'vitest';

import type { GoogleProviderConfig } from './config.js';
import { GoogleDatabaseReadService } from './database.js';

const config: GoogleProviderConfig = {
  spreadsheetId: 'spreadsheet-id',
  appsScriptProjectId: 'script-id',
  driveFolderId: 'folder-id',
  authentication: {
    mode: 'user_oauth',
    credentialSecret: 'GOOGLE_CREDENTIALS',
  },
};

describe('Google Database read service', () => {
  it('Spreadsheet metadataだけを決定的なSheet順で返す', async () => {
    const secrets = { get: vi.fn() };
    const getSpreadsheetMetadata = vi.fn().mockResolvedValue({
      spreadsheetId: 'spreadsheet-id',
      title: 'Application Database',
      locale: 'ja_JP',
      timeZone: 'Asia/Tokyo',
      sheets: [
        { sheetId: 2, title: 'users', rowCount: 1000, columnCount: 20 },
        { sheetId: 1, title: 'posts', rowCount: 500, columnCount: 12 },
      ],
      values: [['must not be exposed']],
    });
    const service = new GoogleDatabaseReadService(
      { getSpreadsheetMetadata },
      config,
      secrets,
    );

    const result = await service.getMetadata();
    expect(result).toEqual({
      spreadsheetId: 'spreadsheet-id',
      title: 'Application Database',
      locale: 'ja_JP',
      timeZone: 'Asia/Tokyo',
      sheets: [
        { sheetId: 1, title: 'posts', rowCount: 500, columnCount: 12 },
        { sheetId: 2, title: 'users', rowCount: 1000, columnCount: 20 },
      ],
    });
    expect(result).not.toHaveProperty('values');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.sheets)).toBe(true);
    expect(getSpreadsheetMetadata).toHaveBeenCalledWith({
      spreadsheetId: 'spreadsheet-id',
      credential: {
        credentialSecret: 'GOOGLE_CREDENTIALS',
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      },
      secrets,
    });
    expect(secrets.get).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {
      spreadsheetId: 'other',
      title: 'Database',
      locale: null,
      timeZone: null,
      sheets: [],
    },
    {
      spreadsheetId: 'spreadsheet-id',
      title: '',
      locale: null,
      timeZone: null,
      sheets: [],
    },
    {
      spreadsheetId: 'spreadsheet-id',
      title: 'Database',
      locale: null,
      timeZone: null,
      sheets: [
        { sheetId: 1, title: 'users', rowCount: 1, columnCount: 1 },
        { sheetId: 1, title: 'posts', rowCount: 1, columnCount: 1 },
      ],
    },
  ])('不正なmetadata responseをstable errorで拒否する', async (value) => {
    const service = new GoogleDatabaseReadService(
      { getSpreadsheetMetadata: vi.fn().mockResolvedValue(value) },
      config,
      { get: vi.fn() },
    );
    await expect(service.getMetadata()).rejects.toMatchObject({
      code: 'GOOGLE_SPREADSHEET_METADATA_INVALID',
      message: 'Google Spreadsheet metadata response is invalid.',
    });
  });

  it('Gateway errorの生messageを公開しない', async () => {
    const service = new GoogleDatabaseReadService(
      {
        getSpreadsheetMetadata: vi
          .fn()
          .mockRejectedValue(new Error('token=secret-value')),
      },
      config,
      { get: vi.fn() },
    );
    await expect(service.getMetadata()).rejects.toMatchObject({
      code: 'GOOGLE_SPREADSHEET_METADATA_FAILED',
      message: 'Google Spreadsheet metadata could not be read.',
    });
  });
});
