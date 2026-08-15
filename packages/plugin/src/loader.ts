import type { ApplicationModel } from '@gstack/application';
import {
  normalizeGeneratedArtifacts,
  type GeneratedArtifact,
} from '@gstack/generator';
import type { ProviderRegistry } from '@gstack/provider';

import { isPluginCompatible, validatePluginManifest } from './manifest.js';
import { PluginRegistry } from './registry.js';
import type { GstackPlugin } from './types.js';

const PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;

export type PluginModuleImporter = (packageName: string) => Promise<unknown>;

export class PluginLoaderError extends Error {
  public constructor(
    public readonly code:
      | 'PLUGIN_SPECIFIER_INVALID'
      | 'PLUGIN_LOAD_FAILED'
      | 'PLUGIN_MODULE_INVALID'
      | 'PLUGIN_PACKAGE_MISMATCH'
      | 'PLUGIN_INCOMPATIBLE'
      | 'PLUGIN_GENERATION_FAILED'
      | 'PLUGIN_ARTIFACT_INVALID',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PluginLoaderError';
  }
}

export async function loadPlugins(input: {
  readonly packageNames: readonly string[];
  readonly gstackVersion: string;
  readonly importer?: PluginModuleImporter;
}): Promise<PluginRegistry> {
  const registry = new PluginRegistry();
  const names = new Set<string>();
  for (const packageName of input.packageNames) {
    if (!PACKAGE.test(packageName) || names.has(packageName)) {
      throw error(
        'PLUGIN_SPECIFIER_INVALID',
        'Plugin package specifier is invalid.',
      );
    }
    names.add(packageName);
  }
  for (const packageName of input.packageNames) {
    let module: unknown;
    try {
      module = await (input.importer ?? defaultImporter)(packageName);
    } catch (cause: unknown) {
      throw error(
        'PLUGIN_LOAD_FAILED',
        'Plugin package could not be loaded.',
        cause,
      );
    }
    if (!record(module) || !('gstackPlugin' in module)) {
      throw error('PLUGIN_MODULE_INVALID', 'Plugin module is invalid.');
    }
    const plugin = module.gstackPlugin as GstackPlugin;
    const manifest = validatePluginManifest(plugin?.manifest);
    if (manifest.packageName !== packageName) {
      throw error(
        'PLUGIN_PACKAGE_MISMATCH',
        'Plugin package identity does not match.',
      );
    }
    if (!isPluginCompatible(manifest, input.gstackVersion)) {
      throw error(
        'PLUGIN_INCOMPATIBLE',
        'Plugin is not compatible with this gstack version.',
      );
    }
    registry.register(plugin);
  }
  return registry;
}

export function registerProviderPlugins(
  plugins: PluginRegistry,
  providers: ProviderRegistry,
): void {
  for (const plugin of plugins.providers()) providers.register(plugin.provider);
}

export function runGeneratorPlugins(input: {
  readonly plugins: PluginRegistry;
  readonly application: ApplicationModel;
  readonly configuration: Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >;
}): readonly GeneratedArtifact[] {
  const artifacts = input.plugins.generators().flatMap((plugin) => {
    let outputs;
    try {
      outputs = plugin.generate({
        application: input.application,
        configuration:
          input.configuration[plugin.manifest.id] ?? Object.freeze({}),
      });
    } catch (cause: unknown) {
      throw error(
        'PLUGIN_GENERATION_FAILED',
        'Generator Plugin failed.',
        cause,
      );
    }
    const prefix = `generated/plugins/${plugin.manifest.id}/`;
    if (
      !Array.isArray(outputs) ||
      outputs.some(
        (artifact) =>
          !record(artifact) ||
          typeof artifact.path !== 'string' ||
          !artifact.path.startsWith(prefix) ||
          typeof artifact.content !== 'string',
      )
    ) {
      throw error(
        'PLUGIN_ARTIFACT_INVALID',
        'Generator Plugin Artifact is outside its namespace.',
      );
    }
    return outputs;
  });
  try {
    return normalizeGeneratedArtifacts(artifacts);
  } catch (cause: unknown) {
    throw error(
      'PLUGIN_ARTIFACT_INVALID',
      'Generator Plugin Artifacts are invalid.',
      cause,
    );
  }
}

async function defaultImporter(packageName: string): Promise<unknown> {
  return import(packageName);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function error(
  code: PluginLoaderError['code'],
  message: string,
  cause?: unknown,
): PluginLoaderError {
  return new PluginLoaderError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}
