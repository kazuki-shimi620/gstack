import { createMigrationPlan } from './plan.js';
import type {
  MigrationOperation,
  MigrationPlan,
  OperationCapability,
} from './types.js';

export type EvaluatedOperationCapability = Exclude<
  OperationCapability,
  'not_evaluated'
>;

export interface OperationCapabilityResult {
  readonly operationId: string;
  readonly capability: EvaluatedOperationCapability;
}

export class MigrationCapabilityError extends Error {
  public constructor(
    public readonly code:
      | 'CAPABILITY_RESULT_DUPLICATE'
      | 'CAPABILITY_RESULT_MISSING'
      | 'CAPABILITY_RESULT_UNKNOWN',
    message: string,
  ) {
    super(message);
    this.name = 'MigrationCapabilityError';
  }
}

export function applyCapabilityResults(
  plan: MigrationPlan,
  results: readonly OperationCapabilityResult[],
): MigrationPlan {
  const byId = new Map<string, EvaluatedOperationCapability>();
  const knownIds = new Set(plan.operations.map(({ id }) => id));

  for (const result of results) {
    if (!knownIds.has(result.operationId)) {
      throw new MigrationCapabilityError(
        'CAPABILITY_RESULT_UNKNOWN',
        `Capability result references an unknown Operation: ${result.operationId}`,
      );
    }
    if (byId.has(result.operationId)) {
      throw new MigrationCapabilityError(
        'CAPABILITY_RESULT_DUPLICATE',
        `Capability result is duplicated: ${result.operationId}`,
      );
    }
    byId.set(result.operationId, result.capability);
  }

  const missing = plan.operations.find(({ id }) => !byId.has(id));
  if (missing) {
    throw new MigrationCapabilityError(
      'CAPABILITY_RESULT_MISSING',
      `Capability result is missing: ${missing.id}`,
    );
  }

  const operations = plan.operations.map(
    (operation) =>
      Object.freeze({
        ...operation,
        capability: byId.get(operation.id),
      }) as MigrationOperation,
  );
  const evaluated = createMigrationPlan(operations, plan.warnings);
  const unsupported = operations.filter(
    ({ capability }) => capability === 'unsupported',
  );

  return Object.freeze({
    ...evaluated,
    capabilityStatus: unsupported.length === 0 ? 'supported' : 'unsupported',
    applicable: unsupported.length === 0,
    warnings: Object.freeze([
      ...evaluated.warnings,
      ...unsupported.map(
        ({ id }) => `Provider does not support Migration Operation: ${id}`,
      ),
    ]),
  });
}
