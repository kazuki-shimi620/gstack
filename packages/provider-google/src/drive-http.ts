import {
  GoogleCredentialService,
  type GoogleOAuthTokenGateway,
} from './credential.js';
import type { GoogleHttpClient } from './http.js';
import type { GoogleDriveMetadataGateway } from './storage.js';

const FOLDER_FIELDS =
  'id,name,mimeType,parents,trashed,capabilities(canAddChildren,canListChildren)';

export class GoogleDriveHttpGateway implements GoogleDriveMetadataGateway {
  public constructor(
    private readonly http: GoogleHttpClient,
    private readonly tokens: GoogleOAuthTokenGateway,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getFolderMetadata(
    input: Parameters<GoogleDriveMetadataGateway['getFolderMetadata']>[0],
  ): Promise<unknown> {
    const credential = await new GoogleCredentialService(
      input.secrets,
      this.tokens,
      this.now,
    ).authorize(input.credential);
    const url = new URL(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.folderId)}`,
    );
    url.searchParams.set('fields', FOLDER_FIELDS);
    url.searchParams.set('supportsAllDrives', 'true');
    const response = await this.http.execute({
      method: 'GET',
      url: url.href,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${credential.accessToken}`,
      },
      body: null,
      retryable: true,
    });
    try {
      return JSON.parse(response.body);
    } catch (error: unknown) {
      throw new TypeError('Google Drive folder metadata response is invalid.', {
        cause: error,
      });
    }
  }
}
