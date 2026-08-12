import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { EnvironmentSecretResolver, loadStandardProject } from './index.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('standard runtime', () => {
  it('enabledな公式Google ProviderをCatalogとInspectionへ接続する', async () => {
    const root = await project(`
providers:
  google:
    enabled: true
    configuration:
      spreadsheetId: spreadsheet-id
      appsScriptProjectId: script-id
      driveFolderId: folder-id
      authentication:
        mode: user_oauth
        credentialSecret: GOOGLE_CREDENTIALS
`);
    const loaded = await loadStandardProject({ root, environment: {} });
    await expect(loaded.listProviders()).resolves.toEqual([
      expect.objectContaining({ name: 'google' }),
    ]);
    await expect(loaded.validateProvider('google')).resolves.toEqual([]);
    await expect(loaded.getProjectContext()).resolves.toMatchObject({
      capabilities: {
        providerStatus: 'available',
        providerInspection: 'available',
      },
    });
  });

  it('disabled Providerを登録せず未知enabled Providerを拒否する', async () => {
    const disabled = await project(`
providers:
  google:
    enabled: false
    configuration: {}
`);
    const loaded = await loadStandardProject({ root: disabled });
    await expect(loaded.listProviders()).resolves.toEqual([]);
    await expect(loaded.getProviderHealth('google')).rejects.toMatchObject({
      details: { code: 'PROVIDER_INSPECTION_NOT_AVAILABLE' },
    });

    const unknown = await project(`
providers:
  example:
    enabled: true
    configuration: {}
`);
    await expect(loadStandardProject({ root: unknown })).rejects.toMatchObject({
      details: { code: 'PROVIDER_NOT_AVAILABLE', category: 'provider' },
    });
  });

  it('Environment Secret Resolverは安全な変数名だけを解決する', async () => {
    const resolver = new EnvironmentSecretResolver({
      GOOGLE_CREDENTIALS: 'credential',
      unsafe: 'must-not-resolve',
    });
    await expect(resolver.get('GOOGLE_CREDENTIALS')).resolves.toBe(
      'credential',
    );
    await expect(resolver.get('unsafe')).resolves.toBeNull();
  });
});

async function project(extra: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'gstack-runtime-'));
  roots.push(root);
  await writeFile(
    path.join(root, 'gstack.yaml'),
    `version: 1
name: sample
schemaVersion: 1
schema: { directory: schema }
${extra.trimStart()}`,
  );
  return root;
}
