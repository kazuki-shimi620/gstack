import {
  failureResult,
  getErrorDetails,
  GstackError,
  successResult,
  type GstackProject,
} from '@gstack/core';
import {
  applyStandardGoogleMigrationFile,
  applyStandardPluginInstall,
  applyStandardPluginRemove,
  buildStandardGoogle,
  listStandardPlugins,
  loadStandardProject,
  prepareStandardPluginInstall,
  prepareStandardPluginRemove,
  prepareStandardGoogleMigrationApplyFile,
  prepareStandardGoogleMigrationRollbackFile,
  prepareStandardGoogleMigrationUnlockFile,
  rollbackStandardGoogleMigrationFile,
  unlockStandardGoogleMigrationFile,
  prepareStandardGoogleDeploy,
  deployStandardGoogle,
  initializeStandardGoogleProject,
  initializeLocalProject,
  initializeSchemaModel,
  prepareStandardGoogleProjectInitialization,
  startStandardDevServer,
  validateStandardPluginPackage,
} from '@gstack/runtime';
import { Command } from 'commander';

import {
  formatErrorHuman,
  formatDeployPreviewHuman,
  formatDeployResultHuman,
  formatBuildHuman,
  formatGenerationHuman,
  formatJson,
  formatMigrationHistoryHuman,
  formatMigrationApplyDryRunHuman,
  formatMigrationApplyHuman,
  formatMigrationPlanHuman,
  formatMigrationRollbackDryRunHuman,
  formatMigrationRollbackHuman,
  formatMigrationUnlockHuman,
  formatMigrationStatusHuman,
  formatProviderHealthHuman,
  formatProviderInfoHuman,
  formatProviderListHuman,
  formatProviderValidationHuman,
  formatPluginListHuman,
  formatPluginChangePlanHuman,
  formatPluginPackageValidationHuman,
  formatProjectInitializationHuman,
  formatValidationHuman,
} from './formatters.js';

export interface ProgramIO {
  readonly stdout: (message: string) => void;
  readonly stderr: (message: string) => void;
}

export interface ProgramServices {
  readonly initializeLocalProject?: (
    name: string,
  ) => ReturnType<typeof initializeLocalProject>;
  readonly initializeSchemaModel?: (
    project: GstackProject,
    model: string,
  ) => ReturnType<typeof initializeSchemaModel>;
  readonly loadProject: () => Promise<GstackProject>;
  readonly prepareMigrationApplyFile: (
    project: GstackProject,
    filePath: string,
  ) => ReturnType<typeof prepareStandardGoogleMigrationApplyFile>;
  readonly applyMigrationFile: (
    project: GstackProject,
    input: {
      readonly filePath: string;
      readonly approval: string;
      readonly allowDestructive: boolean;
      readonly resume: boolean;
    },
  ) => ReturnType<typeof applyStandardGoogleMigrationFile>;
  readonly prepareMigrationRollbackFile: (
    project: GstackProject,
    filePath: string,
  ) => ReturnType<typeof prepareStandardGoogleMigrationRollbackFile>;
  readonly rollbackMigrationFile?: (
    project: GstackProject,
    input: {
      readonly filePath: string;
      readonly approval: string;
      readonly allowDestructive: boolean;
      readonly resume: boolean;
    },
  ) => ReturnType<typeof rollbackStandardGoogleMigrationFile>;
  readonly prepareMigrationUnlockFile?: (
    project: GstackProject,
    filePath: string,
  ) => ReturnType<typeof prepareStandardGoogleMigrationUnlockFile>;
  readonly unlockMigrationFile?: (
    project: GstackProject,
    filePath: string,
    approval: string,
  ) => ReturnType<typeof unlockStandardGoogleMigrationFile>;
  readonly prepareDeploy?: (
    project: GstackProject,
  ) => ReturnType<typeof prepareStandardGoogleDeploy>;
  readonly executeDeploy?: (
    project: GstackProject,
    approval: string,
  ) => ReturnType<typeof deployStandardGoogle>;
  readonly prepareProjectInitialization?: (
    project: GstackProject,
  ) => ReturnType<typeof prepareStandardGoogleProjectInitialization>;
  readonly initializeProject?: (
    project: GstackProject,
    approval: string,
  ) => ReturnType<typeof initializeStandardGoogleProject>;
  readonly build?: (
    project: GstackProject,
    dryRun: boolean,
  ) => ReturnType<typeof buildStandardGoogle>;
  readonly startDev?: (
    project: GstackProject,
    port: number,
  ) => ReturnType<typeof startStandardDevServer>;
  readonly listPlugins?: () => ReturnType<typeof listStandardPlugins>;
  readonly preparePluginInstall?: (
    packageSpec: string,
  ) => ReturnType<typeof prepareStandardPluginInstall>;
  readonly preparePluginRemove?: (
    packageName: string,
  ) => ReturnType<typeof prepareStandardPluginRemove>;
  readonly applyPluginInstall?: (
    packageSpec: string,
    approval: string,
  ) => ReturnType<typeof applyStandardPluginInstall>;
  readonly applyPluginRemove?: (
    packageName: string,
    approval: string,
  ) => ReturnType<typeof applyStandardPluginRemove>;
  readonly validatePluginPackage?: (
    directory: string,
  ) => ReturnType<typeof validateStandardPluginPackage>;
}

const defaultServices: ProgramServices = {
  initializeLocalProject: (name) => initializeLocalProject({ name }),
  initializeSchemaModel: (project, model) =>
    initializeSchemaModel({ project, model }),
  loadProject: loadStandardProject,
  prepareMigrationApplyFile: (project, filePath) =>
    prepareStandardGoogleMigrationApplyFile({ project, filePath }),
  applyMigrationFile: (project, input) =>
    applyStandardGoogleMigrationFile({ project, ...input }),
  prepareMigrationRollbackFile: (project, filePath) =>
    prepareStandardGoogleMigrationRollbackFile({ project, filePath }),
  rollbackMigrationFile: (project, input) =>
    rollbackStandardGoogleMigrationFile({ project, ...input }),
  prepareMigrationUnlockFile: (project, filePath) =>
    prepareStandardGoogleMigrationUnlockFile({ project, filePath }),
  unlockMigrationFile: (project, filePath, approval) =>
    unlockStandardGoogleMigrationFile({ project, filePath, approval }),
  prepareDeploy: (project) => prepareStandardGoogleDeploy({ project }),
  executeDeploy: (project, approval) =>
    deployStandardGoogle({ project, approval }),
  prepareProjectInitialization: (project) =>
    prepareStandardGoogleProjectInitialization({ project }),
  initializeProject: (project, approval) =>
    initializeStandardGoogleProject({ project, approval }),
  build: (project, dryRun) => buildStandardGoogle({ project, dryRun }),
  startDev: (project, port) => startStandardDevServer({ project, port }),
  listPlugins: () => listStandardPlugins(),
  preparePluginInstall: (packageSpec) =>
    prepareStandardPluginInstall({ packageSpec }),
  preparePluginRemove: (packageName) =>
    prepareStandardPluginRemove({ packageName }),
  applyPluginInstall: (packageSpec, approval) =>
    applyStandardPluginInstall({ packageSpec, approval }),
  applyPluginRemove: (packageName, approval) =>
    applyStandardPluginRemove({ packageName, approval }),
  validatePluginPackage: (directory) =>
    validateStandardPluginPackage({ directory }),
};

export function createProgram(
  io: ProgramIO = {
    stdout: (message) => process.stdout.write(`${message}\n`),
    stderr: (message) => process.stderr.write(`${message}\n`),
  },
  services: ProgramServices = defaultServices,
): Command {
  const program = new Command()
    .name('gstack')
    .description('Schema-first application framework')
    .version('0.0.0');

  const schema = program.command('schema').description('Manage Schema files');
  const provider = program
    .command('provider')
    .description('Inspect configured Providers');
  const plugin = program
    .command('plugin')
    .description('Inspect allowlisted Plugins');
  const pluginPackage = plugin
    .command('package')
    .description('Validate a Plugin package before publishing');
  const migration = program
    .command('migration')
    .description('Inspect Migration state and plans');
  program
    .command('version')
    .description('Show the gstack CLI version')
    .action(() => io.stdout('0.0.0'));

  provider
    .command('list')
    .description('List enabled Providers')
    .option('--json', 'output structured JSON')
    .action(async (options: { json?: boolean }) => {
      await withProviderOutput(io, options.json, async (project) => {
        const providers = await project.listProviders();
        return {
          data: { providers },
          human: formatProviderListHuman(providers),
        };
      });
    });

  plugin
    .command('list')
    .description('List validated allowlisted Plugins')
    .option('--json', 'output structured JSON')
    .action(async (options: { json?: boolean }) => {
      await withOutput(io, options.json, async () => {
        const plugins = await (services.listPlugins ?? listStandardPlugins)();
        return {
          data: { plugins },
          human: formatPluginListHuman(plugins),
        };
      });
    });

  plugin
    .command('install')
    .description('Preview installation of an exact Plugin package version')
    .argument('<package-spec>', 'npm package with an exact SemVer version')
    .option('--dry-run', 'create a Plan without changing files or packages')
    .option('--approval <fingerprint>', 'approve the exact current Plan')
    .option('--json', 'output structured JSON')
    .action(
      async (
        packageSpec: string,
        options: { dryRun?: boolean; approval?: string; json?: boolean },
      ) => {
        await withOutput(io, options.json, async () => {
          validatePluginChangeOptions('install', options);
          const plan = options.dryRun
            ? await (
                services.preparePluginInstall ??
                ((selected) =>
                  prepareStandardPluginInstall({ packageSpec: selected }))
              )(packageSpec)
            : await (
                services.applyPluginInstall ??
                ((selected, approval) =>
                  applyStandardPluginInstall({
                    packageSpec: selected,
                    approval,
                  }))
              )(packageSpec, options.approval as string);
          return {
            data: { dryRun: Boolean(options.dryRun), pluginChange: plan },
            human: formatPluginChangePlanHuman(plan, Boolean(options.dryRun)),
          };
        });
      },
    );

  plugin
    .command('remove')
    .description('Preview removal of an unused Plugin package')
    .argument('<package-name>', 'allowlisted npm package name')
    .option('--dry-run', 'create a Plan without changing files or packages')
    .option('--approval <fingerprint>', 'approve the exact current Plan')
    .option('--json', 'output structured JSON')
    .action(
      async (
        packageName: string,
        options: { dryRun?: boolean; approval?: string; json?: boolean },
      ) => {
        await withOutput(io, options.json, async () => {
          validatePluginChangeOptions('remove', options);
          const plan = options.dryRun
            ? await (
                services.preparePluginRemove ??
                ((selected) =>
                  prepareStandardPluginRemove({ packageName: selected }))
              )(packageName)
            : await (
                services.applyPluginRemove ??
                ((selected, approval) =>
                  applyStandardPluginRemove({
                    packageName: selected,
                    approval,
                  }))
              )(packageName, options.approval as string);
          return {
            data: { dryRun: Boolean(options.dryRun), pluginChange: plan },
            human: formatPluginChangePlanHuman(plan, Boolean(options.dryRun)),
          };
        });
      },
    );

  pluginPackage
    .command('validate')
    .description('Validate local package metadata and npm pack contents')
    .option('--directory <path>', 'Plugin package directory', process.cwd())
    .option('--json', 'output structured JSON')
    .action(async (options: { directory: string; json?: boolean }) => {
      await withOutput(io, options.json, async () => {
        const validation = await (
          services.validatePluginPackage ??
          ((directory) => validateStandardPluginPackage({ directory }))
        )(options.directory);
        return {
          data: { pluginPackage: validation },
          human: formatPluginPackageValidationHuman(validation),
        };
      });
    });

  migration
    .command('status')
    .description('Show read-only Migration status')
    .option('--json', 'output structured JSON')
    .action(async (options: { json?: boolean }) => {
      await withProjectOutput(io, options.json, async (project) => {
        const status = await project.getMigrationStatus();
        return {
          data: { migrationStatus: status },
          human: formatMigrationStatusHuman(status),
        };
      });
    });

  migration
    .command('apply')
    .description('Validate one Migration File before explicit Apply')
    .requiredOption('--file <path>', 'Migration YAML inside migrations/')
    .option('--dry-run', 'validate and preview without changing Provider state')
    .option('--approval <fingerprint>', 'approve the exact evaluated Plan')
    .option('--allow-destructive', 'allow an approved destructive Plan')
    .option('--resume', 'resume an explicitly approved failed Migration')
    .option('--json', 'output structured JSON')
    .action(
      async (options: {
        file: string;
        dryRun?: boolean;
        approval?: string;
        allowDestructive?: boolean;
        resume?: boolean;
        json?: boolean;
      }) => {
        await withProjectOutput(
          io,
          options.json,
          async (project) => {
            if (
              options.dryRun &&
              (options.approval || options.allowDestructive || options.resume)
            ) {
              throw new GstackError({
                code: 'MIGRATION_OPTIONS_INVALID',
                category: 'migration',
                message: 'Migration dry-run cannot include Apply options.',
                hint: 'Run dry-run alone, then pass its fingerprint to --approval.',
              });
            }
            if (!options.dryRun && !options.approval) {
              throw new GstackError({
                code: 'MIGRATION_DRY_RUN_REQUIRED',
                category: 'migration',
                message:
                  'Migration Apply requires an explicit approval fingerprint.',
                hint: 'Run with --dry-run, then pass its fingerprint to --approval.',
              });
            }
            if (options.dryRun) {
              const prepared = await services.prepareMigrationApplyFile(
                project,
                options.file,
              );
              const migrationApply = {
                version: prepared.file.version,
                name: prepared.file.name,
                checksum: prepared.file.checksum,
                planFingerprint: prepared.planFingerprint,
                plan: prepared.plan,
              };
              return {
                data: { dryRun: true, migrationApply },
                human: formatMigrationApplyDryRunHuman(migrationApply),
              };
            }
            const result = await services.applyMigrationFile(project, {
              filePath: options.file,
              approval: options.approval as string,
              allowDestructive: Boolean(options.allowDestructive),
              resume: Boolean(options.resume),
            });
            return {
              data: { dryRun: false, migrationApply: result },
              human: formatMigrationApplyHuman(result),
            };
          },
          services.loadProject,
        );
      },
    );

  migration
    .command('history')
    .description('List Migration History without changing it')
    .option('--json', 'output structured JSON')
    .action(async (options: { json?: boolean }) => {
      await withProjectOutput(io, options.json, async (project) => {
        const history = await project.listMigrationHistory();
        return {
          data: { migrationHistory: history },
          human: formatMigrationHistoryHuman(history),
        };
      });
    });

  migration
    .command('rollback')
    .description('Rollback the latest applied Migration with explicit approval')
    .requiredOption(
      '--file <path>',
      'applied Migration YAML inside migrations/',
    )
    .option('--dry-run', 'validate and preview without changing Provider state')
    .option('--approval <fingerprint>', 'approve the exact rollback Plan')
    .option('--allow-destructive', 'allow an approved destructive rollback')
    .option('--resume', 'resume an explicitly approved failed rollback')
    .option('--json', 'output structured JSON')
    .action(
      async (options: {
        file: string;
        dryRun?: boolean;
        approval?: string;
        allowDestructive?: boolean;
        resume?: boolean;
        json?: boolean;
      }) => {
        await withProjectOutput(
          io,
          options.json,
          async (project) => {
            if (
              options.dryRun &&
              (options.approval || options.allowDestructive || options.resume)
            ) {
              throw new GstackError({
                code: 'MIGRATION_OPTIONS_INVALID',
                category: 'migration',
                message:
                  'Migration Rollback dry-run cannot include execution options.',
                hint: 'Run dry-run alone, then pass its fingerprint to --approval.',
              });
            }
            if (!options.dryRun && !options.approval) {
              throw new GstackError({
                code: 'MIGRATION_ROLLBACK_DRY_RUN_REQUIRED',
                category: 'migration',
                message:
                  'Migration Rollback requires an explicit approval fingerprint.',
                hint: 'Run with --dry-run, then pass its fingerprint to --approval.',
              });
            }
            if (options.dryRun) {
              const preview = await services.prepareMigrationRollbackFile(
                project,
                options.file,
              );
              const migrationRollback = {
                sourceVersion: preview.sourceVersion,
                sourceChecksum: preview.sourceChecksum,
                targetVersion: preview.targetVersion,
                planFingerprint: preview.planFingerprint,
                plan: preview.plan,
              };
              return {
                data: { dryRun: true, migrationRollback },
                human: formatMigrationRollbackDryRunHuman(migrationRollback),
              };
            }
            const result = await (
              services.rollbackMigrationFile ??
              ((selected, input) =>
                rollbackStandardGoogleMigrationFile({
                  project: selected,
                  ...input,
                }))
            )(project, {
              filePath: options.file,
              approval: options.approval as string,
              allowDestructive: Boolean(options.allowDestructive),
              resume: Boolean(options.resume),
            });
            return {
              data: { dryRun: false, migrationRollback: result },
              human: formatMigrationRollbackHuman(result),
            };
          },
          services.loadProject,
        );
      },
    );

  migration
    .command('unlock')
    .description('Recover an interrupted Migration and remove its lock')
    .requiredOption(
      '--file <path>',
      'interrupted Migration YAML inside migrations/',
    )
    .option(
      '--dry-run',
      'inspect recovery without changing History or Provider state',
    )
    .option('--approval <fingerprint>', 'approve the exact recovery state')
    .option('--json', 'output structured JSON')
    .action(
      async (options: {
        file: string;
        dryRun?: boolean;
        approval?: string;
        json?: boolean;
      }) => {
        await withProjectOutput(
          io,
          options.json,
          async (project) => {
            if (options.dryRun && options.approval) {
              throw new GstackError({
                code: 'MIGRATION_OPTIONS_INVALID',
                category: 'migration',
                message: 'Migration unlock dry-run cannot include approval.',
                hint: 'Run dry-run alone, then pass its fingerprint to --approval.',
              });
            }
            if (!options.dryRun && !options.approval) {
              throw new GstackError({
                code: 'MIGRATION_UNLOCK_APPROVAL_INVALID',
                category: 'migration',
                message:
                  'Migration unlock requires an explicit approval fingerprint.',
                hint: 'Run with --dry-run after confirming the old process has stopped.',
              });
            }
            const recovery = options.dryRun
              ? await (
                  services.prepareMigrationUnlockFile ??
                  ((selected, filePath) =>
                    prepareStandardGoogleMigrationUnlockFile({
                      project: selected,
                      filePath,
                    }))
                )(project, options.file)
              : await (
                  services.unlockMigrationFile ??
                  ((selected, filePath, approval) =>
                    unlockStandardGoogleMigrationFile({
                      project: selected,
                      filePath,
                      approval,
                    }))
                )(project, options.file, options.approval as string);
            return {
              data: {
                dryRun: Boolean(options.dryRun),
                migrationUnlock: recovery,
              },
              human: formatMigrationUnlockHuman(
                recovery,
                Boolean(options.dryRun),
              ),
            };
          },
          services.loadProject,
        );
      },
    );

  migration
    .command('plan')
    .description('Preview a Provider-independent Migration Plan')
    .option('--json', 'output structured JSON')
    .action(async (options: { json?: boolean }) => {
      await withProjectOutput(io, options.json, async (project) => {
        const preview = await project.previewMigrationPlan();
        return {
          data: { migrationPlan: preview },
          human: formatMigrationPlanHuman(preview),
        };
      });
    });

  provider
    .command('info <name>')
    .description('Show one Provider manifest and capabilities')
    .option('--json', 'output structured JSON')
    .action(async (name: string, options: { json?: boolean }) => {
      await withProviderOutput(io, options.json, async (project) => {
        const selected = await project.getProvider(name);
        if (!selected) {
          throw new GstackError({
            code: 'PROVIDER_NOT_FOUND',
            category: 'provider',
            message: `Provider not found: ${name}`,
          });
        }
        return {
          data: { provider: selected },
          human: formatProviderInfoHuman(selected),
        };
      });
    });

  provider
    .command('validate <name>')
    .description('Validate one Provider configuration without changing it')
    .option('--json', 'output structured JSON')
    .action(async (name: string, options: { json?: boolean }) => {
      await withProviderOutput(io, options.json, async (project) => {
        const issues = await project.validateProvider(name);
        return {
          data: { name, issues },
          human: formatProviderValidationHuman(name, issues),
          failed: issues.some(({ severity }) => severity === 'error'),
        };
      });
    });

  provider
    .command('health <name>')
    .description('Read one Provider health status without changing it')
    .option('--json', 'output structured JSON')
    .action(async (name: string, options: { json?: boolean }) => {
      await withProviderOutput(io, options.json, async (project) => {
        const health = await project.getProviderHealth(name);
        return {
          data: { name, health },
          human: formatProviderHealthHuman(name, health),
          failed: health.status === 'unavailable',
        };
      });
    });

  provider
    .command('initialize <name>')
    .description('Initialize an empty Provider project for gstack management')
    .option(
      '--dry-run',
      'inspect initialization without changing Provider state',
    )
    .option(
      '--approval <fingerprint>',
      'approve the exact initialization state',
    )
    .option('--json', 'output structured JSON')
    .action(
      async (
        name: string,
        options: { dryRun?: boolean; approval?: string; json?: boolean },
      ) => {
        await withProjectOutput(
          io,
          options.json,
          async (project) => {
            if (name !== 'google') {
              throw new GstackError({
                code: 'PROJECT_INITIALIZATION_NOT_AVAILABLE',
                category: 'provider',
                message: `Project Initialization is not available for Provider: ${name}`,
              });
            }
            if (options.dryRun && options.approval) {
              throw new GstackError({
                code: 'PROJECT_INITIALIZATION_APPROVAL_INVALID',
                category: 'provider',
                message: 'Initialization dry-run cannot include approval.',
              });
            }
            if (!options.dryRun && !options.approval) {
              throw new GstackError({
                code: 'PROJECT_INITIALIZATION_APPROVAL_REQUIRED',
                category: 'provider',
                message: 'Project Initialization requires explicit approval.',
                hint: 'Run provider initialize google --dry-run first.',
              });
            }
            const preview = options.dryRun
              ? await (
                  services.prepareProjectInitialization ??
                  ((selected) =>
                    prepareStandardGoogleProjectInitialization({
                      project: selected,
                    }))
                )(project)
              : await (
                  services.initializeProject ??
                  ((selected, approval) =>
                    initializeStandardGoogleProject({
                      project: selected,
                      approval,
                    }))
                )(project, options.approval as string);
            return {
              data: {
                dryRun: Boolean(options.dryRun),
                initialization: preview,
              },
              human: formatProjectInitializationHuman(
                preview,
                Boolean(options.dryRun),
              ),
            };
          },
          services.loadProject,
        );
      },
    );

  program
    .command('init <name>')
    .description('Create a new local gstack project')
    .option('--json', 'output structured JSON')
    .action(async (name: string, options: { json?: boolean }) => {
      try {
        const result = await (
          services.initializeLocalProject ??
          ((projectName) => initializeLocalProject({ name: projectName }))
        )(name);
        io.stdout(
          options.json
            ? formatJson(successResult({ projectInitialization: result }))
            : [
                `Project initialized: ${result.name}`,
                `Root: ${result.root}`,
                ...result.createdPaths.map((created) => `Created: ${created}`),
                'Next: add a Schema Model under schema/.',
              ].join('\n'),
        );
      } catch (error: unknown) {
        const details = getErrorDetails(error);
        io.stderr(
          options.json
            ? formatJson(failureResult(details))
            : formatErrorHuman(details),
        );
        process.exitCode = details.category === 'configuration' ? 3 : 1;
      }
    });

  schema
    .command('init <model>')
    .description('Create a minimal Schema Model without overwriting files')
    .option('--json', 'output structured JSON')
    .action(async (model: string, options: { json?: boolean }) => {
      await withProjectOutput(
        io,
        options.json,
        async (project) => {
          const result = await (
            services.initializeSchemaModel ??
            ((selected, name) =>
              initializeSchemaModel({ project: selected, model: name }))
          )(project, model);
          return {
            data: { schemaInitialization: result },
            human: [
              `Schema Model initialized: ${result.model}`,
              `Created: ${result.path}`,
            ].join('\n'),
          };
        },
        services.loadProject,
      );
    });

  schema
    .command('validate')
    .description('Validate project Schema files')
    .option('--json', 'output structured JSON')
    .action(async (options: { json?: boolean }) => {
      try {
        const project = await loadStandardProject();
        const result = await project.validateSchema();
        io.stdout(
          options.json
            ? formatJson(successResult(result, result.warnings))
            : formatValidationHuman(result),
        );
        if (!result.valid) {
          process.exitCode = 2;
        }
      } catch (error: unknown) {
        const details = getErrorDetails(error);
        io.stderr(
          options.json
            ? formatJson(failureResult(details))
            : formatErrorHuman(details),
        );
        process.exitCode = details.category === 'configuration' ? 3 : 1;
      }
    });

  program
    .command('generate')
    .description('Generate configured Artifacts from the Application Model')
    .option('--dry-run', 'preview writes and deletes without changing files')
    .option('--json', 'output structured JSON')
    .action(async (options: { dryRun?: boolean; json?: boolean }) => {
      try {
        const project = await loadStandardProject();
        const plan = options.dryRun
          ? await project.previewGeneration()
          : await project.generate();
        io.stdout(
          options.json
            ? formatJson(
                successResult({ dryRun: Boolean(options.dryRun), plan }),
              )
            : formatGenerationHuman(plan, Boolean(options.dryRun)),
        );
      } catch (error: unknown) {
        const details = getErrorDetails(error);
        io.stderr(
          options.json
            ? formatJson(failureResult(details))
            : formatErrorHuman(details),
        );
        process.exitCode = details.category === 'configuration' ? 3 : 1;
      }
    });

  program
    .command('build')
    .description('Build generated Artifacts and validate the Deploy bundle')
    .option('--dry-run', 'preview Build without changing generated files')
    .option('--json', 'output structured JSON')
    .action(async (options: { dryRun?: boolean; json?: boolean }) => {
      await withProjectOutput(
        io,
        options.json,
        async (project) => {
          const result = await (
            services.build ??
            ((selected, dryRun) =>
              buildStandardGoogle({ project: selected, dryRun }))
          )(project, Boolean(options.dryRun));
          return {
            data: { build: result },
            human: formatBuildHuman(result),
          };
        },
        services.loadProject,
      );
    });

  program
    .command('deploy')
    .description('Build and deploy the configured application')
    .option('--dry-run', 'build and preview without changing Provider state')
    .option('--approval <fingerprint>', 'approve the exact Deploy build')
    .option('--json', 'output structured JSON')
    .action(
      async (options: {
        dryRun?: boolean;
        approval?: string;
        json?: boolean;
      }) => {
        await withProjectOutput(
          io,
          options.json,
          async (project) => {
            if (options.dryRun && options.approval) {
              throw new GstackError({
                code: 'DEPLOY_APPROVAL_INVALID',
                category: 'deploy',
                message: 'Deploy dry-run cannot include approval.',
              });
            }
            if (!options.dryRun && !options.approval) {
              throw new GstackError({
                code: 'DEPLOY_APPROVAL_REQUIRED',
                category: 'deploy',
                message: 'Deploy requires an explicit approval fingerprint.',
                hint: 'Run deploy --dry-run, then pass its fingerprint to --approval.',
              });
            }
            if (!options.dryRun) {
              const result = await (
                services.executeDeploy ??
                ((selected, approval) =>
                  deployStandardGoogle({ project: selected, approval }))
              )(project, options.approval as string);
              return {
                data: { dryRun: false, deploy: result },
                human: formatDeployResultHuman(result),
              };
            }
            const preview = await (
              services.prepareDeploy ??
              ((selected) => prepareStandardGoogleDeploy({ project: selected }))
            )(project);
            return {
              data: { dryRun: true, deploy: preview },
              human: formatDeployPreviewHuman(preview),
            };
          },
          services.loadProject,
        );
      },
    );

  program
    .command('dev')
    .description('Start the loopback-only in-memory development API')
    .option('--port <port>', 'loopback port', '3000')
    .action(async (options: { port: string }) => {
      const port = Number(options.port);
      if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
        throw new GstackError({
          code: 'CONFIG_INVALID',
          category: 'configuration',
          message: 'Development server port is invalid.',
        });
      }
      const project = await services.loadProject();
      const server = await (
        services.startDev ??
        ((selected, selectedPort) =>
          startStandardDevServer({ project: selected, port: selectedPort }))
      )(project, port);
      io.stdout(`Development server: ${server.url}`);
      await new Promise<void>((resolve) => {
        const stop = (): void => {
          process.off('SIGINT', stop);
          process.off('SIGTERM', stop);
          void server.close().finally(resolve);
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
      });
    });

  program.configureOutput({
    writeOut: (message) => io.stdout(message.trimEnd()),
    writeErr: (message) => io.stderr(message.trimEnd()),
  });
  return program;
}

async function withProviderOutput(
  io: ProgramIO,
  json: boolean | undefined,
  operation: (project: GstackProject) => Promise<{
    readonly data: Record<string, unknown>;
    readonly human: string;
    readonly failed?: boolean;
  }>,
): Promise<void> {
  return withProjectOutput(io, json, operation);
}

function validatePluginChangeOptions(
  action: 'install' | 'remove',
  options: { readonly dryRun?: boolean; readonly approval?: string },
): void {
  if (options.dryRun && options.approval) {
    throw new GstackError({
      code: 'CONFIG_INVALID',
      category: 'configuration',
      message: `Plugin ${action} dry-run cannot include an approval.`,
    });
  }
  if (!options.dryRun && !options.approval) {
    throw new GstackError({
      code: 'CONFIG_INVALID',
      category: 'configuration',
      message: `Plugin ${action} requires an explicit approval fingerprint.`,
      hint: 'Run with --dry-run, then pass its fingerprint to --approval.',
    });
  }
}

async function withOutput(
  io: ProgramIO,
  json: boolean | undefined,
  operation: () => Promise<{
    readonly data: Record<string, unknown>;
    readonly human: string;
    readonly failed?: boolean;
  }>,
): Promise<void> {
  try {
    const result = await operation();
    io.stdout(json ? formatJson(successResult(result.data)) : result.human);
    if (result.failed) process.exitCode = 2;
  } catch (error: unknown) {
    const details = getErrorDetails(error);
    io.stderr(
      json ? formatJson(failureResult(details)) : formatErrorHuman(details),
    );
    process.exitCode = details.category === 'configuration' ? 3 : 1;
  }
}

async function withProjectOutput(
  io: ProgramIO,
  json: boolean | undefined,
  operation: (project: GstackProject) => Promise<{
    readonly data: Record<string, unknown>;
    readonly human: string;
    readonly failed?: boolean;
  }>,
  loadProject: () => Promise<GstackProject> = loadStandardProject,
): Promise<void> {
  try {
    const result = await operation(await loadProject());
    io.stdout(json ? formatJson(successResult(result.data)) : result.human);
    if (result.failed) process.exitCode = 2;
  } catch (error: unknown) {
    const details = getErrorDetails(error);
    io.stderr(
      json ? formatJson(failureResult(details)) : formatErrorHuman(details),
    );
    process.exitCode = details.category === 'configuration' ? 3 : 1;
  }
}
