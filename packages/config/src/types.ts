export interface GstackConfig {
  readonly version: 1;
  readonly name: string;
  readonly schemaVersion: 1;
  readonly schema: {
    readonly directory: string;
  };
  readonly generator: GeneratorProjectConfig | null;
}

export interface GeneratorProjectConfig {
  readonly formatVersion: 1;
  readonly types: boolean;
  readonly validation: boolean;
  readonly openapi: boolean;
  readonly documentation: boolean;
  readonly aiDocumentation: boolean;
}

export interface ConfigIssue {
  readonly code:
    | 'CONFIG_YAML_INVALID'
    | 'CONFIG_ROOT_INVALID'
    | 'CONFIG_UNKNOWN_KEY'
    | 'CONFIG_REQUIRED'
    | 'CONFIG_VALUE_INVALID'
    | 'CONFIG_VERSION_UNSUPPORTED'
    | 'SCHEMA_VERSION_UNSUPPORTED';
  readonly message: string;
  readonly path?: string;
}

export class ConfigLoadError extends Error {
  public constructor(
    public readonly issues: readonly ConfigIssue[],
    options?: ErrorOptions,
  ) {
    super('gstack.yaml is invalid.', options);
    this.name = 'ConfigLoadError';
  }
}
