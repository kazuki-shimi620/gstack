import type { ProviderSecretResolver } from '@gstack/provider';
import { describe, expect, it, vi } from 'vitest';

import {
  GSTACK_SCRIPT_MARKER_FILE,
  GSTACK_SCRIPT_MARKER_SOURCE,
  GoogleScriptWriteService,
  type GoogleScriptContentGateway,
  type GoogleScriptFile,
} from './script.js';

const config = {
  spreadsheetId: 'sheet-id',
  appsScriptProjectId: 'script-id',
  driveFolderId: 'folder-id',
  authentication: {
    mode: 'user_oauth' as const,
    credentialSecret: 'GOOGLE_CREDENTIALS',
  },
};

const files: readonly GoogleScriptFile[] = Object.freeze([
  Object.freeze({
    name: 'appsscript',
    type: 'JSON' as const,
    source: '{"timeZone":"Asia/Tokyo"}',
  }),
  Object.freeze({
    name: GSTACK_SCRIPT_MARKER_FILE,
    type: 'SERVER_JS' as const,
    source: GSTACK_SCRIPT_MARKER_SOURCE,
  }),
  Object.freeze({
    name: 'main',
    type: 'SERVER_JS' as const,
    source: 'function doGet() {}',
  }),
]);

const secrets: ProviderSecretResolver = {
  get: vi.fn(),
};

describe('Google Apps Script managed content write', () => {
  it('reads ownership before replacing all content with write scope', async () => {
    const gateway: GoogleScriptContentGateway = {
      getProjectContent: vi.fn().mockResolvedValue({ files }),
      updateProjectContent: vi.fn().mockResolvedValue({ files }),
    };
    const result = await new GoogleScriptWriteService(
      gateway,
      config,
      secrets,
    ).replaceManagedContent(files);

    expect(result).toEqual(files);
    expect(gateway.getProjectContent).toHaveBeenCalledWith({
      scriptId: 'script-id',
      credential: {
        credentialSecret: 'GOOGLE_CREDENTIALS',
        scopes: ['https://www.googleapis.com/auth/script.projects.readonly'],
      },
      secrets,
    });
    expect(gateway.updateProjectContent).toHaveBeenCalledWith({
      scriptId: 'script-id',
      files,
      credential: {
        credentialSecret: 'GOOGLE_CREDENTIALS',
        scopes: ['https://www.googleapis.com/auth/script.projects'],
      },
      secrets,
    });
  });

  it('refuses an unmanaged existing project before write', async () => {
    const gateway: GoogleScriptContentGateway = {
      getProjectContent: vi.fn().mockResolvedValue({
        files: [{ name: 'appsscript', type: 'JSON', source: '{}' }],
      }),
      updateProjectContent: vi.fn(),
    };
    await expect(
      new GoogleScriptWriteService(
        gateway,
        config,
        secrets,
      ).replaceManagedContent(files),
    ).rejects.toMatchObject({
      code: 'GOOGLE_SCRIPT_PROJECT_UNMANAGED',
    });
    expect(gateway.updateProjectContent).not.toHaveBeenCalled();
  });

  it('rejects invalid desired content before reading the project', async () => {
    const gateway: GoogleScriptContentGateway = {
      getProjectContent: vi.fn(),
      updateProjectContent: vi.fn(),
    };
    await expect(
      new GoogleScriptWriteService(
        gateway,
        config,
        secrets,
      ).replaceManagedContent([
        { name: 'appsscript', type: 'JSON', source: '{}' },
      ]),
    ).rejects.toMatchObject({
      code: 'GOOGLE_SCRIPT_CONTENT_INVALID',
    });
    expect(gateway.getProjectContent).not.toHaveBeenCalled();
  });

  it('rejects a response that differs from the requested complete file set', async () => {
    const gateway: GoogleScriptContentGateway = {
      getProjectContent: vi.fn().mockResolvedValue({ files }),
      updateProjectContent: vi
        .fn()
        .mockResolvedValue({ files: files.slice(0, 2) }),
    };
    await expect(
      new GoogleScriptWriteService(
        gateway,
        config,
        secrets,
      ).replaceManagedContent(files),
    ).rejects.toMatchObject({
      code: 'GOOGLE_SCRIPT_CONTENT_INVALID',
    });
  });
});
