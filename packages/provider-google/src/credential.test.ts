import { describe, expect, it, vi } from 'vitest';

import {
  GoogleCredentialService,
  parseGoogleAuthorizedUserCredential,
} from './credential.js';

const source = JSON.stringify({
  formatVersion: 1,
  type: 'authorized_user',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  refreshToken: 'refresh-token',
});

describe('Google credential service', () => {
  it('strictなauthorized user credentialを検証する', () => {
    expect(parseGoogleAuthorizedUserCredential(source)).toEqual({
      formatVersion: 1,
      type: 'authorized_user',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-token',
    });
    expect(() =>
      parseGoogleAuthorizedUserCredential(
        JSON.stringify({
          formatVersion: 1,
          type: 'authorized_user',
          clientId: 'client-id',
          clientSecret: 'client-secret',
          refreshToken: 'refresh-token',
          accessToken: 'must-not-be-stored',
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'GOOGLE_CREDENTIAL_INVALID' }));
  });

  it('Secret ResolverとToken Gatewayから短命access credentialを取得する', async () => {
    const get = vi.fn().mockResolvedValue(source);
    const refresh = vi.fn().mockResolvedValue({
      accessToken: 'access-token',
      expiresAt: '2026-08-12T01:00:00.000Z',
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'additional-scope',
      ],
      refreshToken: 'must-not-be-exposed',
    });
    const service = new GoogleCredentialService(
      { get },
      { refresh },
      () => new Date('2026-08-12T00:00:00.000Z'),
    );

    const result = await service.authorize({
      credentialSecret: 'GOOGLE_CREDENTIALS',
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    expect(result).toEqual({
      accessToken: 'access-token',
      expiresAt: '2026-08-12T01:00:00.000Z',
      scopes: [
        'additional-scope',
        'https://www.googleapis.com/auth/spreadsheets.readonly',
      ],
    });
    expect(result).not.toHaveProperty('refreshToken');
    expect(get).toHaveBeenCalledWith('GOOGLE_CREDENTIALS');
    expect(refresh).toHaveBeenCalledWith({
      credential: expect.objectContaining({ refreshToken: 'refresh-token' }),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  });

  it.each([
    {
      value: null,
      code: 'GOOGLE_CREDENTIAL_NOT_FOUND',
    },
    {
      value: '{invalid',
      code: 'GOOGLE_CREDENTIAL_INVALID',
    },
  ])('credential解決失敗をsafe errorにする', async ({ value, code }) => {
    const service = new GoogleCredentialService(
      { get: vi.fn().mockResolvedValue(value) },
      { refresh: vi.fn() },
    );
    await expect(
      service.authorize({ credentialSecret: 'SECRET_NAME', scopes: [] }),
    ).rejects.toMatchObject({ code });
  });

  it('Gateway失敗、期限切れ、scope不足を拒否する', async () => {
    const request = {
      credentialSecret: 'SECRET_NAME',
      scopes: ['required-scope'],
    };
    await expect(
      new GoogleCredentialService(
        { get: vi.fn().mockResolvedValue(source) },
        {
          refresh: vi.fn().mockRejectedValue(new Error('refresh_token=secret')),
        },
      ).authorize(request),
    ).rejects.toMatchObject({
      code: 'GOOGLE_CREDENTIAL_REFRESH_FAILED',
      message: 'Google OAuth credential could not be refreshed.',
    });

    for (const value of [
      {
        accessToken: 'access-token',
        expiresAt: '2026-08-11T23:59:00.000Z',
        scopes: ['required-scope'],
      },
      {
        accessToken: 'access-token',
        expiresAt: '2026-08-12T01:00:00.000Z',
        scopes: ['different-scope'],
      },
    ]) {
      await expect(
        new GoogleCredentialService(
          { get: vi.fn().mockResolvedValue(source) },
          { refresh: vi.fn().mockResolvedValue(value) },
          () => new Date('2026-08-12T00:00:00.000Z'),
        ).authorize(request),
      ).rejects.toMatchObject({ code: 'GOOGLE_ACCESS_CREDENTIAL_INVALID' });
    }
  });
});
