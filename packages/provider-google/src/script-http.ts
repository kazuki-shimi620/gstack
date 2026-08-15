import {
  GoogleCredentialService,
  type GoogleOAuthTokenGateway,
} from './credential.js';
import type { GoogleHttpClient } from './http.js';
import type {
  GoogleScriptContentGateway,
  GoogleScriptMetadataGateway,
} from './script.js';

const PROJECT_FIELDS = 'scriptId,title,parentId,createTime,updateTime';

export class GoogleScriptHttpGateway
  implements GoogleScriptMetadataGateway, GoogleScriptContentGateway
{
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

  async getProjectContent(
    input: Parameters<GoogleScriptContentGateway['getProjectContent']>[0],
  ): Promise<unknown> {
    return this.requestContent(input, 'GET', null, true);
  }

  async updateProjectContent(
    input: Parameters<GoogleScriptContentGateway['updateProjectContent']>[0],
  ): Promise<unknown> {
    return this.requestContent(
      input,
      'PUT',
      JSON.stringify({ files: input.files }),
      false,
    );
  }

  private async requestContent(
    input: Parameters<GoogleScriptContentGateway['getProjectContent']>[0],
    method: 'GET' | 'PUT',
    body: string | null,
    retryable: boolean,
  ): Promise<unknown> {
    const credential = await new GoogleCredentialService(
      input.secrets,
      this.tokens,
      this.now,
    ).authorize(input.credential);
    const response = await this.http.execute({
      method,
      url: `https://script.googleapis.com/v1/projects/${encodeURIComponent(input.scriptId)}/content`,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${credential.accessToken}`,
        ...(body === null ? {} : { 'content-type': 'application/json' }),
      },
      body,
      retryable,
    });
    try {
      return JSON.parse(response.body);
    } catch (error: unknown) {
      throw new TypeError(
        'Google Apps Script project content response is invalid.',
        {
          cause: error,
        },
      );
    }
  }
}
