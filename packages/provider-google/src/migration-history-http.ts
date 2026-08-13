import {
  GoogleCredentialService,
  type GoogleOAuthTokenGateway,
} from './credential.js';
import type { GoogleHttpClient } from './http.js';
import {
  GOOGLE_MIGRATION_HISTORY_MARKER,
  type GoogleMigrationHistoryGateway,
} from './migration-history.js';

export class GoogleMigrationHistoryHttpGateway implements GoogleMigrationHistoryGateway {
  public constructor(
    private readonly http: GoogleHttpClient,
    private readonly tokens: GoogleOAuthTokenGateway,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(
    input: Parameters<GoogleMigrationHistoryGateway['list']>[0],
  ): Promise<unknown> {
    const credential = await this.authorize(input);
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set(
      'q',
      `'${escapeQuery(input.folderId)}' in parents and trashed = false and appProperties has { key='gstackType' and value='${GOOGLE_MIGRATION_HISTORY_MARKER}' }`,
    );
    url.searchParams.set('fields', 'files(id,name,parents,appProperties)');
    url.searchParams.set('spaces', 'drive');
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('includeItemsFromAllDrives', 'true');
    const value = parseJson(
      (
        await this.http.execute({
          method: 'GET',
          url: url.href,
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${credential.accessToken}`,
          },
          body: null,
          retryable: true,
        })
      ).body,
    );
    if (!isRecord(value) || !Array.isArray(value.files)) invalid();
    return value.files.map((file) => {
      if (
        !isRecord(file) ||
        !Array.isArray(file.parents) ||
        !isRecord(file.appProperties)
      )
        invalid();
      return {
        id: file.id,
        name: file.name,
        parentId: file.parents.length === 1 ? file.parents[0] : null,
        version: file.appProperties.version,
      };
    });
  }

  async read(
    input: Parameters<GoogleMigrationHistoryGateway['read']>[0],
  ): Promise<string> {
    const credential = await this.authorize(input);
    const url = new URL(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.fileId)}`,
    );
    url.searchParams.set('alt', 'media');
    url.searchParams.set('supportsAllDrives', 'true');
    return (
      await this.http.execute({
        method: 'GET',
        url: url.href,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${credential.accessToken}`,
        },
        body: null,
        retryable: true,
      })
    ).body;
  }

  async create(
    input: Parameters<GoogleMigrationHistoryGateway['create']>[0],
  ): Promise<unknown> {
    const boundary = 'gstack_migration_history_v1';
    const metadata = JSON.stringify({
      name: input.name,
      parents: [input.folderId],
      mimeType: 'application/json',
      appProperties: {
        gstackType: GOOGLE_MIGRATION_HISTORY_MARKER,
        version: input.version,
      },
    });
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${input.content}\r\n--${boundary}--`;
    const credential = await this.authorize(input);
    const url = new URL('https://www.googleapis.com/upload/drive/v3/files');
    url.searchParams.set('uploadType', 'multipart');
    url.searchParams.set('fields', 'id');
    url.searchParams.set('supportsAllDrives', 'true');
    const value = parseJson(
      (
        await this.http.execute({
          method: 'POST',
          url: url.href,
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${credential.accessToken}`,
            'content-type': `multipart/related; boundary=${boundary}`,
          },
          body,
          retryable: false,
        })
      ).body,
    );
    if (!isRecord(value) || typeof value.id !== 'string') invalid();
    return { id: value.id };
  }

  async update(
    input: Parameters<GoogleMigrationHistoryGateway['update']>[0],
  ): Promise<void> {
    const credential = await this.authorize(input);
    const url = new URL(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(input.fileId)}`,
    );
    url.searchParams.set('uploadType', 'media');
    url.searchParams.set('supportsAllDrives', 'true');
    await this.http.execute({
      method: 'PATCH',
      url: url.href,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${credential.accessToken}`,
        'content-type': 'application/json',
      },
      body: input.content,
      retryable: false,
    });
  }

  private authorize(
    input: Parameters<GoogleMigrationHistoryGateway['list']>[0],
  ) {
    return new GoogleCredentialService(
      input.secrets,
      this.tokens,
      this.now,
    ).authorize(input.credential);
  }
}

function escapeQuery(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}
function parseJson(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch (error: unknown) {
    throw new TypeError('Google Migration History response is invalid.', {
      cause: error,
    });
  }
}
function invalid(): never {
  throw new TypeError('Google Migration History response is invalid.');
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
