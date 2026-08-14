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
  | 'GENERATOR_NOT_CONFIGURED'
  | 'GENERATOR_SCHEMA_INVALID'
  | 'GENERATION_FAILED'
  | 'INTERNAL_ERROR';

export type GstackErrorCategory =
  | 'configuration'
  | 'schema'
  | 'provider'
  | 'migration'
  | 'generator'
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
