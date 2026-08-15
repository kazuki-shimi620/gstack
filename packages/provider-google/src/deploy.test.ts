import { describe, expect, it, vi } from 'vitest';

import { GoogleDeployService, type GoogleDeployGateway } from './deploy.js';

const fingerprint = 'a'.repeat(64);
const config = {
  spreadsheetId: 'sheet-id',
  appsScriptProjectId: 'script-id',
  driveFolderId: 'folder-id',
  authentication: {
    mode: 'user_oauth' as const,
    credentialSecret: 'GOOGLE_CREDENTIALS',
  },
};
const secrets = { get: vi.fn() };

describe('Google Deploy service', () => {
  it('creates a version and managed deployment with separate scopes', async () => {
    const gateway = mockGateway({
      versions: [],
      deployments: [],
      createdVersion: version(7),
      createdDeployment: deployment(7),
    });
    await expect(
      new GoogleDeployService(gateway, config, secrets).publish(fingerprint),
    ).resolves.toEqual({
      outcome: 'created',
      versionNumber: 7,
      deploymentId: 'deployment-id',
      url: 'https://script.google.com/macros/s/id/exec',
    });
    expect(gateway.createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        description: `gstack:${fingerprint}`,
        credential: {
          credentialSecret: 'GOOGLE_CREDENTIALS',
          scopes: ['https://www.googleapis.com/auth/script.projects'],
        },
      }),
    );
    expect(gateway.createDeployment).toHaveBeenCalledWith(
      expect.objectContaining({
        versionNumber: 7,
        manifestFileName: 'appsscript',
        description: 'gstack-managed',
        credential: {
          credentialSecret: 'GOOGLE_CREDENTIALS',
          scopes: ['https://www.googleapis.com/auth/script.deployments'],
        },
      }),
    );
  });

  it('reuses a fingerprint version and updates the single managed deployment', async () => {
    const gateway = mockGateway({
      versions: [version(7)],
      deployments: [deployment(6)],
      updatedDeployment: deployment(7),
    });
    await expect(
      new GoogleDeployService(gateway, config, secrets).publish(fingerprint),
    ).resolves.toMatchObject({ outcome: 'updated', versionNumber: 7 });
    expect(gateway.createVersion).not.toHaveBeenCalled();
    expect(gateway.updateDeployment).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentId: 'deployment-id',
        versionNumber: 7,
      }),
    );
  });

  it('returns unchanged without writes when the exact release is published', async () => {
    const gateway = mockGateway({
      versions: [version(7)],
      deployments: [deployment(7)],
    });
    await expect(
      new GoogleDeployService(gateway, config, secrets).publish(fingerprint),
    ).resolves.toMatchObject({ outcome: 'unchanged', versionNumber: 7 });
    expect(gateway.createVersion).not.toHaveBeenCalled();
    expect(gateway.createDeployment).not.toHaveBeenCalled();
    expect(gateway.updateDeployment).not.toHaveBeenCalled();
  });

  it('rejects duplicate managed state and invalid fingerprints', async () => {
    await expect(
      new GoogleDeployService(mockGateway({}), config, secrets).publish('bad'),
    ).rejects.toMatchObject({ code: 'GOOGLE_DEPLOY_FINGERPRINT_INVALID' });
    await expect(
      new GoogleDeployService(
        mockGateway({ versions: [version(7), version(8)] }),
        config,
        secrets,
      ).publish(fingerprint),
    ).rejects.toMatchObject({ code: 'GOOGLE_DEPLOY_VERSION_CONFLICT' });
    await expect(
      new GoogleDeployService(
        mockGateway({
          versions: [version(7)],
          deployments: [deployment(6), deployment(5, 'other-id')],
        }),
        config,
        secrets,
      ).publish(fingerprint),
    ).rejects.toMatchObject({ code: 'GOOGLE_DEPLOYMENT_CONFLICT' });
  });
});

function mockGateway(input: {
  versions?: unknown[];
  deployments?: unknown[];
  createdVersion?: unknown;
  createdDeployment?: unknown;
  updatedDeployment?: unknown;
}): GoogleDeployGateway {
  return {
    listVersions: vi.fn().mockResolvedValue({ versions: input.versions ?? [] }),
    createVersion: vi.fn().mockResolvedValue(input.createdVersion),
    listDeployments: vi
      .fn()
      .mockResolvedValue({ deployments: input.deployments ?? [] }),
    createDeployment: vi.fn().mockResolvedValue(input.createdDeployment),
    updateDeployment: vi.fn().mockResolvedValue(input.updatedDeployment),
  };
}

function version(versionNumber: number) {
  return { versionNumber, description: `gstack:${fingerprint}` };
}

function deployment(versionNumber: number, deploymentId = 'deployment-id') {
  return {
    deploymentId,
    deploymentConfig: {
      versionNumber,
      description: 'gstack-managed',
    },
    entryPoints: [
      {
        entryPointType: 'WEB_APP',
        webApp: { url: 'https://script.google.com/macros/s/id/exec' },
      },
    ],
  };
}
