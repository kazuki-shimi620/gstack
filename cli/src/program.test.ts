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
    await createProgram(
      { stdout, stderr },
      {
        loadProject: async () => ({ root: '/project' }) as never,
        prepareMigrationApplyFile,
        applyMigrationFile,
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
    await createProgram(
      { stdout, stderr },
      {
        loadProject: async () => ({ root: '/project' }) as never,
        prepareMigrationApplyFile,
        applyMigrationFile,
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
});
