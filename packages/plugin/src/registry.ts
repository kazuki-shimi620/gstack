import { validatePluginManifest } from './manifest.js';
import type { GstackPlugin, GeneratorPlugin, ProviderPlugin } from './types.js';

export class PluginRegistryError extends Error {
  public constructor(
    public readonly code:
      'PLUGIN_ALREADY_REGISTERED' | 'PLUGIN_DEFINITION_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'PluginRegistryError';
  }
}

export class PluginRegistry {
  readonly #plugins = new Map<string, GstackPlugin>();
  readonly #packages = new Set<string>();

  register(plugin: GstackPlugin): void {
    const manifest = validatePluginManifest(plugin.manifest);
    validateDefinition(plugin, manifest.id);
    if (
      this.#plugins.has(manifest.id) ||
      this.#packages.has(manifest.packageName)
    ) {
      throw new PluginRegistryError(
        'PLUGIN_ALREADY_REGISTERED',
        `Plugin is already registered: ${manifest.id}`,
      );
    }
    this.#plugins.set(manifest.id, plugin);
    this.#packages.add(manifest.packageName);
  }

  get(id: string): GstackPlugin | null {
    return this.#plugins.get(id) ?? null;
  }

  list(): readonly GstackPlugin[] {
    return Object.freeze(
      [...this.#plugins.values()].sort((left, right) =>
        left.manifest.id.localeCompare(right.manifest.id),
      ),
    );
  }

  providers(): readonly ProviderPlugin[] {
    return Object.freeze(
      this.list().filter(
        (plugin): plugin is ProviderPlugin =>
          plugin.manifest.kind === 'provider',
      ),
    );
  }

  generators(): readonly GeneratorPlugin[] {
    return Object.freeze(
      this.list().filter(
        (plugin): plugin is GeneratorPlugin =>
          plugin.manifest.kind === 'generator',
      ),
    );
  }
}

function validateDefinition(plugin: GstackPlugin, id: string): void {
  if (plugin.manifest.kind === 'provider') {
    if (!('provider' in plugin)) invalid();
    const provider = plugin.provider.manifest;
    if (
      !provider ||
      provider.name !== id ||
      provider.packageName !== plugin.manifest.packageName ||
      provider.version !== plugin.manifest.version ||
      provider.minimumGstackVersion !== plugin.manifest.minimumGstackVersion
    )
      invalid();
    return;
  }
  if (!('generate' in plugin) || typeof plugin.generate !== 'function')
    invalid();
}

function invalid(): never {
  throw new PluginRegistryError(
    'PLUGIN_DEFINITION_INVALID',
    'Plugin definition does not match its Manifest.',
  );
}
