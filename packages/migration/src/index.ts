export { createMigrationPlan, operationId } from './plan.js';
export {
  createMigrationRollbackPlan,
  MigrationRollbackError,
} from './rollback.js';
export type { MigrationRollbackPlan } from './rollback.js';
export {
  MigrationApplyError,
  MigrationLockError,
  migrationPlanFingerprint,
  prepareMigrationApply,
  validateMigrationApply,
  withMigrationLock,
} from './apply.js';
export type {
  MigrationApplyApproval,
  MigrationApplyPreflight,
  PreparedMigrationApply,
  MigrationLock,
  MigrationLockLease,
} from './apply.js';
export { applyMigration, MigrationExecutionError } from './apply-engine.js';
export type {
  MigrationApplyDependencies,
  MigrationApplyRequest,
  MigrationApplyResult,
  MigrationOperationContext,
  MigrationOperationExecutor,
} from './apply-engine.js';
export type {
  AddColumnOperation,
  AddIndexOperation,
  AddRelationOperation,
  AlterColumnOperation,
  ColumnChange,
  CreateModelOperation,
  DropColumnOperation,
  DropIndexOperation,
  DropModelOperation,
  DropRelationOperation,
  MigrationOperation,
  MigrationCapabilityStatus,
  MigrationPlan,
  MigrationRisk,
  OperationCapability,
  RenameColumnIntent,
  RenameColumnOperation,
} from './types.js';
export {
  applyCapabilityResults,
  MigrationCapabilityError,
} from './capability.js';
export type {
  EvaluatedOperationCapability,
  OperationCapabilityResult,
} from './capability.js';
export { diffApplicationModels, MigrationDiffError } from './diff.js';
export type { DiffApplicationModelsOptions } from './diff.js';
export {
  createMigrationFile,
  migrationChecksum,
  verifyMigrationChecksum,
} from './file.js';
export type { MigrationFile, MigrationFilePayload } from './file.js';
export {
  loadMigrationFile,
  MIGRATION_FILE_MAX_BYTES,
  MigrationFileSystemError,
} from './file-system.js';
export {
  completeMigration,
  createPendingHistory,
  failMigration,
  MigrationHistoryError,
  recordOperationCompleted,
  recordRollback,
  resumeMigration,
  startMigration,
} from './history.js';
export type { MigrationHistoryEntry, MigrationStatus } from './history.js';
export {
  MigrationHistoryJsonError,
  parseMigrationHistory,
  serializeMigrationHistory,
} from './history-json.js';
export {
  createApplicationModelSnapshot,
  parseApplicationModelSnapshot,
  serializeApplicationModelSnapshot,
  snapshotChecksum,
  SnapshotError,
} from './snapshot.js';
export type {
  ApplicationModelSnapshot,
  ApplicationModelSnapshotPayload,
} from './snapshot.js';
export { MigrationHistoryRepository } from './storage.js';
export type { MigrationHistoryStorage } from './storage.js';
export { MigrationReadService } from './read.js';
export type { MigrationPlanPreview, MigrationStatusSummary } from './read.js';
export {
  MigrationFileError,
  parseMigrationFile,
  serializeMigrationFile,
} from './yaml.js';
