import { describe, expect, it, vi } from 'vitest';

import { createDefaultGoogleDeployComponents } from './deploy-default.js';

describe('default Google Deploy composition', () => {
  it('content writeとdeploymentを同じ安全HTTP境界で構成する', () => {
    const components = createDefaultGoogleDeployComponents(
      {
        spreadsheetId: 'sheet-id',
        appsScriptProjectId: 'script-id',
        driveFolderId: 'folder-id',
        authentication: {
          mode: 'user_oauth',
          credentialSecret: 'GOOGLE_CREDENTIALS',
        },
      },
      { get: vi.fn() },
      { fetch: vi.fn() as unknown as typeof fetch },
    );
    expect(components.content).toBeDefined();
    expect(components.deployment).toBeDefined();
    expect(Object.isFrozen(components)).toBe(true);
  });
});
