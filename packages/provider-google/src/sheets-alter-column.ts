import type { Field } from '@gstack/application';
import type { AlterColumnOperation, ColumnChange } from '@gstack/migration';
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

export interface GoogleSheetsAlterColumnGateway {
  inspectAlterColumn(input: {
    readonly spreadsheetId: string;
    readonly sheetTitle: string;
    readonly columnName: string;
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

export interface AlterColumnAbsentState {
  readonly status: 'absent';
  readonly sheetId: number;
  readonly columnIndex: number;
}

export interface AlterColumnAppliedState {
  readonly status: 'applied';
}

export type AlterColumnState = AlterColumnAbsentState | AlterColumnAppliedState;

export interface AlterColumnRow {
  readonly rowNumber: number;
  readonly value: unknown;
}

export class GoogleSheetsAlterColumnService {
  public constructor(
    private readonly gateway: GoogleSheetsAlterColumnGateway,
    private readonly config: GoogleProviderConfig,
    private readonly secrets: ProviderSecretResolver,
  ) {}

  async execute(
    operation: AlterColumnOperation,
    migrationChecksum: string,
  ): Promise<void> {
    const credential = googleCredentialRequest(
      this.config.authentication.credentialSecret,
      'database_write',
    );
    const first = await this.inspect(operation, migrationChecksum, credential);
    if (first.status === 'applied') return;

    // Migration lock下でも外部編集は起こり得るため、write直前に再検査する。
    const current = await this.inspect(
      operation,
      migrationChecksum,
      credential,
    );
    if (current.status === 'applied') return;
    if (
      current.sheetId !== first.sheetId ||
      current.columnIndex !== first.columnIndex
    ) {
      conflict();
    }
    let response: unknown;
    try {
      response = await this.gateway.batchUpdate({
        spreadsheetId: this.config.spreadsheetId,
        credential,
        secrets: this.secrets,
        requests: alterColumnBatchRequests(
          operation,
          migrationChecksum,
          current,
        ),
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
    operation: AlterColumnOperation,
    migrationChecksum: string,
    credential: GoogleCredentialRequest,
  ): Promise<AlterColumnState> {
    let value: unknown;
    try {
      value = await this.gateway.inspectAlterColumn({
        spreadsheetId: this.config.spreadsheetId,
        sheetTitle: operation.model,
        columnName: operation.column,
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
    return inspectAlterColumnState(value, operation, migrationChecksum);
  }
}

export function inspectAlterColumnState(
  value: unknown,
  operation: AlterColumnOperation,
  migrationChecksum: string,
): AlterColumnState {
  validateChecksum(migrationChecksum);
  validateAlterColumnOperation(operation);
  if (!isRecord(value) || !Array.isArray(value.sheets)) invalidState();
  const expectedSheetId = stableSheetId(operation.model);
  let sheet: Record<string, unknown> | null = null;
  const sheetIds = new Set<number>();
  const sheetTitles = new Set<string>();
  for (const candidate of value.sheets) {
    if (
      !isRecord(candidate) ||
      !Number.isSafeInteger(candidate.sheetId) ||
      typeof candidate.title !== 'string' ||
      !Array.isArray(candidate.headers) ||
      !Array.isArray(candidate.metadata)
    ) {
      invalidState();
    }
    if (
      sheetIds.has(candidate.sheetId as number) ||
      sheetTitles.has(candidate.title)
    ) {
      conflict();
    }
    sheetIds.add(candidate.sheetId as number);
    sheetTitles.add(candidate.title);
    if (
      candidate.sheetId === expectedSheetId ||
      candidate.title === operation.model
    ) {
      if (
        sheet ||
        candidate.sheetId !== expectedSheetId ||
        candidate.title !== operation.model
      ) {
        conflict();
      }
      sheet = candidate;
    }
  }
  if (!sheet || !Array.isArray(sheet.rows)) conflict();
  const headers = sheet.headers as unknown[];
  const metadata = sheet.metadata as unknown[];
  for (const item of metadata) validateMetadata(item);
  validateRowsShape(sheet.rows);
  if (
    headers.some((header) => typeof header !== 'string' || !header.trim()) ||
    new Set(headers).size !== headers.length
  ) {
    conflict();
  }
  const columnIndex = headers.indexOf(operation.column);
  if (columnIndex < 0) conflict();
  validateModelMarker(metadata, expectedSheetId, operation.model);

  const expectedMarker = `${migrationChecksum}:${operation.id}`;
  const markers = metadata.filter(
    (metadata) =>
      isRecord(metadata) &&
      metadata.key === GSTACK_OPERATION_METADATA_KEY &&
      metadata.value === expectedMarker,
  );
  if (markers.length > 1) conflict();
  if (markers.length === 1) {
    validateColumnLocation(
      markers[0] as Record<string, unknown>,
      expectedSheetId,
      columnIndex,
    );
    return Object.freeze({ status: 'applied' });
  }
  validateAlterColumnValues(sheet.rows, operation.target);
  return Object.freeze({
    status: 'absent',
    sheetId: expectedSheetId,
    columnIndex,
  });
}

export function validateAlterColumnValues(
  rows: readonly unknown[],
  target: Field,
): void {
  const seen = new Set<unknown>();
  let previousRowNumber = 1;
  for (const row of rows) {
    if (
      !isRecord(row) ||
      !Number.isSafeInteger(row.rowNumber) ||
      (row.rowNumber as number) < 2 ||
      (row.rowNumber as number) <= previousRowNumber ||
      !Object.hasOwn(row, 'value')
    ) {
      invalidState();
    }
    const rowNumber = row.rowNumber as number;
    previousRowNumber = rowNumber;
    const value = row.value;
    if (value === null || value === undefined || value === '') {
      if (target.required) incompatible(rowNumber);
      continue;
    }
    if (!validFieldValue(value, target)) incompatible(rowNumber);
    if (target.unique) {
      if (seen.has(value)) incompatible(rowNumber);
      seen.add(value);
    }
  }
}

export function alterColumnBatchRequests(
  operation: AlterColumnOperation,
  migrationChecksum: string,
  state: AlterColumnAbsentState,
): readonly Readonly<Record<string, unknown>>[] {
  validateChecksum(migrationChecksum);
  validateAlterColumnOperation(operation);
  if (
    state.status !== 'absent' ||
    state.sheetId !== stableSheetId(operation.model) ||
    !Number.isSafeInteger(state.columnIndex) ||
    state.columnIndex < 0
  ) {
    invalidOperation();
  }
  return Object.freeze([
    Object.freeze({
      createDeveloperMetadata: Object.freeze({
        developerMetadata: Object.freeze({
          metadataKey: GSTACK_OPERATION_METADATA_KEY,
          metadataValue: `${migrationChecksum}:${operation.id}`,
          location: Object.freeze({
            dimensionRange: Object.freeze({
              sheetId: state.sheetId,
              dimension: 'COLUMNS',
              startIndex: state.columnIndex,
              endIndex: state.columnIndex + 1,
            }),
          }),
          visibility: 'DOCUMENT',
        }),
      }),
    }),
  ]);
}

function validateAlterColumnOperation(operation: AlterColumnOperation): void {
  if (
    !validFieldDefinition(operation.previous) ||
    !validFieldDefinition(operation.target) ||
    operation.previous.name !== operation.column ||
    operation.target.name !== operation.column ||
    operation.id !== `alter_column:${operation.model}:${operation.column}` ||
    !operation.model.trim() ||
    operation.destructive ||
    operation.reversible ||
    !operation.column.trim()
  ) {
    invalidOperation();
  }
  const expected = expectedChanges(operation.previous, operation.target);
  if (
    expected.length === 0 ||
    expected.length !== operation.changes.length ||
    expected.some(
      (change, index) => !sameChange(change, operation.changes[index]),
    ) ||
    operation.risk !==
      (expected.some(({ risk }) => risk === 'caution') ? 'caution' : 'safe')
  ) {
    invalidOperation();
  }
}

function expectedChanges(
  previous: Field,
  target: Field,
): readonly ColumnChange[] {
  const changes: ColumnChange[] = [];
  if (previous.type !== target.type) {
    changes.push({
      property: 'type',
      previous: previous.type,
      target: target.type,
      risk: 'caution',
    });
  }
  if (previous.required !== target.required) {
    changes.push({
      property: 'required',
      previous: previous.required,
      target: target.required,
      risk: target.required ? 'caution' : 'safe',
    });
  }
  if (previous.unique !== target.unique) {
    changes.push({
      property: 'unique',
      previous: previous.unique,
      target: target.unique,
      risk: target.unique ? 'caution' : 'safe',
    });
  }
  if (!sameArray(previous.enumValues, target.enumValues)) {
    changes.push({
      property: 'enumValues',
      previous: previous.enumValues,
      target: target.enumValues,
      risk: previous.enumValues.some(
        (item) => !target.enumValues.includes(item),
      )
        ? 'caution'
        : 'safe',
    });
  }
  return changes;
}

function sameChange(
  expected: ColumnChange,
  value: ColumnChange | undefined,
): boolean {
  return (
    value !== undefined &&
    expected.property === value.property &&
    expected.risk === value.risk &&
    equalValue(expected.previous, value.previous) &&
    equalValue(expected.target, value.target)
  );
}

function equalValue(
  left: ColumnChange['previous'],
  right: ColumnChange['previous'],
): boolean {
  return Array.isArray(left) && Array.isArray(right)
    ? sameArray(left, right)
    : left === right;
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function validFieldValue(value: unknown, field: Field): boolean {
  if (field.type === 'string' || field.type === 'text')
    return typeof value === 'string';
  if (field.type === 'integer')
    return typeof value === 'number' && Number.isSafeInteger(value);
  if (field.type === 'number')
    return typeof value === 'number' && Number.isFinite(value);
  if (field.type === 'boolean') return typeof value === 'boolean';
  if (field.type === 'uuid')
    return (
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        value,
      )
    );
  if (field.type === 'date')
    return (
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
      !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    );
  if (field.type === 'datetime')
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
  if (field.type === 'enum')
    return typeof value === 'string' && field.enumValues.includes(value);
  return field.type === 'json';
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
  )
    conflict();
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

function validateRowsShape(rows: readonly unknown[]): void {
  let previousRowNumber = 1;
  for (const row of rows) {
    if (
      !isRecord(row) ||
      !Number.isSafeInteger(row.rowNumber) ||
      (row.rowNumber as number) < 2 ||
      (row.rowNumber as number) <= previousRowNumber ||
      !Object.hasOwn(row, 'value')
    ) {
      invalidState();
    }
    previousRowNumber = row.rowNumber as number;
  }
}

function validFieldDefinition(value: unknown): value is Field {
  const types: readonly Field['type'][] = [
    'string',
    'text',
    'integer',
    'number',
    'boolean',
    'uuid',
    'date',
    'datetime',
    'json',
    'enum',
  ];
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    types.includes(value.type as Field['type']) &&
    typeof value.required === 'boolean' &&
    typeof value.unique === 'boolean' &&
    Array.isArray(value.enumValues) &&
    value.enumValues.every((item) => typeof item === 'string') &&
    new Set(value.enumValues).size === value.enumValues.length &&
    (value.type === 'enum'
      ? value.enumValues.length > 0
      : value.enumValues.length === 0)
  );
}

function validateColumnLocation(
  metadata: Record<string, unknown>,
  sheetId: number,
  columnIndex: number,
): void {
  if (!isColumnLocation(metadata.location, sheetId, columnIndex)) conflict();
}

function isColumnLocation(
  value: unknown,
  sheetId: number,
  columnIndex: number,
): boolean {
  return (
    isRecord(value) &&
    value.sheetId === sheetId &&
    value.dimension === 'COLUMNS' &&
    value.startIndex === columnIndex &&
    value.endIndex === columnIndex + 1
  );
}

function validateChecksum(value: string): void {
  if (!/^[a-f0-9]{64}$/u.test(value)) invalidOperation();
}

function incompatible(rowNumber: number): never {
  throw new GoogleSheetsMigrationError(
    'GOOGLE_SHEETS_MIGRATION_CONFLICT',
    `Google Sheets alter_column data is incompatible at row ${rowNumber}.`,
  );
}

function invalidOperation(): never {
  throw new GoogleSheetsMigrationError(
    'GOOGLE_MIGRATION_OPERATION_INVALID',
    'Google Sheets alter_column Operation is invalid.',
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
