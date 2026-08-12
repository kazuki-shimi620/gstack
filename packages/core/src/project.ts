import path from 'node:path';

import { analyzeSchemas } from '@gstack/analyzer';
import type { ApplicationModel } from '@gstack/application';
import {
  ConfigLoadError,
  findProjectRoot,
  loadProjectConfig,
  type GstackConfig,
} from '@gstack/config';
import { parseSchemaSource } from '@gstack/parser';
import { compareDiagnostics, loadSchemaSources } from '@gstack/schema';

import type {
  GstackProject,
  ProjectConfigLoader,
  ProjectContext,
  ProjectStatus,
  SchemaDocument,
  SchemaSourceLoader,
  SchemaSummary,
  ValidationResult,
} from './types.js';
import { GstackError } from './error.js';

const GSTACK_VERSION = '0.0.0';

export interface LoadProjectOptions {
  readonly root?: string;
  readonly startDirectory?: string;
  readonly loadConfig?: ProjectConfigLoader;
  readonly loadSources?: SchemaSourceLoader;
}

export async function loadProject(
  options: LoadProjectOptions = {},
): Promise<GstackProject> {
  const root = options.root
    ? path.resolve(options.root)
    : await findProjectRoot(options.startDirectory ?? process.cwd());
  if (!root) {
    throw new GstackError({
      code: 'PROJECT_NOT_FOUND',
      category: 'configuration',
      message: 'No gstack project was found.',
      path: path.resolve(options.startDirectory ?? process.cwd()),
      hint: 'Run the command inside a project containing gstack.yaml or provide an explicit project root.',
    });
  }
  const config = await loadConfigSafely(
    root,
    options.loadConfig ?? loadProjectConfig,
  );
  return new Project(root, config, options.loadSources ?? loadSchemaSources);
}

class Project implements GstackProject {
  public constructor(
    public readonly root: string,
    private readonly config: GstackConfig,
    private readonly loadSources: SchemaSourceLoader,
  ) {}

  public async getConfig(): Promise<GstackConfig> {
    return this.config;
  }

  public async getStatus(): Promise<ProjectStatus> {
    const sources = await this.loadSourcesSafely();
    return {
      projectRoot: this.root,
      projectName: this.config.name,
      gstackVersion: GSTACK_VERSION,
      schemaCount: sources.length,
      config: {
        version: this.config.version,
        schemaVersion: this.config.schemaVersion,
        schemaDirectory: this.config.schema.directory,
      },
      providers: { configured: false, details: null },
      generators: { configured: false, details: null },
      migration: { availability: 'not_implemented' },
      validation: { checked: false, valid: null, level: null },
    };
  }

  public async getProjectContext(): Promise<ProjectContext> {
    const [status, schemas, validation] = await Promise.all([
      this.getStatus(),
      this.listSchemas(),
      this.validateSchema(),
    ]);
    return {
      status: {
        ...status,
        validation: {
          checked: true,
          valid: validation.valid,
          level: validation.level,
        },
      },
      schemas,
      validation,
      capabilities: {
        projectStatus: 'available',
        schemaRead: 'available',
        schemaSyntaxValidation: 'available',
        semanticValidation: 'available',
        applicationModel: 'available',
        providerStatus: 'not_implemented',
        migrationPlan: 'not_implemented',
        generatedArtifacts: 'not_implemented',
      },
    };
  }

  public async listSchemas(): Promise<readonly SchemaSummary[]> {
    const sources = await this.loadSourcesSafely();
    return sources.map(({ id, name, path: sourcePath }) => ({
      id,
      name,
      path: sourcePath,
    }));
  }

  public async getSchema(name: string): Promise<SchemaDocument | null> {
    const sources = await this.loadSourcesSafely();
    const source = sources.find(
      (candidate) => candidate.name === name || candidate.id === name,
    );
    return source
      ? {
          id: source.id,
          name: source.name,
          path: source.path,
          content: source.content,
        }
      : null;
  }

  public async validateSchema(): Promise<ValidationResult> {
    const compilation = await this.compileSchemas();
    return compilation.validation;
  }

  public async getApplicationModel(): Promise<ApplicationModel | null> {
    const compilation = await this.compileSchemas();
    return compilation.application;
  }

  private async compileSchemas(): Promise<{
    readonly application: ApplicationModel | null;
    readonly validation: ValidationResult;
  }> {
    const sources = await this.loadSourcesSafely();
    const results = sources.map(parseSchemaSource);
    const errors = results
      .flatMap((result) => result.errors)
      .sort(compareDiagnostics);
    const warnings = results
      .flatMap((result) => result.warnings)
      .sort(compareDiagnostics);
    if (errors.length > 0) {
      return {
        application: null,
        validation: { valid: false, level: 'syntax', errors, warnings },
      };
    }

    const asts = results.flatMap((result) =>
      result.document ? [result.document.ast] : [],
    );
    const analyzed = analyzeSchemas(asts, {
      applicationName: this.config.name,
      schemaVersion: this.config.schemaVersion,
    });
    return {
      application: analyzed.application ?? null,
      validation: {
        valid: analyzed.errors.length === 0,
        level: 'semantic',
        errors: analyzed.errors,
        warnings: [...warnings, ...analyzed.warnings].sort(compareDiagnostics),
      },
    };
  }

  private async loadSourcesSafely() {
    try {
      return await this.loadSources(this.root, this.config.schema.directory);
    } catch (error: unknown) {
      throw new GstackError(
        {
          code: 'SCHEMA_LOAD_FAILED',
          category: 'schema',
          message: 'Schema sources could not be loaded.',
          path: path.resolve(this.root, this.config.schema.directory),
        },
        { cause: error },
      );
    }
  }
}

async function loadConfigSafely(
  root: string,
  loader: ProjectConfigLoader,
): Promise<GstackConfig> {
  try {
    return await loader(root);
  } catch (error: unknown) {
    if (error instanceof ConfigLoadError) {
      throw new GstackError(
        {
          code: 'CONFIG_INVALID',
          category: 'configuration',
          message: 'gstack.yaml is invalid.',
          path: path.join(root, 'gstack.yaml'),
          issues: error.issues,
        },
        { cause: error },
      );
    }
    throw new GstackError(
      {
        code: 'INTERNAL_ERROR',
        category: 'internal',
        message: 'Project configuration could not be loaded.',
      },
      { cause: error },
    );
  }
}
