import { describe, expect, it, vi } from 'vitest';

import type {
  AddRelationOperation,
  DropRelationOperation,
} from '@gstack/migration';

import type { GoogleProviderConfig } from './config.js';
import {
  GoogleSheetsRelationService,
  inspectRelationState,
  relationBatchRequests,
  validateRelationValues,
} from './sheets-relation.js';
import { stableSheetId } from './sheets-migration.js';

const checksum = 'a'.repeat(64);
const definition = {
  name: 'account',
  type: 'belongs_to' as const,
  field: 'account_id',
  targetModel: 'accounts',
  references: 'id',
};
const addOperation: AddRelationOperation = {
  id: 'add_relation:users:account',
  type: 'add_relation',
  model: 'users',
  relation: definition,
  risk: 'safe',
  destructive: false,
  reversible: true,
  capability: 'emulated',
};
const dropOperation: DropRelationOperation = {
  id: 'drop_relation:users:account',
  type: 'drop_relation',
  model: 'users',
  previous: definition,
  risk: 'safe',
  destructive: false,
  reversible: true,
  capability: 'emulated',
};

describe('Google Sheets Relation Migration', () => {
  it('source／targetの管理状態と参照値を検証する', () => {
    expect(inspectRelationState(state(), addOperation, checksum)).toEqual({
      status: 'absent',
      sourceSheetId: stableSheetId('users'),
    });
    expect(inspectRelationState(state(), dropOperation, checksum)).toEqual({
      status: 'absent',
      sourceSheetId: stableSheetId('users'),
    });
  });

  it('存在しない参照を値を露出せず拒否し空local値を許可する', () => {
    expect(() =>
      validateRelationValues(
        [
          { rowNumber: 2, value: '' },
          { rowNumber: 4, value: 'secret-missing-id' },
        ],
        [{ rowNumber: 2, value: 'account-1' }],
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'GOOGLE_SHEETS_MIGRATION_CONFLICT',
        message: expect.not.stringContaining('secret'),
      }),
    );
    expect(() =>
      validateRelationValues(
        [{ rowNumber: 2, value: '' }],
        [{ rowNumber: 2, value: 'account-1' }],
      ),
    ).not.toThrow();
  });

  it('参照値をcoerceせず比較する', () => {
    expect(() =>
      validateRelationValues(
        [{ rowNumber: 2, value: '1' }],
        [{ rowNumber: 2, value: 1 }],
      ),
    ).toThrow();
  });

  it('自己参照Relationを単一Sheet状態で検証する', () => {
    const self: AddRelationOperation = {
      ...addOperation,
      id: 'add_relation:users:parent',
      relation: {
        name: 'parent',
        type: 'belongs_to',
        field: 'parent_id',
        targetModel: 'users',
        references: 'id',
      },
    };
    const sheetId = stableSheetId('users');
    expect(
      inspectRelationState(
        {
          sheets: [
            {
              sheetId,
              title: 'users',
              headers: ['id', 'parent_id'],
              metadata: [modelMarker('users')],
              localValues: [{ rowNumber: 3, value: 'user-1' }],
              referenceValues: [{ rowNumber: 2, value: 'user-1' }],
            },
          ],
        },
        self,
        checksum,
      ),
    ).toEqual({ status: 'absent', sourceSheetId: sheetId });
  });

  it('同じOperation markerだけをsource Sheetで適用済みと判定する', () => {
    expect(
      inspectRelationState(
        state([operationMarker(`${checksum}:${addOperation.id}`)]),
        addOperation,
        checksum,
      ),
    ).toEqual({ status: 'applied' });
  });

  it('cellを変更せずsource Sheet markerだけを作る', () => {
    expect(
      relationBatchRequests(addOperation, checksum, {
        status: 'absent',
        sourceSheetId: stableSheetId('users'),
      }),
    ).toEqual([
      {
        createDeveloperMetadata: {
          developerMetadata: {
            metadataKey: 'gstack_operation',
            metadataValue: `${checksum}:${addOperation.id}`,
            location: { sheetId: stableSheetId('users') },
            visibility: 'DOCUMENT',
          },
        },
      },
    ]);
  });

  it('addは両Sheet値を要求しwrite直前に再readする', async () => {
    const inspectRelation = vi.fn().mockResolvedValue(state());
    const batchUpdate = vi
      .fn()
      .mockResolvedValue({ spreadsheetId: 'spreadsheet-id' });
    const service = new GoogleSheetsRelationService(
      { inspectRelation, batchUpdate },
      config,
      { get: vi.fn() },
    );
    await service.execute(addOperation, checksum);
    expect(inspectRelation).toHaveBeenCalledTimes(2);
    expect(inspectRelation).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSheetTitle: 'users',
        localField: 'account_id',
        targetSheetTitle: 'accounts',
        referenceField: 'id',
        includeValues: true,
      }),
    );
    expect(batchUpdate).toHaveBeenCalledTimes(1);
  });

  it('dropは値を読まず再read済みmarkerをskipする', async () => {
    const inspectRelation = vi
      .fn()
      .mockResolvedValueOnce(state())
      .mockResolvedValueOnce(
        state([operationMarker(`${checksum}:${dropOperation.id}`)]),
      );
    const batchUpdate = vi.fn();
    const service = new GoogleSheetsRelationService(
      { inspectRelation, batchUpdate },
      config,
      { get: vi.fn() },
    );
    await service.execute(dropOperation, checksum);
    expect(inspectRelation).toHaveBeenCalledWith(
      expect.objectContaining({ includeValues: false }),
    );
    expect(batchUpdate).not.toHaveBeenCalled();
  });
});

const config: GoogleProviderConfig = {
  spreadsheetId: 'spreadsheet-id',
  appsScriptProjectId: 'script-id',
  driveFolderId: 'folder-id',
  authentication: {
    mode: 'user_oauth',
    credentialSecret: 'GOOGLE_CREDENTIALS',
  },
};

function state(extraSourceMetadata: readonly unknown[] = []): unknown {
  return {
    sheets: [
      {
        sheetId: stableSheetId('users'),
        title: 'users',
        headers: ['id', 'account_id'],
        metadata: [modelMarker('users'), ...extraSourceMetadata],
        localValues: [
          { rowNumber: 2, value: 'account-1' },
          { rowNumber: 4, value: '' },
        ],
      },
      {
        sheetId: stableSheetId('accounts'),
        title: 'accounts',
        headers: ['id'],
        metadata: [modelMarker('accounts')],
        referenceValues: [{ rowNumber: 2, value: 'account-1' }],
      },
    ],
  };
}

function modelMarker(model: string): unknown {
  return {
    key: 'gstack_model',
    value: `${'c'.repeat(64)}:create_model:${model}:${model}`,
    location: { sheetId: stableSheetId(model) },
  };
}

function operationMarker(value: string): unknown {
  return {
    key: 'gstack_operation',
    value,
    location: { sheetId: stableSheetId('users') },
  };
}
