import type {
  MigrationOperation,
  MigrationPlan,
  MigrationRisk,
} from './types.js';

const RISK_ORDER: Readonly<Record<MigrationRisk, number>> = {
  safe: 0,
  caution: 1,
  destructive: 2,
};

export function createMigrationPlan(
  operations: readonly MigrationOperation[],
  warnings: readonly string[] = [],
): MigrationPlan {
  const ordered = [...operations].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const ids = new Set<string>();
  for (const operation of ordered) {
    if (ids.has(operation.id)) {
      throw new Error(`Migration Operation ID must be unique: ${operation.id}`);
    }
    ids.add(operation.id);
  }
  const risk = ordered.reduce<MigrationRisk>(
    (current, operation) =>
      RISK_ORDER[operation.risk] > RISK_ORDER[current]
        ? operation.risk
        : current,
    'safe',
  );
  return Object.freeze({
    operations: Object.freeze(ordered),
    risk,
    destructive: ordered.some((operation) => operation.destructive),
    reversible: ordered.every((operation) => operation.reversible),
    warnings: Object.freeze([...warnings]),
  });
}

export function operationId(
  type: MigrationOperation['type'],
  model: string,
  subject = model,
): string {
  return `${type}:${model}:${subject}`;
}
