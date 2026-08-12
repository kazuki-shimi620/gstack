import { describe, expect, it, vi } from 'vitest';

import type { GstackProject } from '@gstack/core';

import { createReadHandlers } from './handlers.js';

const config = {
  version: 1 as const,
  name: 'project',
  schemaVersion: 1 as const,
  schema: { directory: 'schema' },
};

describe('MCP read handlers', () => {
  it('delegates to Core without reimplementing project logic', async () => {
    const status = {
      projectRoot: '/project',
      projectName: 'project',
      gstackVersion: '0.0.0',
      schemaCount: 0,
      config: { version: 1, schemaVersion: 1, schemaDirectory: 'schema' },
      providers: { configured: false, details: null },
      generators: { configured: false, details: null },
      migration: { availability: 'not_implemented' as const },
      validation: { checked: false, valid: null, level: null },
    };
    const getStatus = vi.fn().mockResolvedValue(status);
    const project: GstackProject = {
      root: '/project',
      getConfig: vi.fn().mockResolvedValue(config),
      getStatus,
      getProjectContext: vi.fn().mockResolvedValue({
        status,
        schemas: [],
        validation: { valid: true, level: 'syntax', errors: [], warnings: [] },
        capabilities: {
          projectStatus: 'available',
          schemaRead: 'available',
          schemaSyntaxValidation: 'available',
          semanticValidation: 'available',
          applicationModel: 'available',
          providerStatus: 'not_implemented',
          migrationPlan: 'not_implemented',
          generatedArtifacts: 'not_implemented',
        },
      }),
      listSchemas: vi.fn().mockResolvedValue([]),
      getSchema: vi.fn().mockResolvedValue(null),
      validateSchema: vi.fn().mockResolvedValue({
        valid: true,
        level: 'syntax',
        errors: [],
        warnings: [],
      }),
      getApplicationModel: vi.fn().mockResolvedValue(null),
      getMigrationStatus: vi.fn(),
      listMigrationHistory: vi.fn(),
      previewMigrationPlan: vi.fn(),
    };

    await expect(createReadHandlers(project).getProjectStatus()).resolves.toBe(
      status,
    );
    expect(getStatus).toHaveBeenCalledOnce();
    await expect(createReadHandlers(project).getConfig()).resolves.toBe(config);
    await expect(
      createReadHandlers(project).getApplicationModel(),
    ).resolves.toBeNull();
  });
});
