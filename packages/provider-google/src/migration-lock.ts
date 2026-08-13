import { createHash } from 'node:crypto';

import type { MigrationLock, MigrationLockLease } from '@gstack/migration';
import type { ProviderSecretResolver } from '@gstack/provider';

import { googleCredentialRequest } from './authentication.js';
import type { GoogleProviderConfig } from './config.js';

export interface GoogleMigrationLockGateway {
  inspect(input: LockInput): Promise<unknown>;
  add(
    input: LockInput & { readonly lockId: string; readonly sheetId: number },
  ): Promise<'acquired' | 'conflict'>;
  remove(input: LockInput & { readonly lockId: string }): Promise<void>;
}

interface LockInput {
  readonly spreadsheetId: string;
  readonly secrets: ProviderSecretResolver;
  readonly credential: ReturnType<typeof googleCredentialRequest>;
}

export class GoogleMigrationLockError extends Error {
  public constructor(
    public readonly code:
      'GOOGLE_MIGRATION_LOCK_FAILED' | 'GOOGLE_MIGRATION_LOCK_STATE_INVALID',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GoogleMigrationLockError';
  }
}

export class GoogleSheetsMigrationLock implements MigrationLock {
  public constructor(
    private readonly gateway: GoogleMigrationLockGateway,
    private readonly config: GoogleProviderConfig,
    private readonly secrets: ProviderSecretResolver,
  ) {}

  async acquire(key: string): Promise<MigrationLockLease | null> {
    const lockId = googleMigrationLockId(key);
    const common = {
      spreadsheetId: this.config.spreadsheetId,
      secrets: this.secrets,
      credential: googleCredentialRequest(
        this.config.authentication.credentialSecret,
        'database_write',
      ),
    };
    let state: unknown;
    try {
      state = await this.gateway.inspect(common);
    } catch (error: unknown) {
      throw failed(error);
    }
    const inspected = normalizeLockState(state);
    if (inspected.lockIds.includes(lockId)) return null;
    let result: 'acquired' | 'conflict';
    try {
      result = await this.gateway.add({
        ...common,
        lockId,
        sheetId: inspected.sheetId,
      });
    } catch (error: unknown) {
      throw failed(error);
    }
    if (result === 'conflict') return null;
    let released = false;
    return Object.freeze({
      release: async () => {
        if (released) return;
        try {
          await this.gateway.remove({ ...common, lockId });
          released = true;
        } catch (error: unknown) {
          throw failed(error);
        }
      },
    });
  }
}

export function googleMigrationLockId(key: string): string {
  if (!key.trim()) return invalid();
  return `gstack_lock_${createHash('sha256').update(key, 'utf8').digest('hex')}`;
}

function normalizeLockState(value: unknown): {
  readonly sheetId: number;
  readonly lockIds: readonly string[];
} {
  if (
    !isRecord(value) ||
    !Array.isArray(value.sheetIds) ||
    !Array.isArray(value.lockIds)
  )
    return invalid();
  if (
    value.sheetIds.length === 0 ||
    value.sheetIds.some(
      (id) => !Number.isSafeInteger(id) || (id as number) < 0,
    ) ||
    new Set(value.sheetIds).size !== value.sheetIds.length ||
    value.lockIds.some((id) => typeof id !== 'string' || !id) ||
    new Set(value.lockIds).size !== value.lockIds.length
  )
    return invalid();
  return Object.freeze({
    sheetId: Math.min(...(value.sheetIds as number[])),
    lockIds: Object.freeze([...(value.lockIds as string[])].sort()),
  });
}

function invalid(): never {
  throw new GoogleMigrationLockError(
    'GOOGLE_MIGRATION_LOCK_STATE_INVALID',
    'Google Migration lock state is invalid.',
  );
}

function failed(cause: unknown): GoogleMigrationLockError {
  return new GoogleMigrationLockError(
    'GOOGLE_MIGRATION_LOCK_FAILED',
    'Google Migration lock operation failed.',
    { cause },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
