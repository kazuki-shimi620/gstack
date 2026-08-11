import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadProjectConfig } from './loader.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('loadProjectConfig', () => {
  it('loads the accepted D-001 and D-002 contract', async () => {
    const root = await projectWithConfig(`
version: 1
name: sample-app
schemaVersion: 1
schema:
  directory: schemas
`);

    await expect(loadProjectConfig(root)).resolves.toEqual({
      version: 1,
      name: 'sample-app',
      schemaVersion: 1,
      schema: { directory: 'schemas' },
    });
  });

  it('rejects unknown keys and unsupported versions together', async () => {
    const root = await projectWithConfig(`
version: 2
name: sample-app
schemaVersion: 9
schema:
  directory: schema
  extra: true
unknown: true
`);

    await expect(loadProjectConfig(root)).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'CONFIG_VERSION_UNSUPPORTED' }),
        expect.objectContaining({ code: 'SCHEMA_VERSION_UNSUPPORTED' }),
        expect.objectContaining({
          code: 'CONFIG_UNKNOWN_KEY',
          path: 'unknown',
        }),
        expect.objectContaining({
          code: 'CONFIG_UNKNOWN_KEY',
          path: 'schema.extra',
        }),
      ]),
    });
  });

  it('rejects Schema directories outside the project', async () => {
    const root = await projectWithConfig(`
version: 1
name: sample-app
schemaVersion: 1
schema:
  directory: ../schema
`);

    await expect(loadProjectConfig(root)).rejects.toMatchObject({
      issues: [
        expect.objectContaining({
          code: 'CONFIG_VALUE_INVALID',
          path: 'schema.directory',
        }),
      ],
    });
  });
});

async function projectWithConfig(content: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'gstack-loader-test-'));
  temporaryDirectories.push(directory);
  await writeFile(path.join(directory, 'gstack.yaml'), content.trimStart());
  return directory;
}
