import type { ProviderRegistry } from './registry.js';
import type {
  ProviderCapabilityName,
  ProviderManifest,
  ProviderMigrationSupport,
} from './types.js';

export interface ProviderSummary {
  readonly name: string;
  readonly packageName: string;
  readonly version: string;
  readonly minimumGstackVersion: string;
  readonly capabilities: Readonly<Record<ProviderCapabilityName, boolean>>;
  readonly migrationSupport: ProviderManifest['migrationSupport'];
}

export class ProviderCatalog {
  public constructor(private readonly registry: ProviderRegistry) {}

  listProviders(): readonly ProviderSummary[] {
    return Object.freeze(
      this.registry.list().map(({ manifest }) => summarizeManifest(manifest)),
    );
  }

  getProvider(name: string): ProviderSummary | null {
    const factory = this.registry.get(name);
    return factory === null ? null : summarizeManifest(factory.manifest);
  }

  supportsCapability(
    name: string,
    capability: ProviderCapabilityName,
  ): boolean | null {
    return this.getProvider(name)?.capabilities[capability] ?? null;
  }
}

function summarizeManifest(manifest: ProviderManifest): ProviderSummary {
  const capabilities = Object.freeze({ ...manifest.capabilities });
  const migrationSupport = Object.freeze({
    ...manifest.migrationSupport,
  }) as Readonly<
    Record<keyof ProviderManifest['migrationSupport'], ProviderMigrationSupport>
  >;

  return Object.freeze({
    name: manifest.name,
    packageName: manifest.packageName,
    version: manifest.version,
    minimumGstackVersion: manifest.minimumGstackVersion,
    capabilities,
    migrationSupport,
  });
}
