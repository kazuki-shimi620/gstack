import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { SchemaSource } from './source.js';

export async function loadSchemaSources(
  projectRoot: string,
  schemaPath = 'schema',
): Promise<readonly SchemaSource[]> {
  const schemaDirectory = path.resolve(projectRoot, schemaPath);
  let entries;

  try {
    entries = await readdir(schemaDirectory, { withFileTypes: true });
  } catch (error: unknown) {
    if (isMissingPathError(error)) {
      return [];
    }
    throw error;
  }

  const filenames = entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    filenames.map(async (filename) => {
      const absolutePath = path.join(schemaDirectory, filename);
      return {
        id: `${schemaPath.replaceAll(path.sep, '/')}/${filename}`,
        name: filename.replace(/\.ya?ml$/u, ''),
        path: absolutePath,
        content: await readFile(absolutePath, 'utf8'),
      } satisfies SchemaSource;
    }),
  );
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
