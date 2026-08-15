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

export type GoogleScriptFileType = 'SERVER_JS' | 'HTML' | 'JSON';

export interface GoogleScriptFile {
  readonly name: string;
  readonly type: GoogleScriptFileType;
  readonly source: string;
}

export interface GoogleScriptContentGateway {
  getProjectContent(input: {
    readonly scriptId: string;
    readonly credential: GoogleCredentialRequest;
    readonly secrets: ProviderSecretResolver;
  }): Promise<unknown>;
  updateProjectContent(input: {
    readonly scriptId: string;
    readonly files: readonly GoogleScriptFile[];
    readonly credential: GoogleCredentialRequest;
    readonly secrets: ProviderSecretResolver;
  }): Promise<unknown>;
}

export const GSTACK_SCRIPT_MARKER_FILE = 'gstack_managed';
export const GSTACK_SCRIPT_MARKER_SOURCE =
  '// Managed by gstack. Manual changes to generated files are overwritten.\n';

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
      | 'GOOGLE_SCRIPT_METADATA_FAILED'
      | 'GOOGLE_SCRIPT_METADATA_INVALID'
      | 'GOOGLE_SCRIPT_CONTENT_FAILED'
      | 'GOOGLE_SCRIPT_CONTENT_INVALID'
      | 'GOOGLE_SCRIPT_PROJECT_UNMANAGED',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GoogleScriptError';
  }
}

export class GoogleScriptWriteService {
  public constructor(
    private readonly gateway: GoogleScriptContentGateway,
    private readonly config: GoogleProviderConfig,
    private readonly secrets: ProviderSecretResolver,
  ) {}

  async replaceManagedContent(
    files: readonly GoogleScriptFile[],
  ): Promise<readonly GoogleScriptFile[]> {
    const desired = validateScriptFiles(files);
    if (!hasManagementMarker(desired)) {
      throw new GoogleScriptError(
        'GOOGLE_SCRIPT_CONTENT_INVALID',
        'Google Apps Script content must include the gstack marker.',
      );
    }

    let current: readonly GoogleScriptFile[];
    try {
      current = parseProjectContent(
        await this.gateway.getProjectContent({
          scriptId: this.config.appsScriptProjectId,
          credential: googleCredentialRequest(
            this.config.authentication.credentialSecret,
            'script_read',
          ),
          secrets: this.secrets,
        }),
      );
    } catch (error: unknown) {
      if (error instanceof GoogleScriptError) throw error;
      throw new GoogleScriptError(
        'GOOGLE_SCRIPT_CONTENT_FAILED',
        'Google Apps Script project content could not be read.',
        { cause: error },
      );
    }
    if (!hasManagementMarker(current)) {
      throw new GoogleScriptError(
        'GOOGLE_SCRIPT_PROJECT_UNMANAGED',
        'Google Apps Script project is not managed by gstack.',
      );
    }

    let updated: readonly GoogleScriptFile[];
    try {
      updated = parseProjectContent(
        await this.gateway.updateProjectContent({
          scriptId: this.config.appsScriptProjectId,
          files: desired,
          credential: googleCredentialRequest(
            this.config.authentication.credentialSecret,
            'script_write',
          ),
          secrets: this.secrets,
        }),
      );
    } catch (error: unknown) {
      if (error instanceof GoogleScriptError) throw error;
      throw new GoogleScriptError(
        'GOOGLE_SCRIPT_CONTENT_FAILED',
        'Google Apps Script project content could not be updated.',
        { cause: error },
      );
    }
    if (!sameFiles(desired, updated)) {
      throw new GoogleScriptError(
        'GOOGLE_SCRIPT_CONTENT_INVALID',
        'Google Apps Script project content response is invalid.',
      );
    }
    return updated;
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
    const parentId = isRecord(value) ? (value.parentId ?? null) : null;
    if (
      !isRecord(value) ||
      value.scriptId !== this.config.appsScriptProjectId ||
      typeof value.title !== 'string' ||
      value.title.length === 0 ||
      !(parentId === null || isNonEmptyString(parentId)) ||
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
      parentId,
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

function parseProjectContent(value: unknown): readonly GoogleScriptFile[] {
  if (!isRecord(value) || !Array.isArray(value.files)) {
    throw new GoogleScriptError(
      'GOOGLE_SCRIPT_CONTENT_INVALID',
      'Google Apps Script project content response is invalid.',
    );
  }
  return validateScriptFiles(value.files);
}

function validateScriptFiles(
  value: readonly unknown[],
): readonly GoogleScriptFile[] {
  const files: GoogleScriptFile[] = [];
  const names = new Set<string>();
  let manifests = 0;
  for (const item of value) {
    if (
      !isRecord(item) ||
      !isNonEmptyString(item.name) ||
      !['SERVER_JS', 'HTML', 'JSON'].includes(String(item.type)) ||
      typeof item.source !== 'string' ||
      names.has(item.name)
    ) {
      throw new GoogleScriptError(
        'GOOGLE_SCRIPT_CONTENT_INVALID',
        'Google Apps Script project content is invalid.',
      );
    }
    names.add(item.name);
    if (item.type === 'JSON') manifests += 1;
    files.push(
      Object.freeze({
        name: item.name,
        type: item.type as GoogleScriptFileType,
        source: item.source,
      }),
    );
  }
  if (files.length === 0 || manifests !== 1) {
    throw new GoogleScriptError(
      'GOOGLE_SCRIPT_CONTENT_INVALID',
      'Google Apps Script content must include exactly one manifest.',
    );
  }
  return Object.freeze(
    files.sort((left, right) => left.name.localeCompare(right.name)),
  );
}

function hasManagementMarker(files: readonly GoogleScriptFile[]): boolean {
  return files.some(
    (file) =>
      file.name === GSTACK_SCRIPT_MARKER_FILE &&
      file.type === 'SERVER_JS' &&
      file.source === GSTACK_SCRIPT_MARKER_SOURCE,
  );
}

function sameFiles(
  left: readonly GoogleScriptFile[],
  right: readonly GoogleScriptFile[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (file, index) =>
        file.name === right[index]?.name &&
        file.type === right[index]?.type &&
        file.source === right[index]?.source,
    )
  );
}
