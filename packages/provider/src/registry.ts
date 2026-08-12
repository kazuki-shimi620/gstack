import { validateProviderManifest } from './manifest.js';
import type { ProviderFactory } from './types.js';

export class ProviderRegistryError extends Error {
  public constructor(
    public readonly code: 'PROVIDER_ALREADY_REGISTERED',
    message: string,
  ) {
    super(message);
    this.name = 'ProviderRegistryError';
  }
}

export class ProviderRegistry {
  readonly #factories = new Map<string, ProviderFactory>();

  register(factory: ProviderFactory): void {
    const manifest = validateProviderManifest(factory.manifest);
    if (this.#factories.has(manifest.name)) {
      throw new ProviderRegistryError(
        'PROVIDER_ALREADY_REGISTERED',
        `Provider is already registered: ${manifest.name}`,
      );
    }
    this.#factories.set(manifest.name, factory);
  }

  get(name: string): ProviderFactory | null {
    return this.#factories.get(name) ?? null;
  }

  list(): readonly ProviderFactory[] {
    return Object.freeze(
      [...this.#factories.values()].sort((left, right) =>
        left.manifest.name.localeCompare(right.manifest.name),
      ),
    );
  }
}
