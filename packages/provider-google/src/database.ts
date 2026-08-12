import type { ProviderSecretResolver } from '@gstack/provider';

import {
  googleCredentialRequest,
  type GoogleCredentialRequest,
} from './authentication.js';
import type { GoogleProviderConfig } from './config.js';

export interface GoogleSpreadsheetMetadataGateway {
  getSpreadsheetMetadata(input: {
    readonly spreadsheetId: string;
    readonly credential: GoogleCredentialRequest;
    readonly secrets: ProviderSecretResolver;
  }): Promise<unknown>;
}

export interface GoogleSpreadsheetMetadata {
  readonly spreadsheetId: string;
  readonly title: string;
  readonly locale: string | null;
  readonly timeZone: string | null;
  readonly sheets: readonly GoogleSheetMetadata[];
}

export interface GoogleSheetMetadata {
  readonly sheetId: number;
  readonly title: string;
  readonly rowCount: number;
  readonly columnCount: number;
}

export class GoogleDatabaseError extends Error {
  public constructor(
    public readonly code:
      | 'GOOGLE_SPREADSHEET_METADATA_FAILED'
      | 'GOOGLE_SPREADSHEET_METADATA_INVALID',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GoogleDatabaseError';
  }
}

export class GoogleDatabaseReadService {
  public constructor(
    private readonly gateway: GoogleSpreadsheetMetadataGateway,
    private readonly config: GoogleProviderConfig,
    private readonly secrets: ProviderSecretResolver,
  ) {}

  async getMetadata(): Promise<GoogleSpreadsheetMetadata> {
    let value: unknown;
    try {
      value = await this.gateway.getSpreadsheetMetadata({
        spreadsheetId: this.config.spreadsheetId,
        credential: googleCredentialRequest(
          this.config.authentication.credentialSecret,
          'database_read',
        ),
        secrets: this.secrets,
      });
    } catch (error: unknown) {
      throw new GoogleDatabaseError(
        'GOOGLE_SPREADSHEET_METADATA_FAILED',
        'Google Spreadsheet metadata could not be read.',
        { cause: error },
      );
    }
    return normalizeMetadata(value, this.config.spreadsheetId);
  }
}

function normalizeMetadata(
  value: unknown,
  expectedSpreadsheetId: string,
): GoogleSpreadsheetMetadata {
  if (!isRecord(value) || value.spreadsheetId !== expectedSpreadsheetId) {
    throw invalidMetadata();
  }
  if (
    typeof value.title !== 'string' ||
    value.title.length === 0 ||
    !isNullableString(value.locale) ||
    !isNullableString(value.timeZone) ||
    !Array.isArray(value.sheets)
  ) {
    throw invalidMetadata();
  }
  const sheetIds = new Set<number>();
  const sheetTitles = new Set<string>();
  const sheets = value.sheets.map((sheet) => {
    if (
      !isRecord(sheet) ||
      !Number.isSafeInteger(sheet.sheetId) ||
      (sheet.sheetId as number) < 0 ||
      typeof sheet.title !== 'string' ||
      sheet.title.length === 0 ||
      !isPositiveInteger(sheet.rowCount) ||
      !isPositiveInteger(sheet.columnCount) ||
      sheetIds.has(sheet.sheetId as number) ||
      sheetTitles.has(sheet.title)
    ) {
      throw invalidMetadata();
    }
    sheetIds.add(sheet.sheetId as number);
    sheetTitles.add(sheet.title);
    return Object.freeze({
      sheetId: sheet.sheetId as number,
      title: sheet.title,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
    });
  });
  return Object.freeze({
    spreadsheetId: expectedSpreadsheetId,
    title: value.title,
    locale: value.locale,
    timeZone: value.timeZone,
    sheets: Object.freeze(
      sheets.sort(
        (left, right) =>
          left.title.localeCompare(right.title) || left.sheetId - right.sheetId,
      ),
    ),
  });
}

function invalidMetadata(): GoogleDatabaseError {
  return new GoogleDatabaseError(
    'GOOGLE_SPREADSHEET_METADATA_INVALID',
    'Google Spreadsheet metadata response is invalid.',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
