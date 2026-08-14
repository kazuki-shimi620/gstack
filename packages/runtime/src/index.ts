import path from 'node:path';

import {
  findProjectRoot,
  loadProjectConfig,
  type GstackConfig,
} from '@gstack/config';
import { GstackError, loadProject, type GstackProject } from '@gstack/core';
import {
  applyCapabilityResults,
  MigrationReadService,
  prepareMigrationApply,
  type MigrationFile,
  type MigrationPlan,
  type PreparedMigrationApply,
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
