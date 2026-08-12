import { failureResult, getErrorDetails, successResult } from '@gstack/core';
import { loadStandardProject } from '@gstack/runtime';
import { Command } from 'commander';

import {
  formatErrorHuman,
  formatGenerationHuman,
  formatJson,
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
  program
    .command('version')
    .description('Show the gstack CLI version')
    .action(() => io.stdout('0.0.0'));

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
