import type { MigrationOperation } from '@gstack/migration';

export type ProviderCapabilityName =
  'database' | 'api' | 'authentication' | 'storage' | 'deploy';
export type ProviderMigrationSupport = 'native' | 'emulated' | 'unsupported';

export interface ProviderManifest {
  readonly formatVersion: 1;
  readonly name: string;
  readonly packageName: string;
  readonly version: string;
  readonly minimumGstackVersion: string;
  readonly capabilities: Readonly<Record<ProviderCapabilityName, boolean>>;
  readonly migrationSupport: Readonly<
    Record<MigrationOperation['type'], ProviderMigrationSupport>
  >;
}

export interface ProviderSecretResolver {
  get(name: string): Promise<string | null>;
}

export interface ProviderInitializeContext {
  readonly projectRoot: string;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly secrets: ProviderSecretResolver;
}

export interface ProviderHealth {
  readonly status: 'healthy' | 'degraded' | 'unavailable';
  readonly code: string;
}

export interface ProviderSession {
  validate(): Promise<readonly ProviderIssue[]>;
  health(): Promise<ProviderHealth>;
  dispose(): Promise<void>;
}

export interface ProviderIssue {
  readonly code: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
}

export interface ProviderFactory {
  readonly manifest: ProviderManifest;
  initialize(context: ProviderInitializeContext): Promise<ProviderSession>;
}
