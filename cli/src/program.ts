import {
  failureResult,
  getErrorDetails,
  GstackError,
  successResult,
  type GstackProject,
} from '@gstack/core';
import {
  loadStandardProject,
  prepareStandardGoogleMigrationApplyFile,
} from '@gstack/runtime';
import { Command } from 'commander';

import {
  formatErrorHuman,
  formatGenerationHuman,
  formatJson,
  formatMigrationHistoryHuman,
  formatMigrationApplyDryRunHuman,
  formatMigrationPlanHuman,
  formatMigrationStatusHuman,
  formatProviderHealthHuman,
  formatProviderInfoHuman,
  formatProviderListHuman,
  formatProviderValidationHuman,
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
}

const defaultServices: ProgramServices = {
  loadProject: loadStandardProject,
  prepareMigrationApplyFile: (project, filePath) =>
    prepareStandardGoogleMigrationApplyFile({ project, filePath }),
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
    .option('--json', 'output structured JSON')
    .action(
      async (options: { file: string; dryRun?: boolean; json?: boolean }) => {
        await withProjectOutput(
          io,
          options.json,
          async (project) => {
            if (!options.dryRun) {
              throw new GstackError({
                code: 'MIGRATION_DRY_RUN_REQUIRED',
                category: 'migration',
                message: 'Migration Apply requires --dry-run in this build.',
                hint: 'Review the dry-run fingerprint before explicit Apply.',
              });
            }
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
