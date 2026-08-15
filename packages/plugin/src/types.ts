import type { ApplicationModel } from '@gstack/application';
import type { GeneratedArtifactInput } from '@gstack/generator';
import type { ProviderFactory } from '@gstack/provider';

export interface PluginManifest {
  readonly formatVersion: 1;
  readonly id: string;
  readonly kind: 'provider' | 'generator';
  readonly packageName: string;
  readonly version: string;
  readonly minimumGstackVersion: string;
}

export interface ProviderPlugin {
  readonly manifest: PluginManifest & { readonly kind: 'provider' };
  readonly provider: ProviderFactory;
}

export interface GeneratorPlugin {
  readonly manifest: PluginManifest & { readonly kind: 'generator' };
  generate(input: {
    readonly application: ApplicationModel;
    readonly configuration: Readonly<Record<string, unknown>>;
  }): readonly GeneratedArtifactInput[];
}

export type GstackPlugin = ProviderPlugin | GeneratorPlugin;
