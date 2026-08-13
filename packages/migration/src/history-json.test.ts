import { describe, expect, it } from 'vitest';

import { createMigrationFile } from './file.js';
import {
  completeMigration,
  createPendingHistory,
  startMigration,
} from './history.js';
import {
  parseMigrationHistory,
  serializeMigrationHistory,
} from './history-json.js';
import { createApplicationModelSnapshot } from './snapshot.js';

const file = createMigrationFile('20260813_000001', 'initial', []);
const snapshot = createApplicationModelSnapshot({
  schemaVersion: 1,
  name: 'app',
  models: [],
  metadata: {},
});

describe('Migration History JSON', () => {
  it('状態invariantとsnapshot checksumを保ったままround tripする', () => {
    const entry = completeMigration(
      startMigration(createPendingHistory(file), '2026-08-13T00:00:00Z'),
      '2026-08-13T00:00:01Z',
      snapshot,
    );
    const parsed = parseMigrationHistory(serializeMigrationHistory(entry));
    expect(parsed).toEqual(entry);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.appliedSnapshot)).toBe(true);
  });

  it('不正JSON、未知key、状態不整合、snapshot改変を拒否する', () => {
    expect(() => parseMigrationHistory('not-json')).toThrowError(
      expect.objectContaining({ code: 'MIGRATION_HISTORY_JSON_INVALID' }),
    );
    const pending = createPendingHistory(file);
    expect(() =>
      parseMigrationHistory(JSON.stringify({ ...pending, unknown: true })),
    ).toThrowError(
      expect.objectContaining({ code: 'MIGRATION_HISTORY_FORMAT_INVALID' }),
    );
    expect(() =>
      parseMigrationHistory(JSON.stringify({ ...pending, status: 'applied' })),
    ).toThrowError(
      expect.objectContaining({ code: 'MIGRATION_HISTORY_FORMAT_INVALID' }),
    );
    const applied = completeMigration(
      startMigration(pending, '2026-08-13T00:00:00Z'),
      '2026-08-13T00:00:01Z',
      snapshot,
    );
    expect(() =>
      parseMigrationHistory(
        JSON.stringify({
          ...applied,
          appliedSnapshot: { ...snapshot, checksum: 'b'.repeat(64) },
        }),
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'MIGRATION_HISTORY_FORMAT_INVALID' }),
    );
  });
});
