import {
  GoogleCredentialService,
  type GoogleOAuthTokenGateway,
} from './credential.js';
import { GoogleHttpError, type GoogleHttpClient } from './http.js';
import type { GoogleMigrationLockGateway } from './migration-lock.js';

export class GoogleMigrationLockHttpGateway implements GoogleMigrationLockGateway {
  public constructor(
    private readonly http: GoogleHttpClient,
    private readonly tokens: GoogleOAuthTokenGateway,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async inspect(
    input: Parameters<GoogleMigrationLockGateway['inspect']>[0],
  ): Promise<unknown> {
    const credential = await this.authorize(input);
    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}`,
    );
    url.searchParams.set('includeGridData', 'false');
    url.searchParams.set(
      'fields',
      'sheets(properties(sheetId)),namedRanges(namedRangeId)',
    );
    const response = await this.http.execute({
      method: 'GET',
      url: url.href,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${credential.accessToken}`,
      },
      body: null,
      retryable: true,
    });
    const value = parseJson(response.body);
    if (!isRecord(value) || !Array.isArray(value.sheets)) invalid();
    return {
      sheetIds: value.sheets.map((sheet) => {
        if (!isRecord(sheet) || !isRecord(sheet.properties)) invalid();
        return sheet.properties.sheetId;
      }),
      lockIds: Array.isArray(value.namedRanges)
        ? value.namedRanges.map((range) => {
            if (!isRecord(range)) invalid();
            return range.namedRangeId;
          })
        : [],
    };
  }

  async add(
    input: Parameters<GoogleMigrationLockGateway['add']>[0],
  ): Promise<'acquired' | 'conflict'> {
    try {
      await this.batch(input, {
        addNamedRange: {
          namedRange: {
            namedRangeId: input.lockId,
            name: input.lockId,
            range: {
              sheetId: input.sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 1,
            },
          },
        },
      });
      return 'acquired';
    } catch (error: unknown) {
      if (
        error instanceof GoogleHttpError &&
        error.code === 'GOOGLE_HTTP_FAILED' &&
        error.status === 400
      )
        return 'conflict';
      throw error;
    }
  }

  async remove(
    input: Parameters<GoogleMigrationLockGateway['remove']>[0],
  ): Promise<void> {
    await this.batch(input, {
      deleteNamedRange: { namedRangeId: input.lockId },
    });
  }

  private async batch(
    input: Parameters<GoogleMigrationLockGateway['remove']>[0],
    request: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const credential = await this.authorize(input);
    await this.http.execute({
      method: 'POST',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}:batchUpdate`,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${credential.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        requests: [request],
        includeSpreadsheetInResponse: false,
        responseIncludeGridData: false,
      }),
      retryable: false,
    });
  }

  private authorize(
    input: Parameters<GoogleMigrationLockGateway['inspect']>[0],
  ) {
    return new GoogleCredentialService(
      input.secrets,
      this.tokens,
      this.now,
    ).authorize(input.credential);
  }
}

function parseJson(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch (error: unknown) {
    throw new TypeError('Google Migration lock response is invalid.', {
      cause: error,
    });
  }
}
function invalid(): never {
  throw new TypeError('Google Migration lock response is invalid.');
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
