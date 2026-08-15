export type GstackErrorCode =
  | 'PROJECT_NOT_FOUND'
  | 'CONFIG_INVALID'
  | 'SCHEMA_LOAD_FAILED'
  | 'SCHEMA_NOT_FOUND'
  | 'PROVIDER_NOT_AVAILABLE'
  | 'PROVIDER_NOT_FOUND'
  | 'PROVIDER_INSPECTION_NOT_AVAILABLE'
  | 'PROVIDER_INITIALIZATION_FAILED'
  | 'PROVIDER_OPERATION_FAILED'
  | 'PROVIDER_RESULT_INVALID'
  | 'PROVIDER_DISPOSAL_FAILED'
  | 'MIGRATION_NOT_AVAILABLE'
  | 'MIGRATION_SCHEMA_INVALID'
  | 'MIGRATION_FILE_NOT_FOUND'
  | 'MIGRATION_FILE_PATH_INVALID'
  | 'MIGRATION_FILE_TOO_LARGE'
  | 'MIGRATION_FILE_YAML_INVALID'
  | 'MIGRATION_FILE_INVALID'
  | 'MIGRATION_CHECKSUM_MISMATCH'
  | 'MIGRATION_APPROVAL_INVALID'
  | 'MIGRATION_CHECKSUM_INVALID'
  | 'MIGRATION_DESTRUCTIVE_NOT_ALLOWED'
  | 'MIGRATION_PLAN_MISMATCH'
  | 'MIGRATION_PLAN_NOT_APPLICABLE'
  | 'MIGRATION_DRY_RUN_REQUIRED'
  | 'MIGRATION_OPTIONS_INVALID'
  | 'MIGRATION_LOCK_INVALID'
  | 'MIGRATION_LOCK_UNAVAILABLE'
  | 'MIGRATION_ALREADY_IN_PROGRESS'
  | 'MIGRATION_HISTORY_CONFLICT'
  | 'MIGRATION_RESUME_REQUIRED'
  | 'MIGRATION_ROLLBACK_PROGRESS_INVALID'
  | 'MIGRATION_ROLLBACK_SNAPSHOT_INVALID'
  | 'MIGRATION_ROLLBACK_HISTORY_CONFLICT'
  | 'MIGRATION_ROLLBACK_NOT_LATEST'
  | 'MIGRATION_ROLLBACK_DRY_RUN_REQUIRED'
  | 'MIGRATION_IRREVERSIBLE'
  | 'PROVIDER_OPERATION_FAILED'
  | 'GENERATOR_NOT_CONFIGURED'
  | 'GENERATOR_SCHEMA_INVALID'
  | 'GENERATION_FAILED'
  | 'DEPLOY_NOT_AVAILABLE'
  | 'DEPLOY_DRY_RUN_REQUIRED'
  | 'DEPLOY_BUILD_INVALID'
  | 'DEPLOY_APPROVAL_REQUIRED'
  | 'DEPLOY_APPROVAL_INVALID'
  | 'DEPLOY_FAILED'
  | 'DEPLOY_MIGRATION_NOT_READY'
  | 'INTERNAL_ERROR';

export type GstackErrorCategory =
  | 'configuration'
  | 'schema'
  | 'provider'
  | 'migration'
  | 'generator'
  | 'deploy'
  | 'internal';

export interface GstackErrorDetails {
  readonly code: GstackErrorCode;
  readonly category: GstackErrorCategory;
  readonly message: string;
  readonly path?: string;
  readonly hint?: string;
  readonly issues?: readonly GstackErrorIssue[];
}

export interface GstackErrorIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export class GstackError extends Error {
  public readonly details: GstackErrorDetails;

  public constructor(details: GstackErrorDetails, options?: ErrorOptions) {
    super(details.message, options);
    this.name = 'GstackError';
    this.details = details;
  }
}

export function getErrorDetails(error: unknown): GstackErrorDetails {
  if (error instanceof GstackError) {
    return error.details;
  }
  return {
    code: 'INTERNAL_ERROR',
    category: 'internal',
    message: 'An unexpected gstack error occurred.',
  };
}
