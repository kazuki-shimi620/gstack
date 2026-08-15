import {
  GoogleCredentialService,
  type GoogleOAuthTokenGateway,
} from './credential.js';
import type { GoogleDeployGateway, GoogleDeployRequest } from './deploy.js';
import type { GoogleHttpClient } from './http.js';

const MAX_LIST_PAGES = 100;

export class GoogleDeployHttpGateway implements GoogleDeployGateway {
  public constructor(
    private readonly http: GoogleHttpClient,
    private readonly tokens: GoogleOAuthTokenGateway,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listVersions(
    input: Parameters<GoogleDeployGateway['listVersions']>[0],
  ): Promise<unknown> {
    return { versions: await this.list(input, 'versions') };
  }

  async createVersion(
    input: Parameters<GoogleDeployGateway['createVersion']>[0],
  ): Promise<unknown> {
    return this.write(input, 'POST', 'versions', {
      description: input.description,
    });
  }

  async listDeployments(
    input: Parameters<GoogleDeployGateway['listDeployments']>[0],
  ): Promise<unknown> {
    return { deployments: await this.list(input, 'deployments') };
  }

  async createDeployment(
    input: Parameters<GoogleDeployGateway['createDeployment']>[0],
  ): Promise<unknown> {
    return this.write(input, 'POST', 'deployments', deploymentConfig(input));
  }

  async updateDeployment(
    input: Parameters<GoogleDeployGateway['updateDeployment']>[0],
  ): Promise<unknown> {
    return this.write(
      input,
      'PUT',
      `deployments/${encodeURIComponent(input.deploymentId)}`,
      {
        deploymentConfig: {
          scriptId: input.scriptId,
          ...deploymentConfig(input),
        },
      },
    );
  }

  private async list(
    input: GoogleDeployRequest,
    resource: 'versions' | 'deployments',
  ): Promise<readonly unknown[]> {
    const authorization = await this.authorization(input);
    const items: unknown[] = [];
    const tokens = new Set<string>();
    let pageToken: string | null = null;
    for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
      const url = this.url(input.scriptId, resource);
      url.searchParams.set('pageSize', '50');
      if (pageToken !== null) url.searchParams.set('pageToken', pageToken);
      const value = await this.execute({
        method: 'GET',
        url: url.href,
        headers: { accept: 'application/json', authorization },
        body: null,
        retryable: true,
      });
      if (!record(value) || !Array.isArray(value[resource])) invalidResponse();
      items.push(...value[resource]);
      const next = value.nextPageToken;
      if (next === undefined || next === '') return Object.freeze(items);
      if (typeof next !== 'string' || tokens.has(next)) invalidResponse();
      tokens.add(next);
      pageToken = next;
    }
    invalidResponse();
  }

  private async write(
    input: GoogleDeployRequest,
    method: 'POST' | 'PUT',
    resource: string,
    body: unknown,
  ): Promise<unknown> {
    return this.execute({
      method,
      url: this.url(input.scriptId, resource).href,
      headers: {
        accept: 'application/json',
        authorization: await this.authorization(input),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      retryable: false,
    });
  }

  private async authorization(input: GoogleDeployRequest): Promise<string> {
    const credential = await new GoogleCredentialService(
      input.secrets,
      this.tokens,
      this.now,
    ).authorize(input.credential);
    return `Bearer ${credential.accessToken}`;
  }

  private url(scriptId: string, resource: string): URL {
    return new URL(
      `https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/${resource}`,
    );
  }

  private async execute(
    request: Parameters<GoogleHttpClient['execute']>[0],
  ): Promise<unknown> {
    const response = await this.http.execute(request);
    try {
      return JSON.parse(response.body);
    } catch (error: unknown) {
      throw new TypeError('Google Deploy response is invalid.', {
        cause: error,
      });
    }
  }
}

function deploymentConfig(input: {
  readonly versionNumber: number;
  readonly manifestFileName: 'appsscript';
  readonly description: string;
}) {
  return {
    versionNumber: input.versionNumber,
    manifestFileName: input.manifestFileName,
    description: input.description,
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalidResponse(): never {
  throw new TypeError('Google Deploy list response is invalid.');
}
