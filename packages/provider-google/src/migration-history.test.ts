import { describe, expect, it, vi } from 'vitest';

import {
  createMigrationFile,
  createPendingHistory,
  serializeMigrationHistory,
} from '@gstack/migration';

import type { GoogleProviderConfig } from './config.js';
import {
  GoogleDriveMigrationHistoryStorage,
  historyFileName,
} from './migration-history.js';

const config: GoogleProviderConfig = {
  spreadsheetId: 'sheet-1',
  appsScriptProjectId: 'script-1',
  driveFolderId: 'folder-1',
  authentication: {
    mode: 'user_oauth',
    credentialSecret: 'GOOGLE_CREDENTIALS',
  },
};
const entry = createPendingHistory(
  createMigrationFile('20260813_000001', 'initial', []),
);

describe('Google Drive Migration History Storage', () => {
  it('管理fileをstrictに読みversion順へ正規化する', async () => {
    const later = createPendingHistory(
      createMigrationFile('20260813_000002', 'later', []),
    );
    const read = vi.fn(async ({ fileId }: { fileId: string }) =>
      fileId === 'one'
        ? serializeMigrationHistory(entry)
        : serializeMigrationHistory(later),
    );
    const storage = createStorage({
      list: vi
        .fn()
        .mockResolvedValue([
          file('two', later.version),
          file('one', entry.version),
        ]),
      read,
      create: vi.fn(),
      update: vi.fn(),
    });
    await expect(storage.get(entry.version)).resolves.toEqual(entry);
    await expect(storage.list()).resolves.toEqual([entry, later]);
  });

  it('新規はcreate、既存は同じfile IDへupdateする', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'created' });
    const gateway = {
      list: vi.fn().mockResolvedValue([]),
      read: vi.fn(),
      create,
      update: vi.fn(),
    };
    await createStorage(gateway).save(entry);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        folderId: 'folder-1',
        name: historyFileName(entry.version),
        version: entry.version,
        credential: {
          credentialSecret: 'GOOGLE_CREDENTIALS',
          scopes: ['https://www.googleapis.com/auth/drive.file'],
        },
        content: serializeMigrationHistory(entry),
      }),
    );

    gateway.list.mockResolvedValue([file('existing', entry.version)]);
    await createStorage(gateway).save(entry);
    expect(gateway.update).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'existing' }),
    );
  });

  it('重複version、folder不一致、内容version不一致を拒否する', async () => {
    const duplicate = createStorage({
      list: vi
        .fn()
        .mockResolvedValue([
          file('one', entry.version),
          file('two', entry.version),
        ]),
      read: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    });
    await expect(duplicate.get(entry.version)).rejects.toMatchObject({
      code: 'GOOGLE_MIGRATION_HISTORY_CONFLICT',
    });
    const wrongFolder = createStorage({
      list: vi
        .fn()
        .mockResolvedValue([
          { ...file('one', entry.version), parentId: 'other' },
        ]),
      read: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    });
    await expect(wrongFolder.list()).rejects.toMatchObject({
      code: 'GOOGLE_MIGRATION_HISTORY_INVALID',
    });
    const wrongContent = createStorage({
      list: vi.fn().mockResolvedValue([file('one', entry.version)]),
      read: vi
        .fn()
        .mockResolvedValue(
          serializeMigrationHistory(
            createPendingHistory(
              createMigrationFile('20260813_000002', 'other', []),
            ),
          ),
        ),
      create: vi.fn(),
      update: vi.fn(),
    });
    await expect(wrongContent.get(entry.version)).rejects.toMatchObject({
      code: 'GOOGLE_MIGRATION_HISTORY_CONFLICT',
    });
  });
});

function file(id: string, version: string) {
  return { id, version, name: historyFileName(version), parentId: 'folder-1' };
}
function createStorage(
  gateway: ConstructorParameters<typeof GoogleDriveMigrationHistoryStorage>[0],
) {
  return new GoogleDriveMigrationHistoryStorage(gateway, config, {
    get: vi.fn(),
  });
}
