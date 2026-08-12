import type { ProviderFactory, ProviderHealth } from '@gstack/provider';

import { GoogleDatabaseError, GoogleDatabaseReadService } from './database.js';
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
  return createGoogleProvider(new DefaultGoogleWorkspaceGateway(sheets));
}

class DefaultGoogleWorkspaceGateway implements GoogleWorkspaceGateway {
  public constructor(private readonly sheets: GoogleSheetsHttpGateway) {}

  async checkHealth(
    input: Parameters<GoogleWorkspaceGateway['checkHealth']>[0],
  ): Promise<ProviderHealth> {
    try {
      await new GoogleDatabaseReadService(
        this.sheets,
        input.config,
        input.secrets,
      ).getMetadata();
      return { status: 'healthy', code: 'GOOGLE_SHEETS_READY' };
    } catch (error: unknown) {
      return classifyHealth(error);
    }
  }
}

function classifyHealth(error: unknown): ProviderHealth {
  const cause = error instanceof GoogleDatabaseError ? error.cause : error;
  if (cause instanceof GoogleHttpError) {
    switch (cause.code) {
      case 'GOOGLE_HTTP_UNAUTHORIZED':
        return { status: 'unavailable', code: 'GOOGLE_AUTHENTICATION_FAILED' };
      case 'GOOGLE_HTTP_FORBIDDEN':
        return { status: 'unavailable', code: 'GOOGLE_PERMISSION_DENIED' };
      case 'GOOGLE_HTTP_NOT_FOUND':
        return { status: 'unavailable', code: 'GOOGLE_SPREADSHEET_NOT_FOUND' };
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
        return { status: 'unavailable', code: 'GOOGLE_RESPONSE_INVALID' };
    }
  }
  return { status: 'unavailable', code: 'GOOGLE_HEALTH_CHECK_FAILED' };
}
