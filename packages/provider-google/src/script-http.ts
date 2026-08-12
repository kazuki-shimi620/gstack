import {
  GoogleCredentialService,
  type GoogleOAuthTokenGateway,
} from './credential.js';
import type { GoogleHttpClient } from './http.js';
import type { GoogleScriptMetadataGateway } from './script.js';

const PROJECT_FIELDS = 'scriptId,title,parentId,createTime,updateTime';

export class GoogleScriptHttpGateway implements GoogleScriptMetadataGateway {
  public constructor(
    private readonly http: GoogleHttpClient,
    private readonly tokens: GoogleOAuthTokenGateway,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getProjectMetadata(
    input: Parameters<GoogleScriptMetadataGateway['getProjectMetadata']>[0],
  ): Promise<unknown> {
    const credential = await new GoogleCredentialService(
      input.secrets,
      this.tokens,
      this.now,
    ).authorize(input.credential);
    const url = new URL(
      `https://script.googleapis.com/v1/projects/${encodeURIComponent(input.scriptId)}`,
    );
    url.searchParams.set('fields', PROJECT_FIELDS);
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
      throw new TypeError(
        'Google Apps Script project metadata response is invalid.',
        {
          cause: error,
        },
      );
    }
  }
}
