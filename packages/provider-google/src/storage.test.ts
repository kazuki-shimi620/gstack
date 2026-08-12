import { describe, expect, it, vi } from 'vitest';

import type { GoogleProviderConfig } from './config.js';
import {
  GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  GoogleStorageReadService,
} from './storage.js';

const config: GoogleProviderConfig = {
  spreadsheetId: 'spreadsheet-id',
  appsScriptProjectId: 'script-id',
  driveFolderId: 'folder-id',
  authentication: {
    mode: 'user_oauth',
    credentialSecret: 'GOOGLE_CREDENTIALS',
  },
};

describe('Google Storage read service', () => {
  it('Drive folder metadataだけを決定的に返す', async () => {
    const secrets = { get: vi.fn() };
    const getFolderMetadata = vi.fn().mockResolvedValue({
      id: 'folder-id',
      name: 'Application Files',
      mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
      parents: ['parent-b', 'parent-a'],
      trashed: false,
      capabilities: { canAddChildren: true, canListChildren: true },
      permissions: [{ emailAddress: 'must-not-be-exposed@example.com' }],
    });
    const result = await new GoogleStorageReadService(
      { getFolderMetadata },
      config,
      secrets,
    ).getFolderMetadata();
    expect(result).toEqual({
      folderId: 'folder-id',
      name: 'Application Files',
      parentIds: ['parent-a', 'parent-b'],
      trashed: false,
      capabilities: { canAddChildren: true, canListChildren: true },
    });
    expect(result).not.toHaveProperty('permissions');
    expect(Object.isFrozen(result)).toBe(true);
    expect(getFolderMetadata).toHaveBeenCalledWith({
      folderId: 'folder-id',
      credential: {
        credentialSecret: 'GOOGLE_CREDENTIALS',
        scopes: ['https://www.googleapis.com/auth/drive.metadata.readonly'],
      },
      secrets,
    });
  });

  it.each([
    null,
    {
      id: 'other',
      name: 'Folder',
      mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
      parents: [],
      trashed: false,
      capabilities: { canAddChildren: true, canListChildren: true },
    },
    {
      id: 'folder-id',
      name: 'File',
      mimeType: 'text/plain',
      parents: [],
      trashed: false,
      capabilities: { canAddChildren: false, canListChildren: false },
    },
  ])('不正folder metadataをstable errorで拒否する', async (value) => {
    await expect(
      new GoogleStorageReadService(
        { getFolderMetadata: vi.fn().mockResolvedValue(value) },
        config,
        { get: vi.fn() },
      ).getFolderMetadata(),
    ).rejects.toMatchObject({ code: 'GOOGLE_DRIVE_METADATA_INVALID' });
  });
});
