import path from 'node:path';

import {
  findProjectRoot,
  loadProjectConfig,
  type GstackConfig,
} from '@gstack/config';
import { GstackError, loadProject, type GstackProject } from '@gstack/core';
import {
  applyCapabilityResults,
  applyMigration,
  loadMigrationFile,
  MigrationApplyError,
  MigrationExecutionError,
  MigrationFileError,
  MigrationFileSystemError,
  MigrationLockError,
  MigrationReadService,
  prepareMigrationApply,
  type MigrationFile,
  type MigrationPlan,
  type PreparedMigrationApply,
  type MigrationApplyResult,
} from '@gstack/migration';
import {
  ProviderCatalog,
  ProviderInspectionService,
  ProviderRegistry,
  ProviderRuntime,
  type ProviderSecretResolver,
} from '@gstack/provider';
import {
  createDefaultGoogleMigrationComponents,
  createDefaultGoogleProvider,
  evaluateGoogleMigrationCapabilities,
  parseGoogleProviderConfig,
  type DefaultGoogleMigrationComponents,
} from '@gstack/provider-google';

export interface LoadStandardProjectOptions {
  readonly root?: string;
  readonly startDirectory?: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
}

export interface StandardGoogleMigrationRuntime extends DefaultGoogleMigrationComponents {
  evaluate(plan: MigrationPlan): MigrationPlan;
  readonly providerContext: string;
}

export function createStandardGoogleMigrationRuntime(input: {
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly secrets: ProviderSecretResolver;
}): StandardGoogleMigrationRuntime {
  const parsed = parseGoogleProviderConfig(input.configuration);
  if (!parsed.config) {
    throw new GstackError({
      code: 'CONFIG_INVALID',
      category: 'provider',
      message: 'Google Provider configuration is invalid.',
    });
  }
  const components = createDefaultGoogleMigrationComponents(
    parsed.config,
    input.secrets,
  );
  return Object.freeze({
    ...components,
    providerContext: `google:${parsed.config.spreadsheetId}`,
    evaluate: (plan: MigrationPlan) =>
      applyCapabilityResults(
        plan,
        evaluateGoogleMigrationCapabilities(plan.operations),
      ),
  });
}

export async function prepareStandardGoogleMigrationApply(input: {
  readonly project: GstackProject;
  readonly file: MigrationFile;
  readonly runtime: StandardGoogleMigrationRuntime;
}): Promise<PreparedMigrationApply> {
  const [application, preview] = await Promise.all([
    input.project.getApplicationModel(),
    input.project.previewMigrationPlan(),
  ]);
  if (!application) {
    throw new GstackError({
      code: 'MIGRATION_SCHEMA_INVALID',
      category: 'migration',
      message: 'Migration Apply cannot use an invalid Schema.',
    });
  }
  return prepareMigrationApply(
    input.file,
    preview.plan,
    application,
    input.runtime.providerContext,
  );
}

export async function prepareStandardGoogleMigrationApplyFile(input: {
  readonly project: GstackProject;
  readonly filePath: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
}): Promise<PreparedMigrationApply> {
  return (await resolveStandardGoogleMigrationApply(input)).prepared;
}

export async function applyStandardGoogleMigrationFile(input: {
  readonly project: GstackProject;
  readonly filePath: string;
  readonly approval: string;
  readonly allowDestructive: boolean;
  readonly resume: boolean;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly now?: () => string;
}): Promise<MigrationApplyResult> {
  try {
    const { prepared, runtime } =
      await resolveStandardGoogleMigrationApply(input);
    return await applyStandardGoogleMigration({
      prepared,
      runtime,
      approval: input.approval,
      allowDestructive: input.allowDestructive,
      resume: input.resume,
      ...(input.now === undefined ? {} : { now: input.now }),
    });
  } catch (error: unknown) {
    throw normalizeMigrationError(error);
  }
}

export async function applyStandardGoogleMigration(input: {
  readonly prepared: PreparedMigrationApply;
  readonly runtime: StandardGoogleMigrationRuntime;
  readonly approval: string;
  readonly allowDestructive: boolean;
  readonly resume: boolean;
  readonly now?: () => string;
}): Promise<MigrationApplyResult> {
  try {
    return await applyMigration(
      {
        ...input.prepared,
        approval: {
          token: input.approval,
          allowDestructive: input.allowDestructive,
        },
        resume: input.resume,
      },
      {
        history: input.runtime.history,
        lock: input.runtime.lock,
        executor: input.runtime.executor,
        now: input.now ?? (() => new Date().toISOString()),
      },
    );
  } catch (error: unknown) {
    throw normalizeMigrationError(error);
  }
}

async function resolveStandardGoogleMigrationApply(input: {
  readonly project: GstackProject;
  readonly filePath: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
}): Promise<{
  readonly prepared: PreparedMigrationApply;
  readonly runtime: StandardGoogleMigrationRuntime;
}> {
  const config = await input.project.getConfig();
  const google = config.providers.find(
    ({ name, enabled }) => name === 'google' && enabled,
  );
  if (!google) {
    throw new GstackError({
      code: 'MIGRATION_NOT_AVAILABLE',
      category: 'migration',
      message: 'Google Migration is not configured for this project.',
      hint: 'Enable and configure the Google Provider in gstack.yaml.',
    });
  }
  try {
    const [file, runtime] = await Promise.all([
      loadMigrationFile(input.project.root, input.filePath),
      Promise.resolve(
        createStandardGoogleMigrationRuntime({
          configuration: google.configuration,
          secrets: new EnvironmentSecretResolver(
            input.environment ?? process.env,
          ),
        }),
      ),
    ]);
    const prepared = await prepareStandardGoogleMigrationApply({
      project: input.project,
      file,
      runtime,
    });
    return Object.freeze({ prepared, runtime });
  } catch (error: unknown) {
    throw normalizeMigrationError(error);
  }
}

export async function loadStandardProject(
  options: LoadStandardProjectOptions = {},
): Promise<GstackProject> {
  const root = options.root
    ? path.resolve(options.root)
    : await findProjectRoot(options.startDirectory ?? process.cwd());
  if (!root) {
    return loadProject({
      startDirectory: options.startDirectory ?? process.cwd(),
    });
  }
  const config = await loadProjectConfig(root);
  const enabled = config.providers.filter((provider) => provider.enabled);
  const unknown = enabled.find(({ name }) => name !== 'google');
  if (unknown) {
    throw new GstackError({
      code: 'PROVIDER_NOT_AVAILABLE',
      category: 'provider',
      message: `Provider is not available in the standard runtime: ${unknown.name}`,
    });
  }
  const registry = new ProviderRegistry();
  if (enabled.some(({ name }) => name === 'google')) {
    registry.register(createDefaultGoogleProvider());
  }
  const catalog = new ProviderCatalog(registry);
  const google = enabled.find(({ name }) => name === 'google');
  const secrets = new EnvironmentSecretResolver(
    options.environment ?? process.env,
  );
  const inspection = google
    ? new ProviderInspectionService(new ProviderRuntime(registry), {
        projectRoot: root,
        configuration: google.configuration,
        secrets,
      })
    : undefined;
  const googleConfig = google
    ? parseGoogleProviderConfig(google.configuration).config
    : null;
  const migration = googleConfig
    ? createDefaultGoogleMigrationComponents(googleConfig, secrets)
    : null;
  const migrationReadService = migration
    ? new MigrationReadService(migration.history)
    : null;
  return loadProject({
    root,
    loadConfig: async (): Promise<GstackConfig> => config,
    providerReader: {
      listProviders: async () => catalog.listProviders(),
      getProvider: async (name) => catalog.getProvider(name),
    },
    ...(migrationReadService === null
      ? {}
      : {
          migrationReader: {
            getStatus: () => migrationReadService.getStatus(),
            listHistory: () => migrationReadService.listHistory(),
            previewPlan: async (
              ...args: Parameters<MigrationReadService['previewPlan']>
            ) => {
              const preview = await migrationReadService.previewPlan(...args);
              return Object.freeze({
                ...preview,
                plan: applyCapabilityResults(
                  preview.plan,
                  evaluateGoogleMigrationCapabilities(preview.plan.operations),
                ),
              });
            },
          },
        }),
    ...(inspection === undefined ? {} : { providerInspector: inspection }),
  });
}

export class EnvironmentSecretResolver implements ProviderSecretResolver {
  public constructor(
    private readonly environment: Readonly<
      Record<string, string | undefined>
    > = process.env,
  ) {}

  async get(name: string): Promise<string | null> {
    if (!/^[A-Z][A-Z0-9_]*$/u.test(name)) return null;
    return this.environment[name] ?? null;
  }
}

function normalizeMigrationError(error: unknown): unknown {
  if (error instanceof GstackError) return error;
  if (
    error instanceof MigrationFileSystemError ||
    error instanceof MigrationFileError ||
    error instanceof MigrationApplyError ||
    error instanceof MigrationLockError ||
    error instanceof MigrationExecutionError
  ) {
    return new GstackError(
      {
        code: error.code,
        category: 'migration',
        message: error.message,
      },
      { cause: error },
    );
  }
  return error;
}
