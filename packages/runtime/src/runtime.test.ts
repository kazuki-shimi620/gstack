import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyCapabilityResults,
  createMigrationFile,
  createApplicationModelSnapshot,
  createMigrationPlan,
  migrationPlanFingerprint,
  MigrationHistoryRepository,
  serializeMigrationFile,
  type CreateModelOperation,
  type MigrationHistoryEntry,
  type MigrationHistoryStorage,
  type MigrationOperationExecutor,
  type MigrationPlan,
} from '@gstack/migration';

import {
  createStandardGoogleMigrationRuntime,
  EnvironmentSecretResolver,
  applyStandardGoogleMigration,
  loadStandardProject,
  prepareStandardGoogleMigrationApply,
  prepareStandardGoogleMigrationApplyFile,
  prepareStandardGoogleMigrationRollback,
  prepareStandardGoogleDeploy,
  deployStandardGoogle,
} from './index.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('standard runtime', () => {
  it('生成PlanとProvider設定から副作用なしのDeploy fingerprintを作る', async () => {
    const configuration = {
      spreadsheetId: 'spreadsheet-id',
      appsScriptProjectId: 'script-id',
      driveFolderId: 'folder-id',
      authentication: {
        mode: 'user_oauth',
        credentialSecret: 'GOOGLE_CREDENTIALS',
      },
    };
    const project = {
      getConfig: async () => ({
        providers: [{ name: 'google', enabled: true, configuration }],
      }),
      previewGeneration: async () => ({
        writes: [
          {
            path: 'generated/backend/appsscript/appsscript.json',
            content: '{}\n',
          },
          {
            path: 'generated/backend/appsscript/main.gs',
            content: 'function doGet() {}\n',
          },
          { path: 'generated/types/users.ts', content: 'ignored' },
        ],
      }),
    } as never;
    const first = await prepareStandardGoogleDeploy({ project });
    const second = await prepareStandardGoogleDeploy({ project });
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      provider: 'google',
      scriptId: 'script-id',
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
      files: [
        {
          name: 'appsscript',
          checksum: expect.stringMatching(/^[a-f0-9]{64}$/u),
        },
        { name: 'gstack_config' },
        { name: 'gstack_managed' },
        { name: 'main' },
      ],
    });
    expect(JSON.stringify(first)).not.toContain('GOOGLE_CREDENTIALS');
  });

  it('一致するapprovalでcontent更新後にversionとdeploymentを公開する', async () => {
    const project = deployProject();
    const preview = await prepareStandardGoogleDeploy({ project });
    const replaceManagedContent = vi.fn().mockResolvedValue([]);
    const publish = vi.fn().mockResolvedValue({
      outcome: 'created',
      versionNumber: 3,
      deploymentId: 'deployment-id',
      url: 'https://script.google.com/macros/s/id/exec',
    });
    await expect(
      deployStandardGoogle({
        project,
        approval: preview.fingerprint,
        migrationHistory: {
          list: async () => [deployAppliedHistory()],
        },
        components: {
          content: { replaceManagedContent } as never,
          deployment: { publish } as never,
        },
      }),
    ).resolves.toMatchObject({
      fingerprint: preview.fingerprint,
      deployment: { outcome: 'created', versionNumber: 3 },
    });
    expect(replaceManagedContent).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith(preview.fingerprint);
    expect(replaceManagedContent.mock.invocationCallOrder[0]).toBeLessThan(
      publish.mock.invocationCallOrder[0]!,
    );
  });

  it('approval不一致をProvider write前に拒否する', async () => {
    const replaceManagedContent = vi.fn();
    const publish = vi.fn();
    await expect(
      deployStandardGoogle({
        project: deployProject(),
        approval: 'f'.repeat(64),
        components: {
          content: { replaceManagedContent } as never,
          deployment: { publish } as never,
        },
      }),
    ).rejects.toMatchObject({ details: { code: 'DEPLOY_APPROVAL_INVALID' } });
    expect(replaceManagedContent).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('未適用Schemaをcontent更新前に拒否する', async () => {
    const project = deployProject();
    const preview = await prepareStandardGoogleDeploy({ project });
    const replaceManagedContent = vi.fn();
    await expect(
      deployStandardGoogle({
        project,
        approval: preview.fingerprint,
        migrationHistory: { list: async () => [] },
        components: {
          content: { replaceManagedContent } as never,
          deployment: { publish: vi.fn() } as never,
        },
      }),
    ).rejects.toMatchObject({
      details: { code: 'DEPLOY_MIGRATION_NOT_READY' },
    });
    expect(replaceManagedContent).not.toHaveBeenCalled();
  });

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

  it('明示承認された準備結果を標準Migration componentsへ渡す', async () => {
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
    const file = createMigrationFile('20260813_000002', 'apply_users', [
      operation,
    ]);
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
    const entries = new Map<string, MigrationHistoryEntry>();
    const storage: MigrationHistoryStorage = {
      get: async (version) => entries.get(version) ?? null,
      list: async () => [...entries.values()],
      save: async (entry) => void entries.set(entry.version, entry),
    };
    const executed: string[] = [];
    const executor: MigrationOperationExecutor = {
      execute: async (_operation, context) =>
        void executed.push(context.operationId),
    };
    const timestamps = ['2026-08-13T00:00:00Z', '2026-08-13T00:00:01Z'];
    const result = await applyStandardGoogleMigration({
      prepared,
      runtime: {
        history: new MigrationHistoryRepository(storage),
        lock: {
          acquire: async () => ({ release: async () => undefined }),
        },
        executor,
      } as never,
      approval: migrationPlanFingerprint(file, plan),
      allowDestructive: false,
      resume: false,
      now: () => timestamps.shift() ?? '2026-08-13T00:00:02Z',
    });
    expect(result).toMatchObject({
      outcome: 'applied',
      history: { status: 'applied', completedOperationCount: 1 },
    });
    expect(executed).toEqual([operation.id]);
  });

  it('Rollback PlanへProvider capabilityとfingerprintを反映する', () => {
    const operation = {
      id: 'add_column:users:email',
      type: 'add_column',
      model: 'users',
      risk: 'safe',
      destructive: false,
      reversible: true,
      capability: 'not_evaluated',
      column: { name: 'email' },
    } as never;
    const file = createMigrationFile('20260815_000010', 'add_email', [
      operation,
    ]);
    const appliedSnapshot = {
      formatVersion: 1,
      application: {
        schemaVersion: 1,
        name: 'app',
        models: [],
        metadata: {},
      },
      checksum: 'a'.repeat(64),
    } as never;
    const preview = prepareStandardGoogleMigrationRollback({
      file,
      history: [
        {
          version: file.version,
          name: file.name,
          checksum: file.checksum,
          status: 'applied',
          operationCount: 1,
          completedOperationCount: 1,
          appliedSnapshot,
        } as never,
      ],
      runtime: {
        evaluate: (plan: MigrationPlan) =>
          applyCapabilityResults(plan, [
            {
              operationId: plan.operations[0]!.id,
              capability: 'unsupported',
            },
          ]),
      } as never,
    });
    expect(preview).toMatchObject({
      sourceVersion: file.version,
      targetVersion: null,
      plan: { capabilityStatus: 'unsupported', applicable: false },
      planFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
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

function deployProject() {
  return {
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
    previewGeneration: async () => ({
      writes: [
        {
          path: 'generated/backend/appsscript/appsscript.json',
          content: '{}\n',
        },
        {
          path: 'generated/backend/appsscript/main.gs',
          content: 'function doGet() {}\n',
        },
      ],
    }),
    getApplicationModel: async () => deployApplication(),
  } as never;
}

function deployApplication() {
  return {
    schemaVersion: 1 as const,
    name: 'app',
    models: [],
    metadata: {},
  };
}

function deployAppliedHistory(): MigrationHistoryEntry {
  return {
    status: 'applied',
    operationCount: 0,
    completedOperationCount: 0,
    appliedSnapshot: createApplicationModelSnapshot(deployApplication()),
  } as MigrationHistoryEntry;
}
