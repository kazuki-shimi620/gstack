import type { Index } from '@gstack/application';
import type { AddIndexOperation, DropIndexOperation } from '@gstack/migration';
import type { ProviderSecretResolver } from '@gstack/provider';

import {
  googleCredentialRequest,
  type GoogleCredentialRequest,
} from './authentication.js';
import type { GoogleProviderConfig } from './config.js';
import {
  GSTACK_MODEL_METADATA_KEY,
  GSTACK_OPERATION_METADATA_KEY,
  GoogleSheetsMigrationError,
  stableSheetId,
} from './sheets-migration.js';

export type GoogleSheetsIndexOperation = AddIndexOperation | DropIndexOperation;

export interface GoogleSheetsIndexGateway {
  inspectIndex(input: {
    readonly spreadsheetId: string;
    readonly sheetTitle: string;
    readonly columns: readonly string[];
    readonly includeValues: boolean;
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

export interface IndexAbsentState {
  readonly status: 'absent';
  readonly sheetId: number;
}

export interface IndexAppliedState {
  readonly status: 'applied';
}

export type IndexMigrationState = IndexAbsentState | IndexAppliedState;

export class GoogleSheetsIndexService {
  public constructor(
    private readonly gateway: GoogleSheetsIndexGateway,
    private readonly config: GoogleProviderConfig,
    private readonly secrets: ProviderSecretResolver,
  ) {}

  async execute(
    operation: GoogleSheetsIndexOperation,
    migrationChecksum: string,
  ): Promise<void> {
    validateChecksum(migrationChecksum);
    validateIndexOperation(operation);
    const definition = indexDefinition(operation);
    const credential = googleCredentialRequest(
      this.config.authentication.credentialSecret,
      'database_write',
    );
    const first = await this.inspect(
      operation,
      migrationChecksum,
      definition,
      credential,
    );
    if (first.status === 'applied') return;
    const current = await this.inspect(
      operation,
      migrationChecksum,
      definition,
      credential,
    );
    if (current.status === 'applied') return;
    if (current.sheetId !== first.sheetId) conflict();
    let response: unknown;
    try {
      response = await this.gateway.batchUpdate({
        spreadsheetId: this.config.spreadsheetId,
        credential,
        secrets: this.secrets,
        requests: indexBatchRequests(operation, migrationChecksum, current),
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
        'Google Sheets Migration write response is invalid.',
      );
    }
  }

  private async inspect(
    operation: GoogleSheetsIndexOperation,
    migrationChecksum: string,
    definition: Index,
    credential: GoogleCredentialRequest,
  ): Promise<IndexMigrationState> {
    let value: unknown;
    try {
      value = await this.gateway.inspectIndex({
        spreadsheetId: this.config.spreadsheetId,
        sheetTitle: operation.model,
        columns: definition.columns,
        includeValues: operation.type === 'add_index' && definition.unique,
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
    return inspectIndexState(value, operation, migrationChecksum);
  }
}

export function inspectIndexState(
  value: unknown,
  operation: GoogleSheetsIndexOperation,
  migrationChecksum: string,
): IndexMigrationState {
  validateChecksum(migrationChecksum);
  validateIndexOperation(operation);
  if (!isRecord(value) || !Array.isArray(value.sheets)) invalidState();
  const expectedSheetId = stableSheetId(operation.model);
  const sheet = findTargetSheet(value.sheets, operation.model, expectedSheetId);
  if (!Array.isArray(sheet.rows)) invalidState();
  const headers = sheet.headers as unknown[];
  if (
    headers.some((header) => typeof header !== 'string' || !header.trim()) ||
    new Set(headers).size !== headers.length
  ) {
    conflict();
  }
  const definition = indexDefinition(operation);
  if (definition.columns.some((column) => !headers.includes(column)))
    conflict();
  const metadata = sheet.metadata as unknown[];
  for (const item of metadata) validateMetadata(item);
  validateModelMarker(metadata, expectedSheetId, operation.model);
  validateIndexRowsShape(sheet.rows, definition.columns.length);

  const expectedMarker = `${migrationChecksum}:${operation.id}`;
  const markers = metadata.filter(
    (item) =>
      isRecord(item) &&
      item.key === GSTACK_OPERATION_METADATA_KEY &&
      item.value === expectedMarker,
  );
  if (markers.length > 1) conflict();
  if (markers.length === 1) {
    const marker = markers[0] as Record<string, unknown>;
    if (
      !isRecord(marker.location) ||
      marker.location.sheetId !== expectedSheetId ||
      Object.keys(marker.location).some((key) => key !== 'sheetId')
    ) {
      conflict();
    }
    return Object.freeze({ status: 'applied' });
  }
  if (operation.type === 'add_index' && definition.unique) {
    validateUniqueIndexRows(sheet.rows, definition.columns.length);
  }
  return Object.freeze({ status: 'absent', sheetId: expectedSheetId });
}

export function validateUniqueIndexRows(
  rows: readonly unknown[],
  columnCount: number,
): void {
  validateIndexRowsShape(rows, columnCount);
  const seen = new Set<string>();
  for (const row of rows) {
    const record = row as {
      readonly rowNumber: number;
      readonly values: unknown[];
    };
    if (record.values.some(isEmpty)) continue;
    const key = JSON.stringify(
      record.values.map((value) => [typeof value, value]),
    );
    if (seen.has(key)) incompatible(record.rowNumber);
    seen.add(key);
  }
}

export function indexBatchRequests(
  operation: GoogleSheetsIndexOperation,
  migrationChecksum: string,
  state: IndexAbsentState,
): readonly Readonly<Record<string, unknown>>[] {
  validateChecksum(migrationChecksum);
  validateIndexOperation(operation);
  if (
    state.status !== 'absent' ||
    state.sheetId !== stableSheetId(operation.model)
  ) {
    invalidOperation();
  }
  return Object.freeze([
    Object.freeze({
      createDeveloperMetadata: Object.freeze({
        developerMetadata: Object.freeze({
          metadataKey: GSTACK_OPERATION_METADATA_KEY,
          metadataValue: `${migrationChecksum}:${operation.id}`,
          location: Object.freeze({ sheetId: state.sheetId }),
          visibility: 'DOCUMENT',
        }),
      }),
    }),
  ]);
}

function validateIndexOperation(operation: GoogleSheetsIndexOperation): void {
  const definition = indexDefinition(operation);
  if (
    !validIndex(definition) ||
    operation.id !==
      `${operation.type}:${operation.model}:${definition.name}` ||
    !operation.model.trim() ||
    operation.risk !== 'safe' ||
    operation.destructive ||
    !operation.reversible
  ) {
    invalidOperation();
  }
}

function indexDefinition(operation: GoogleSheetsIndexOperation): Index {
  return operation.type === 'add_index' ? operation.index : operation.previous;
}

function validIndex(value: unknown): value is Index {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    Array.isArray(value.columns) &&
    value.columns.length > 0 &&
    value.columns.every(
      (column) => typeof column === 'string' && column.trim().length > 0,
    ) &&
    new Set(value.columns).size === value.columns.length &&
    typeof value.unique === 'boolean'
  );
}

function findTargetSheet(
  sheets: readonly unknown[],
  model: string,
  expectedSheetId: number,
): Record<string, unknown> {
  let target: Record<string, unknown> | null = null;
  const ids = new Set<number>();
  const titles = new Set<string>();
  for (const sheet of sheets) {
    if (
      !isRecord(sheet) ||
      !Number.isSafeInteger(sheet.sheetId) ||
      typeof sheet.title !== 'string' ||
      !Array.isArray(sheet.headers) ||
      !Array.isArray(sheet.metadata)
    ) {
      invalidState();
    }
    if (ids.has(sheet.sheetId as number) || titles.has(sheet.title)) conflict();
    ids.add(sheet.sheetId as number);
    titles.add(sheet.title);
    if (sheet.sheetId === expectedSheetId || sheet.title === model) {
      if (
        target ||
        sheet.sheetId !== expectedSheetId ||
        sheet.title !== model
      ) {
        conflict();
      }
      target = sheet;
    }
  }
  if (!target) conflict();
  return target;
}

function validateIndexRowsShape(
  rows: readonly unknown[],
  columnCount: number,
): void {
  let previousRowNumber = 1;
  for (const row of rows) {
    if (
      !isRecord(row) ||
      !Number.isSafeInteger(row.rowNumber) ||
      (row.rowNumber as number) < 2 ||
      (row.rowNumber as number) <= previousRowNumber ||
      !Array.isArray(row.values) ||
      row.values.length !== columnCount
    ) {
      invalidState();
    }
    previousRowNumber = row.rowNumber as number;
    if (
      row.values.some(
        (item) =>
          item !== undefined &&
          item !== null &&
          typeof item !== 'string' &&
          (typeof item !== 'number' || !Number.isFinite(item)) &&
          typeof item !== 'boolean',
      )
    ) {
      invalidState();
    }
  }
}

function validateModelMarker(
  metadata: readonly unknown[],
  sheetId: number,
  model: string,
): void {
  const markers = metadata.filter(
    (item) => isRecord(item) && item.key === GSTACK_MODEL_METADATA_KEY,
  );
  if (markers.length !== 1) conflict();
  const marker = markers[0] as Record<string, unknown>;
  const [checksum, ...operationParts] =
    typeof marker.value === 'string' ? marker.value.split(':') : [];
  if (
    !checksum ||
    !/^[a-f0-9]{64}$/u.test(checksum) ||
    operationParts.join(':') !== `create_model:${model}:${model}` ||
    !isRecord(marker.location) ||
    marker.location.sheetId !== sheetId ||
    Object.keys(marker.location).some((key) => key !== 'sheetId')
  ) {
    conflict();
  }
}

function validateMetadata(value: unknown): void {
  if (
    !isRecord(value) ||
    typeof value.key !== 'string' ||
    typeof value.value !== 'string' ||
    !isRecord(value.location)
  ) {
    invalidState();
  }
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function validateChecksum(value: string): void {
  if (!/^[a-f0-9]{64}$/u.test(value)) invalidOperation();
}

function incompatible(rowNumber: number): never {
  throw new GoogleSheetsMigrationError(
    'GOOGLE_SHEETS_MIGRATION_CONFLICT',
    `Google Sheets unique Index data conflicts at row ${rowNumber}.`,
  );
}

function invalidOperation(): never {
  throw new GoogleSheetsMigrationError(
    'GOOGLE_MIGRATION_OPERATION_INVALID',
    'Google Sheets Index Operation is invalid.',
  );
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
    'Google Sheets Migration state conflicts with the Operation.',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
