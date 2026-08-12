import type { MigrationHistoryEntry } from './history.js';

export interface MigrationHistoryStorage {
  get(version: string): Promise<MigrationHistoryEntry | null>;
  list(): Promise<readonly MigrationHistoryEntry[]>;
  save(entry: MigrationHistoryEntry): Promise<void>;
}

export class MigrationHistoryRepository {
  public constructor(private readonly storage: MigrationHistoryStorage) {}

  public async get(version: string): Promise<MigrationHistoryEntry | null> {
    return this.storage.get(version);
  }

  public async list(): Promise<readonly MigrationHistoryEntry[]> {
    return [...(await this.storage.list())].sort((left, right) =>
      left.version.localeCompare(right.version),
    );
  }

  public async create(entry: MigrationHistoryEntry): Promise<void> {
    const existing = await this.storage.get(entry.version);
    if (existing) {
      throw new Error(`Migration History already exists: ${entry.version}`);
    }
    await this.storage.save(entry);
  }

  public async update(entry: MigrationHistoryEntry): Promise<void> {
    const existing = await this.storage.get(entry.version);
    if (!existing) {
      throw new Error(`Migration History does not exist: ${entry.version}`);
    }
    if (existing.checksum !== entry.checksum) {
      throw new Error(
        `Migration History checksum cannot change: ${entry.version}`,
      );
    }
    await this.storage.save(entry);
  }
}
