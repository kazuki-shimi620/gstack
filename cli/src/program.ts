import {
  failureResult,
  getErrorDetails,
  GstackError,
  successResult,
  type GstackProject,
} from '@gstack/core';
import { loadStandardProject } from '@gstack/runtime';
import { Command } from 'commander';

import {
  formatErrorHuman,
  formatGenerationHuman,
  formatJson,
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

export function createProgram(
  io: ProgramIO = {
    stdout: (message) => process.stdout.write(`${message}\n`),
    stderr: (message) => process.stderr.write(`${message}\n`),
  },
): Command {
  const program = new Command()
    .name('gstack')
    .description('Schema-first application framework')
    .version('0.0.0');

  const schema = program.command('schema').description('Manage Schema files');
  const provider = program
    .command('provider')
    .description('Inspect configured Providers');
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
  try {
    const result = await operation(await loadStandardProject());
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
