import type { Relation } from '@gstack/application';
import type {
  AddRelationOperation,
  DropRelationOperation,
} from '@gstack/migration';
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

export type GoogleSheetsRelationOperation =
  AddRelationOperation | DropRelationOperation;

export interface GoogleSheetsRelationGateway {
  inspectRelation(input: {
    readonly spreadsheetId: string;
    readonly sourceSheetTitle: string;
    readonly localField: string;
    readonly targetSheetTitle: string;
    readonly referenceField: string;
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

export interface RelationAbsentState {
  readonly status: 'absent';
  readonly sourceSheetId: number;
}

export interface RelationAppliedState {
  readonly status: 'applied';
}

export type RelationMigrationState = RelationAbsentState | RelationAppliedState;

export class GoogleSheetsRelationService {
  public constructor(
    private readonly gateway: GoogleSheetsRelationGateway,
    private readonly config: GoogleProviderConfig,
    private readonly secrets: ProviderSecretResolver,
  ) {}

  async execute(
    operation: GoogleSheetsRelationOperation,
    migrationChecksum: string,
  ): Promise<void> {
    validateChecksum(migrationChecksum);
    validateRelationOperation(operation);
    const relation = relationDefinition(operation);
    const credential = googleCredentialRequest(
      this.config.authentication.credentialSecret,
      'database_write',
    );
    const first = await this.inspect(
      operation,
      migrationChecksum,
      relation,
      credential,
    );
    if (first.status === 'applied') return;
    const current = await this.inspect(
      operation,
      migrationChecksum,
      relation,
      credential,
    );
    if (current.status === 'applied') return;
    if (current.sourceSheetId !== first.sourceSheetId) conflict();
    let response: unknown;
    try {
      response = await this.gateway.batchUpdate({
        spreadsheetId: this.config.spreadsheetId,
        credential,
        secrets: this.secrets,
        requests: relationBatchRequests(operation, migrationChecksum, current),
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
    operation: GoogleSheetsRelationOperation,
    migrationChecksum: string,
    relation: Relation,
    credential: GoogleCredentialRequest,
  ): Promise<RelationMigrationState> {
    let value: unknown;
    try {
      value = await this.gateway.inspectRelation({
        spreadsheetId: this.config.spreadsheetId,
        sourceSheetTitle: operation.model,
        localField: relation.field,
        targetSheetTitle: relation.targetModel,
        referenceField: relation.references,
        includeValues: operation.type === 'add_relation',
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
    return inspectRelationState(value, operation, migrationChecksum);
  }
}

export function inspectRelationState(
  value: unknown,
  operation: GoogleSheetsRelationOperation,
  migrationChecksum: string,
): RelationMigrationState {
  validateChecksum(migrationChecksum);
  validateRelationOperation(operation);
  if (!isRecord(value) || !Array.isArray(value.sheets)) invalidState();
  const relation = relationDefinition(operation);
  const sheets = validateSheets(value.sheets);
  const source = findSheet(sheets, operation.model);
  const target = findSheet(sheets, relation.targetModel);
  validateManagedSheet(source, operation.model);
  validateManagedSheet(target, relation.targetModel);
  const sourceHeaders = source.headers as unknown[];
  const targetHeaders = target.headers as unknown[];
  if (
    !sourceHeaders.includes(relation.field) ||
    !targetHeaders.includes(relation.references)
  ) {
    conflict();
  }
  if (
    !Array.isArray(source.localValues) ||
    !Array.isArray(target.referenceValues)
  ) {
    invalidState();
  }
  validateValueRowsShape(source.localValues);
  validateValueRowsShape(target.referenceValues);

  const expectedMarker = `${migrationChecksum}:${operation.id}`;
  const metadata = source.metadata as unknown[];
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
      marker.location.sheetId !== stableSheetId(operation.model) ||
      Object.keys(marker.location).some((key) => key !== 'sheetId')
    ) {
      conflict();
    }
    return Object.freeze({ status: 'applied' });
  }
  if (operation.type === 'add_relation') {
    validateRelationValues(source.localValues, target.referenceValues);
  }
  return Object.freeze({
    status: 'absent',
    sourceSheetId: stableSheetId(operation.model),
  });
}

export function validateRelationValues(
  localRows: readonly unknown[],
  referenceRows: readonly unknown[],
): void {
  validateValueRowsShape(localRows);
  validateValueRowsShape(referenceRows);
  const references = new Set(
    referenceRows
      .map((row) => (row as Record<string, unknown>).value)
      .filter((value) => !isEmpty(value))
      .map(valueKey),
  );
  for (const row of localRows) {
    const record = row as Record<string, unknown>;
    if (isEmpty(record.value)) continue;
    if (!references.has(valueKey(record.value))) {
      incompatible(record.rowNumber as number);
    }
  }
}

export function relationBatchRequests(
  operation: GoogleSheetsRelationOperation,
  migrationChecksum: string,
  state: RelationAbsentState,
): readonly Readonly<Record<string, unknown>>[] {
  validateChecksum(migrationChecksum);
  validateRelationOperation(operation);
  if (
    state.status !== 'absent' ||
    state.sourceSheetId !== stableSheetId(operation.model)
  ) {
    invalidOperation();
  }
  return Object.freeze([
    Object.freeze({
      createDeveloperMetadata: Object.freeze({
        developerMetadata: Object.freeze({
          metadataKey: GSTACK_OPERATION_METADATA_KEY,
          metadataValue: `${migrationChecksum}:${operation.id}`,
          location: Object.freeze({ sheetId: state.sourceSheetId }),
          visibility: 'DOCUMENT',
        }),
      }),
    }),
  ]);
}

function validateRelationOperation(
  operation: GoogleSheetsRelationOperation,
): void {
  const relation = relationDefinition(operation);
  if (
    !validRelation(relation) ||
    operation.id !== `${operation.type}:${operation.model}:${relation.name}` ||
    !operation.model.trim() ||
    operation.risk !== 'safe' ||
    operation.destructive ||
    !operation.reversible
  ) {
    invalidOperation();
  }
}

function relationDefinition(
  operation: GoogleSheetsRelationOperation,
): Relation {
  return operation.type === 'add_relation'
    ? operation.relation
    : operation.previous;
}

function validRelation(value: unknown): value is Relation {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    value.type === 'belongs_to' &&
    typeof value.field === 'string' &&
    value.field.trim().length > 0 &&
    typeof value.targetModel === 'string' &&
    value.targetModel.trim().length > 0 &&
    typeof value.references === 'string' &&
    value.references.trim().length > 0
  );
}

function validateSheets(
  values: readonly unknown[],
): readonly Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  const ids = new Set<number>();
  const titles = new Set<string>();
  for (const value of values) {
    if (
      !isRecord(value) ||
      !Number.isSafeInteger(value.sheetId) ||
      typeof value.title !== 'string' ||
      !Array.isArray(value.headers) ||
      !Array.isArray(value.metadata)
    ) {
      invalidState();
    }
    if (ids.has(value.sheetId as number) || titles.has(value.title)) conflict();
    ids.add(value.sheetId as number);
    titles.add(value.title);
    result.push(value);
  }
  return result;
}

function findSheet(
  sheets: readonly Record<string, unknown>[],
  model: string,
): Record<string, unknown> {
  const sheetId = stableSheetId(model);
  const matches = sheets.filter(
    (sheet) => sheet.sheetId === sheetId || sheet.title === model,
  );
  if (
    matches.length !== 1 ||
    matches[0]!.sheetId !== sheetId ||
    matches[0]!.title !== model
  ) {
    conflict();
  }
  return matches[0]!;
}

function validateManagedSheet(
  sheet: Record<string, unknown>,
  model: string,
): void {
  const headers = sheet.headers as unknown[];
  if (
    headers.some((header) => typeof header !== 'string' || !header.trim()) ||
    new Set(headers).size !== headers.length
  ) {
    conflict();
  }
  const metadata = sheet.metadata as unknown[];
  for (const item of metadata) validateMetadata(item);
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
    marker.location.sheetId !== stableSheetId(model) ||
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

function validateValueRowsShape(rows: readonly unknown[]): void {
  let previousRowNumber = 1;
  for (const row of rows) {
    if (
      !isRecord(row) ||
      !Number.isSafeInteger(row.rowNumber) ||
      (row.rowNumber as number) < 2 ||
      (row.rowNumber as number) <= previousRowNumber ||
      !Object.hasOwn(row, 'value') ||
      (!isEmpty(row.value) &&
        typeof row.value !== 'string' &&
        (typeof row.value !== 'number' || !Number.isFinite(row.value)) &&
        typeof row.value !== 'boolean')
    ) {
      invalidState();
    }
    previousRowNumber = row.rowNumber as number;
  }
}

function valueKey(value: unknown): string {
  return JSON.stringify([typeof value, value]);
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
    `Google Sheets Relation data conflicts at row ${rowNumber}.`,
  );
}

function invalidOperation(): never {
  throw new GoogleSheetsMigrationError(
    'GOOGLE_MIGRATION_OPERATION_INVALID',
    'Google Sheets Relation Operation is invalid.',
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
