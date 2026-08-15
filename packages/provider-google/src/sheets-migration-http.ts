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

  async inspectAddColumn(
    input: Parameters<GoogleSheetsBatchUpdateGateway['inspectAddColumn']>[0],
  ): Promise<unknown> {
    return this.inspectColumns(input);
  }

  async inspectRenameColumn(
    input: Parameters<GoogleSheetsBatchUpdateGateway['inspectRenameColumn']>[0],
  ): Promise<unknown> {
    return this.inspectColumns(input);
  }

  async inspectDropColumn(
    input: Parameters<GoogleSheetsBatchUpdateGateway['inspectDropColumn']>[0],
  ): Promise<unknown> {
    return this.inspectColumns(input);
  }

  async inspectDropModel(
    input: Parameters<GoogleSheetsBatchUpdateGateway['inspectDropModel']>[0],
  ): Promise<unknown> {
    const credential = await this.authorize(input);
    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}`,
    );
    url.searchParams.set('includeGridData', 'false');
    url.searchParams.set(
      'fields',
      'developerMetadata(metadataKey,metadataValue,location(spreadsheet)),sheets(properties(sheetId,title),developerMetadata(metadataKey,metadataValue,location(sheetId,dimensionRange(sheetId,dimension,startIndex,endIndex))))',
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
    const summary = normalizeDropModelSummary(parseJson(response.body));
    const target = summary.sheets.find(
      ({ title }) => title === input.sheetTitle,
    );
    if (!target) return summary;
    const columns = await this.inspectColumns(input);
    if (!isRecord(columns) || !Array.isArray(columns.sheets)) {
      invalidStateResponse();
    }
    const detail = columns.sheets.find(
      (sheet) => isRecord(sheet) && sheet.title === input.sheetTitle,
    );
    if (!isRecord(detail) || detail.sheetId !== target.sheetId) {
      invalidStateResponse();
    }
    return {
      metadata: summary.metadata,
      sheets: summary.sheets.map((sheet) =>
        sheet.sheetId === target.sheetId
          ? { ...sheet, headers: detail.headers }
          : sheet,
      ),
    };
  }

  async inspectAlterColumn(input: {
    readonly spreadsheetId: string;
    readonly sheetTitle: string;
    readonly columnName: string;
    readonly credential: Parameters<
      GoogleSheetsBatchUpdateGateway['batchUpdate']
    >[0]['credential'];
    readonly secrets: Parameters<
      GoogleSheetsBatchUpdateGateway['batchUpdate']
    >[0]['secrets'];
  }): Promise<unknown> {
    const summary = await this.inspectColumns(input);
    if (!isRecord(summary) || !Array.isArray(summary.sheets)) {
      invalidStateResponse();
    }
    const target = summary.sheets.find(
      (sheet) => isRecord(sheet) && sheet.title === input.sheetTitle,
    );
    if (
      !isRecord(target) ||
      !Array.isArray(target.headers) ||
      !Number.isSafeInteger(target.rowCount) ||
      (target.rowCount as number) < 1
    ) {
      return summary;
    }
    const columnIndex = target.headers.indexOf(input.columnName);
    if (columnIndex < 0 || target.rowCount === 1) {
      return {
        sheets: summary.sheets.map((sheet) =>
          sheet === target ? { ...target, rows: [] } : sheet,
        ),
      };
    }
    const credential = await this.authorize(input);
    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}`,
    );
    url.searchParams.set('includeGridData', 'true');
    url.searchParams.set(
      'ranges',
      `${quoteSheetTitle(input.sheetTitle)}!2:${String(target.rowCount)}`,
    );
    url.searchParams.set(
      'fields',
      'sheets(properties(sheetId,title),data(rowData(values(effectiveValue))))',
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
    const rows = normalizeAlterColumnRows(
      parseJson(response.body),
      target.sheetId,
      input.sheetTitle,
      target.headers,
      columnIndex,
    );
    return {
      sheets: summary.sheets.map((sheet) =>
        sheet === target ? { ...target, rows } : sheet,
      ),
    };
  }

  async inspectIndex(input: {
    readonly spreadsheetId: string;
    readonly sheetTitle: string;
    readonly columns: readonly string[];
    readonly includeValues: boolean;
    readonly credential: Parameters<
      GoogleSheetsBatchUpdateGateway['batchUpdate']
    >[0]['credential'];
    readonly secrets: Parameters<
      GoogleSheetsBatchUpdateGateway['batchUpdate']
    >[0]['secrets'];
  }): Promise<unknown> {
    const summary = await this.inspectColumns(input);
    if (!isRecord(summary) || !Array.isArray(summary.sheets)) {
      invalidStateResponse();
    }
    const target = summary.sheets.find(
      (sheet) => isRecord(sheet) && sheet.title === input.sheetTitle,
    );
    if (
      !isRecord(target) ||
      !Array.isArray(target.headers) ||
      !Number.isSafeInteger(target.rowCount) ||
      (target.rowCount as number) < 1
    ) {
      return summary;
    }
    const targetHeaders = target.headers as unknown[];
    const columnIndexes = input.columns.map((column) =>
      targetHeaders.indexOf(column),
    );
    if (
      !input.includeValues ||
      columnIndexes.some((index) => index < 0) ||
      target.rowCount === 1
    ) {
      return {
        sheets: summary.sheets.map((sheet) =>
          sheet === target ? { ...target, rows: [] } : sheet,
        ),
      };
    }
    const credential = await this.authorize(input);
    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}`,
    );
    url.searchParams.set('includeGridData', 'true');
    url.searchParams.set(
      'ranges',
      `${quoteSheetTitle(input.sheetTitle)}!2:${String(target.rowCount)}`,
    );
    url.searchParams.set(
      'fields',
      'sheets(properties(sheetId,title),data(rowData(values(effectiveValue))))',
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
    const rows = normalizeIndexRows(
      parseJson(response.body),
      target.sheetId,
      input.sheetTitle,
      targetHeaders,
      columnIndexes,
    );
    return {
      sheets: summary.sheets.map((sheet) =>
        sheet === target ? { ...target, rows } : sheet,
      ),
    };
  }

  async inspectRelation(input: {
    readonly spreadsheetId: string;
    readonly sourceSheetTitle: string;
    readonly localField: string;
    readonly targetSheetTitle: string;
    readonly referenceField: string;
    readonly includeValues: boolean;
    readonly credential: Parameters<
      GoogleSheetsBatchUpdateGateway['batchUpdate']
    >[0]['credential'];
    readonly secrets: Parameters<
      GoogleSheetsBatchUpdateGateway['batchUpdate']
    >[0]['secrets'];
  }): Promise<unknown> {
    const sourceSummary = await this.inspectColumns({
      ...input,
      sheetTitle: input.sourceSheetTitle,
    });
    const targetSummary =
      input.targetSheetTitle === input.sourceSheetTitle
        ? sourceSummary
        : await this.inspectColumns({
            ...input,
            sheetTitle: input.targetSheetTitle,
          });
    const source = findSummarySheet(sourceSummary, input.sourceSheetTitle);
    const target = findSummarySheet(targetSummary, input.targetSheetTitle);
    const localValues =
      input.includeValues && source
        ? await this.readColumnValues(input, source, input.localField)
        : [];
    const referenceValues =
      input.includeValues && target
        ? await this.readColumnValues(input, target, input.referenceField)
        : [];
    if (!source || !target) {
      return mergeRelationSummaries(sourceSummary, targetSummary, null, null);
    }
    return mergeRelationSummaries(
      sourceSummary,
      targetSummary,
      { sheetId: source.sheetId, values: localValues },
      { sheetId: target.sheetId, values: referenceValues },
    );
  }

  private async readColumnValues(
    input: {
      readonly spreadsheetId: string;
      readonly credential: Parameters<
        GoogleSheetsBatchUpdateGateway['batchUpdate']
      >[0]['credential'];
      readonly secrets: Parameters<
        GoogleSheetsBatchUpdateGateway['batchUpdate']
      >[0]['secrets'];
    },
    sheet: Record<string, unknown>,
    columnName: string,
  ): Promise<readonly Readonly<{ rowNumber: number; value: unknown }>[]> {
    if (
      !Array.isArray(sheet.headers) ||
      !Number.isSafeInteger(sheet.rowCount) ||
      (sheet.rowCount as number) < 1 ||
      typeof sheet.title !== 'string'
    ) {
      return [];
    }
    const columnIndex = sheet.headers.indexOf(columnName);
    if (columnIndex < 0 || sheet.rowCount === 1) return [];
    const credential = await this.authorize(input);
    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}`,
    );
    url.searchParams.set('includeGridData', 'true');
    url.searchParams.set(
      'ranges',
      `${quoteSheetTitle(sheet.title)}!2:${String(sheet.rowCount)}`,
    );
    url.searchParams.set(
      'fields',
      'sheets(properties(sheetId,title),data(rowData(values(effectiveValue))))',
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
    return normalizeAlterColumnRows(
      parseJson(response.body),
      sheet.sheetId,
      sheet.title,
      sheet.headers,
      columnIndex,
    );
  }

  private async inspectColumns(input: {
    readonly spreadsheetId: string;
    readonly sheetTitle: string;
    readonly credential: Parameters<
      GoogleSheetsBatchUpdateGateway['batchUpdate']
    >[0]['credential'];
    readonly secrets: Parameters<
      GoogleSheetsBatchUpdateGateway['batchUpdate']
    >[0]['secrets'];
  }): Promise<unknown> {
    const credential = await this.authorize(input);
    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}`,
    );
    url.searchParams.set('includeGridData', 'true');
    url.searchParams.set('ranges', quoteSheetTitle(input.sheetTitle) + '!1:1');
    url.searchParams.set(
      'fields',
      'sheets(properties(sheetId,title,gridProperties(columnCount,rowCount)),data(rowData(values(userEnteredValue))),developerMetadata(metadataKey,metadataValue,location(sheetId,dimensionRange(sheetId,dimension,startIndex,endIndex))))',
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
    return normalizeAddColumnState(parseJson(response.body));
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

function quoteSheetTitle(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function normalizeAddColumnState(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.sheets)) invalidStateResponse();
  return {
    sheets: value.sheets.map((sheet) => {
      if (
        !isRecord(sheet) ||
        !isRecord(sheet.properties) ||
        !isRecord(sheet.properties.gridProperties)
      ) {
        invalidStateResponse();
      }
      const data = sheet.data === undefined ? [] : sheet.data;
      if (!Array.isArray(data) || data.length > 1) invalidStateResponse();
      const grid = data[0];
      if (grid !== undefined && !isRecord(grid)) invalidStateResponse();
      const rows = grid?.rowData === undefined ? [] : grid.rowData;
      if (!Array.isArray(rows) || rows.length > 1) invalidStateResponse();
      const row = rows[0];
      if (row !== undefined && !isRecord(row)) invalidStateResponse();
      const values = row?.values === undefined ? [] : row.values;
      if (!Array.isArray(values)) invalidStateResponse();
      return {
        sheetId: sheet.properties.sheetId,
        title: sheet.properties.title,
        columnCount: sheet.properties.gridProperties.columnCount,
        ...(sheet.properties.gridProperties.rowCount === undefined
          ? {}
          : { rowCount: sheet.properties.gridProperties.rowCount }),
        headers: values.map(headerValue),
        metadata: Array.isArray(sheet.developerMetadata)
          ? sheet.developerMetadata.map(normalizeMetadata)
          : [],
      };
    }),
  };
}

function normalizeAlterColumnRows(
  value: unknown,
  sheetId: unknown,
  sheetTitle: string,
  headers: readonly unknown[],
  columnIndex: number,
): readonly Readonly<{ rowNumber: number; value: unknown }>[] {
  if (!isRecord(value) || !Array.isArray(value.sheets)) {
    invalidStateResponse();
  }
  const sheets = value.sheets;
  if (sheets.length !== 1) invalidStateResponse();
  const sheet = sheets[0];
  if (
    !isRecord(sheet) ||
    !isRecord(sheet.properties) ||
    sheet.properties.sheetId !== sheetId ||
    sheet.properties.title !== sheetTitle
  ) {
    invalidStateResponse();
  }
  const data = sheet.data ?? [];
  if (!Array.isArray(data) || data.length > 1) invalidStateResponse();
  const grid = data[0];
  if (grid !== undefined && !isRecord(grid)) invalidStateResponse();
  const rowData = grid?.rowData ?? [];
  if (!Array.isArray(rowData)) invalidStateResponse();
  return Object.freeze(
    rowData.flatMap((row, index) => {
      if (!isRecord(row)) invalidStateResponse();
      const cells = row.values ?? [];
      if (!Array.isArray(cells) || cells.length > headers.length) {
        invalidStateResponse();
      }
      const values = cells.map(effectiveCellValue);
      if (values.every((item) => item === undefined)) return [];
      return [
        Object.freeze({
          rowNumber: index + 2,
          value: values[columnIndex],
        }),
      ];
    }),
  );
}

function normalizeIndexRows(
  value: unknown,
  sheetId: unknown,
  sheetTitle: string,
  headers: readonly unknown[],
  columnIndexes: readonly number[],
): readonly Readonly<{ rowNumber: number; values: readonly unknown[] }>[] {
  const rows = normalizeGridRows(value, sheetId, sheetTitle, headers.length);
  return Object.freeze(
    rows.map(({ rowNumber, values }) =>
      Object.freeze({
        rowNumber,
        values: Object.freeze(columnIndexes.map((index) => values[index])),
      }),
    ),
  );
}

function normalizeGridRows(
  value: unknown,
  sheetId: unknown,
  sheetTitle: string,
  headerCount: number,
): readonly Readonly<{ rowNumber: number; values: readonly unknown[] }>[] {
  if (!isRecord(value) || !Array.isArray(value.sheets)) {
    invalidStateResponse();
  }
  const sheets = value.sheets;
  if (sheets.length !== 1) invalidStateResponse();
  const sheet = sheets[0];
  if (
    !isRecord(sheet) ||
    !isRecord(sheet.properties) ||
    sheet.properties.sheetId !== sheetId ||
    sheet.properties.title !== sheetTitle
  ) {
    invalidStateResponse();
  }
  const data = sheet.data ?? [];
  if (!Array.isArray(data) || data.length > 1) invalidStateResponse();
  const grid = data[0];
  if (grid !== undefined && !isRecord(grid)) invalidStateResponse();
  const rowData = grid?.rowData ?? [];
  if (!Array.isArray(rowData)) invalidStateResponse();
  return Object.freeze(
    rowData.flatMap((row, index) => {
      if (!isRecord(row)) invalidStateResponse();
      const cells = row.values ?? [];
      if (!Array.isArray(cells) || cells.length > headerCount) {
        invalidStateResponse();
      }
      const values = cells.map(effectiveCellValue);
      if (values.every((item) => item === undefined)) return [];
      return [Object.freeze({ rowNumber: index + 2, values })];
    }),
  );
}

function findSummarySheet(
  value: unknown,
  title: string,
): Record<string, unknown> | null {
  if (!isRecord(value) || !Array.isArray(value.sheets)) {
    invalidStateResponse();
  }
  const matches = value.sheets.filter(
    (sheet) => isRecord(sheet) && sheet.title === title,
  );
  if (matches.length > 1) invalidStateResponse();
  return (matches[0] as Record<string, unknown> | undefined) ?? null;
}

function mergeRelationSummaries(
  sourceValue: unknown,
  targetValue: unknown,
  local: {
    readonly sheetId: unknown;
    readonly values: readonly unknown[];
  } | null,
  reference: {
    readonly sheetId: unknown;
    readonly values: readonly unknown[];
  } | null,
): unknown {
  if (
    !isRecord(sourceValue) ||
    !Array.isArray(sourceValue.sheets) ||
    !isRecord(targetValue) ||
    !Array.isArray(targetValue.sheets)
  ) {
    invalidStateResponse();
  }
  const byId = new Map<unknown, Record<string, unknown>>();
  for (const sheet of [...sourceValue.sheets, ...targetValue.sheets]) {
    if (!isRecord(sheet)) invalidStateResponse();
    const current = byId.get(sheet.sheetId);
    if (
      current &&
      (current.title !== sheet.title ||
        JSON.stringify(current.headers) !== JSON.stringify(sheet.headers) ||
        JSON.stringify(current.metadata) !== JSON.stringify(sheet.metadata))
    ) {
      invalidStateResponse();
    }
    byId.set(sheet.sheetId, current ?? sheet);
  }
  return {
    sheets: [...byId.values()].map((sheet) => ({
      ...sheet,
      ...(local && local.sheetId === sheet.sheetId
        ? { localValues: local.values }
        : {}),
      ...(reference && reference.sheetId === sheet.sheetId
        ? { referenceValues: reference.values }
        : {}),
    })),
  };
}

function effectiveCellValue(value: unknown): unknown {
  if (!isRecord(value)) invalidStateResponse();
  if (value.effectiveValue === undefined) return undefined;
  if (!isRecord(value.effectiveValue)) invalidStateResponse();
  const keys = Object.keys(value.effectiveValue);
  if (keys.length !== 1) invalidStateResponse();
  const key = keys[0];
  if (!['stringValue', 'numberValue', 'boolValue'].includes(key!)) {
    invalidStateResponse();
  }
  const result = value.effectiveValue[key!];
  if (
    (key === 'stringValue' && typeof result !== 'string') ||
    (key === 'numberValue' &&
      (typeof result !== 'number' || !Number.isFinite(result))) ||
    (key === 'boolValue' && typeof result !== 'boolean')
  ) {
    invalidStateResponse();
  }
  return result;
}

function normalizeDropModelSummary(value: unknown): {
  readonly metadata: readonly {
    readonly key: unknown;
    readonly value: unknown;
    readonly location: { readonly spreadsheet: unknown };
  }[];
  readonly sheets: readonly {
    readonly sheetId: unknown;
    readonly title: unknown;
    readonly headers: readonly never[];
    readonly metadata: readonly unknown[];
  }[];
} {
  if (!isRecord(value) || !Array.isArray(value.sheets)) invalidStateResponse();
  const metadata = value.developerMetadata ?? [];
  if (!Array.isArray(metadata)) invalidStateResponse();
  return {
    metadata: metadata.map((entry) => {
      if (!isRecord(entry) || !isRecord(entry.location)) {
        invalidStateResponse();
      }
      return {
        key: entry.metadataKey,
        value: entry.metadataValue,
        location: { spreadsheet: entry.location.spreadsheet },
      };
    }),
    sheets: value.sheets.map((sheet) => {
      if (!isRecord(sheet) || !isRecord(sheet.properties)) {
        invalidStateResponse();
      }
      return {
        sheetId: sheet.properties.sheetId,
        title: sheet.properties.title,
        headers: [],
        metadata: Array.isArray(sheet.developerMetadata)
          ? sheet.developerMetadata.map(normalizeMetadata)
          : [],
      };
    }),
  };
}

function headerValue(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.userEnteredValue)) return null;
  return value.userEnteredValue.stringValue;
}

function normalizeMetadata(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.location)) invalidStateResponse();
  const dimensionRange = value.location.dimensionRange;
  if (dimensionRange !== undefined && !isRecord(dimensionRange)) {
    invalidStateResponse();
  }
  return {
    key: value.metadataKey,
    value: value.metadataValue,
    location: dimensionRange
      ? {
          sheetId: dimensionRange.sheetId,
          dimension: dimensionRange.dimension,
          startIndex: dimensionRange.startIndex,
          endIndex: dimensionRange.endIndex,
        }
      : { sheetId: value.location.sheetId },
  };
}

function invalidStateResponse(): never {
  throw new TypeError('Google Sheets Migration state response is invalid.');
}
