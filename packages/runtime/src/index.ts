import path from 'node:path';
import { createHash } from 'node:crypto';

import {
  findProjectRoot,
  loadProjectConfig,
  type GstackConfig,
} from '@gstack/config';
import {
  GstackError,
  loadProject,
  type GenerationPlan,
  type GstackProject,
} from '@gstack/core';
import {
  applyCapabilityResults,
  createApplicationModelSnapshot,
  applyMigration,
  loadMigrationFile,
  MigrationApplyError,
  MigrationExecutionError,
  MigrationFileError,
  MigrationFileSystemError,
  MigrationLockError,
  MigrationRollbackError,
  MigrationReadService,
  migrationPlanFingerprint,
  prepareMigrationApply,
  previewMigrationRollback,
  type MigrationFile,
  type MigrationHistoryEntry,
  type MigrationPlan,
  type MigrationRollbackPreview,
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
  createDefaultGoogleDeployComponents,
  createDefaultGoogleProvider,
  createGoogleScriptSourceBundle,
  evaluateGoogleMigrationCapabilities,
  parseGoogleProviderConfig,
  type DefaultGoogleMigrationComponents,
  type DefaultGoogleDeployComponents,
  type GoogleScriptFile,
  type GoogleDeploymentResult,
  type GoogleScriptInitializationPreview,
} from '@gstack/provider-google';

export { startStandardDevServer } from './dev.js';
export type { StandardDevServer } from './dev.js';

export interface StandardGoogleDeployPreview {
  readonly provider: 'google';
  readonly scriptId: string;
  readonly fingerprint: string;
  readonly files: readonly {
    readonly name: string;
    readonly type: 'SERVER_JS' | 'HTML' | 'JSON';
    readonly checksum: string;
  }[];
}

export interface StandardGoogleDeployResult {
  readonly fingerprint: string;
  readonly deployment: GoogleDeploymentResult;
}

export interface StandardGoogleBuildResult {
  readonly dryRun: boolean;
  readonly artifacts: readonly {
    readonly path: string;
    readonly checksum: string;
  }[];
  readonly deletes: readonly string[];
  readonly deploy: StandardGoogleDeployPreview;
}

export async function buildStandardGoogle(input: {
  readonly project: GstackProject;
  readonly dryRun: boolean;
}): Promise<StandardGoogleBuildResult> {
  const plan = input.dryRun
    ? await input.project.previewGeneration()
    : await input.project.generate();
  const build = await prepareGoogleDeployBuild(input.project, plan);
  return Object.freeze({
    dryRun: input.dryRun,
    artifacts: Object.freeze(
      plan.writes.map(({ path: artifactPath, checksum }) =>
        Object.freeze({ path: artifactPath, checksum }),
      ),
    ),
    deletes: Object.freeze([...plan.deletes]),
    deploy: build.preview,
  });
}

export async function prepareStandardGoogleProjectInitialization(input: {
  readonly project: GstackProject;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly components?: DefaultGoogleDeployComponents;
}): Promise<GoogleScriptInitializationPreview> {
  const { config, secrets } = await resolveGoogleWriteContext(
    input.project,
    input.environment,
  );
  try {
    const components =
      input.components ?? createDefaultGoogleDeployComponents(config, secrets);
    return await components.content.previewManagementInitialization();
  } catch (error: unknown) {
    throw projectInitializationError(error);
  }
}

export async function initializeStandardGoogleProject(input: {
  readonly project: GstackProject;
  readonly approval: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly components?: DefaultGoogleDeployComponents;
}): Promise<GoogleScriptInitializationPreview> {
  const { config, secrets } = await resolveGoogleWriteContext(
    input.project,
    input.environment,
  );
  try {
    const components =
      input.components ?? createDefaultGoogleDeployComponents(config, secrets);
    const preview = await components.content.previewManagementInitialization();
    if (input.approval !== preview.fingerprint) {
      throw new GstackError({
        code: 'PROJECT_INITIALIZATION_APPROVAL_INVALID',
        category: 'provider',
        message:
          'Project initialization approval does not match current state.',
      });
    }
    await components.content.initializeManagedProject(input.approval);
    return preview;
  } catch (error: unknown) {
    throw projectInitializationError(error);
  }
}

async function resolveGoogleWriteContext(
  project: GstackProject,
  environment?: Readonly<Record<string, string | undefined>>,
) {
  const projectConfig = await project.getConfig();
  const google = projectConfig.providers.find(
    ({ name, enabled }) => name === 'google' && enabled,
  );
  const config = google
    ? parseGoogleProviderConfig(google.configuration).config
    : null;
  if (!config) {
    throw new GstackError({
      code: 'PROJECT_INITIALIZATION_NOT_AVAILABLE',
      category: 'provider',
      message: 'Google Project Initialization is not configured.',
    });
  }
  return Object.freeze({
    config,
    secrets: new EnvironmentSecretResolver(environment ?? process.env),
  });
}

function projectInitializationError(error: unknown): unknown {
  if (error instanceof GstackError) return error;
  return new GstackError(
    {
      code: 'PROJECT_INITIALIZATION_FAILED',
      category: 'provider',
      message: 'Google Project Initialization failed.',
    },
    { cause: error },
  );
}

export async function prepareStandardGoogleDeploy(input: {
  readonly project: GstackProject;
}): Promise<StandardGoogleDeployPreview> {
  return (await prepareGoogleDeployBuild(input.project)).preview;
}

export async function deployStandardGoogle(input: {
  readonly project: GstackProject;
  readonly approval: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly components?: DefaultGoogleDeployComponents;
  readonly migrationHistory?: {
    list(): Promise<readonly MigrationHistoryEntry[]>;
  };
}): Promise<StandardGoogleDeployResult> {
  const build = await prepareGoogleDeployBuild(input.project);
  if (input.approval !== build.preview.fingerprint) {
    throw new GstackError({
      code: 'DEPLOY_APPROVAL_INVALID',
      category: 'deploy',
      message: 'Deploy approval does not match the current build.',
      hint: 'Run deploy --dry-run again and approve its current fingerprint.',
    });
  }
  try {
    const secrets = new EnvironmentSecretResolver(
      input.environment ?? process.env,
    );
    await requireDeployMigrationReady(
      input.project,
      input.migrationHistory ??
        createDefaultGoogleMigrationComponents(build.config, secrets).history,
    );
    const components =
      input.components ??
      createDefaultGoogleDeployComponents(build.config, secrets);
    await components.content.replaceManagedContent(build.bundle);
    const deployment = await components.deployment.publish(
      build.preview.fingerprint,
    );
    return Object.freeze({
      fingerprint: build.preview.fingerprint,
      deployment,
    });
  } catch (error: unknown) {
    if (error instanceof GstackError) throw error;
    throw new GstackError(
      {
        code: 'DEPLOY_FAILED',
        category: 'deploy',
        message: 'Google Deploy failed.',
      },
      { cause: error },
    );
  }
}

async function requireDeployMigrationReady(
  project: GstackProject,
  history: { list(): Promise<readonly MigrationHistoryEntry[]> },
): Promise<void> {
  const application = await project.getApplicationModel();
  if (!application) {
    throw new GstackError({
      code: 'DEPLOY_MIGRATION_NOT_READY',
      category: 'deploy',
      message: 'Deploy requires a valid Application Model.',
    });
  }
  const entries = await history.list();
  const latest = entries.at(-1);
  const checksum = createApplicationModelSnapshot(application).checksum;
  if (
    !latest ||
    latest.status !== 'applied' ||
    latest.completedOperationCount !== latest.operationCount ||
    latest.appliedSnapshot?.checksum !== checksum
  ) {
    throw new GstackError({
      code: 'DEPLOY_MIGRATION_NOT_READY',
      category: 'deploy',
      message: 'Deploy requires the latest Schema Migration to be applied.',
      hint: 'Preview and apply the current Migration before deploying.',
    });
  }
}

async function prepareGoogleDeployBuild(
  project: GstackProject,
  existingPlan?: GenerationPlan,
): Promise<{
  readonly config: NonNullable<
    ReturnType<typeof parseGoogleProviderConfig>['config']
  >;
  readonly bundle: readonly GoogleScriptFile[];
  readonly preview: StandardGoogleDeployPreview;
}> {
  const config = await project.getConfig();
  const google = config.providers.find(
    ({ name, enabled }) => name === 'google' && enabled,
  );
  if (!google) {
    throw new GstackError({
      code: 'DEPLOY_NOT_AVAILABLE',
      category: 'deploy',
      message: 'Google Deploy is not configured for this project.',
    });
  }
  const parsed = parseGoogleProviderConfig(google.configuration);
  if (!parsed.config) {
    throw new GstackError({
      code: 'CONFIG_INVALID',
      category: 'provider',
      message: 'Google Provider configuration is invalid.',
    });
  }
  try {
    const plan = existingPlan ?? (await project.previewGeneration());
    const artifacts = plan.writes.filter(({ path: artifactPath }) =>
      artifactPath.startsWith('generated/backend/appsscript/'),
    );
    const bundle = createGoogleScriptSourceBundle(artifacts, parsed.config);
    const files = Object.freeze(
      bundle.map((file) =>
        Object.freeze({
          name: file.name,
          type: file.type,
          checksum: createHash('sha256')
            .update(file.source, 'utf8')
            .digest('hex'),
        }),
      ),
    );
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          formatVersion: 1,
          provider: 'google',
          scriptId: parsed.config.appsScriptProjectId,
          files,
        }),
        'utf8',
      )
      .digest('hex');
    const preview = Object.freeze({
      provider: 'google',
      scriptId: parsed.config.appsScriptProjectId,
      fingerprint,
      files,
    });
    return Object.freeze({ config: parsed.config, bundle, preview });
  } catch (error: unknown) {
    if (error instanceof GstackError) throw error;
    throw new GstackError(
      {
        code: 'DEPLOY_BUILD_INVALID',
        category: 'deploy',
        message: 'Apps Script Deploy build is invalid.',
      },
      { cause: error },
    );
  }
}

export interface LoadStandardProjectOptions {
  readonly root?: string;
  readonly startDirectory?: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
}

export interface StandardGoogleMigrationRuntime extends DefaultGoogleMigrationComponents {
  evaluate(plan: MigrationPlan): MigrationPlan;
  readonly providerContext: string;
}

export interface StandardGoogleMigrationRollbackPreview extends Omit<
  MigrationRollbackPreview,
  'plan'
> {
  readonly plan: MigrationPlan;
  readonly planFingerprint: string;
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

export function prepareStandardGoogleMigrationRollback(input: {
  readonly file: MigrationFile;
  readonly history: readonly MigrationHistoryEntry[];
  readonly runtime: StandardGoogleMigrationRuntime;
}): StandardGoogleMigrationRollbackPreview {
  const preview = previewMigrationRollback({
    file: input.file,
    history: input.history,
  });
  const plan = input.runtime.evaluate(preview.plan);
  return Object.freeze({
    ...preview,
    plan,
    planFingerprint: migrationPlanFingerprint(input.file, plan),
  });
}

export async function prepareStandardGoogleMigrationRollbackFile(input: {
  readonly project: GstackProject;
  readonly filePath: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
}): Promise<StandardGoogleMigrationRollbackPreview> {
  try {
    const runtime = await resolveStandardGoogleMigrationRuntime(
      input.project,
      input.environment,
    );
    const [file, history] = await Promise.all([
      loadMigrationFile(input.project.root, input.filePath),
      runtime.history.list(),
    ]);
    return prepareStandardGoogleMigrationRollback({ file, history, runtime });
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
  try {
    const [file, runtime] = await Promise.all([
      loadMigrationFile(input.project.root, input.filePath),
      resolveStandardGoogleMigrationRuntime(input.project, input.environment),
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

async function resolveStandardGoogleMigrationRuntime(
  project: GstackProject,
  environment?: Readonly<Record<string, string | undefined>>,
): Promise<StandardGoogleMigrationRuntime> {
  const config = await project.getConfig();
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
  return createStandardGoogleMigrationRuntime({
    configuration: google.configuration,
    secrets: new EnvironmentSecretResolver(environment ?? process.env),
  });
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
    error instanceof MigrationExecutionError ||
    error instanceof MigrationRollbackError
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
