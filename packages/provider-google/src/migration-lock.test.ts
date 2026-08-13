import { describe, expect, it, vi } from 'vitest';

import type { GoogleProviderConfig } from './config.js';
import {
  googleMigrationLockId,
  GoogleSheetsMigrationLock,
} from './migration-lock.js';

const config: GoogleProviderConfig = {
  spreadsheetId: 'sheet-1',
  appsScriptProjectId: 'script-1',
  driveFolderId: 'folder-1',
  authentication: {
    mode: 'user_oauth',
    credentialSecret: 'GOOGLE_CREDENTIALS',
  },
};

describe('Google Migration lock', () => {
  it('決定的IDでlockを取得しreleaseを一度だけ実行する', async () => {
    const add = vi.fn().mockResolvedValue('acquired');
    const remove = vi.fn().mockResolvedValue(undefined);
    const lock = new GoogleSheetsMigrationLock(
      {
        inspect: vi.fn().mockResolvedValue({ sheetIds: [20, 10], lockIds: [] }),
        add,
        remove,
      },
      config,
      { get: vi.fn() },
    );
    const key = 'google:sheet-1:20260813_000001';
    const lease = await lock.acquire(key);
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({
        lockId: googleMigrationLockId(key),
        sheetId: 10,
        credential: {
          credentialSecret: 'GOOGLE_CREDENTIALS',
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        },
      }),
    );
    await lease?.release();
    await lease?.release();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('既存lockと取得raceをunavailableとして返す', async () => {
    const key = 'google:sheet-1:version';
    const existing = new GoogleSheetsMigrationLock(
      {
        inspect: vi.fn().mockResolvedValue({
          sheetIds: [1],
          lockIds: [googleMigrationLockId(key)],
        }),
        add: vi.fn(),
        remove: vi.fn(),
      },
      config,
      { get: vi.fn() },
    );
    await expect(existing.acquire(key)).resolves.toBeNull();
    const raced = new GoogleSheetsMigrationLock(
      {
        inspect: vi.fn().mockResolvedValue({ sheetIds: [1], lockIds: [] }),
        add: vi.fn().mockResolvedValue('conflict'),
        remove: vi.fn(),
      },
      config,
      { get: vi.fn() },
    );
    await expect(raced.acquire(key)).resolves.toBeNull();
  });

  it('不正stateとgateway errorをsafe errorへ変換する', async () => {
    const invalid = new GoogleSheetsMigrationLock(
      {
        inspect: vi.fn().mockResolvedValue({ sheetIds: [], lockIds: [] }),
        add: vi.fn(),
        remove: vi.fn(),
      },
      config,
      { get: vi.fn() },
    );
    await expect(invalid.acquire('key')).rejects.toMatchObject({
      code: 'GOOGLE_MIGRATION_LOCK_STATE_INVALID',
    });
    const failed = new GoogleSheetsMigrationLock(
      {
        inspect: vi.fn().mockRejectedValue(new Error('secret')),
        add: vi.fn(),
        remove: vi.fn(),
      },
      config,
      { get: vi.fn() },
    );
    await expect(failed.acquire('key')).rejects.toMatchObject({
      code: 'GOOGLE_MIGRATION_LOCK_FAILED',
      message: 'Google Migration lock operation failed.',
    });
  });
});
