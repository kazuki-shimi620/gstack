import { describe, expect, it, vi } from 'vitest';

import { GoogleDeployHttpGateway } from './deploy-http.js';

const credential = {
  credentialSecret: 'GOOGLE_CREDENTIALS',
  scopes: ['scope'],
};
const secrets = {
  get: vi.fn().mockResolvedValue(
    JSON.stringify({
      formatVersion: 1,
      type: 'authorized_user',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-token',
    }),
  ),
};
const tokens = {
  refresh: vi.fn().mockResolvedValue({
    accessToken: 'access-token',
    expiresAt: '2099-01-01T00:00:00.000Z',
    scopes: ['scope'],
  }),
};

describe('Google Deploy HTTP gateway', () => {
  it('follows version pagination with retryable GET requests', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        body: '{"versions":[{"versionNumber":1}],"nextPageToken":"next"}',
      })
      .mockResolvedValueOnce({ body: '{"versions":[{"versionNumber":2}]}' });
    const result = await new GoogleDeployHttpGateway(
      { execute },
      tokens,
    ).listVersions({
      scriptId: 'script/id',
      credential,
      secrets,
    });
    expect(result).toEqual({
      versions: [{ versionNumber: 1 }, { versionNumber: 2 }],
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(
      execute.mock.calls.map(([request]) => ({
        method: request.method,
        retryable: request.retryable,
        pageToken: new URL(request.url).searchParams.get('pageToken'),
      })),
    ).toEqual([
      { method: 'GET', retryable: true, pageToken: null },
      { method: 'GET', retryable: true, pageToken: 'next' },
    ]);
  });

  it('creates a version with a non-retryable POST', async () => {
    const execute = vi.fn().mockResolvedValue({ body: '{"versionNumber":3}' });
    await new GoogleDeployHttpGateway({ execute }, tokens).createVersion({
      scriptId: 'script/id',
      credential,
      secrets,
      description: 'gstack:fingerprint',
    });
    expect(execute).toHaveBeenCalledWith({
      method: 'POST',
      url: 'https://script.googleapis.com/v1/projects/script%2Fid/versions',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer access-token',
        'content-type': 'application/json',
      },
      body: '{"description":"gstack:fingerprint"}',
      retryable: false,
    });
  });

  it('updates deployment with the required nested config and non-retryable PUT', async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ body: '{"deploymentId":"id"}' });
    await new GoogleDeployHttpGateway({ execute }, tokens).updateDeployment({
      scriptId: 'script/id',
      credential,
      secrets,
      deploymentId: 'deploy/id',
      versionNumber: 4,
      manifestFileName: 'appsscript',
      description: 'gstack-managed',
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        url: 'https://script.googleapis.com/v1/projects/script%2Fid/deployments/deploy%2Fid',
        body: JSON.stringify({
          deploymentConfig: {
            scriptId: 'script/id',
            versionNumber: 4,
            manifestFileName: 'appsscript',
            description: 'gstack-managed',
          },
        }),
        retryable: false,
      }),
    );
  });

  it('rejects repeated pagination tokens', async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ body: '{"deployments":[],"nextPageToken":"same"}' });
    await expect(
      new GoogleDeployHttpGateway({ execute }, tokens).listDeployments({
        scriptId: 'script-id',
        credential,
        secrets,
      }),
    ).rejects.toThrow('list response is invalid');
  });
});
