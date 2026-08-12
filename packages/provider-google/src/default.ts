import type { ProviderFactory, ProviderHealth } from '@gstack/provider';

import { GoogleDatabaseError, GoogleDatabaseReadService } from './database.js';
import { GoogleDriveHttpGateway } from './drive-http.js';
import {
  FetchGoogleHttpTransport,
  GoogleHttpError,
  GoogleHttpExecutor,
} from './http.js';
import { GoogleOAuthHttpGateway } from './oauth-http.js';
import {
  createGoogleProvider,
  type GoogleWorkspaceGateway,
} from './provider.js';
import { GoogleSheetsHttpGateway } from './sheets-http.js';
import { GoogleScriptHttpGateway } from './script-http.js';
import { GoogleScriptError, GoogleScriptReadService } from './script.js';
import { GoogleStorageError, GoogleStorageReadService } from './storage.js';

export interface DefaultGoogleProviderOptions {
  readonly fetch?: typeof fetch;
  readonly timeoutMilliseconds?: number;
  readonly maxAttempts?: number;
  readonly retryDelaysMilliseconds?: readonly number[];
  readonly wait?: (milliseconds: number) => Promise<void>;
  readonly now?: () => Date;
}

export function createDefaultGoogleProvider(
  options: DefaultGoogleProviderOptions = {},
): ProviderFactory {
  const transport = new FetchGoogleHttpTransport(options.fetch);
  const http = new GoogleHttpExecutor(
    transport,
    {
      ...(options.timeoutMilliseconds === undefined
        ? {}
        : { timeoutMilliseconds: options.timeoutMilliseconds }),
      ...(options.maxAttempts === undefined
        ? {}
        : { maxAttempts: options.maxAttempts }),
      ...(options.retryDelaysMilliseconds === undefined
        ? {}
        : { retryDelaysMilliseconds: options.retryDelaysMilliseconds }),
    },
    options.wait,
  );
  const oauth = new GoogleOAuthHttpGateway(http, options.now);
  const sheets = new GoogleSheetsHttpGateway(http, oauth, options.now);
  const drive = new GoogleDriveHttpGateway(http, oauth, options.now);
  const script = new GoogleScriptHttpGateway(http, oauth, options.now);
  return createGoogleProvider(
    new DefaultGoogleWorkspaceGateway(sheets, drive, script),
  );
}

export class DefaultGoogleWorkspaceGateway implements GoogleWorkspaceGateway {
  public constructor(
    private readonly sheets: GoogleSheetsHttpGateway,
    private readonly drive: GoogleDriveHttpGateway,
    private readonly script: GoogleScriptHttpGateway,
  ) {}

  async checkHealth(
    input: Parameters<GoogleWorkspaceGateway['checkHealth']>[0],
  ): Promise<ProviderHealth> {
    try {
      await new GoogleDatabaseReadService(
        this.sheets,
        input.config,
        input.secrets,
      ).getMetadata();
      await new GoogleStorageReadService(
        this.drive,
        input.config,
        input.secrets,
      ).getFolderMetadata();
      await new GoogleScriptReadService(
        this.script,
        input.config,
        input.secrets,
      ).getProjectMetadata();
      return { status: 'healthy', code: 'GOOGLE_WORKSPACE_READY' };
    } catch (error: unknown) {
      return classifyHealth(error);
    }
  }
}

function classifyHealth(error: unknown): ProviderHealth {
  const cause =
    error instanceof GoogleDatabaseError ||
    error instanceof GoogleStorageError ||
    error instanceof GoogleScriptError
      ? error.cause
      : error;
  if (cause instanceof GoogleHttpError) {
    switch (cause.code) {
      case 'GOOGLE_HTTP_UNAUTHORIZED':
        return { status: 'unavailable', code: 'GOOGLE_AUTHENTICATION_FAILED' };
      case 'GOOGLE_HTTP_FORBIDDEN':
        return { status: 'unavailable', code: 'GOOGLE_PERMISSION_DENIED' };
      case 'GOOGLE_HTTP_NOT_FOUND':
        return { status: 'unavailable', code: resourceNotFoundCode(error) };
      case 'GOOGLE_HTTP_RATE_LIMITED':
        return { status: 'degraded', code: 'GOOGLE_RATE_LIMITED' };
      case 'GOOGLE_HTTP_UNAVAILABLE':
        return { status: 'degraded', code: 'GOOGLE_API_UNAVAILABLE' };
      case 'GOOGLE_HTTP_RESPONSE_TOO_LARGE':
      case 'GOOGLE_HTTP_FAILED':
        return { status: 'unavailable', code: 'GOOGLE_RESPONSE_INVALID' };
    }
  }
  if (
    cause &&
    typeof cause === 'object' &&
    'code' in cause &&
    typeof cause.code === 'string'
  ) {
    switch (cause.code) {
      case 'GOOGLE_CREDENTIAL_NOT_FOUND':
        return { status: 'unavailable', code: 'GOOGLE_CREDENTIAL_NOT_FOUND' };
      case 'GOOGLE_CREDENTIAL_INVALID':
      case 'GOOGLE_ACCESS_CREDENTIAL_INVALID':
        return { status: 'unavailable', code: 'GOOGLE_CREDENTIAL_INVALID' };
      case 'GOOGLE_CREDENTIAL_REFRESH_FAILED':
        return { status: 'unavailable', code: 'GOOGLE_AUTHENTICATION_FAILED' };
      case 'GOOGLE_SPREADSHEET_METADATA_INVALID':
      case 'GOOGLE_DRIVE_METADATA_INVALID':
      case 'GOOGLE_SCRIPT_METADATA_INVALID':
        return { status: 'unavailable', code: 'GOOGLE_RESPONSE_INVALID' };
    }
  }
  return { status: 'unavailable', code: 'GOOGLE_HEALTH_CHECK_FAILED' };
}

function resourceNotFoundCode(error: unknown): string {
  if (error instanceof GoogleStorageError) {
    return 'GOOGLE_DRIVE_FOLDER_NOT_FOUND';
  }
  if (error instanceof GoogleScriptError) {
    return 'GOOGLE_SCRIPT_PROJECT_NOT_FOUND';
  }
  return 'GOOGLE_SPREADSHEET_NOT_FOUND';
}
