export { createMigrationPlan, operationId } from './plan.js';
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
  completeMigration,
  createPendingHistory,
  failMigration,
  MigrationHistoryError,
  recordOperationCompleted,
  recordRollback,
  startMigration,
} from './history.js';
export type { MigrationHistoryEntry, MigrationStatus } from './history.js';
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
export {
  MigrationFileError,
  parseMigrationFile,
  serializeMigrationFile,
} from './yaml.js';
