import type {
  EvaluatedOperationCapability,
  MigrationOperationContext,
  MigrationOperationExecutor,
  MigrationOperation,
  OperationCapabilityResult,
} from '@gstack/migration';

import { googleProviderManifest } from './provider.js';
import type { GoogleSheetsAlterColumnService } from './sheets-alter-column.js';
import type { GoogleSheetsIndexService } from './sheets-index.js';
import type { GoogleSheetsRelationService } from './sheets-relation.js';
import type {
  GoogleSheetsAddColumnService,
  GoogleSheetsCreateModelService,
  GoogleSheetsDropColumnService,
  GoogleSheetsDropModelService,
  GoogleSheetsRenameColumnService,
} from './sheets-migration.js';

export class GoogleMigrationOperationExecutor implements MigrationOperationExecutor {
  public constructor(
    private readonly createModel: GoogleSheetsCreateModelService,
    private readonly addColumn: GoogleSheetsAddColumnService,
    private readonly renameColumn: GoogleSheetsRenameColumnService,
    private readonly dropColumn: GoogleSheetsDropColumnService,
    private readonly dropModel: GoogleSheetsDropModelService,
    private readonly alterColumn: GoogleSheetsAlterColumnService,
    private readonly index: GoogleSheetsIndexService,
    private readonly relation: GoogleSheetsRelationService,
  ) {}

  async execute(
    operation: MigrationOperation,
    context: MigrationOperationContext,
  ): Promise<void> {
    switch (operation.type) {
      case 'create_model':
        await this.createModel.execute(operation, context.migrationChecksum);
        return;
      case 'add_column':
        await this.addColumn.execute(operation, context.migrationChecksum);
        return;
      case 'rename_column':
        await this.renameColumn.execute(operation, context.migrationChecksum);
        return;
      case 'drop_column':
        await this.dropColumn.execute(operation, context.migrationChecksum);
        return;
      case 'drop_model':
        await this.dropModel.execute(operation, context.migrationChecksum);
        return;
      case 'alter_column':
        await this.alterColumn.execute(operation, context.migrationChecksum);
        return;
      case 'add_index':
      case 'drop_index':
        await this.index.execute(operation, context.migrationChecksum);
        return;
      case 'add_relation':
      case 'drop_relation':
        await this.relation.execute(operation, context.migrationChecksum);
        return;
    }
  }
}

export class GoogleMigrationOperationError extends Error {
  public constructor(
    public readonly code: 'GOOGLE_MIGRATION_OPERATION_UNSUPPORTED',
    message: string,
  ) {
    super(message);
    this.name = 'GoogleMigrationOperationError';
  }
}

export function evaluateGoogleMigrationCapabilities(
  operations: readonly MigrationOperation[],
): readonly OperationCapabilityResult[] {
  return Object.freeze(
    operations.map((operation) =>
      Object.freeze({
        operationId: operation.id,
        capability: googleProviderManifest.migrationSupport[
          operation.type
        ] as EvaluatedOperationCapability,
      }),
    ),
  );
}
