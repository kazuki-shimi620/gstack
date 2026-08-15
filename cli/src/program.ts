import {
  failureResult,
  getErrorDetails,
  GstackError,
  successResult,
  type GstackProject,
} from '@gstack/core';
import {
  applyStandardGoogleMigrationFile,
  buildStandardGoogle,
  loadStandardProject,
  prepareStandardGoogleMigrationApplyFile,
  prepareStandardGoogleMigrationRollbackFile,
  prepareStandardGoogleDeploy,
  deployStandardGoogle,
  initializeStandardGoogleProject,
  prepareStandardGoogleProjectInitialization,
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
  formatMigrationStatusHuman,
  formatProviderHealthHuman,
  formatProviderInfoHuman,
  formatProviderListHuman,
  formatProviderValidationHuman,
  formatProjectInitializationHuman,
  formatValidationHuman,
} from './formatters.js';

export interface ProgramIO {
  readonly stdout: (message: string) => void;
  readonly stderr: (message: string) => void;
}

export interface ProgramServices {
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
}

const defaultServices: ProgramServices = {
  loadProject: loadStandardProject,
  prepareMigrationApplyFile: (project, filePath) =>
    prepareStandardGoogleMigrationApplyFile({ project, filePath }),
  applyMigrationFile: (project, input) =>
    applyStandardGoogleMigrationFile({ project, ...input }),
  prepareMigrationRollbackFile: (project, filePath) =>
    prepareStandardGoogleMigrationRollbackFile({ project, filePath }),
  prepareDeploy: (project) => prepareStandardGoogleDeploy({ project }),
  executeDeploy: (project, approval) =>
    deployStandardGoogle({ project, approval }),
  prepareProjectInitialization: (project) =>
    prepareStandardGoogleProjectInitialization({ project }),
  initializeProject: (project, approval) =>
    initializeStandardGoogleProject({ project, approval }),
  build: (project, dryRun) => buildStandardGoogle({ project, dryRun }),
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
    .description('Preview rollback of the latest applied Migration')
    .requiredOption(
      '--file <path>',
      'applied Migration YAML inside migrations/',
    )
    .option('--dry-run', 'validate and preview without changing Provider state')
    .option('--json', 'output structured JSON')
    .action(
      async (options: { file: string; dryRun?: boolean; json?: boolean }) => {
        await withProjectOutput(
          io,
          options.json,
          async (project) => {
            if (!options.dryRun) {
              throw new GstackError({
                code: 'MIGRATION_ROLLBACK_DRY_RUN_REQUIRED',
                category: 'migration',
                message: 'Migration Rollback is available as dry-run only.',
                hint: 'Pass --dry-run to inspect the rollback Plan.',
              });
            }
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
