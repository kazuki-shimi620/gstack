import type { ApplicationModel } from '@gstack/application';
import type { GstackConfig } from '@gstack/config';
import type { Diagnostic, SchemaSource } from '@gstack/schema';

export interface FeatureConfigurationStatus {
  readonly configured: boolean;
  readonly details: Readonly<Record<string, unknown>> | null;
}

export interface ProjectStatus {
  readonly projectRoot: string;
  readonly projectName: string;
  readonly gstackVersion: string;
  readonly schemaCount: number;
  readonly config: {
    readonly version: 1;
    readonly schemaVersion: 1;
    readonly schemaDirectory: string;
  };
  readonly providers: FeatureConfigurationStatus;
  readonly generators: FeatureConfigurationStatus;
  readonly migration: {
    readonly availability: 'not_implemented';
  };
  readonly validation: {
    readonly checked: boolean;
    readonly valid: boolean | null;
    readonly level: 'syntax' | 'semantic' | null;
  };
}

export interface SchemaSummary {
  readonly id: string;
  readonly name: string;
  readonly path: string;
}

export interface SchemaDocument extends SchemaSummary {
  readonly content: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly level: 'syntax' | 'semantic';
  readonly errors: readonly Diagnostic[];
  readonly warnings: readonly Diagnostic[];
}

export interface ProjectContext {
  readonly status: ProjectStatus;
  readonly schemas: readonly SchemaSummary[];
  readonly validation: ValidationResult;
  readonly capabilities: {
    readonly projectStatus: 'available';
    readonly schemaRead: 'available';
    readonly schemaSyntaxValidation: 'available';
    readonly semanticValidation: 'available';
    readonly applicationModel: 'available';
    readonly providerStatus: 'not_implemented';
    readonly migrationPlan: 'not_implemented';
    readonly generatedArtifacts: 'not_implemented';
  };
}

export interface GstackProject {
  readonly root: string;
  getConfig(): Promise<GstackConfig>;
  getStatus(): Promise<ProjectStatus>;
  getProjectContext(): Promise<ProjectContext>;
  listSchemas(): Promise<readonly SchemaSummary[]>;
  getSchema(name: string): Promise<SchemaDocument | null>;
  validateSchema(): Promise<ValidationResult>;
  getApplicationModel(): Promise<ApplicationModel | null>;
}

export type SchemaSourceLoader = (
  projectRoot: string,
  schemaDirectory: string,
) => Promise<readonly SchemaSource[]>;

export type ProjectConfigLoader = (
  projectRoot: string,
) => Promise<GstackConfig>;
