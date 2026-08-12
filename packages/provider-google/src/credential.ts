import type { ProviderSecretResolver } from '@gstack/provider';

import type { GoogleCredentialRequest } from './authentication.js';

export interface GoogleAuthorizedUserCredential {
  readonly formatVersion: 1;
  readonly type: 'authorized_user';
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
}

export interface GoogleAccessCredential {
  readonly accessToken: string;
  readonly expiresAt: string;
  readonly scopes: readonly string[];
}

export interface GoogleOAuthTokenGateway {
  refresh(input: {
    readonly credential: GoogleAuthorizedUserCredential;
    readonly scopes: readonly string[];
  }): Promise<unknown>;
}

export type GoogleCredentialErrorCode =
  | 'GOOGLE_CREDENTIAL_NOT_FOUND'
  | 'GOOGLE_CREDENTIAL_INVALID'
  | 'GOOGLE_CREDENTIAL_REFRESH_FAILED'
  | 'GOOGLE_ACCESS_CREDENTIAL_INVALID';

export class GoogleCredentialError extends Error {
  public constructor(
    public readonly code: GoogleCredentialErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GoogleCredentialError';
  }
}

export class GoogleCredentialService {
  public constructor(
    private readonly secrets: ProviderSecretResolver,
    private readonly gateway: GoogleOAuthTokenGateway,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async authorize(
    request: GoogleCredentialRequest,
  ): Promise<GoogleAccessCredential> {
    let source: string | null;
    try {
      source = await this.secrets.get(request.credentialSecret);
    } catch (error: unknown) {
      throw new GoogleCredentialError(
        'GOOGLE_CREDENTIAL_NOT_FOUND',
        'Google OAuth credential could not be resolved.',
        { cause: error },
      );
    }
    if (source === null) {
      throw new GoogleCredentialError(
        'GOOGLE_CREDENTIAL_NOT_FOUND',
        'Google OAuth credential could not be resolved.',
      );
    }

    const credential = parseCredential(source);
    let refreshed: unknown;
    try {
      refreshed = await this.gateway.refresh({
        credential,
        scopes: request.scopes,
      });
    } catch (error: unknown) {
      throw new GoogleCredentialError(
        'GOOGLE_CREDENTIAL_REFRESH_FAILED',
        'Google OAuth credential could not be refreshed.',
        { cause: error },
      );
    }
    return normalizeAccessCredential(refreshed, request.scopes, this.now());
  }
}

export function parseGoogleAuthorizedUserCredential(
  source: string,
): GoogleAuthorizedUserCredential {
  return parseCredential(source);
}

function parseCredential(source: string): GoogleAuthorizedUserCredential {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error: unknown) {
    throw invalidCredential(error);
  }
  if (!isRecord(value)) throw invalidCredential();
  const keys = Object.keys(value).sort();
  if (
    keys.join(',') !==
      ['clientId', 'clientSecret', 'formatVersion', 'refreshToken', 'type']
        .sort()
        .join(',') ||
    value.formatVersion !== 1 ||
    value.type !== 'authorized_user' ||
    !isNonEmptyString(value.clientId) ||
    !isNonEmptyString(value.clientSecret) ||
    !isNonEmptyString(value.refreshToken)
  ) {
    throw invalidCredential();
  }
  return Object.freeze({
    formatVersion: 1,
    type: 'authorized_user',
    clientId: value.clientId,
    clientSecret: value.clientSecret,
    refreshToken: value.refreshToken,
  });
}

function normalizeAccessCredential(
  value: unknown,
  requestedScopes: readonly string[],
  now: Date,
): GoogleAccessCredential {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.accessToken) ||
    !isNonEmptyString(value.expiresAt) ||
    !Array.isArray(value.scopes) ||
    !value.scopes.every(isNonEmptyString)
  ) {
    throw invalidAccessCredential();
  }
  const scopes = value.scopes as string[];
  const expiresAt = new Date(value.expiresAt);
  if (
    Number.isNaN(expiresAt.valueOf()) ||
    expiresAt.valueOf() <= now.valueOf() ||
    !requestedScopes.every((scope) => scopes.includes(scope))
  ) {
    throw invalidAccessCredential();
  }
  return Object.freeze({
    accessToken: value.accessToken,
    expiresAt: expiresAt.toISOString(),
    scopes: Object.freeze([...new Set(scopes)].sort()),
  });
}

function invalidCredential(cause?: unknown): GoogleCredentialError {
  return new GoogleCredentialError(
    'GOOGLE_CREDENTIAL_INVALID',
    'Google OAuth credential is invalid.',
    cause === undefined ? undefined : { cause },
  );
}

function invalidAccessCredential(): GoogleCredentialError {
  return new GoogleCredentialError(
    'GOOGLE_ACCESS_CREDENTIAL_INVALID',
    'Google OAuth access credential is invalid.',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
