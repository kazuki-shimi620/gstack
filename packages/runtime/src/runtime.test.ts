import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  applyCapabilityResults,
  createMigrationFile,
  createMigrationPlan,
  serializeMigrationFile,
  type CreateModelOperation,
} from '@gstack/migration';

import {
  createStandardGoogleMigrationRuntime,
  EnvironmentSecretResolver,
  loadStandardProject,
  prepareStandardGoogleMigrationApply,
  prepareStandardGoogleMigrationApplyFile,
} from './index.js';

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
        migrationPlan: 'available',
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

  it('Google Migration componentsとManifest capability評価を構成する', () => {
    const runtime = createStandardGoogleMigrationRuntime({
      configuration: {
        spreadsheetId: 'spreadsheet-id',
        appsScriptProjectId: 'script-id',
        driveFolderId: 'folder-id',
        authentication: {
          mode: 'user_oauth',
          credentialSecret: 'GOOGLE_CREDENTIALS',
        },
      },
      secrets: new EnvironmentSecretResolver({}),
    });
    const plan = runtime.evaluate(
      createMigrationPlan([
        {
          id: 'create_model:users:users',
          type: 'create_model',
          model: 'users',
          risk: 'safe',
          destructive: false,
          reversible: true,
          capability: 'not_evaluated',
        } as never,
      ]),
    );
    expect(runtime.providerContext).toBe('google:spreadsheet-id');
    expect(plan).toMatchObject({
      capabilityStatus: 'supported',
      applicable: true,
      operations: [{ capability: 'native' }],
    });
  });

  it('Project previewとFileから副作用なしのApply準備結果を作る', async () => {
    const operation = {
      id: 'create_model:users:users',
      type: 'create_model',
      model: 'users',
      risk: 'safe',
      destructive: false,
      reversible: true,
      capability: 'not_evaluated',
      definition: { name: 'users' },
    } as unknown as CreateModelOperation;
    const file = createMigrationFile('20260813_000001', 'initial', [operation]);
    const plan = applyCapabilityResults(createMigrationPlan(file.operations), [
      { operationId: operation.id, capability: 'native' },
    ]);
    const application = {
      schemaVersion: 1,
      name: 'app',
      models: [operation.definition],
      metadata: {},
    } as never;
    const prepared = await prepareStandardGoogleMigrationApply({
      file,
      runtime: { providerContext: 'google:sheet' } as never,
      project: {
        getApplicationModel: async () => application,
        previewMigrationPlan: async () => ({ baselineVersion: null, plan }),
      } as never,
    });
    expect(prepared).toMatchObject({
      file,
      plan,
      providerContext: 'google:sheet',
      planFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
  });

  it('Project設定と安全なMigration Fileから標準Apply準備を構成する', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gstack-runtime-apply-'));
    roots.push(root);
    await mkdir(path.join(root, 'migrations'));
    const operation = {
      id: 'create_model:users:users',
      type: 'create_model',
      model: 'users',
      risk: 'safe',
      destructive: false,
      reversible: true,
      capability: 'not_evaluated',
      definition: { name: 'users' },
    } as unknown as CreateModelOperation;
    const file = createMigrationFile('20260813_000001', 'initial', [operation]);
    await writeFile(
      path.join(root, 'migrations', '20260813_000001_initial.yaml'),
      serializeMigrationFile(file),
    );
    const plan = applyCapabilityResults(createMigrationPlan(file.operations), [
      { operationId: operation.id, capability: 'native' },
    ]);
    const prepared = await prepareStandardGoogleMigrationApplyFile({
      filePath: 'migrations/20260813_000001_initial.yaml',
      environment: {},
      project: {
        root,
        getConfig: async () => ({
          providers: [
            {
              name: 'google',
              enabled: true,
              configuration: {
                spreadsheetId: 'spreadsheet-id',
                appsScriptProjectId: 'script-id',
                driveFolderId: 'folder-id',
                authentication: {
                  mode: 'user_oauth',
                  credentialSecret: 'GOOGLE_CREDENTIALS',
                },
              },
            },
          ],
        }),
        getApplicationModel: async () => ({
          schemaVersion: 1,
          name: 'app',
          models: [operation.definition],
          metadata: {},
        }),
        previewMigrationPlan: async () => ({ baselineVersion: null, plan }),
      } as never,
    });
    expect(prepared).toMatchObject({
      file,
      providerContext: 'google:spreadsheet-id',
    });
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
