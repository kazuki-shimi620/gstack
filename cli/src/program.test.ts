import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProgram } from './program.js';

afterEach(() => {
  process.exitCode = undefined;
});

describe('migration apply CLI', () => {
  it('dry-run結果を表示し、Apply service以外のwriteを要求しない', async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const operation = {
      id: 'create_model:users:users',
      type: 'create_model',
      model: 'users',
      risk: 'safe',
      destructive: false,
      reversible: true,
      capability: 'native',
      definition: { name: 'users' },
    } as never;
    const file = {
      formatVersion: 1,
      version: '20260813_000001',
      name: 'initial',
      checksum: 'a'.repeat(64),
      operations: [operation],
    } as const;
    const plan = {
      operations: [operation],
      risk: 'safe',
      destructive: false,
      reversible: true,
      capabilityStatus: 'supported',
      applicable: true,
      warnings: [],
    } as const;
    const prepareMigrationApplyFile = vi.fn(async () => ({
      file: file as never,
      plan: plan as never,
      targetSnapshot: {} as never,
      providerContext: 'google:spreadsheet-id',
      planFingerprint: 'b'.repeat(64),
    }));
    const applyMigrationFile = vi.fn();
    const prepareMigrationRollbackFile = vi.fn();
    await createProgram(
      { stdout, stderr },
      {
        loadProject: async () => ({ root: '/project' }) as never,
        prepareMigrationApplyFile,
        applyMigrationFile,
        prepareMigrationRollbackFile,
      },
    ).parseAsync([
      'node',
      'gstack',
      'migration',
      'apply',
      '--file',
      'migrations/20260813_000001_initial.yaml',
      '--dry-run',
      '--json',
    ]);
    expect(prepareMigrationApplyFile).toHaveBeenCalledWith(
      expect.objectContaining({ root: '/project' }),
      'migrations/20260813_000001_initial.yaml',
    );
    expect(stderr).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.mock.calls[0]?.[0] as string)).toMatchObject({
      ok: true,
      data: {
        dryRun: true,
        migrationApply: {
          version: file.version,
          checksum: file.checksum,
          planFingerprint: 'b'.repeat(64),
        },
      },
    });
  });

  it('dry-runを省略した実行をProviderへ渡す前に拒否する', async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const prepareMigrationApplyFile = vi.fn();
    const applyMigrationFile = vi.fn();
    const prepareMigrationRollbackFile = vi.fn();
    await createProgram(
      { stdout, stderr },
      {
        loadProject: async () => ({ root: '/project' }) as never,
        prepareMigrationApplyFile,
        applyMigrationFile,
        prepareMigrationRollbackFile,
      },
    ).parseAsync([
      'node',
      'gstack',
      'migration',
      'apply',
      '--file',
      'migrations/change.yaml',
      '--json',
    ]);
    expect(prepareMigrationApplyFile).not.toHaveBeenCalled();
    expect(applyMigrationFile).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled();
    expect(JSON.parse(stderr.mock.calls[0]?.[0] as string)).toMatchObject({
      ok: false,
      error: { code: 'MIGRATION_DRY_RUN_REQUIRED' },
    });
    expect(process.exitCode).toBe(1);
  });

  it('fingerprintと安全flagを実Apply serviceへ明示的に渡す', async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const history = {
      version: '20260813_000001',
      name: 'initial',
      checksum: 'a'.repeat(64),
      status: 'applied',
      operationCount: 1,
      completedOperationCount: 1,
    } as never;
    const applyMigrationFile = vi.fn(async () => ({
      outcome: 'applied' as const,
      history,
    }));
    await createProgram(
      { stdout, stderr },
      {
        loadProject: async () => ({ root: '/project' }) as never,
        prepareMigrationApplyFile: vi.fn(),
        applyMigrationFile,
        prepareMigrationRollbackFile: vi.fn(),
      },
    ).parseAsync([
      'node',
      'gstack',
      'migration',
      'apply',
      '--file',
      'migrations/change.yaml',
      '--approval',
      'b'.repeat(64),
      '--allow-destructive',
      '--resume',
      '--json',
    ]);
    expect(applyMigrationFile).toHaveBeenCalledWith(
      expect.objectContaining({ root: '/project' }),
      {
        filePath: 'migrations/change.yaml',
        approval: 'b'.repeat(64),
        allowDestructive: true,
        resume: true,
      },
    );
    expect(stderr).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.mock.calls[0]?.[0] as string)).toMatchObject({
      ok: true,
      data: {
        dryRun: false,
        migrationApply: { outcome: 'applied' },
      },
    });
  });

  it('Rollback dry-runの評価済みPlanを表示する', async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const plan = {
      operations: [
        {
          id: 'drop_column:users:email',
          risk: 'destructive',
          capability: 'unsupported',
        },
      ],
      risk: 'destructive',
      destructive: true,
      reversible: false,
      capabilityStatus: 'unsupported',
      applicable: false,
      warnings: [],
    } as never;
    const prepareMigrationRollbackFile = vi.fn(async () => ({
      sourceVersion: '20260815_000001',
      sourceChecksum: 'a'.repeat(64),
      completedOperationCount: 1,
      targetVersion: null,
      targetSnapshot: null,
      plan,
      planFingerprint: 'b'.repeat(64),
    }));
    await createProgram(
      { stdout, stderr },
      {
        loadProject: async () => ({ root: '/project' }) as never,
        prepareMigrationApplyFile: vi.fn(),
        applyMigrationFile: vi.fn(),
        prepareMigrationRollbackFile,
      },
    ).parseAsync([
      'node',
      'gstack',
      'migration',
      'rollback',
      '--file',
      'migrations/add_email.yaml',
      '--dry-run',
      '--json',
    ]);
    expect(prepareMigrationRollbackFile).toHaveBeenCalledWith(
      expect.objectContaining({ root: '/project' }),
      'migrations/add_email.yaml',
    );
    expect(stderr).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.mock.calls[0]?.[0] as string)).toMatchObject({
      ok: true,
      data: {
        dryRun: true,
        migrationRollback: {
          sourceVersion: '20260815_000001',
          targetVersion: null,
          planFingerprint: 'b'.repeat(64),
        },
      },
    });
  });
});

describe('plugin CLI', () => {
  it('検証済みPlugin ManifestをJSONで表示する', async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const listPlugins = vi.fn(async () => [
      {
        formatVersion: 1 as const,
        id: 'example',
        kind: 'generator' as const,
        packageName: '@example/generator',
        version: '1.2.3',
        minimumGstackVersion: '0.0.0',
        configured: true,
      },
    ]);
    await createProgram(
      { stdout, stderr },
      {
        loadProject: vi.fn(),
        prepareMigrationApplyFile: vi.fn(),
        applyMigrationFile: vi.fn(),
        prepareMigrationRollbackFile: vi.fn(),
        listPlugins,
      },
    ).parseAsync(['node', 'gstack', 'plugin', 'list', '--json']);
    expect(listPlugins).toHaveBeenCalledOnce();
    expect(stderr).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.mock.calls[0]?.[0] as string)).toMatchObject({
      ok: true,
      data: {
        plugins: [
          {
            id: 'example',
            kind: 'generator',
            packageName: '@example/generator',
            configured: true,
          },
        ],
      },
    });
  });

  it('installをdry-run Planとして表示しpackage managerを実行しない', async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const preparePluginInstall = vi.fn(async () => ({
      action: 'install' as const,
      packageName: '@example/generator',
      version: '1.2.3',
      pluginId: null,
      command: {
        executable: 'npm' as const,
        arguments: [
          'install',
          '--save-exact',
          '--ignore-scripts',
          '@example/generator@1.2.3',
        ],
      },
      currentPackages: [],
      nextPackages: ['@example/generator'],
      stateChecksums: {
        config: 'b'.repeat(64),
        packageJson: 'c'.repeat(64),
      },
      fingerprint: 'a'.repeat(64),
    }));
    await createProgram(
      { stdout, stderr },
      {
        loadProject: vi.fn(),
        prepareMigrationApplyFile: vi.fn(),
        applyMigrationFile: vi.fn(),
        prepareMigrationRollbackFile: vi.fn(),
        preparePluginInstall,
      },
    ).parseAsync([
      'node',
      'gstack',
      'plugin',
      'install',
      '@example/generator@1.2.3',
      '--dry-run',
      '--json',
    ]);
    expect(preparePluginInstall).toHaveBeenCalledWith(
      '@example/generator@1.2.3',
    );
    expect(stderr).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.mock.calls[0]?.[0] as string)).toMatchObject({
      ok: true,
      data: {
        dryRun: true,
        pluginChange: {
          action: 'install',
          fingerprint: 'a'.repeat(64),
        },
      },
    });
  });

  it('approval付きinstallだけを実変更serviceへ渡す', async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const plan = {
      action: 'install' as const,
      packageName: '@example/generator',
      version: '1.2.3',
      pluginId: null,
      command: { executable: 'npm' as const, arguments: [] },
      currentPackages: [],
      nextPackages: ['@example/generator'],
      stateChecksums: {
        config: 'b'.repeat(64),
        packageJson: 'c'.repeat(64),
      },
      fingerprint: 'a'.repeat(64),
    };
    const applyPluginInstall = vi.fn(async () => plan);
    await createProgram(
      { stdout, stderr },
      {
        loadProject: vi.fn(),
        prepareMigrationApplyFile: vi.fn(),
        applyMigrationFile: vi.fn(),
        prepareMigrationRollbackFile: vi.fn(),
        applyPluginInstall,
      },
    ).parseAsync([
      'node',
      'gstack',
      'plugin',
      'install',
      '@example/generator@1.2.3',
      '--approval',
      plan.fingerprint,
      '--json',
    ]);
    expect(applyPluginInstall).toHaveBeenCalledWith(
      '@example/generator@1.2.3',
      plan.fingerprint,
    );
    expect(stderr).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.mock.calls[0]?.[0] as string)).toMatchObject({
      ok: true,
      data: { dryRun: false, pluginChange: { action: 'install' } },
    });
  });
});

describe('project initialization CLI', () => {
  it('dry-run fingerprintを表示し、承認時だけinitialize serviceへ渡す', async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const preview = {
      scriptId: 'script-id',
      manifestChecksum: 'a'.repeat(64),
      fingerprint: 'b'.repeat(64),
    };
    const prepareProjectInitialization = vi.fn().mockResolvedValue(preview);
    const initializeProject = vi.fn().mockResolvedValue(preview);
    const services = {
      loadProject: async () => ({ root: '/project' }) as never,
      prepareMigrationApplyFile: vi.fn(),
      applyMigrationFile: vi.fn(),
      prepareMigrationRollbackFile: vi.fn(),
      prepareProjectInitialization,
      initializeProject,
    };
    await createProgram({ stdout, stderr }, services).parseAsync([
      'node',
      'gstack',
      'provider',
      'initialize',
      'google',
      '--dry-run',
      '--json',
    ]);
    expect(prepareProjectInitialization).toHaveBeenCalledOnce();
    expect(initializeProject).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.mock.calls[0]?.[0] as string)).toMatchObject({
      data: { dryRun: true, initialization: preview },
    });

    stdout.mockClear();
    await createProgram({ stdout, stderr }, services).parseAsync([
      'node',
      'gstack',
      'provider',
      'initialize',
      'google',
      '--approval',
      preview.fingerprint,
      '--json',
    ]);
    expect(initializeProject).toHaveBeenCalledWith(
      expect.objectContaining({ root: '/project' }),
      preview.fingerprint,
    );
    expect(JSON.parse(stdout.mock.calls[0]?.[0] as string)).toMatchObject({
      data: { dryRun: false, initialization: preview },
    });
    expect(stderr).not.toHaveBeenCalled();
  });
});
