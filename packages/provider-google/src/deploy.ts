import type { ProviderSecretResolver } from '@gstack/provider';

import {
  googleCredentialRequest,
  type GoogleCredentialRequest,
} from './authentication.js';
import type { GoogleProviderConfig } from './config.js';

const MANAGED_DEPLOYMENT_DESCRIPTION = 'gstack-managed';

export interface GoogleDeployGateway {
  listVersions(input: GoogleDeployRequest): Promise<unknown>;
  createVersion(
    input: GoogleDeployRequest & { readonly description: string },
  ): Promise<unknown>;
  listDeployments(input: GoogleDeployRequest): Promise<unknown>;
  createDeployment(
    input: GoogleDeployRequest & {
      readonly versionNumber: number;
      readonly manifestFileName: 'appsscript';
      readonly description: string;
    },
  ): Promise<unknown>;
  updateDeployment(
    input: GoogleDeployRequest & {
      readonly deploymentId: string;
      readonly versionNumber: number;
      readonly manifestFileName: 'appsscript';
      readonly description: string;
    },
  ): Promise<unknown>;
}

export interface GoogleDeployRequest {
  readonly scriptId: string;
  readonly credential: GoogleCredentialRequest;
  readonly secrets: ProviderSecretResolver;
}

export interface GoogleDeploymentResult {
  readonly outcome: 'created' | 'updated' | 'unchanged';
  readonly versionNumber: number;
  readonly deploymentId: string;
  readonly url: string;
}

export class GoogleDeployError extends Error {
  public constructor(
    public readonly code:
      | 'GOOGLE_DEPLOY_FINGERPRINT_INVALID'
      | 'GOOGLE_DEPLOY_VERSION_FAILED'
      | 'GOOGLE_DEPLOY_VERSION_INVALID'
      | 'GOOGLE_DEPLOY_VERSION_CONFLICT'
      | 'GOOGLE_DEPLOYMENT_FAILED'
      | 'GOOGLE_DEPLOYMENT_INVALID'
      | 'GOOGLE_DEPLOYMENT_CONFLICT',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GoogleDeployError';
  }
}

export class GoogleDeployService {
  public constructor(
    private readonly gateway: GoogleDeployGateway,
    private readonly config: GoogleProviderConfig,
    private readonly secrets: ProviderSecretResolver,
  ) {}

  async publish(fingerprint: string): Promise<GoogleDeploymentResult> {
    if (!/^[a-f0-9]{64}$/u.test(fingerprint)) {
      throw new GoogleDeployError(
        'GOOGLE_DEPLOY_FINGERPRINT_INVALID',
        'Google Deploy fingerprint is invalid.',
      );
    }
    const versionNumber = await this.resolveVersion(fingerprint);
    return this.resolveDeployment(versionNumber);
  }

  private async resolveVersion(fingerprint: string): Promise<number> {
    const description = `gstack:${fingerprint}`;
    let versions: readonly Version[];
    try {
      versions = parseVersions(
        await this.gateway.listVersions(this.request('script_write')),
      ).filter((version) => version.description === description);
    } catch (error: unknown) {
      if (error instanceof GoogleDeployError) throw error;
      throw failed(
        'GOOGLE_DEPLOY_VERSION_FAILED',
        'Google versions could not be listed.',
        error,
      );
    }
    if (versions.length > 1) {
      throw new GoogleDeployError(
        'GOOGLE_DEPLOY_VERSION_CONFLICT',
        'Multiple Google versions match the Deploy fingerprint.',
      );
    }
    if (versions[0]) return versions[0].versionNumber;
    try {
      return parseVersion(
        await this.gateway.createVersion({
          ...this.request('script_write'),
          description,
        }),
      ).versionNumber;
    } catch (error: unknown) {
      if (error instanceof GoogleDeployError) throw error;
      throw failed(
        'GOOGLE_DEPLOY_VERSION_FAILED',
        'Google version could not be created.',
        error,
      );
    }
  }

  private async resolveDeployment(
    versionNumber: number,
  ): Promise<GoogleDeploymentResult> {
    let deployments: readonly Deployment[];
    try {
      deployments = parseDeployments(
        await this.gateway.listDeployments(this.request('deploy')),
      ).filter(
        (deployment) =>
          deployment.description === MANAGED_DEPLOYMENT_DESCRIPTION,
      );
    } catch (error: unknown) {
      if (error instanceof GoogleDeployError) throw error;
      throw failed(
        'GOOGLE_DEPLOYMENT_FAILED',
        'Google deployments could not be listed.',
        error,
      );
    }
    if (deployments.length > 1) {
      throw new GoogleDeployError(
        'GOOGLE_DEPLOYMENT_CONFLICT',
        'Multiple gstack-managed Google deployments exist.',
      );
    }
    const current = deployments[0];
    if (current?.versionNumber === versionNumber) {
      return result('unchanged', current);
    }
    const request = {
      ...this.request('deploy'),
      versionNumber,
      manifestFileName: 'appsscript' as const,
      description: MANAGED_DEPLOYMENT_DESCRIPTION,
    };
    try {
      const deployment = parseDeployment(
        current
          ? await this.gateway.updateDeployment({
              ...request,
              deploymentId: current.deploymentId,
            })
          : await this.gateway.createDeployment(request),
      );
      if (deployment.versionNumber !== versionNumber) invalidDeployment();
      return result(current ? 'updated' : 'created', deployment);
    } catch (error: unknown) {
      if (error instanceof GoogleDeployError) throw error;
      throw failed(
        'GOOGLE_DEPLOYMENT_FAILED',
        'Google deployment could not be published.',
        error,
      );
    }
  }

  private request(operation: 'script_write' | 'deploy'): GoogleDeployRequest {
    return {
      scriptId: this.config.appsScriptProjectId,
      credential: googleCredentialRequest(
        this.config.authentication.credentialSecret,
        operation,
      ),
      secrets: this.secrets,
    };
  }
}

interface Version {
  readonly versionNumber: number;
  readonly description: string;
}

interface Deployment {
  readonly deploymentId: string;
  readonly versionNumber: number;
  readonly description: string;
  readonly url: string;
}

function parseVersions(value: unknown): readonly Version[] {
  if (!record(value) || !Array.isArray(value.versions)) invalidVersion();
  return Object.freeze(value.versions.map(parseVersion));
}

function parseVersion(value: unknown): Version {
  if (
    !record(value) ||
    !Number.isSafeInteger(value.versionNumber) ||
    Number(value.versionNumber) <= 0 ||
    typeof value.description !== 'string'
  )
    invalidVersion();
  return Object.freeze({
    versionNumber: value.versionNumber as number,
    description: value.description,
  });
}

function parseDeployments(value: unknown): readonly Deployment[] {
  if (!record(value) || !Array.isArray(value.deployments)) invalidDeployment();
  return Object.freeze(value.deployments.map(parseDeployment));
}

function parseDeployment(value: unknown): Deployment {
  if (
    !record(value) ||
    typeof value.deploymentId !== 'string' ||
    value.deploymentId.length === 0 ||
    !record(value.deploymentConfig) ||
    !Number.isSafeInteger(value.deploymentConfig.versionNumber) ||
    Number(value.deploymentConfig.versionNumber) <= 0 ||
    typeof value.deploymentConfig.description !== 'string' ||
    !Array.isArray(value.entryPoints)
  )
    invalidDeployment();
  const webApps = value.entryPoints.filter(
    (entry) => record(entry) && entry.entryPointType === 'WEB_APP',
  );
  if (
    webApps.length !== 1 ||
    !record(webApps[0]) ||
    !record(webApps[0].webApp) ||
    typeof webApps[0].webApp.url !== 'string' ||
    webApps[0].webApp.url.length === 0
  )
    invalidDeployment();
  return Object.freeze({
    deploymentId: value.deploymentId,
    versionNumber: value.deploymentConfig.versionNumber as number,
    description: value.deploymentConfig.description,
    url: (webApps[0].webApp as Record<string, unknown>).url as string,
  });
}

function result(
  outcome: GoogleDeploymentResult['outcome'],
  deployment: Deployment,
): GoogleDeploymentResult {
  return Object.freeze({
    outcome,
    versionNumber: deployment.versionNumber,
    deploymentId: deployment.deploymentId,
    url: deployment.url,
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalidVersion(): never {
  throw new GoogleDeployError(
    'GOOGLE_DEPLOY_VERSION_INVALID',
    'Google version response is invalid.',
  );
}

function invalidDeployment(): never {
  throw new GoogleDeployError(
    'GOOGLE_DEPLOYMENT_INVALID',
    'Google deployment response is invalid.',
  );
}

function failed(
  code: 'GOOGLE_DEPLOY_VERSION_FAILED' | 'GOOGLE_DEPLOYMENT_FAILED',
  message: string,
  cause: unknown,
): GoogleDeployError {
  return new GoogleDeployError(code, message, { cause });
}
