export type GstackErrorCode =
  | 'PROJECT_NOT_FOUND'
  | 'CONFIG_INVALID'
  | 'SCHEMA_LOAD_FAILED'
  | 'SCHEMA_NOT_FOUND'
  | 'INTERNAL_ERROR';

export type GstackErrorCategory = 'configuration' | 'schema' | 'internal';

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
