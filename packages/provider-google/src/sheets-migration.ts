import type { CreateModelOperation } from '@gstack/migration';
import type { ProviderSecretResolver } from '@gstack/provider';

import {
  googleCredentialRequest,
  type GoogleCredentialRequest,
} from './authentication.js';
import type { GoogleProviderConfig } from './config.js';

export const GSTACK_MODEL_METADATA_KEY = 'gstack_model';

export interface GoogleSheetsBatchUpdateGateway {
  inspectCreateModel(input: {
    readonly spreadsheetId: string;
    readonly credential: GoogleCredentialRequest;
    readonly secrets: ProviderSecretResolver;
  }): Promise<unknown>;
  batchUpdate(input: {
    readonly spreadsheetId: string;
    readonly credential: GoogleCredentialRequest;
    readonly secrets: ProviderSecretResolver;
    readonly requests: readonly Readonly<Record<string, unknown>>[];
  }): Promise<unknown>;
}

export class GoogleSheetsMigrationError extends Error {
  public constructor(
    public readonly code:
      | 'GOOGLE_MIGRATION_OPERATION_INVALID'
      | 'GOOGLE_SHEETS_MIGRATION_CONFLICT'
      | 'GOOGLE_SHEETS_MIGRATION_STATE_INVALID'
      | 'GOOGLE_SHEETS_WRITE_FAILED'
      | 'GOOGLE_SHEETS_WRITE_RESPONSE_INVALID',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GoogleSheetsMigrationError';
  }
}

export class GoogleSheetsCreateModelService {
  public constructor(
    private readonly gateway: GoogleSheetsBatchUpdateGateway,
    private readonly config: GoogleProviderConfig,
    private readonly secrets: ProviderSecretResolver,
  ) {}

  async execute(
    operation: CreateModelOperation,
    migrationChecksum: string,
  ): Promise<void> {
    const requests = createModelBatchRequests(operation, migrationChecksum);
    const credential = googleCredentialRequest(
      this.config.authentication.credentialSecret,
      'database_write',
    );
    let state: unknown;
    try {
      state = await this.gateway.inspectCreateModel({
        spreadsheetId: this.config.spreadsheetId,
        credential,
        secrets: this.secrets,
      });
    } catch (error: unknown) {
      throw new GoogleSheetsMigrationError(
        'GOOGLE_SHEETS_WRITE_FAILED',
        'Google Sheets Migration state could not be read.',
        { cause: error },
      );
    }
    if (
      inspectCreateModelState(state, operation, migrationChecksum) === 'applied'
    ) {
      return;
    }
    let response: unknown;
    try {
      response = await this.gateway.batchUpdate({
        spreadsheetId: this.config.spreadsheetId,
        credential,
        secrets: this.secrets,
        requests,
      });
    } catch (error: unknown) {
      throw new GoogleSheetsMigrationError(
        'GOOGLE_SHEETS_WRITE_FAILED',
        'Google Sheets Migration Operation failed.',
        { cause: error },
      );
    }
    if (
      !isRecord(response) ||
      response.spreadsheetId !== this.config.spreadsheetId
    ) {
      throw new GoogleSheetsMigrationError(
        'GOOGLE_SHEETS_WRITE_RESPONSE_INVALID',
        'Google Sheets Migration response is invalid.',
      );
    }
  }
}

export function inspectCreateModelState(
  value: unknown,
  operation: CreateModelOperation,
  migrationChecksum: string,
): 'absent' | 'applied' {
  if (!isRecord(value) || !Array.isArray(value.sheets)) invalidState();
  const expectedId = stableSheetId(operation.model);
  const expectedMarker = `${migrationChecksum}:${operation.id}`;
  let matchingSheet = false;
  let matchingMarker = false;
  for (const sheet of value.sheets) {
    if (
      !isRecord(sheet) ||
      !Number.isSafeInteger(sheet.sheetId) ||
      typeof sheet.title !== 'string' ||
      !Array.isArray(sheet.metadata)
    ) {
      invalidState();
    }
    const sameId = sheet.sheetId === expectedId;
    const sameTitle = sheet.title === operation.model;
    if (sameId || sameTitle) {
      if (!(sameId && sameTitle)) conflict();
      matchingSheet = true;
    }
    for (const metadata of sheet.metadata) {
      if (
        !isRecord(metadata) ||
        typeof metadata.key !== 'string' ||
        typeof metadata.value !== 'string'
      ) {
        invalidState();
      }
      if (metadata.key === GSTACK_MODEL_METADATA_KEY) {
        if (
          metadata.value !== expectedMarker ||
          !(sameId && sameTitle) ||
          matchingMarker
        ) {
          conflict();
        }
        matchingMarker = true;
      }
    }
  }
  if (matchingSheet !== matchingMarker) conflict();
  return matchingSheet ? 'applied' : 'absent';
}

export function createModelBatchRequests(
  operation: CreateModelOperation,
  migrationChecksum: string,
): readonly Readonly<Record<string, unknown>>[] {
  if (!/^[a-f0-9]{64}$/u.test(migrationChecksum)) {
    throw new GoogleSheetsMigrationError(
      'GOOGLE_MIGRATION_OPERATION_INVALID',
      'Migration checksum is invalid.',
    );
  }
  const sheetId = stableSheetId(operation.model);
  const headers = operation.definition.fields.map(({ name }) =>
    Object.freeze({ userEnteredValue: Object.freeze({ stringValue: name }) }),
  );
  const requests: Readonly<Record<string, unknown>>[] = [
    Object.freeze({
      addSheet: Object.freeze({
        properties: Object.freeze({
          sheetId,
          title: operation.model,
          gridProperties: Object.freeze({
            rowCount: 1000,
            columnCount: Math.max(headers.length, 1),
          }),
        }),
      }),
    }),
  ];
  if (headers.length > 0) {
    requests.push(
      Object.freeze({
        updateCells: Object.freeze({
          start: Object.freeze({ sheetId, rowIndex: 0, columnIndex: 0 }),
          rows: Object.freeze([
            Object.freeze({ values: Object.freeze(headers) }),
          ]),
          fields: 'userEnteredValue',
        }),
      }),
    );
  }
  requests.push(
    Object.freeze({
      createDeveloperMetadata: Object.freeze({
        developerMetadata: Object.freeze({
          metadataKey: GSTACK_MODEL_METADATA_KEY,
          metadataValue: `${migrationChecksum}:${operation.id}`,
          location: Object.freeze({ sheetId }),
          visibility: 'DOCUMENT',
        }),
      }),
    }),
  );
  return Object.freeze(requests);
}

export function stableSheetId(modelName: string): number {
  let hash = 2_166_136_261;
  for (const byte of new TextEncoder().encode(modelName)) {
    hash ^= byte;
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash & 0x7fff_ffff || 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalidState(): never {
  throw new GoogleSheetsMigrationError(
    'GOOGLE_SHEETS_MIGRATION_STATE_INVALID',
    'Google Sheets Migration state is invalid.',
  );
}

function conflict(): never {
  throw new GoogleSheetsMigrationError(
    'GOOGLE_SHEETS_MIGRATION_CONFLICT',
    'Google Sheets Migration state conflicts with the requested Operation.',
  );
}
