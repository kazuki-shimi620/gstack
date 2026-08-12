import type {
  EvaluatedOperationCapability,
  MigrationOperation,
  OperationCapabilityResult,
} from '@gstack/migration';

import { googleProviderManifest } from './provider.js';

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
