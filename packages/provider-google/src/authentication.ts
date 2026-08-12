export type GoogleProviderOperation =
  | 'health'
  | 'database_read'
  | 'database_write'
  | 'storage_read'
  | 'storage_write'
  | 'script_read'
  | 'script_write'
  | 'deploy';

export const GOOGLE_OAUTH_SCOPES: Readonly<
  Record<GoogleProviderOperation, readonly string[]>
> = Object.freeze({
  health: Object.freeze([
    'https://www.googleapis.com/auth/spreadsheets.readonly',
  ]),
  database_read: Object.freeze([
    'https://www.googleapis.com/auth/spreadsheets.readonly',
  ]),
  database_write: Object.freeze([
    'https://www.googleapis.com/auth/spreadsheets',
  ]),
  storage_read: Object.freeze([
    'https://www.googleapis.com/auth/drive.metadata.readonly',
  ]),
  storage_write: Object.freeze(['https://www.googleapis.com/auth/drive.file']),
  script_read: Object.freeze([
    'https://www.googleapis.com/auth/script.projects.readonly',
  ]),
  script_write: Object.freeze([
    'https://www.googleapis.com/auth/script.projects',
  ]),
  deploy: Object.freeze(['https://www.googleapis.com/auth/script.deployments']),
});

export interface GoogleCredentialRequest {
  readonly credentialSecret: string;
  readonly scopes: readonly string[];
}

export function googleCredentialRequest(
  credentialSecret: string,
  operation: GoogleProviderOperation,
): GoogleCredentialRequest {
  return Object.freeze({
    credentialSecret,
    scopes: GOOGLE_OAUTH_SCOPES[operation],
  });
}
