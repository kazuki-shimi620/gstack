import { stat } from 'node:fs/promises';
import path from 'node:path';

export const GSTACK_CONFIG_FILENAME = 'gstack.yaml';

export async function findProjectRoot(
  startDirectory: string,
): Promise<string | null> {
  let current = path.resolve(startDirectory);

  while (true) {
    if (await exists(path.join(current, GSTACK_CONFIG_FILENAME))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

async function exists(filename: string): Promise<boolean> {
  try {
    return (await stat(filename)).isFile();
  } catch (error: unknown) {
    if (isMissingPathError(error)) {
      return false;
    }
    throw error;
  }
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
