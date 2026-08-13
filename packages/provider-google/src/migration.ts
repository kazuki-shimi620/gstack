import type {
  EvaluatedOperationCapability,
  MigrationOperationContext,
  MigrationOperationExecutor,
  MigrationOperation,
  OperationCapabilityResult,
} from '@gstack/migration';

import { googleProviderManifest } from './provider.js';
import type { GoogleSheetsCreateModelService } from './sheets-migration.js';

export class GoogleMigrationOperationExecutor implements MigrationOperationExecutor {
  public constructor(
    private readonly createModel: GoogleSheetsCreateModelService,
  ) {}

  async execute(
    operation: MigrationOperation,
    context: MigrationOperationContext,
  ): Promise<void> {
    switch (operation.type) {
      case 'create_model':
        await this.createModel.execute(operation, context.migrationChecksum);
        return;
      default:
        throw new GoogleMigrationOperationError(
          'GOOGLE_MIGRATION_OPERATION_UNSUPPORTED',
          `Google Provider does not support Migration Operation: ${operation.type}`,
        );
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
