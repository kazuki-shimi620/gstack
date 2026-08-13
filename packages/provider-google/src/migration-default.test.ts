import { describe, expect, it, vi } from 'vitest';

import type { GoogleProviderConfig } from './config.js';
import { createDefaultGoogleMigrationComponents } from './migration-default.js';

const config: GoogleProviderConfig = {
  spreadsheetId: 'sheet-1',
  appsScriptProjectId: 'script-1',
  driveFolderId: 'folder-1',
  authentication: {
    mode: 'user_oauth',
    credentialSecret: 'GOOGLE_CREDENTIALS',
  },
};

describe('default Google Migration composition', () => {
  it('History、Lock、Executorを同じ安全HTTP境界で構成する', () => {
    const components = createDefaultGoogleMigrationComponents(
      config,
      { get: vi.fn() },
      {
        fetch: vi.fn() as unknown as typeof fetch,
        now: () => new Date('2026-08-13T00:00:00Z'),
      },
    );
    expect(components.history).toBeDefined();
    expect(components.lock).toBeDefined();
    expect(components.executor).toBeDefined();
    expect(Object.isFrozen(components)).toBe(true);
  });
});
