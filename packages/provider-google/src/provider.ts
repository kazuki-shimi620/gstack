import type {
  ProviderFactory,
  ProviderHealth,
  ProviderInitializeContext,
  ProviderIssue,
  ProviderManifest,
  ProviderSecretResolver,
  ProviderSession,
} from '@gstack/provider';

import {
  parseGoogleProviderConfig,
  type GoogleProviderConfig,
} from './config.js';
import { googleCredentialRequest } from './authentication.js';

export const googleProviderManifest: ProviderManifest = Object.freeze({
  formatVersion: 1,
  name: 'google',
  packageName: '@gstack/provider-google',
  version: '0.0.0',
  minimumGstackVersion: '0.0.0',
  capabilities: Object.freeze({
    database: true,
    api: true,
    authentication: true,
    storage: true,
    deploy: true,
  }),
  migrationSupport: Object.freeze({
    create_model: 'native',
    drop_model: 'native',
    add_column: 'native',
    drop_column: 'native',
    rename_column: 'native',
    alter_column: 'unsupported',
    add_index: 'unsupported',
    drop_index: 'unsupported',
    add_relation: 'unsupported',
    drop_relation: 'unsupported',
  }),
});

export interface GoogleWorkspaceGateway {
  checkHealth(input: {
    readonly projectRoot: string;
    readonly config: GoogleProviderConfig;
    readonly secrets: ProviderSecretResolver;
    readonly credential: {
      readonly credentialSecret: string;
      readonly scopes: readonly string[];
    };
  }): Promise<ProviderHealth>;
}

export function createGoogleProvider(
  gateway: GoogleWorkspaceGateway,
): ProviderFactory {
  return Object.freeze({
    manifest: googleProviderManifest,
    initialize: async (
      context: ProviderInitializeContext,
    ): Promise<ProviderSession> => {
      const parsed = parseGoogleProviderConfig(context.configuration);
      let disposed = false;
      return {
        validate: async () => {
          ensureActive(disposed);
          return parsed.issues.map(({ code, message }): ProviderIssue => ({
            code,
            severity: 'error',
            message,
          }));
        },
        health: async () => {
          ensureActive(disposed);
          if (!parsed.config) {
            return { status: 'unavailable', code: 'CONFIGURATION_INVALID' };
          }
          return gateway.checkHealth({
            projectRoot: context.projectRoot,
            config: parsed.config,
            secrets: context.secrets,
            credential: googleCredentialRequest(
              parsed.config.authentication.credentialSecret,
              'health',
            ),
          });
        },
        dispose: async () => {
          disposed = true;
        },
      };
    },
  });
}

function ensureActive(disposed: boolean): void {
  if (disposed) throw new Error('Google Provider session is disposed.');
}
