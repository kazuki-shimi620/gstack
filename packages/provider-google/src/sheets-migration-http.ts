import {
  GoogleCredentialService,
  type GoogleOAuthTokenGateway,
} from './credential.js';
import type { GoogleHttpClient } from './http.js';
import type { GoogleSheetsBatchUpdateGateway } from './sheets-migration.js';

export class GoogleSheetsMigrationHttpGateway implements GoogleSheetsBatchUpdateGateway {
  public constructor(
    private readonly http: GoogleHttpClient,
    private readonly tokens: GoogleOAuthTokenGateway,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async inspectCreateModel(
    input: Parameters<GoogleSheetsBatchUpdateGateway['inspectCreateModel']>[0],
  ): Promise<unknown> {
    const credential = await this.authorize(input);
    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}`,
    );
    url.searchParams.set('includeGridData', 'false');
    url.searchParams.set(
      'fields',
      'sheets(properties(sheetId,title),developerMetadata(metadataKey,metadataValue,location(sheetId)))',
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
    if (!isRecord(value) || !Array.isArray(value.sheets)) {
      throw new TypeError('Google Sheets Migration state response is invalid.');
    }
    return {
      sheets: value.sheets.map((sheet) => {
        if (!isRecord(sheet) || !isRecord(sheet.properties)) {
          throw new TypeError(
            'Google Sheets Migration state response is invalid.',
          );
        }
        return {
          sheetId: sheet.properties.sheetId,
          title: sheet.properties.title,
          metadata: Array.isArray(sheet.developerMetadata)
            ? sheet.developerMetadata.map((metadata) => {
                if (!isRecord(metadata)) {
                  throw new TypeError(
                    'Google Sheets Migration state response is invalid.',
                  );
                }
                return {
                  key: metadata.metadataKey,
                  value: metadata.metadataValue,
                };
              })
            : [],
        };
      }),
    };
  }

  async batchUpdate(
    input: Parameters<GoogleSheetsBatchUpdateGateway['batchUpdate']>[0],
  ): Promise<unknown> {
    const credential = await this.authorize(input);
    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}:batchUpdate`,
    );
    const response = await this.http.execute({
      method: 'POST',
      url: url.href,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${credential.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        requests: input.requests,
        includeSpreadsheetInResponse: false,
        responseIncludeGridData: false,
      }),
      retryable: false,
    });
    return parseJson(response.body);
  }

  private authorize(input: {
    readonly credential: Parameters<
      GoogleSheetsBatchUpdateGateway['batchUpdate']
    >[0]['credential'];
    readonly secrets: Parameters<
      GoogleSheetsBatchUpdateGateway['batchUpdate']
    >[0]['secrets'];
  }) {
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
    throw new TypeError('Google Sheets batch response is invalid.', {
      cause: error,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
