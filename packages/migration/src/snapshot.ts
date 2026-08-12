import { createHash } from 'node:crypto';

import type { ApplicationModel } from '@gstack/application';

export interface ApplicationModelSnapshotPayload {
  readonly formatVersion: 1;
  readonly application: ApplicationModel;
}

export interface ApplicationModelSnapshot extends ApplicationModelSnapshotPayload {
  readonly checksum: string;
}

export class SnapshotError extends Error {
  public constructor(
    public readonly code:
      | 'SNAPSHOT_JSON_INVALID'
      | 'SNAPSHOT_FORMAT_INVALID'
      | 'SNAPSHOT_CHECKSUM_MISMATCH',
    message: string,
  ) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export function createApplicationModelSnapshot(
  application: ApplicationModel,
): ApplicationModelSnapshot {
  const payload = { formatVersion: 1 as const, application };
  return deepFreeze({ ...payload, checksum: snapshotChecksum(payload) });
}

export function serializeApplicationModelSnapshot(
  snapshot: ApplicationModelSnapshot,
): string {
  return canonicalJson(snapshot);
}

export function parseApplicationModelSnapshot(
  content: string,
): ApplicationModelSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch {
    throw new SnapshotError(
      'SNAPSHOT_JSON_INVALID',
      'Snapshot JSON is invalid.',
    );
  }
  validateSnapshot(value);
  const { checksum, ...payload } = value;
  if (checksum !== snapshotChecksum(payload)) {
    throw new SnapshotError(
      'SNAPSHOT_CHECKSUM_MISMATCH',
      'Application Model snapshot checksum does not match.',
    );
  }
  return deepFreeze(value);
}

export function snapshotChecksum(
  payload: ApplicationModelSnapshotPayload,
): string {
  return createHash('sha256')
    .update(canonicalJson(payload), 'utf8')
    .digest('hex');
}

function validateSnapshot(
  value: unknown,
): asserts value is ApplicationModelSnapshot {
  if (!record(value)) invalid();
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'application,checksum,formatVersion') invalid();
  if (value.formatVersion !== 1) invalid();
  if (
    typeof value.checksum !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value.checksum)
  )
    invalid();
  if (!record(value.application)) invalid();
  if (value.application.schemaVersion !== 1) invalid();
  if (
    typeof value.application.name !== 'string' ||
    !Array.isArray(value.application.models)
  )
    invalid();
  if (!record(value.application.metadata)) invalid();
}

function invalid(): never {
  throw new SnapshotError(
    'SNAPSHOT_FORMAT_INVALID',
    'Application Model snapshot format is invalid.',
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (record(value)) {
    return `{${Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
