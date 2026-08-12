import { createHash } from 'node:crypto';

import type { MigrationFile } from './file.js';
import { verifyMigrationChecksum } from './file.js';
import type { MigrationPlan } from './types.js';

export interface MigrationApplyApproval {
  readonly token: string;
  readonly allowDestructive: boolean;
}

export interface MigrationApplyPreflight {
  readonly version: string;
  readonly checksum: string;
  readonly planFingerprint: string;
  readonly lockKey: string;
  readonly operationIds: readonly string[];
}

export interface MigrationLockLease {
  release(): Promise<void>;
}

export interface MigrationLock {
  acquire(key: string): Promise<MigrationLockLease | null>;
}

export class MigrationApplyError extends Error {
  public constructor(
    public readonly code:
      | 'MIGRATION_APPROVAL_INVALID'
      | 'MIGRATION_CHECKSUM_INVALID'
      | 'MIGRATION_DESTRUCTIVE_NOT_ALLOWED'
      | 'MIGRATION_PLAN_MISMATCH'
      | 'MIGRATION_PLAN_NOT_APPLICABLE',
    message: string,
  ) {
    super(message);
    this.name = 'MigrationApplyError';
  }
}

export function migrationPlanFingerprint(
  file: MigrationFile,
  plan: MigrationPlan,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: file.version,
        checksum: file.checksum,
        operations: plan.operations.map(({ id, capability }) => ({
          id,
          capability,
        })),
      }),
      'utf8',
    )
    .digest('hex');
}

export function validateMigrationApply(
  file: MigrationFile,
  plan: MigrationPlan,
  providerContext: string,
  approval: MigrationApplyApproval,
): MigrationApplyPreflight {
  if (!verifyMigrationChecksum(file)) {
    throw new MigrationApplyError(
      'MIGRATION_CHECKSUM_INVALID',
      'Migration checksum is invalid.',
    );
  }
  const fileOperations = file.operations.map(({ id }) => id);
  const planOperations = plan.operations.map(({ id }) => id);
  if (
    fileOperations.length !== planOperations.length ||
    fileOperations.some((id, index) => id !== planOperations[index])
  ) {
    throw new MigrationApplyError(
      'MIGRATION_PLAN_MISMATCH',
      'Migration Plan does not match the Migration File.',
    );
  }
  if (!plan.applicable || plan.capabilityStatus !== 'supported') {
    throw new MigrationApplyError(
      'MIGRATION_PLAN_NOT_APPLICABLE',
      'Migration Plan is not applicable.',
    );
  }
  if (plan.destructive && !approval.allowDestructive) {
    throw new MigrationApplyError(
      'MIGRATION_DESTRUCTIVE_NOT_ALLOWED',
      'Destructive Migration requires explicit approval.',
    );
  }
  const planFingerprint = migrationPlanFingerprint(file, plan);
  if (approval.token !== planFingerprint) {
    throw new MigrationApplyError(
      'MIGRATION_APPROVAL_INVALID',
      'Migration approval does not match the evaluated Plan.',
    );
  }
  if (!providerContext.trim()) {
    throw new MigrationApplyError(
      'MIGRATION_PLAN_MISMATCH',
      'Migration Provider context is required.',
    );
  }
  return Object.freeze({
    version: file.version,
    checksum: file.checksum,
    planFingerprint,
    lockKey: `${providerContext}:${file.version}`,
    operationIds: Object.freeze(planOperations),
  });
}
