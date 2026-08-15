import { MigrationHistoryRepository } from '@gstack/migration';
import type { ProviderSecretResolver } from '@gstack/provider';

import type { GoogleProviderConfig } from './config.js';
import { GoogleOAuthHttpGateway } from './oauth-http.js';
import { FetchGoogleHttpTransport, GoogleHttpExecutor } from './http.js';
import { GoogleDriveMigrationHistoryStorage } from './migration-history.js';
import { GoogleMigrationHistoryHttpGateway } from './migration-history-http.js';
import { GoogleMigrationLockHttpGateway } from './migration-lock-http.js';
import { GoogleSheetsMigrationLock } from './migration-lock.js';
import { GoogleMigrationOperationExecutor } from './migration.js';
import { GoogleSheetsMigrationHttpGateway } from './sheets-migration-http.js';
import { GoogleSheetsAlterColumnService } from './sheets-alter-column.js';
import { GoogleSheetsIndexService } from './sheets-index.js';
import {
  GoogleSheetsAddColumnService,
  GoogleSheetsCreateModelService,
  GoogleSheetsDropColumnService,
  GoogleSheetsDropModelService,
  GoogleSheetsRenameColumnService,
} from './sheets-migration.js';
import type { DefaultGoogleProviderOptions } from './default.js';

export interface DefaultGoogleMigrationComponents {
  readonly history: MigrationHistoryRepository;
  readonly lock: GoogleSheetsMigrationLock;
  readonly executor: GoogleMigrationOperationExecutor;
}

export function createDefaultGoogleMigrationComponents(
  config: GoogleProviderConfig,
  secrets: ProviderSecretResolver,
  options: DefaultGoogleProviderOptions = {},
): DefaultGoogleMigrationComponents {
  const transport = new FetchGoogleHttpTransport(options.fetch);
  const http = new GoogleHttpExecutor(
    transport,
    {
      ...(options.timeoutMilliseconds === undefined
        ? {}
        : { timeoutMilliseconds: options.timeoutMilliseconds }),
      ...(options.maxAttempts === undefined
        ? {}
        : { maxAttempts: options.maxAttempts }),
      ...(options.retryDelaysMilliseconds === undefined
        ? {}
        : { retryDelaysMilliseconds: options.retryDelaysMilliseconds }),
    },
    options.wait,
  );
  const oauth = new GoogleOAuthHttpGateway(http, options.now);
  const sheets = new GoogleSheetsMigrationHttpGateway(http, oauth, options.now);
  const historyGateway = new GoogleMigrationHistoryHttpGateway(
    http,
    oauth,
    options.now,
  );
  const lockGateway = new GoogleMigrationLockHttpGateway(
    http,
    oauth,
    options.now,
  );
  return Object.freeze({
    history: new MigrationHistoryRepository(
      new GoogleDriveMigrationHistoryStorage(historyGateway, config, secrets),
    ),
    lock: new GoogleSheetsMigrationLock(lockGateway, config, secrets),
    executor: new GoogleMigrationOperationExecutor(
      new GoogleSheetsCreateModelService(sheets, config, secrets),
      new GoogleSheetsAddColumnService(sheets, config, secrets),
      new GoogleSheetsRenameColumnService(sheets, config, secrets),
      new GoogleSheetsDropColumnService(sheets, config, secrets),
      new GoogleSheetsDropModelService(sheets, config, secrets),
      new GoogleSheetsAlterColumnService(sheets, config, secrets),
      new GoogleSheetsIndexService(sheets, config, secrets),
    ),
  });
}
