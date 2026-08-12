import type { ProviderSecretResolver } from '@gstack/provider';

import {
  googleCredentialRequest,
  type GoogleCredentialRequest,
} from './authentication.js';
import type { GoogleProviderConfig } from './config.js';

export const GOOGLE_DRIVE_FOLDER_MIME_TYPE =
  'application/vnd.google-apps.folder';

export interface GoogleDriveMetadataGateway {
  getFolderMetadata(input: {
    readonly folderId: string;
    readonly credential: GoogleCredentialRequest;
    readonly secrets: ProviderSecretResolver;
  }): Promise<unknown>;
}

export interface GoogleDriveFolderMetadata {
  readonly folderId: string;
  readonly name: string;
  readonly parentIds: readonly string[];
  readonly trashed: boolean;
  readonly capabilities: {
    readonly canAddChildren: boolean;
    readonly canListChildren: boolean;
  };
}

export class GoogleStorageError extends Error {
  public constructor(
    public readonly code:
      'GOOGLE_DRIVE_METADATA_FAILED' | 'GOOGLE_DRIVE_METADATA_INVALID',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GoogleStorageError';
  }
}

export class GoogleStorageReadService {
  public constructor(
    private readonly gateway: GoogleDriveMetadataGateway,
    private readonly config: GoogleProviderConfig,
    private readonly secrets: ProviderSecretResolver,
  ) {}

  async getFolderMetadata(): Promise<GoogleDriveFolderMetadata> {
    let value: unknown;
    try {
      value = await this.gateway.getFolderMetadata({
        folderId: this.config.driveFolderId,
        credential: googleCredentialRequest(
          this.config.authentication.credentialSecret,
          'storage_read',
        ),
        secrets: this.secrets,
      });
    } catch (error: unknown) {
      throw new GoogleStorageError(
        'GOOGLE_DRIVE_METADATA_FAILED',
        'Google Drive folder metadata could not be read.',
        { cause: error },
      );
    }
    return normalizeFolderMetadata(value, this.config.driveFolderId);
  }
}

function normalizeFolderMetadata(
  value: unknown,
  expectedFolderId: string,
): GoogleDriveFolderMetadata {
  if (
    !isRecord(value) ||
    value.id !== expectedFolderId ||
    value.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE ||
    typeof value.name !== 'string' ||
    value.name.length === 0 ||
    typeof value.trashed !== 'boolean' ||
    !Array.isArray(value.parents) ||
    !value.parents.every(isNonEmptyString) ||
    new Set(value.parents).size !== value.parents.length ||
    !isRecord(value.capabilities) ||
    typeof value.capabilities.canAddChildren !== 'boolean' ||
    typeof value.capabilities.canListChildren !== 'boolean'
  ) {
    throw new GoogleStorageError(
      'GOOGLE_DRIVE_METADATA_INVALID',
      'Google Drive folder metadata response is invalid.',
    );
  }
  return Object.freeze({
    folderId: expectedFolderId,
    name: value.name,
    parentIds: Object.freeze([...value.parents].sort()),
    trashed: value.trashed,
    capabilities: Object.freeze({
      canAddChildren: value.capabilities.canAddChildren,
      canListChildren: value.capabilities.canListChildren,
    }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
