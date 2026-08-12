import { randomUUID } from 'node:crypto';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { ConfigLoadError, type GstackConfig } from '@gstack/config';
import type { SchemaSource } from '@gstack/schema';
import type { MigrationReader } from './types.js';

import { loadProject } from './project.js';

const TEST_CONFIG: GstackConfig = {
  version: 1,
  name: 'sample-app',
  schemaVersion: 1,
  schema: { directory: 'schema' },
  generator: null,
};

function source(name: string, content: string): SchemaSource {
  return {
    id: `schema/${name}.yaml`,
    name,
    path: `/project/schema/${name}.yaml`,
    content,
  };
}

describe('gstack project read API', () => {
  it('returns structured project status and schema summaries', async () => {
    const sources = [
      source(
        'users',
        'name: users\nmodel: { displayName: User }\ndatabase: { primaryKey: id, columns: { id: { type: uuid } } }\n',
      ),
    ];
    const loadSources = vi.fn(async () => sources);
    const project = await loadProject({
      root: '/project',
      loadConfig: async () => TEST_CONFIG,
      loadSources,
    });

    await expect(project.getStatus()).resolves.toMatchObject({
      projectRoot: '/project',
      projectName: 'sample-app',
      schemaCount: 1,
      config: { version: 1, schemaVersion: 1, schemaDirectory: 'schema' },
      migration: { availability: 'not_configured' },
      validation: { checked: false, valid: null, level: null },
    });
    await expect(project.listSchemas()).resolves.toEqual([
      {
        id: 'schema/users.yaml',
        name: 'users',
        path: '/project/schema/users.yaml',
      },
    ]);
    await expect(project.getSchema('users')).resolves.toMatchObject({
      name: 'users',
    });
    await expect(project.getSchema('../secret')).resolves.toBeNull();
    expect(loadSources).toHaveBeenCalledWith('/project', 'schema');

    await expect(project.getProjectContext()).resolves.toMatchObject({
      status: {
        projectName: 'sample-app',
        validation: { checked: true, valid: true, level: 'semantic' },
      },
      schemas: [{ name: 'users' }],
      validation: { valid: true, level: 'semantic' },
      capabilities: {
        schemaRead: 'available',
        semanticValidation: 'available',
        applicationModel: 'available',
      },
    });
  });

  it('returns structured syntax diagnostics without throwing YAML errors', async () => {
    const project = await loadProject({
      root: '/project',
      loadConfig: async () => TEST_CONFIG,
      loadSources: async () => [
        source('broken', 'name: users\nname: duplicate\n'),
      ],
    });

    const result = await project.validateSchema();

    expect(result.valid).toBe(false);
    expect(result.level).toBe('syntax');
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'SCHEMA_YAML_ERROR',
        phase: 'syntax',
        severity: 'error',
        file: 'schema/broken.yaml',
      }),
    ]);
  });

  it('注入されたMigration ReaderへRead操作を委譲する', async () => {
    const status = {
      totalCount: 0,
      pendingCount: 0,
      applyingCount: 0,
      appliedCount: 0,
      failedCount: 0,
      rolledBackCount: 0,
      latestAttempt: null,
      latestApplied: null,
    };
    const preview = {
      baselineVersion: null,
      plan: {
        operations: [],
        risk: 'safe' as const,
        destructive: false,
        reversible: true,
        capabilityStatus: 'supported' as const,
        applicable: true,
        warnings: [],
      },
    };
    const migrationReader: MigrationReader = {
      getStatus: vi.fn().mockResolvedValue(status),
      listHistory: vi.fn().mockResolvedValue([]),
      previewPlan: vi.fn().mockResolvedValue(preview),
    };
    const project = await loadProject({
      root: '/project',
      loadConfig: async () => TEST_CONFIG,
      loadSources: async () => [
        source(
          'users',
          'name: users\nmodel: { displayName: User }\ndatabase: { primaryKey: id, columns: { id: { type: uuid } } }\n',
        ),
      ],
      migrationReader,
    });

    await expect(project.getMigrationStatus()).resolves.toBe(status);
    await expect(project.listMigrationHistory()).resolves.toEqual([]);
    await expect(project.previewMigrationPlan()).resolves.toBe(preview);
    expect(migrationReader.previewPlan).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'sample-app' }),
      [],
    );
    await expect(project.getStatus()).resolves.toMatchObject({
      migration: { availability: 'available' },
    });
  });

  it('Migration storage未設定と不正Schemaを安全なCore errorにする', async () => {
    const project = await loadProject({
      root: '/project',
      loadConfig: async () => TEST_CONFIG,
      loadSources: async () => [],
    });
    await expect(project.getMigrationStatus()).rejects.toMatchObject({
      details: { code: 'MIGRATION_NOT_AVAILABLE', category: 'migration' },
    });

    const invalid = await loadProject({
      root: '/project',
      loadConfig: async () => TEST_CONFIG,
      loadSources: async () => [source('users', 'name: users\nmodel: {}\n')],
      migrationReader: {
        getStatus: vi.fn(),
        listHistory: vi.fn(),
        previewPlan: vi.fn(),
      },
    });
    await expect(invalid.previewMigrationPlan()).rejects.toMatchObject({
      details: { code: 'MIGRATION_SCHEMA_INVALID', category: 'migration' },
    });
  });

  it('Generation previewと明示的writeを分離する', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gstack-core-generator-'));
    try {
      const project = await loadProject({
        root,
        loadConfig: async () => ({
          ...TEST_CONFIG,
          generator: {
            formatVersion: 1,
            types: true,
            validation: false,
            api: false,
            frontend: false,
            openapi: false,
            documentation: false,
            aiDocumentation: false,
          },
        }),
        loadSources: async () => [
          source(
            'users',
            'name: users\nmodel: { displayName: User }\ndatabase: { primaryKey: id, columns: { id: { type: uuid } } }\n',
          ),
        ],
      });

      const preview = await project.previewGeneration();
      expect(
        preview.writes.map(({ path: artifactPath }) => artifactPath),
      ).toEqual(['generated/types/index.ts', 'generated/types/users.ts']);
      await expect(access(path.join(root, 'generated'))).rejects.toMatchObject({
        code: 'ENOENT',
      });

      await expect(project.generate()).resolves.toEqual(preview);
      await expect(
        readFile(path.join(root, 'generated', 'types', 'users.ts'), 'utf8'),
      ).resolves.toContain('export interface Users');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('Generator未設定を安全なCore errorにする', async () => {
    const project = await loadProject({
      root: '/project',
      loadConfig: async () => TEST_CONFIG,
      loadSources: async () => [],
    });
    await expect(project.previewGeneration()).rejects.toMatchObject({
      details: { code: 'GENERATOR_NOT_CONFIGURED', category: 'generator' },
    });
  });

  it('returns semantic diagnostics and exposes the Application Model only when valid', async () => {
    const valid = await loadProject({
      root: '/project',
      loadConfig: async () => TEST_CONFIG,
      loadSources: async () => [
        source(
          'users',
          'name: users\nmodel: { displayName: User }\ndatabase: { primaryKey: id, columns: { id: { type: uuid } } }\n',
        ),
      ],
    });

    await expect(valid.validateSchema()).resolves.toMatchObject({
      valid: true,
      level: 'semantic',
    });
    await expect(valid.getApplicationModel()).resolves.toMatchObject({
      name: 'sample-app',
      schemaVersion: 1,
      models: [{ name: 'users' }],
    });

    const invalid = await loadProject({
      root: '/project',
      loadConfig: async () => TEST_CONFIG,
      loadSources: async () => [
        source('users', 'name: users\nmodel: {}\ndatabase: {}\n'),
      ],
    });
    const validation = await invalid.validateSchema();
    expect(validation).toMatchObject({ valid: false, level: 'semantic' });
    expect(validation.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ phase: 'semantic' })]),
    );
    await expect(invalid.getApplicationModel()).resolves.toBeNull();
  });

  it('returns a structured error when no project marker can be found', async () => {
    await expect(
      loadProject({ startDirectory: `/tmp/gstack-missing-${randomUUID()}` }),
    ).rejects.toMatchObject({
      details: {
        code: 'PROJECT_NOT_FOUND',
        category: 'configuration',
      },
    });
  });

  it('converts Schema loader failures at the Core boundary', async () => {
    const project = await loadProject({
      root: '/project',
      loadConfig: async () => TEST_CONFIG,
      loadSources: async () => {
        throw new Error('sensitive filesystem detail');
      },
    });

    await expect(project.listSchemas()).rejects.toMatchObject({
      message: 'Schema sources could not be loaded.',
      details: {
        code: 'SCHEMA_LOAD_FAILED',
        category: 'schema',
        path: '/project/schema',
      },
    });
  });

  it('converts Config validation issues at the Core boundary', async () => {
    await expect(
      loadProject({
        root: '/project',
        loadConfig: async () => {
          throw new ConfigLoadError([
            {
              code: 'CONFIG_REQUIRED',
              message: 'name is required.',
              path: 'name',
            },
          ]);
        },
      }),
    ).rejects.toMatchObject({
      details: {
        code: 'CONFIG_INVALID',
        category: 'configuration',
        path: '/project/gstack.yaml',
        issues: [
          {
            code: 'CONFIG_REQUIRED',
            message: 'name is required.',
            path: 'name',
          },
        ],
      },
    });
  });
});
