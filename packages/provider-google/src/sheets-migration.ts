import type {
  AddColumnOperation,
  CreateModelOperation,
  RenameColumnOperation,
} from '@gstack/migration';
import type { ProviderSecretResolver } from '@gstack/provider';

import {
  googleCredentialRequest,
  type GoogleCredentialRequest,
} from './authentication.js';
import type { GoogleProviderConfig } from './config.js';

export const GSTACK_MODEL_METADATA_KEY = 'gstack_model';
export const GSTACK_OPERATION_METADATA_KEY = 'gstack_operation';

export interface GoogleSheetsBatchUpdateGateway {
  inspectCreateModel(input: {
    readonly spreadsheetId: string;
    readonly credential: GoogleCredentialRequest;
    readonly secrets: ProviderSecretResolver;
  }): Promise<unknown>;
  inspectAddColumn(input: {
    readonly spreadsheetId: string;
    readonly sheetTitle: string;
    readonly credential: GoogleCredentialRequest;
    readonly secrets: ProviderSecretResolver;
  }): Promise<unknown>;
  inspectRenameColumn(input: {
    readonly spreadsheetId: string;
    readonly sheetTitle: string;
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

export type GoogleSheetsCreateModelGateway = Pick<
  GoogleSheetsBatchUpdateGateway,
  'inspectCreateModel' | 'batchUpdate'
>;

export type GoogleSheetsAddColumnGateway = Pick<
  GoogleSheetsBatchUpdateGateway,
  'inspectAddColumn' | 'batchUpdate'
>;

export type GoogleSheetsRenameColumnGateway = Pick<
  GoogleSheetsBatchUpdateGateway,
  'inspectRenameColumn' | 'batchUpdate'
>;

export interface AddColumnAbsentState {
  readonly status: 'absent';
  readonly sheetId: number;
  readonly columnIndex: number;
  readonly columnCount: number;
}

export interface AddColumnAppliedState {
  readonly status: 'applied';
}

export type AddColumnState = AddColumnAbsentState | AddColumnAppliedState;

export interface RenameColumnAbsentState {
  readonly status: 'absent';
  readonly sheetId: number;
  readonly columnIndex: number;
}

export interface RenameColumnAppliedState {
  readonly status: 'applied';
}

export type RenameColumnState =
  RenameColumnAbsentState | RenameColumnAppliedState;

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
    private readonly gateway: GoogleSheetsCreateModelGateway,
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

export class GoogleSheetsAddColumnService {
  public constructor(
    private readonly gateway: GoogleSheetsAddColumnGateway,
    private readonly config: GoogleProviderConfig,
    private readonly secrets: ProviderSecretResolver,
  ) {}

  async execute(
    operation: AddColumnOperation,
    migrationChecksum: string,
  ): Promise<void> {
    validateChecksum(migrationChecksum);
    const credential = googleCredentialRequest(
      this.config.authentication.credentialSecret,
      'database_write',
    );
    let value: unknown;
    try {
      value = await this.gateway.inspectAddColumn({
        spreadsheetId: this.config.spreadsheetId,
        sheetTitle: operation.model,
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
    const state = inspectAddColumnState(value, operation, migrationChecksum);
    if (state.status === 'applied') return;
    let response: unknown;
    try {
      response = await this.gateway.batchUpdate({
        spreadsheetId: this.config.spreadsheetId,
        credential,
        secrets: this.secrets,
        requests: addColumnBatchRequests(operation, migrationChecksum, state),
      });
    } catch (error: unknown) {
      throw new GoogleSheetsMigrationError(
        'GOOGLE_SHEETS_WRITE_FAILED',
        'Google Sheets Migration Operation failed.',
        { cause: error },
      );
    }
    validateWriteResponse(response, this.config.spreadsheetId);
  }
}

export class GoogleSheetsRenameColumnService {
  public constructor(
    private readonly gateway: GoogleSheetsRenameColumnGateway,
    private readonly config: GoogleProviderConfig,
    private readonly secrets: ProviderSecretResolver,
  ) {}

  async execute(
    operation: RenameColumnOperation,
    migrationChecksum: string,
  ): Promise<void> {
    validateChecksum(migrationChecksum);
    const credential = googleCredentialRequest(
      this.config.authentication.credentialSecret,
      'database_write',
    );
    let value: unknown;
    try {
      value = await this.gateway.inspectRenameColumn({
        spreadsheetId: this.config.spreadsheetId,
        sheetTitle: operation.model,
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
    const state = inspectRenameColumnState(value, operation, migrationChecksum);
    if (state.status === 'applied') return;
    let response: unknown;
    try {
      response = await this.gateway.batchUpdate({
        spreadsheetId: this.config.spreadsheetId,
        credential,
        secrets: this.secrets,
        requests: renameColumnBatchRequests(
          operation,
          migrationChecksum,
          state,
        ),
      });
    } catch (error: unknown) {
      throw new GoogleSheetsMigrationError(
        'GOOGLE_SHEETS_WRITE_FAILED',
        'Google Sheets Migration Operation failed.',
        { cause: error },
      );
    }
    validateWriteResponse(response, this.config.spreadsheetId);
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
  validateChecksum(migrationChecksum);
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

export function inspectAddColumnState(
  value: unknown,
  operation: AddColumnOperation,
  migrationChecksum: string,
): AddColumnState {
  validateChecksum(migrationChecksum);
  if (!isRecord(value) || !Array.isArray(value.sheets)) invalidState();
  const expectedSheetId = stableSheetId(operation.model);
  const expectedMarker = `${migrationChecksum}:${operation.id}`;
  let target: Record<string, unknown> | null = null;
  for (const sheet of value.sheets) {
    if (
      !isRecord(sheet) ||
      !Number.isSafeInteger(sheet.sheetId) ||
      typeof sheet.title !== 'string' ||
      !Number.isSafeInteger(sheet.columnCount) ||
      (sheet.columnCount as number) < 1 ||
      !Array.isArray(sheet.headers) ||
      !Array.isArray(sheet.metadata)
    ) {
      invalidState();
    }
    const sameId = sheet.sheetId === expectedSheetId;
    const sameTitle = sheet.title === operation.model;
    if (sameId || sameTitle) {
      if (!(sameId && sameTitle) || target) conflict();
      target = sheet;
    }
  }
  if (!target) conflict();
  const headers = target.headers as unknown[];
  if (
    headers.length > (target.columnCount as number) ||
    headers.some((header) => typeof header !== 'string' || !header.trim()) ||
    new Set(headers).size !== headers.length
  ) {
    invalidState();
  }
  const headerNames = headers as string[];
  let modelMarkerCount = 0;
  const matchingMarkers: Record<string, unknown>[] = [];
  for (const metadata of target.metadata as unknown[]) {
    if (
      !isRecord(metadata) ||
      typeof metadata.key !== 'string' ||
      typeof metadata.value !== 'string' ||
      !isRecord(metadata.location)
    ) {
      invalidState();
    }
    if (metadata.key === GSTACK_MODEL_METADATA_KEY) {
      modelMarkerCount += 1;
      const [modelChecksum, ...modelOperationParts] = metadata.value.split(':');
      if (
        !modelChecksum ||
        !/^[a-f0-9]{64}$/u.test(modelChecksum) ||
        modelOperationParts.join(':') !==
          `create_model:${operation.model}:${operation.model}` ||
        metadata.location.sheetId !== expectedSheetId
      ) {
        conflict();
      }
    }
    if (
      metadata.key === GSTACK_OPERATION_METADATA_KEY &&
      metadata.value === expectedMarker
    ) {
      matchingMarkers.push(metadata);
    }
  }
  if (modelMarkerCount !== 1 || matchingMarkers.length > 1) conflict();
  const columnIndex = headerNames.indexOf(operation.column.name);
  const marker = matchingMarkers[0];
  if (marker) {
    const location = marker.location as Record<string, unknown>;
    if (
      columnIndex < 0 ||
      location.sheetId !== expectedSheetId ||
      location.dimension !== 'COLUMNS' ||
      location.startIndex !== columnIndex ||
      location.endIndex !== columnIndex + 1
    ) {
      conflict();
    }
    return Object.freeze({ status: 'applied' });
  }
  if (columnIndex >= 0) conflict();
  return Object.freeze({
    status: 'absent',
    sheetId: expectedSheetId,
    columnIndex: headerNames.length,
    columnCount: target.columnCount as number,
  });
}

export function addColumnBatchRequests(
  operation: AddColumnOperation,
  migrationChecksum: string,
  state: AddColumnAbsentState,
): readonly Readonly<Record<string, unknown>>[] {
  validateChecksum(migrationChecksum);
  if (
    state.status !== 'absent' ||
    state.sheetId !== stableSheetId(operation.model) ||
    !Number.isSafeInteger(state.columnIndex) ||
    state.columnIndex < 0 ||
    !Number.isSafeInteger(state.columnCount) ||
    state.columnCount < 1 ||
    state.columnIndex > state.columnCount
  ) {
    throw new GoogleSheetsMigrationError(
      'GOOGLE_MIGRATION_OPERATION_INVALID',
      'Google Sheets add_column state is invalid.',
    );
  }
  const dimensionRequest =
    state.columnIndex < state.columnCount
      ? Object.freeze({
          insertDimension: Object.freeze({
            range: Object.freeze({
              sheetId: state.sheetId,
              dimension: 'COLUMNS',
              startIndex: state.columnIndex,
              endIndex: state.columnIndex + 1,
            }),
            inheritFromBefore: false,
          }),
        })
      : Object.freeze({
          appendDimension: Object.freeze({
            sheetId: state.sheetId,
            dimension: 'COLUMNS',
            length: 1,
          }),
        });
  return Object.freeze([
    dimensionRequest,
    Object.freeze({
      updateCells: Object.freeze({
        start: Object.freeze({
          sheetId: state.sheetId,
          rowIndex: 0,
          columnIndex: state.columnIndex,
        }),
        rows: Object.freeze([
          Object.freeze({
            values: Object.freeze([
              Object.freeze({
                userEnteredValue: Object.freeze({
                  stringValue: operation.column.name,
                }),
              }),
            ]),
          }),
        ]),
        fields: 'userEnteredValue',
      }),
    }),
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

export function inspectRenameColumnState(
  value: unknown,
  operation: RenameColumnOperation,
  migrationChecksum: string,
): RenameColumnState {
  validateChecksum(migrationChecksum);
  if (
    !operation.from.trim() ||
    !operation.to.trim() ||
    operation.from === operation.to
  ) {
    throw new GoogleSheetsMigrationError(
      'GOOGLE_MIGRATION_OPERATION_INVALID',
      'Google Sheets rename_column Operation is invalid.',
    );
  }
  if (!isRecord(value) || !Array.isArray(value.sheets)) invalidState();
  const expectedSheetId = stableSheetId(operation.model);
  const expectedMarker = `${migrationChecksum}:${operation.id}`;
  let target: Record<string, unknown> | null = null;
  for (const sheet of value.sheets) {
    if (
      !isRecord(sheet) ||
      !Number.isSafeInteger(sheet.sheetId) ||
      typeof sheet.title !== 'string' ||
      !Number.isSafeInteger(sheet.columnCount) ||
      (sheet.columnCount as number) < 1 ||
      !Array.isArray(sheet.headers) ||
      !Array.isArray(sheet.metadata)
    ) {
      invalidState();
    }
    const sameId = sheet.sheetId === expectedSheetId;
    const sameTitle = sheet.title === operation.model;
    if (sameId || sameTitle) {
      if (!(sameId && sameTitle) || target) conflict();
      target = sheet;
    }
  }
  if (!target) conflict();
  const headers = target.headers as unknown[];
  if (
    headers.length > (target.columnCount as number) ||
    headers.some((header) => typeof header !== 'string' || !header.trim()) ||
    new Set(headers).size !== headers.length
  ) {
    invalidState();
  }
  let modelMarkerCount = 0;
  const matchingMarkers: Record<string, unknown>[] = [];
  for (const metadata of target.metadata as unknown[]) {
    if (
      !isRecord(metadata) ||
      typeof metadata.key !== 'string' ||
      typeof metadata.value !== 'string' ||
      !isRecord(metadata.location)
    ) {
      invalidState();
    }
    if (metadata.key === GSTACK_MODEL_METADATA_KEY) {
      modelMarkerCount += 1;
      const [modelChecksum, ...modelOperationParts] = metadata.value.split(':');
      if (
        !modelChecksum ||
        !/^[a-f0-9]{64}$/u.test(modelChecksum) ||
        modelOperationParts.join(':') !==
          `create_model:${operation.model}:${operation.model}` ||
        metadata.location.sheetId !== expectedSheetId
      ) {
        conflict();
      }
    }
    if (
      metadata.key === GSTACK_OPERATION_METADATA_KEY &&
      metadata.value === expectedMarker
    ) {
      matchingMarkers.push(metadata);
    }
  }
  if (modelMarkerCount !== 1 || matchingMarkers.length > 1) conflict();
  const headerNames = headers as string[];
  const fromIndex = headerNames.indexOf(operation.from);
  const toIndex = headerNames.indexOf(operation.to);
  const marker = matchingMarkers[0];
  if (marker) {
    const location = marker.location as Record<string, unknown>;
    if (
      fromIndex >= 0 ||
      toIndex < 0 ||
      location.sheetId !== expectedSheetId ||
      location.dimension !== 'COLUMNS' ||
      location.startIndex !== toIndex ||
      location.endIndex !== toIndex + 1
    ) {
      conflict();
    }
    return Object.freeze({ status: 'applied' });
  }
  if (fromIndex < 0 || toIndex >= 0) conflict();
  return Object.freeze({
    status: 'absent',
    sheetId: expectedSheetId,
    columnIndex: fromIndex,
  });
}

export function renameColumnBatchRequests(
  operation: RenameColumnOperation,
  migrationChecksum: string,
  state: RenameColumnAbsentState,
): readonly Readonly<Record<string, unknown>>[] {
  validateChecksum(migrationChecksum);
  if (
    state.status !== 'absent' ||
    state.sheetId !== stableSheetId(operation.model) ||
    !Number.isSafeInteger(state.columnIndex) ||
    state.columnIndex < 0 ||
    !operation.to.trim()
  ) {
    throw new GoogleSheetsMigrationError(
      'GOOGLE_MIGRATION_OPERATION_INVALID',
      'Google Sheets rename_column state is invalid.',
    );
  }
  return Object.freeze([
    Object.freeze({
      updateCells: Object.freeze({
        start: Object.freeze({
          sheetId: state.sheetId,
          rowIndex: 0,
          columnIndex: state.columnIndex,
        }),
        rows: Object.freeze([
          Object.freeze({
            values: Object.freeze([
              Object.freeze({
                userEnteredValue: Object.freeze({ stringValue: operation.to }),
              }),
            ]),
          }),
        ]),
        fields: 'userEnteredValue',
      }),
    }),
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

function validateChecksum(value: string): void {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new GoogleSheetsMigrationError(
      'GOOGLE_MIGRATION_OPERATION_INVALID',
      'Migration checksum is invalid.',
    );
  }
}

function validateWriteResponse(value: unknown, spreadsheetId: string): void {
  if (!isRecord(value) || value.spreadsheetId !== spreadsheetId) {
    throw new GoogleSheetsMigrationError(
      'GOOGLE_SHEETS_WRITE_RESPONSE_INVALID',
      'Google Sheets Migration response is invalid.',
    );
  }
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
