import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { ConfigLoadError, type GstackConfig } from '@gstack/config';
import type { SchemaSource } from '@gstack/schema';

import { loadProject } from './project.js';

const TEST_CONFIG: GstackConfig = {
  version: 1,
  name: 'sample-app',
  schemaVersion: 1,
  schema: { directory: 'schema' },
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
    const sources = [source('users', 'name: users\n')];
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
      migration: { availability: 'not_implemented' },
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
      content: 'name: users\n',
    });
    await expect(project.getSchema('../secret')).resolves.toBeNull();
    expect(loadSources).toHaveBeenCalledWith('/project', 'schema');

    await expect(project.getProjectContext()).resolves.toMatchObject({
      status: {
        projectName: 'sample-app',
        validation: { checked: true, valid: true, level: 'syntax' },
      },
      schemas: [{ name: 'users' }],
      validation: { valid: true, level: 'syntax' },
      capabilities: {
        schemaRead: 'available',
        semanticValidation: 'not_implemented',
        applicationModel: 'not_implemented',
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
