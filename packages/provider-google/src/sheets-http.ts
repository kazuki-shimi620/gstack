import {
  GoogleCredentialService,
  type GoogleOAuthTokenGateway,
} from './credential.js';
import type { GoogleSpreadsheetMetadataGateway } from './database.js';
import type { GoogleHttpClient } from './http.js';

const SPREADSHEET_FIELDS = [
  'spreadsheetId',
  'properties(title,locale,timeZone)',
  'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))',
].join(',');

export class GoogleSheetsHttpGateway implements GoogleSpreadsheetMetadataGateway {
  public constructor(
    private readonly http: GoogleHttpClient,
    private readonly tokens: GoogleOAuthTokenGateway,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getSpreadsheetMetadata(
    input: Parameters<
      GoogleSpreadsheetMetadataGateway['getSpreadsheetMetadata']
    >[0],
  ): Promise<unknown> {
    const credential = await new GoogleCredentialService(
      input.secrets,
      this.tokens,
      this.now,
    ).authorize(input.credential);
    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}`,
    );
    url.searchParams.set('includeGridData', 'false');
    url.searchParams.set('fields', SPREADSHEET_FIELDS);
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
    return normalizeGoogleResponse(parseJson(response.body));
  }
}

function normalizeGoogleResponse(value: unknown): unknown {
  if (
    !isRecord(value) ||
    !isRecord(value.properties) ||
    !Array.isArray(value.sheets)
  ) {
    throw new TypeError('Google Sheets metadata response is invalid.');
  }
  return {
    spreadsheetId: value.spreadsheetId,
    title: value.properties.title,
    locale: value.properties.locale ?? null,
    timeZone: value.properties.timeZone ?? null,
    sheets: value.sheets.map((sheet) => {
      if (!isRecord(sheet) || !isRecord(sheet.properties)) {
        throw new TypeError('Google Sheets metadata response is invalid.');
      }
      const grid = sheet.properties.gridProperties;
      if (!isRecord(grid)) {
        throw new TypeError('Google Sheets metadata response is invalid.');
      }
      return {
        sheetId: sheet.properties.sheetId,
        title: sheet.properties.title,
        rowCount: grid.rowCount,
        columnCount: grid.columnCount,
      };
    }),
  };
}

function parseJson(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch (error: unknown) {
    throw new TypeError('Google Sheets metadata response is invalid.', {
      cause: error,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
