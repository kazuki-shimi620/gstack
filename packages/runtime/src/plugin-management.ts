import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  ConfigWriteError,
  findProjectRoot,
  loadProjectConfig,
  writePluginPackages,
} from '@gstack/config';
import { GstackError, GSTACK_VERSION } from '@gstack/core';
import {
  loadPlugins,
  type PluginModuleImporter,
  type PluginRegistry,
} from '@gstack/plugin';

export interface StandardPluginChangePlan {
  readonly action: 'install' | 'remove';
  readonly packageName: string;
  readonly version: string;
  readonly pluginId: string | null;
  readonly command: {
    readonly executable: 'npm';
    readonly arguments: readonly string[];
  };
  readonly currentPackages: readonly string[];
  readonly nextPackages: readonly string[];
  readonly stateChecksums: {
    readonly config: string;
    readonly packageJson: string;
  };
  readonly fingerprint: string;
}

export interface StandardPluginChangeOptions {
  readonly root?: string;
  readonly startDirectory?: string;
  readonly pluginImporter?: PluginModuleImporter;
}

export interface PluginPackageManager {
  run(input: {
    readonly executable: 'npm';
    readonly arguments: readonly string[];
    readonly cwd: string;
  }): Promise<{ readonly exitCode: number }>;
}

export async function applyStandardPluginInstall(
  input: StandardPluginChangeOptions & {
    readonly packageSpec: string;
    readonly approval: string;
    readonly packageManager?: PluginPackageManager;
  },
): Promise<StandardPluginChangePlan> {
  const root = await resolveRoot(input);
  const prepared = await prepareStandardPluginInstall({ ...input, root });
  approve(prepared, input.approval);
  await runPackageManager(root, prepared, input.packageManager);
  const installed = await loadConfiguredPlugins([prepared.packageName], input);
  const plugin =
    installed.get(prepared.packageName) ??
    installed
      .list()
      .find(({ manifest }) => manifest.packageName === prepared.packageName);
  if (!plugin || plugin.manifest.version !== prepared.version) {
    invalid(
      'Installed package did not expose the approved Plugin version; it was not allowlisted.',
    );
  }
  await updatePluginPackages({
    projectRoot: root,
    expectedChecksum: prepared.stateChecksums.config,
    packages: prepared.nextPackages,
  });
  return prepared;
}

export async function applyStandardPluginRemove(
  input: StandardPluginChangeOptions & {
    readonly packageName: string;
    readonly approval: string;
    readonly packageManager?: PluginPackageManager;
  },
): Promise<StandardPluginChangePlan> {
  const root = await resolveRoot(input);
  const prepared = await prepareStandardPluginRemove({ ...input, root });
  approve(prepared, input.approval);
  await updatePluginPackages({
    projectRoot: root,
    expectedChecksum: prepared.stateChecksums.config,
    packages: prepared.nextPackages,
  });
  await runPackageManager(root, prepared, input.packageManager);
  return prepared;
}

export async function prepareStandardPluginInstall(
  input: StandardPluginChangeOptions & { readonly packageSpec: string },
): Promise<StandardPluginChangePlan> {
  const { packageName, version } = parseExactPackageSpec(input.packageSpec);
  const context = await loadContext(input);
  if (context.configPackages.includes(packageName)) {
    invalid('Plugin package is already allowlisted.');
  }
  if (context.dependencies[packageName] !== undefined) {
    invalid('Plugin package is already present in project dependencies.');
  }
  return plan({
    action: 'install',
    packageName,
    version,
    pluginId: null,
    commandArguments: [
      'install',
      '--save-exact',
      '--ignore-scripts',
      `${packageName}@${version}`,
    ],
    currentPackages: context.configPackages,
    nextPackages: [...context.configPackages, packageName],
    stateChecksums: context.stateChecksums,
  });
}

export async function prepareStandardPluginRemove(
  input: StandardPluginChangeOptions & { readonly packageName: string },
): Promise<StandardPluginChangePlan> {
  assertPackageName(input.packageName);
  const context = await loadContext(input);
  if (!context.configPackages.includes(input.packageName)) {
    invalid('Plugin package is not allowlisted.');
  }
  const plugins = await loadConfiguredPlugins(context.configPackages, input);
  const plugin = plugins
    .list()
    .find(({ manifest }) => manifest.packageName === input.packageName);
  if (!plugin) invalid('Plugin package did not expose a valid gstack Plugin.');
  if (context.configuredPluginIds.has(plugin.manifest.id)) {
    invalid('Remove Plugin configuration before removing its package.');
  }
  if (
    plugin.manifest.kind === 'provider' &&
    context.enabledProviderNames.has(plugin.manifest.id)
  ) {
    invalid('Disable the Provider before removing its Plugin package.');
  }
  const version = context.dependencies[input.packageName];
  if (version === undefined) {
    invalid('Plugin package is not present in project dependencies.');
  }
  return plan({
    action: 'remove',
    packageName: input.packageName,
    version,
    pluginId: plugin.manifest.id,
    commandArguments: ['uninstall', '--ignore-scripts', input.packageName],
    currentPackages: context.configPackages,
    nextPackages: context.configPackages.filter(
      (candidate) => candidate !== input.packageName,
    ),
    stateChecksums: context.stateChecksums,
  });
}

async function loadContext(options: StandardPluginChangeOptions) {
  const root = await resolveRoot(options);
  const configPath = path.join(root, 'gstack.yaml');
  const packagePath = path.join(root, 'package.json');
  let configSource: string;
  let packageSource: string;
  try {
    [configSource, packageSource] = await Promise.all([
      readFile(configPath, 'utf8'),
      readFile(packagePath, 'utf8'),
    ]);
  } catch (cause: unknown) {
    throw new GstackError(
      {
        code: 'CONFIG_INVALID',
        category: 'configuration',
        message:
          'Plugin management requires project-local gstack.yaml and package.json files.',
      },
      { cause },
    );
  }
  const config = await loadProjectConfig(root);
  const packageJson = parsePackageJson(packageSource);
  return {
    configPackages: config.plugins?.packages ?? [],
    configuredPluginIds: new Set(
      Object.keys(config.plugins?.configuration ?? {}),
    ),
    enabledProviderNames: new Set(
      config.providers.filter(({ enabled }) => enabled).map(({ name }) => name),
    ),
    dependencies: packageJson,
    stateChecksums: {
      config: checksum(configSource),
      packageJson: checksum(packageSource),
    },
  };
}

async function loadConfiguredPlugins(
  packageNames: readonly string[],
  options: StandardPluginChangeOptions,
): Promise<PluginRegistry> {
  return loadPlugins({
    packageNames,
    gstackVersion: GSTACK_VERSION,
    ...(options.pluginImporter === undefined
      ? {}
      : { importer: options.pluginImporter }),
  });
}

function parsePackageJson(source: string): Readonly<Record<string, string>> {
  try {
    const value: unknown = JSON.parse(source);
    if (!record(value)) invalid('Project package.json must be an object.');
    const dependencies = value.dependencies ?? {};
    if (!record(dependencies))
      invalid('package.json dependencies must be an object.');
    const result: Record<string, string> = {};
    for (const [name, version] of Object.entries(dependencies)) {
      if (typeof version !== 'string')
        invalid('Dependency versions must be strings.');
      result[name] = version;
    }
    return Object.freeze(result);
  } catch (cause: unknown) {
    if (cause instanceof GstackError) throw cause;
    throw new GstackError(
      {
        code: 'CONFIG_INVALID',
        category: 'configuration',
        message: 'Project package.json is invalid JSON.',
      },
      { cause },
    );
  }
}

function parseExactPackageSpec(spec: string): {
  readonly packageName: string;
  readonly version: string;
} {
  const separator = spec.lastIndexOf('@');
  const packageName = spec.slice(0, separator);
  const version = spec.slice(separator + 1);
  assertPackageName(packageName);
  if (
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version)
  ) {
    invalid('Plugin install requires an exact SemVer package specifier.');
  }
  return { packageName, version };
}

function assertPackageName(value: string): void {
  if (
    !/^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/u.test(
      value,
    )
  ) {
    invalid('Plugin package name is invalid.');
  }
}

function plan(input: {
  readonly action: 'install' | 'remove';
  readonly packageName: string;
  readonly version: string;
  readonly pluginId: string | null;
  readonly commandArguments: readonly string[];
  readonly currentPackages: readonly string[];
  readonly nextPackages: readonly string[];
  readonly stateChecksums: {
    readonly config: string;
    readonly packageJson: string;
  };
}): StandardPluginChangePlan {
  const content = {
    action: input.action,
    packageName: input.packageName,
    version: input.version,
    pluginId: input.pluginId,
    command: { executable: 'npm' as const, arguments: input.commandArguments },
    currentPackages: input.currentPackages,
    nextPackages: input.nextPackages,
    stateChecksums: input.stateChecksums,
  };
  return Object.freeze({
    ...content,
    command: Object.freeze({
      ...content.command,
      arguments: Object.freeze([...content.command.arguments]),
    }),
    currentPackages: Object.freeze([...content.currentPackages]),
    nextPackages: Object.freeze([...content.nextPackages]),
    stateChecksums: Object.freeze({ ...content.stateChecksums }),
    fingerprint: checksum(JSON.stringify(content)),
  });
}

async function resolveRoot(options: StandardPluginChangeOptions) {
  const root = options.root
    ? path.resolve(options.root)
    : await findProjectRoot(options.startDirectory ?? process.cwd());
  if (!root) {
    throw new GstackError({
      code: 'PROJECT_NOT_FOUND',
      category: 'configuration',
      message: 'No gstack project was found.',
    });
  }
  return root;
}

function approve(plan: StandardPluginChangePlan, approval: string): void {
  if (approval !== plan.fingerprint) {
    invalid('Plugin change approval does not match the current Plan.');
  }
}

async function runPackageManager(
  root: string,
  plan: StandardPluginChangePlan,
  packageManager: PluginPackageManager = defaultPackageManager,
): Promise<void> {
  const result = await packageManager.run({
    executable: plan.command.executable,
    arguments: plan.command.arguments,
    cwd: root,
  });
  if (result.exitCode !== 0) {
    invalid('npm failed while applying the Plugin change.');
  }
}

async function updatePluginPackages(
  input: Parameters<typeof writePluginPackages>[0],
): Promise<void> {
  try {
    await writePluginPackages(input);
  } catch (cause: unknown) {
    if (cause instanceof ConfigWriteError) invalid(cause.message);
    throw cause;
  }
}

const defaultPackageManager: PluginPackageManager = {
  run: ({ executable, arguments: args, cwd }) =>
    new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd,
        shell: false,
        stdio: 'inherit',
      });
      child.once('error', reject);
      child.once('exit', (code) => resolve({ exitCode: code ?? 1 }));
    }),
};

function checksum(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalid(message: string): never {
  throw new GstackError({
    code: 'CONFIG_INVALID',
    category: 'configuration',
    message,
  });
}
