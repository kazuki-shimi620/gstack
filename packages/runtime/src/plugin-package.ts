import { execFile } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { GstackError } from '@gstack/core';
import { loadPlugins, type PluginModuleImporter } from '@gstack/plugin';

const execFileAsync = promisify(execFile);

export interface PluginPackInspector {
  inspect(directory: string): Promise<unknown>;
}

export interface StandardPluginPackageValidation {
  readonly valid: true;
  readonly packageName: string;
  readonly version: string;
  readonly pluginId: string;
  readonly kind: 'provider' | 'generator';
  readonly minimumGstackVersion: string;
  readonly entry: string;
  readonly types: string;
  readonly fileCount: number;
  readonly unpackedSize: number;
}

export async function validateStandardPluginPackage(input: {
  readonly directory?: string;
  readonly moduleImporter?: PluginModuleImporter;
  readonly packInspector?: PluginPackInspector;
}): Promise<StandardPluginPackageValidation> {
  const directory = path.resolve(input.directory ?? process.cwd());
  const packagePath = path.join(directory, 'package.json');
  const metadata = await readPackageMetadata(packagePath);
  const entry = rootExport(metadata.exports);
  const types = relativeFile(metadata.types, 'types');
  await assertRegularContainedFile(directory, entry, 'Plugin export entry');
  await assertRegularContainedFile(directory, types, 'Plugin type declaration');

  const plugins = await loadPlugins({
    packageNames: [metadata.name],
    gstackVersion: '0.0.0',
    importer:
      input.moduleImporter ??
      (async () => import(pathToFileURL(path.join(directory, entry)).href)),
  });
  const plugin = plugins.list()[0];
  if (!plugin || plugin.manifest.version !== metadata.version) {
    invalid('Plugin Manifest version must match package.json version.');
  }

  const packed = await (input.packInspector ?? npmPackInspector).inspect(
    directory,
  );
  const pack = validatePackResult(packed, metadata.name, metadata.version);
  const paths = new Set(pack.files.map(({ path: filePath }) => filePath));
  for (const required of ['package.json', entry, types]) {
    if (!paths.has(required)) {
      invalid(`Published package is missing required file: ${required}`);
    }
  }
  const sensitive = pack.files.find(({ path: filePath }) =>
    sensitivePath(filePath),
  );
  if (sensitive) {
    invalid(`Published package contains a sensitive file: ${sensitive.path}`);
  }

  return Object.freeze({
    valid: true,
    packageName: metadata.name,
    version: metadata.version,
    pluginId: plugin.manifest.id,
    kind: plugin.manifest.kind,
    minimumGstackVersion: plugin.manifest.minimumGstackVersion,
    entry,
    types,
    fileCount: pack.files.length,
    unpackedSize: pack.unpackedSize,
  });
}

const npmPackInspector: PluginPackInspector = {
  async inspect(directory) {
    try {
      const { stdout } = await execFileAsync(
        'npm',
        ['pack', '--dry-run', '--json', '--ignore-scripts'],
        {
          cwd: directory,
          encoding: 'utf8',
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      return JSON.parse(stdout) as unknown;
    } catch (cause: unknown) {
      throw new GstackError(
        {
          code: 'CONFIG_INVALID',
          category: 'configuration',
          message: 'npm pack dry-run failed for the Plugin package.',
        },
        { cause },
      );
    }
  },
};

interface PackageMetadata {
  readonly name: string;
  readonly version: string;
  readonly exports: unknown;
  readonly types: unknown;
}

async function readPackageMetadata(
  packagePath: string,
): Promise<PackageMetadata> {
  try {
    const metadata = await lstat(packagePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      invalid('Plugin package.json must be a regular file.');
    }
    const value: unknown = JSON.parse(await readFile(packagePath, 'utf8'));
    if (!record(value)) invalid('Plugin package.json must be an object.');
    if (value.private === true)
      invalid('Private packages cannot be published.');
    if (typeof value.name !== 'string' || typeof value.version !== 'string') {
      invalid('Plugin package name and version are required.');
    }
    return {
      name: value.name,
      version: value.version,
      exports: value.exports,
      types: value.types,
    };
  } catch (cause: unknown) {
    if (cause instanceof GstackError) throw cause;
    throw new GstackError(
      {
        code: 'CONFIG_INVALID',
        category: 'configuration',
        message: 'Plugin package.json could not be read.',
      },
      { cause },
    );
  }
}

function rootExport(value: unknown): string {
  if (typeof value === 'string') return relativeFile(value, 'exports');
  if (!record(value))
    invalid('Plugin package must define a root exports entry.');
  const root = value['.'] ?? value;
  if (typeof root === 'string') return relativeFile(root, 'exports');
  if (!record(root)) invalid('Plugin root exports entry is invalid.');
  const selected = root.import ?? root.default;
  return relativeFile(selected, 'exports');
}

function relativeFile(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.startsWith('./')) {
    invalid(`Plugin package ${field} must be a relative file path.`);
  }
  const normalized = path.posix.normalize(value.slice(2));
  if (
    normalized.length === 0 ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    path.posix.isAbsolute(normalized)
  ) {
    invalid(`Plugin package ${field} escapes the package directory.`);
  }
  return normalized;
}

async function assertRegularContainedFile(
  directory: string,
  relativePath: string,
  label: string,
): Promise<void> {
  try {
    const metadata = await lstat(path.join(directory, relativePath));
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      invalid(`${label} must be a regular file.`);
    }
  } catch (cause: unknown) {
    if (cause instanceof GstackError) throw cause;
    throw new GstackError(
      {
        code: 'CONFIG_INVALID',
        category: 'configuration',
        message: `${label} does not exist.`,
      },
      { cause },
    );
  }
}

function validatePackResult(
  value: unknown,
  name: string,
  version: string,
): {
  readonly files: readonly { readonly path: string }[];
  readonly unpackedSize: number;
} {
  if (!Array.isArray(value) || value.length !== 1 || !record(value[0])) {
    invalid('npm pack dry-run returned an invalid result.');
  }
  const result = value[0];
  if (result.name !== name || result.version !== version) {
    invalid('npm pack identity does not match package.json.');
  }
  if (
    !Array.isArray(result.files) ||
    !result.files.every((file) => record(file) && safePackedPath(file.path)) ||
    typeof result.unpackedSize !== 'number' ||
    !Number.isSafeInteger(result.unpackedSize) ||
    result.unpackedSize < 0
  ) {
    invalid('npm pack file inventory is invalid.');
  }
  return {
    files: result.files as { readonly path: string }[],
    unpackedSize: result.unpackedSize,
  };
}

function safePackedPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value === path.posix.normalize(value) &&
    !path.posix.isAbsolute(value) &&
    value !== '..' &&
    !value.startsWith('../')
  );
}

function sensitivePath(filePath: string): boolean {
  const basename = path.posix.basename(filePath).toLowerCase();
  return (
    basename === '.env' ||
    basename.startsWith('.env.') ||
    basename === '.npmrc' ||
    basename === 'credentials.json' ||
    basename.endsWith('.pem') ||
    basename.endsWith('.key') ||
    /^service-account.*\.json$/u.test(basename)
  );
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
