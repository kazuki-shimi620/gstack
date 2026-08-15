import { createHash, randomUUID } from 'node:crypto';
import {
  chmod,
  lstat,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { parseDocument } from 'yaml';

import { GSTACK_CONFIG_FILENAME } from './project-root.js';

export class ConfigWriteError extends Error {
  public constructor(
    public readonly code:
      'CONFIG_STATE_CHANGED' | 'CONFIG_TARGET_INVALID' | 'CONFIG_WRITE_FAILED',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ConfigWriteError';
  }
}

export async function writePluginPackages(input: {
  readonly projectRoot: string;
  readonly expectedChecksum: string;
  readonly packages: readonly string[];
}): Promise<void> {
  const target = path.join(input.projectRoot, GSTACK_CONFIG_FILENAME);
  let temporary: string | null = null;
  try {
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new ConfigWriteError(
        'CONFIG_TARGET_INVALID',
        'gstack.yaml must be a regular file.',
      );
    }
    const source = await readFile(target, 'utf8');
    if (checksum(source) !== input.expectedChecksum) {
      throw new ConfigWriteError(
        'CONFIG_STATE_CHANGED',
        'gstack.yaml changed after the Plugin Plan was created.',
      );
    }
    const document = parseDocument(source, {
      prettyErrors: false,
      strict: true,
      uniqueKeys: true,
    });
    if (document.errors.length > 0) {
      throw new ConfigWriteError(
        'CONFIG_TARGET_INVALID',
        'gstack.yaml cannot be updated because it is invalid YAML.',
      );
    }
    document.setIn(['plugins', 'packages'], [...input.packages]);
    temporary = path.join(
      input.projectRoot,
      `.${GSTACK_CONFIG_FILENAME}.${randomUUID()}.tmp`,
    );
    await writeFile(temporary, document.toString(), {
      encoding: 'utf8',
      flag: 'wx',
    });
    await chmod(temporary, metadata.mode);
    await rename(temporary, target);
    temporary = null;
  } catch (cause: unknown) {
    if (cause instanceof ConfigWriteError) throw cause;
    throw new ConfigWriteError(
      'CONFIG_WRITE_FAILED',
      'Failed to update gstack.yaml atomically.',
      { cause },
    );
  } finally {
    if (temporary !== null) await unlink(temporary).catch(() => undefined);
  }
}

export function configSourceChecksum(source: string): string {
  return checksum(source);
}

function checksum(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}
