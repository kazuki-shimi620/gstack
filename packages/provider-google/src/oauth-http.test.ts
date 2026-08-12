import { describe, expect, it, vi } from 'vitest';

import { GoogleCredentialService } from './credential.js';
import type { GoogleHttpExecutor } from './http.js';
import { GoogleOAuthHttpGateway } from './oauth-http.js';

const credential = {
  formatVersion: 1 as const,
  type: 'authorized_user' as const,
  clientId: 'client id',
  clientSecret: 'client&secret',
  refreshToken: 'refresh+token',
};

describe('Google OAuth HTTP gateway', () => {
  it('form encoded refresh requestを送りGoogle responseを正規化する', async () => {
    const execute = vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: JSON.stringify({
        access_token: 'access-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'scope-b scope-a scope-a',
        refresh_token: 'must-not-be-exposed',
      }),
    });
    const gateway = new GoogleOAuthHttpGateway(
      { execute } as unknown as GoogleHttpExecutor,
      () => new Date('2026-08-12T00:00:00.000Z'),
    );
    await expect(
      gateway.refresh({ credential, scopes: ['scope-a'] }),
    ).resolves.toEqual({
      accessToken: 'access-token',
      expiresAt: '2026-08-12T01:00:00.000Z',
      scopes: ['scope-a', 'scope-b'],
    });
    const sent = execute.mock.calls[0]?.[0];
    expect(sent).toMatchObject({
      method: 'POST',
      url: 'https://oauth2.googleapis.com/token',
      retryable: true,
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
    });
    expect(new URLSearchParams(sent.body)).toEqual(
      new URLSearchParams({
        client_id: 'client id',
        client_secret: 'client&secret',
        refresh_token: 'refresh+token',
        grant_type: 'refresh_token',
      }),
    );
  });

  it.each([
    'not-json',
    '{}',
    '{"access_token":"token","expires_in":0,"token_type":"Bearer","scope":"scope"}',
    '{"access_token":"token","expires_in":3600,"token_type":"Other","scope":"scope"}',
  ])('不正token responseを拒否する', async (body) => {
    const gateway = new GoogleOAuthHttpGateway({
      execute: vi.fn().mockResolvedValue({ status: 200, headers: {}, body }),
    } as unknown as GoogleHttpExecutor);
    await expect(
      gateway.refresh({ credential, scopes: ['scope'] }),
    ).rejects.toThrow('Google OAuth token response is invalid.');
  });

  it('Credential Serviceとの統合で要求scope不足を拒否する', async () => {
    const execute = vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: JSON.stringify({
        access_token: 'token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'other-scope',
      }),
    });
    const service = new GoogleCredentialService(
      { get: vi.fn().mockResolvedValue(JSON.stringify(credential)) },
      new GoogleOAuthHttpGateway(
        { execute } as unknown as GoogleHttpExecutor,
        () => new Date('2026-08-12T00:00:00.000Z'),
      ),
      () => new Date('2026-08-12T00:00:00.000Z'),
    );
    await expect(
      service.authorize({
        credentialSecret: 'SECRET',
        scopes: ['required-scope'],
      }),
    ).rejects.toMatchObject({ code: 'GOOGLE_ACCESS_CREDENTIAL_INVALID' });
  });
});
