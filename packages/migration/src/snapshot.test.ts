import { describe, expect, it } from 'vitest';

import type { ApplicationModel } from '@gstack/application';
import {
  createApplicationModelSnapshot,
  parseApplicationModelSnapshot,
  serializeApplicationModelSnapshot,
} from './snapshot.js';

const application: ApplicationModel = {
  schemaVersion: 1,
  name: 'app',
  models: [],
  metadata: { owner: 'team-a' },
};

describe('Application Model Snapshot', () => {
  it('canonical JSONへserializeして復元する', () => {
    const snapshot = createApplicationModelSnapshot(application);
    const serialized = serializeApplicationModelSnapshot(snapshot);
    const parsed = parseApplicationModelSnapshot(serialized);

    expect(parsed).toEqual(snapshot);
    expect(parsed.checksum).toMatch(/^[a-f0-9]{64}$/u);
    expect(Object.isFrozen(parsed.application.metadata)).toBe(true);
  });

  it('JSON key順序に依存せずchecksumを検証する', () => {
    const snapshot = createApplicationModelSnapshot(application);
    const reordered = JSON.stringify({
      checksum: snapshot.checksum,
      application: snapshot.application,
      formatVersion: snapshot.formatVersion,
    });
    expect(parseApplicationModelSnapshot(reordered)).toEqual(snapshot);
  });

  it('改変・未知key・不正JSONを拒否する', () => {
    const snapshot = createApplicationModelSnapshot(application);
    expect(() =>
      parseApplicationModelSnapshot(
        JSON.stringify({
          ...snapshot,
          application: { ...application, name: 'changed' },
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'SNAPSHOT_CHECKSUM_MISMATCH' }));
    expect(() =>
      parseApplicationModelSnapshot(
        JSON.stringify({ ...snapshot, provider: 'google' }),
      ),
    ).toThrow(expect.objectContaining({ code: 'SNAPSHOT_FORMAT_INVALID' }));
    expect(() => parseApplicationModelSnapshot('{')).toThrow(
      expect.objectContaining({ code: 'SNAPSHOT_JSON_INVALID' }),
    );
  });
});
