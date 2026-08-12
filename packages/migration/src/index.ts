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
  MigrationPlan,
  MigrationRisk,
  OperationCapability,
  RenameColumnIntent,
  RenameColumnOperation,
} from './types.js';
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
  MigrationFileError,
  parseMigrationFile,
  serializeMigrationFile,
} from './yaml.js';
