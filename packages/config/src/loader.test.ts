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
      generator: null,
      providers: [],
    });
  });

  it('Provider非依存の設定をname順で読み込みfreezeする', async () => {
    const root = await projectWithConfig(`
version: 1
name: sample-app
schemaVersion: 1
schema: { directory: schema }
providers:
  zeta:
    enabled: false
    configuration: {}
  google:
    enabled: true
    configuration:
      spreadsheetId: spreadsheet-id
      authentication:
        mode: user_oauth
        credentialSecret: GOOGLE_CREDENTIALS
`);
    const result = await loadProjectConfig(root);
    expect(result.providers).toEqual([
      {
        name: 'google',
        enabled: true,
        configuration: {
          spreadsheetId: 'spreadsheet-id',
          authentication: {
            mode: 'user_oauth',
            credentialSecret: 'GOOGLE_CREDENTIALS',
          },
        },
      },
      { name: 'zeta', enabled: false, configuration: {} },
    ]);
    expect(Object.isFrozen(result.providers)).toBe(true);
    expect(Object.isFrozen(result.providers[0]?.configuration)).toBe(true);
  });

  it('Provider entryの不正name、未知key、欠落設定を拒否する', async () => {
    const root = await projectWithConfig(`
version: 1
name: sample-app
schemaVersion: 1
schema: { directory: schema }
providers:
  Google:
    enabled: yes
    package: '@gstack/provider-google'
`);
    await expect(loadProjectConfig(root)).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'providers.Google' }),
        expect.objectContaining({ path: 'providers.Google.package' }),
        expect.objectContaining({ path: 'providers.Google.configuration' }),
      ]),
    });
  });

  it('型付けされたGenerator設定を読み込む', async () => {
    const root = await projectWithConfig(`
version: 1
name: sample-app
schemaVersion: 1
schema: { directory: schema }
generator:
  formatVersion: 1
  types: true
  validation: true
  api: true
  frontend: true
  openapi: false
  documentation: true
  aiDocumentation: false
`);
    await expect(loadProjectConfig(root)).resolves.toMatchObject({
      generator: {
        formatVersion: 1,
        types: true,
        validation: true,
        api: true,
        frontend: true,
        openapi: false,
        documentation: true,
        aiDocumentation: false,
      },
    });
  });

  it('Generatorの未知keyと欠落booleanを拒否する', async () => {
    const root = await projectWithConfig(`
version: 1
name: sample-app
schemaVersion: 1
schema: { directory: schema }
generator:
  formatVersion: 1
  types: true
  validation: true
  api: true
  frontend: true
  openapi: true
  documentation: true
  extra: true
`);
    await expect(loadProjectConfig(root)).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: 'generator.extra',
          code: 'CONFIG_UNKNOWN_KEY',
        }),
        expect.objectContaining({
          path: 'generator.aiDocumentation',
          code: 'CONFIG_REQUIRED',
        }),
      ]),
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
