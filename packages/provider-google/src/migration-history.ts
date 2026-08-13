import {
  parseMigrationHistory,
  serializeMigrationHistory,
  type MigrationHistoryEntry,
  type MigrationHistoryStorage,
} from '@gstack/migration';
import type { ProviderSecretResolver } from '@gstack/provider';

import {
  googleCredentialRequest,
  type GoogleCredentialRequest,
} from './authentication.js';
import type { GoogleProviderConfig } from './config.js';

export const GOOGLE_MIGRATION_HISTORY_MARKER = 'migration_history_v1';
export const GOOGLE_MIGRATION_HISTORY_MAX_BYTES = 1_048_576;

export interface GoogleMigrationHistoryFile {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly parentId: string;
}

export interface GoogleMigrationHistoryGateway {
  list(input: HistoryInput): Promise<unknown>;
  read(input: HistoryInput & { readonly fileId: string }): Promise<string>;
  create(
    input: HistoryInput & {
      readonly name: string;
      readonly version: string;
      readonly content: string;
    },
  ): Promise<unknown>;
  update(
    input: HistoryInput & { readonly fileId: string; readonly content: string },
  ): Promise<void>;
}

interface HistoryInput {
  readonly folderId: string;
  readonly credential: GoogleCredentialRequest;
  readonly secrets: ProviderSecretResolver;
}

export class GoogleMigrationHistoryError extends Error {
  public constructor(
    public readonly code:
      | 'GOOGLE_MIGRATION_HISTORY_CONFLICT'
      | 'GOOGLE_MIGRATION_HISTORY_FAILED'
      | 'GOOGLE_MIGRATION_HISTORY_INVALID'
      | 'GOOGLE_MIGRATION_HISTORY_TOO_LARGE',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GoogleMigrationHistoryError';
  }
}

export class GoogleDriveMigrationHistoryStorage implements MigrationHistoryStorage {
  public constructor(
    private readonly gateway: GoogleMigrationHistoryGateway,
    private readonly config: GoogleProviderConfig,
    private readonly secrets: ProviderSecretResolver,
  ) {}

  async get(version: string): Promise<MigrationHistoryEntry | null> {
    const files = await this.files();
    const matches = files.filter((file) => file.version === version);
    if (matches.length > 1) conflict();
    const file = matches[0];
    return file ? this.read(file) : null;
  }

  async list(): Promise<readonly MigrationHistoryEntry[]> {
    const files = await this.files();
    const versions = new Set<string>();
    for (const file of files) {
      if (versions.has(file.version)) conflict();
      versions.add(file.version);
    }
    const entries: MigrationHistoryEntry[] = [];
    for (const file of files) entries.push(await this.read(file));
    return Object.freeze(
      entries.sort((left, right) => left.version.localeCompare(right.version)),
    );
  }

  async save(entry: MigrationHistoryEntry): Promise<void> {
    let content: string;
    try {
      content = serializeMigrationHistory(entry);
    } catch (error: unknown) {
      throw invalid(error);
    }
    if (
      new TextEncoder().encode(content).byteLength >
      GOOGLE_MIGRATION_HISTORY_MAX_BYTES
    ) {
      throw new GoogleMigrationHistoryError(
        'GOOGLE_MIGRATION_HISTORY_TOO_LARGE',
        'Google Migration History exceeds the size limit.',
      );
    }
    const matches = (await this.files()).filter(
      (file) => file.version === entry.version,
    );
    if (matches.length > 1) conflict();
    try {
      if (matches[0]) {
        await this.gateway.update({
          ...this.input(),
          fileId: matches[0].id,
          content,
        });
      } else {
        const created = await this.gateway.create({
          ...this.input(),
          name: historyFileName(entry.version),
          version: entry.version,
          content,
        });
        if (!isRecord(created) || typeof created.id !== 'string' || !created.id)
          invalid();
      }
    } catch (error: unknown) {
      if (error instanceof GoogleMigrationHistoryError) throw error;
      throw failed(error);
    }
  }

  private async files(): Promise<readonly GoogleMigrationHistoryFile[]> {
    let value: unknown;
    try {
      value = await this.gateway.list(this.input());
    } catch (error: unknown) {
      throw failed(error);
    }
    if (!Array.isArray(value)) invalid();
    const ids = new Set<string>();
    return Object.freeze(
      value.map((item) => {
        if (
          !isRecord(item) ||
          typeof item.id !== 'string' ||
          !item.id ||
          typeof item.name !== 'string' ||
          typeof item.version !== 'string' ||
          !/^\d{8}_\d{6}$/u.test(item.version) ||
          item.parentId !== this.config.driveFolderId ||
          item.name !== historyFileName(item.version) ||
          ids.has(item.id)
        )
          invalid();
        ids.add(item.id);
        return Object.freeze({
          id: item.id,
          name: item.name,
          version: item.version,
          parentId: item.parentId,
        });
      }),
    );
  }

  private async read(
    file: GoogleMigrationHistoryFile,
  ): Promise<MigrationHistoryEntry> {
    let content: string;
    try {
      content = await this.gateway.read({ ...this.input(), fileId: file.id });
    } catch (error: unknown) {
      throw failed(error);
    }
    if (
      new TextEncoder().encode(content).byteLength >
      GOOGLE_MIGRATION_HISTORY_MAX_BYTES
    ) {
      throw new GoogleMigrationHistoryError(
        'GOOGLE_MIGRATION_HISTORY_TOO_LARGE',
        'Google Migration History exceeds the size limit.',
      );
    }
    try {
      const entry = parseMigrationHistory(content);
      if (entry.version !== file.version) conflict();
      return entry;
    } catch (error: unknown) {
      if (error instanceof GoogleMigrationHistoryError) throw error;
      throw invalid(error);
    }
  }

  private input(): HistoryInput {
    return {
      folderId: this.config.driveFolderId,
      credential: googleCredentialRequest(
        this.config.authentication.credentialSecret,
        'storage_write',
      ),
      secrets: this.secrets,
    };
  }
}

export function historyFileName(version: string): string {
  return `.gstack-migration-${version}.json`;
}
function conflict(): never {
  throw new GoogleMigrationHistoryError(
    'GOOGLE_MIGRATION_HISTORY_CONFLICT',
    'Google Migration History has conflicting files.',
  );
}
function invalid(cause?: unknown): never {
  throw new GoogleMigrationHistoryError(
    'GOOGLE_MIGRATION_HISTORY_INVALID',
    'Google Migration History is invalid.',
    { cause },
  );
}
function failed(cause: unknown): GoogleMigrationHistoryError {
  return new GoogleMigrationHistoryError(
    'GOOGLE_MIGRATION_HISTORY_FAILED',
    'Google Migration History operation failed.',
    { cause },
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
