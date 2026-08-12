import type { ProviderSecretResolver } from '@gstack/provider';

import {
  googleCredentialRequest,
  type GoogleCredentialRequest,
} from './authentication.js';
import type { GoogleProviderConfig } from './config.js';

export interface GoogleScriptMetadataGateway {
  getProjectMetadata(input: {
    readonly scriptId: string;
    readonly credential: GoogleCredentialRequest;
    readonly secrets: ProviderSecretResolver;
  }): Promise<unknown>;
}

export interface GoogleScriptProjectMetadata {
  readonly scriptId: string;
  readonly title: string;
  readonly parentId: string | null;
  readonly createTime: string;
  readonly updateTime: string;
}

export class GoogleScriptError extends Error {
  public constructor(
    public readonly code:
      'GOOGLE_SCRIPT_METADATA_FAILED' | 'GOOGLE_SCRIPT_METADATA_INVALID',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GoogleScriptError';
  }
}

export class GoogleScriptReadService {
  public constructor(
    private readonly gateway: GoogleScriptMetadataGateway,
    private readonly config: GoogleProviderConfig,
    private readonly secrets: ProviderSecretResolver,
  ) {}

  async getProjectMetadata(): Promise<GoogleScriptProjectMetadata> {
    let value: unknown;
    try {
      value = await this.gateway.getProjectMetadata({
        scriptId: this.config.appsScriptProjectId,
        credential: googleCredentialRequest(
          this.config.authentication.credentialSecret,
          'script_read',
        ),
        secrets: this.secrets,
      });
    } catch (error: unknown) {
      throw new GoogleScriptError(
        'GOOGLE_SCRIPT_METADATA_FAILED',
        'Google Apps Script project metadata could not be read.',
        { cause: error },
      );
    }
    if (
      !isRecord(value) ||
      value.scriptId !== this.config.appsScriptProjectId ||
      typeof value.title !== 'string' ||
      value.title.length === 0 ||
      !(value.parentId === null || isNonEmptyString(value.parentId)) ||
      !isTimestamp(value.createTime) ||
      !isTimestamp(value.updateTime)
    ) {
      throw new GoogleScriptError(
        'GOOGLE_SCRIPT_METADATA_INVALID',
        'Google Apps Script project metadata response is invalid.',
      );
    }
    return Object.freeze({
      scriptId: value.scriptId,
      title: value.title,
      parentId: value.parentId,
      createTime: new Date(value.createTime).toISOString(),
      updateTime: new Date(value.updateTime).toISOString(),
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(new Date(value).valueOf());
}
