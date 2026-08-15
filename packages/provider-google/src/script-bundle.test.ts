import { describe, expect, it } from 'vitest';

import { createGoogleScriptSourceBundle } from './script-bundle.js';

const config = {
  spreadsheetId: 'sheet"id',
  appsScriptProjectId: 'script-id',
  driveFolderId: 'folder-id',
  authentication: {
    mode: 'user_oauth' as const,
    credentialSecret: 'GOOGLE_CREDENTIALS',
  },
};

describe('Apps Script source bundle', () => {
  it('maps only explicit backend artifacts and injects non-secret runtime config', () => {
    const files = createGoogleScriptSourceBundle(
      [
        {
          path: 'generated/backend/appsscript/main.gs',
          content: 'function doGet() {}\n',
        },
        {
          path: 'generated/backend/appsscript/appsscript.json',
          content: '{"runtimeVersion":"V8"}\n',
        },
      ],
      config,
    );
    expect(files.map(({ name, type }) => ({ name, type }))).toEqual([
      { name: 'appsscript', type: 'JSON' },
      { name: 'gstack_config', type: 'SERVER_JS' },
      { name: 'gstack_managed', type: 'SERVER_JS' },
      { name: 'main', type: 'SERVER_JS' },
    ]);
    expect(files.find(({ name }) => name === 'gstack_config')?.source).toBe(
      'const GSTACK_SPREADSHEET_ID = "sheet\\"id";\n',
    );
    expect(JSON.stringify(files)).not.toContain('GOOGLE_CREDENTIALS');
  });

  it.each([
    { artifacts: [] },
    {
      artifacts: [
        { path: 'generated/backend/appsscript/appsscript.json', content: '{}' },
      ],
    },
    {
      artifacts: [
        { path: 'generated/backend/appsscript/main.gs', content: 'x' },
        { path: 'generated/types/main.ts', content: 'manual' },
      ],
    },
    {
      artifacts: [
        { path: 'generated/backend/appsscript/appsscript.json', content: '{}' },
        { path: 'generated/backend/appsscript/nested/main.gs', content: 'x' },
      ],
    },
    {
      artifacts: [
        { path: 'generated/backend/appsscript/appsscript.json', content: '{}' },
        { path: 'generated/backend/appsscript/gstack_config.gs', content: 'x' },
      ],
    },
  ])('rejects an incomplete or ambiguous artifact set', ({ artifacts }) => {
    expect(() => createGoogleScriptSourceBundle(artifacts, config)).toThrow(
      expect.objectContaining({ code: 'GOOGLE_SCRIPT_CONTENT_INVALID' }),
    );
  });
});
