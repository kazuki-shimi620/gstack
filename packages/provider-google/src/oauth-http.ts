import type {
  GoogleAuthorizedUserCredential,
  GoogleOAuthTokenGateway,
} from './credential.js';
import type { GoogleHttpExecutor } from './http.js';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export class GoogleOAuthHttpGateway implements GoogleOAuthTokenGateway {
  public constructor(
    private readonly http: GoogleHttpExecutor,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async refresh(input: {
    readonly credential: GoogleAuthorizedUserCredential;
    readonly scopes: readonly string[];
  }): Promise<unknown> {
    const body = new URLSearchParams({
      client_id: input.credential.clientId,
      client_secret: input.credential.clientSecret,
      refresh_token: input.credential.refreshToken,
      grant_type: 'refresh_token',
    }).toString();
    const response = await this.http.execute({
      method: 'POST',
      url: TOKEN_ENDPOINT,
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
      retryable: true,
    });
    const value = parseJson(response.body);
    if (
      !isRecord(value) ||
      typeof value.access_token !== 'string' ||
      value.access_token.length === 0 ||
      value.access_token.length > 2048 ||
      !Number.isSafeInteger(value.expires_in) ||
      (value.expires_in as number) <= 0 ||
      value.token_type !== 'Bearer' ||
      typeof value.scope !== 'string'
    ) {
      throw new TypeError('Google OAuth token response is invalid.');
    }
    const expiresAt = new Date(
      this.now().valueOf() + (value.expires_in as number) * 1000,
    ).toISOString();
    return Object.freeze({
      accessToken: value.access_token,
      expiresAt,
      scopes: Object.freeze(
        [...new Set(value.scope.split(' ').filter(Boolean))].sort(),
      ),
    });
  }
}

function parseJson(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch (error: unknown) {
    throw new TypeError('Google OAuth token response is invalid.', {
      cause: error,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
