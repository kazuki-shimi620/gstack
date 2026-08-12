import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GstackError, type GstackProject } from '@gstack/core';

import { createMcpServer } from './server.js';

const closeCallbacks: Array<() => Promise<void>> = [];
const config = {
  version: 1 as const,
  name: 'project',
  schemaVersion: 1 as const,
  schema: { directory: 'schema' },
};

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map((close) => close()));
});

describe('gstack MCP server', () => {
  it('exposes only read/validate tools and delegates tool calls to Core', async () => {
    const getStatus = vi.fn().mockResolvedValue({
      projectRoot: '/project',
      projectName: 'project',
      gstackVersion: '0.0.0',
      schemaCount: 0,
      config: { version: 1, schemaVersion: 1, schemaDirectory: 'schema' },
      providers: { configured: false, details: null },
      generators: { configured: false, details: null },
      migration: { availability: 'not_implemented' },
      validation: { checked: false, valid: null, level: null },
    });
    const project: GstackProject = {
      root: '/project',
      getConfig: vi.fn().mockResolvedValue(config),
      getStatus,
      getProjectContext: vi.fn().mockResolvedValue({
        status: {
          projectRoot: '/project',
          projectName: 'project',
          gstackVersion: '0.0.0',
          schemaCount: 0,
          config: { version: 1, schemaVersion: 1, schemaDirectory: 'schema' },
          providers: { configured: false, details: null },
          generators: { configured: false, details: null },
          migration: { availability: 'not_implemented' },
          validation: { checked: true, valid: true, level: 'syntax' },
        },
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
      listProviders: vi.fn().mockResolvedValue([providerSummary()]),
      getProvider: vi
        .fn()
        .mockImplementation(async (name: string) =>
          name === 'example' ? providerSummary() : null,
        ),
      validateProvider: vi.fn().mockResolvedValue([]),
      getProviderHealth: vi
        .fn()
        .mockResolvedValue({ status: 'healthy', code: 'READY' }),
      getMigrationStatus: vi.fn().mockResolvedValue(emptyMigrationStatus()),
      listMigrationHistory: vi.fn().mockResolvedValue([]),
      previewMigrationPlan: vi.fn().mockResolvedValue(emptyMigrationPlan()),
      previewGeneration: vi.fn().mockResolvedValue(emptyGenerationPlan()),
      generate: vi.fn(),
    };
    const server = createMcpServer(project);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    closeCallbacks.push(
      () => client.close(),
      () => server.close(),
    );

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      'get_project_status',
      'list_schemas',
      'get_schema',
      'validate_schema',
      'list_providers',
      'get_provider',
      'validate_provider',
      'get_provider_health',
      'get_migration_status',
      'list_migration_history',
      'preview_migration_plan',
      'preview_generation',
    ]);
    expect(
      tools.tools.every((tool) => tool.annotations?.readOnlyHint === true),
    ).toBe(true);
    expect(
      tools.tools.some((tool) =>
        /apply|rollback|deploy|remove|delete/u.test(tool.name),
      ),
    ).toBe(false);

    const result = await client.callTool({ name: 'get_project_status' });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      data: { status: { projectName: 'project' } },
      warnings: [],
    });
    expect(getStatus).toHaveBeenCalledOnce();

    const migration = await client.callTool({
      name: 'preview_migration_plan',
    });
    expect(migration.structuredContent).toMatchObject({
      ok: true,
      data: {
        migrationPlan: {
          baselineVersion: null,
          plan: { operations: [] },
        },
      },
    });
    expect(project.previewMigrationPlan).toHaveBeenCalledOnce();

    const generation = await client.callTool({ name: 'preview_generation' });
    expect(generation.structuredContent).toMatchObject({
      ok: true,
      data: { generationPlan: { writes: [], deletes: [] } },
    });
    expect(project.previewGeneration).toHaveBeenCalledOnce();

    const provider = await client.callTool({
      name: 'get_provider',
      arguments: { name: 'example' },
    });
    expect(provider.structuredContent).toMatchObject({
      ok: true,
      data: { provider: { name: 'example' } },
    });

    const validation = await client.callTool({
      name: 'validate_provider',
      arguments: { name: 'example' },
    });
    expect(validation.structuredContent).toMatchObject({
      ok: true,
      data: { issues: [] },
    });
    expect(project.validateProvider).toHaveBeenCalledWith('example');

    const health = await client.callTool({
      name: 'get_provider_health',
      arguments: { name: 'example' },
    });
    expect(health.structuredContent).toMatchObject({
      ok: true,
      data: { health: { status: 'healthy', code: 'READY' } },
    });
    expect(project.getProviderHealth).toHaveBeenCalledWith('example');

    const missingProvider = await client.callTool({
      name: 'get_provider',
      arguments: { name: 'missing' },
    });
    expect(missingProvider.structuredContent).toMatchObject({
      ok: false,
      error: { code: 'PROVIDER_NOT_FOUND', category: 'provider' },
    });

    const missing = await client.callTool({
      name: 'get_schema',
      arguments: { name: 'missing' },
    });
    expect(missing.isError).toBe(true);
    expect(missing.structuredContent).toMatchObject({
      ok: false,
      error: { code: 'SCHEMA_NOT_FOUND', category: 'schema' },
    });

    getStatus.mockRejectedValueOnce(
      new GstackError({
        code: 'SCHEMA_LOAD_FAILED',
        category: 'schema',
        message: 'Schema sources could not be loaded.',
      }),
    );
    const failed = await client.callTool({ name: 'get_project_status' });
    expect(failed.isError).toBe(true);
    expect(failed.structuredContent).toEqual({
      ok: false,
      error: {
        code: 'SCHEMA_LOAD_FAILED',
        category: 'schema',
        message: 'Schema sources could not be loaded.',
      },
    });
  });

  it('exposes read-only project context and Schema resources', async () => {
    const status = {
      projectRoot: '/project',
      projectName: 'project',
      gstackVersion: '0.0.0',
      schemaCount: 1,
      config: { version: 1, schemaVersion: 1, schemaDirectory: 'schema' },
      providers: { configured: false, details: null },
      generators: { configured: false, details: null },
      migration: { availability: 'not_implemented' as const },
      validation: { checked: true, valid: true, level: 'syntax' as const },
    };
    const schema = {
      id: 'schema/users.yaml',
      name: 'users',
      path: '/project/schema/users.yaml',
      content: 'name: users\n',
    };
    const project: GstackProject = {
      root: '/project',
      getConfig: vi.fn().mockResolvedValue(config),
      getStatus: vi.fn().mockResolvedValue(status),
      getProjectContext: vi.fn().mockResolvedValue({
        status,
        schemas: [schema],
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
      listSchemas: vi.fn().mockResolvedValue([schema]),
      getSchema: vi
        .fn()
        .mockImplementation((name: string) =>
          Promise.resolve(name === 'users' ? schema : null),
        ),
      validateSchema: vi.fn().mockResolvedValue({
        valid: true,
        level: 'syntax',
        errors: [],
        warnings: [],
      }),
      getApplicationModel: vi.fn().mockResolvedValue(null),
      listProviders: vi.fn().mockResolvedValue([providerSummary()]),
      getProvider: vi
        .fn()
        .mockImplementation(async (name: string) =>
          name === 'example' ? providerSummary() : null,
        ),
      validateProvider: vi.fn().mockResolvedValue([]),
      getProviderHealth: vi
        .fn()
        .mockResolvedValue({ status: 'healthy', code: 'READY' }),
      getMigrationStatus: vi.fn().mockResolvedValue(emptyMigrationStatus()),
      listMigrationHistory: vi.fn().mockResolvedValue([]),
      previewMigrationPlan: vi.fn().mockResolvedValue(emptyMigrationPlan()),
      previewGeneration: vi.fn().mockResolvedValue(emptyGenerationPlan()),
      generate: vi.fn(),
    };
    const server = createMcpServer(project);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    closeCallbacks.push(
      () => client.close(),
      () => server.close(),
    );

    const resources = await client.listResources();
    expect(resources.resources.map((resource) => resource.uri)).toEqual(
      expect.arrayContaining([
        'gstack://project',
        'gstack://project-context',
        'gstack://config',
        'gstack://schema',
        'gstack://schema/users',
        'gstack://application-model',
        'gstack://provider',
        'gstack://provider/example',
        'gstack://migration/status',
        'gstack://migration/history',
        'gstack://architecture',
      ]),
    );

    const context = await client.readResource({
      uri: 'gstack://project-context',
    });
    const contextContent = context.contents[0];
    if (!contextContent || !('text' in contextContent)) {
      throw new Error('Expected text project context resource');
    }
    expect(JSON.parse(contextContent.text)).toMatchObject({
      status: { projectName: 'project' },
      capabilities: { semanticValidation: 'available' },
    });

    const schemaResource = await client.readResource({
      uri: 'gstack://schema/users',
    });
    const schemaContent = schemaResource.contents[0];
    if (!schemaContent || !('text' in schemaContent)) {
      throw new Error('Expected text Schema resource');
    }
    expect(schemaContent.text).toBe('name: users\n');

    const configResource = await client.readResource({
      uri: 'gstack://config',
    });
    const configContent = configResource.contents[0];
    if (!configContent || !('text' in configContent)) {
      throw new Error('Expected text Config resource');
    }
    expect(JSON.parse(configContent.text)).toEqual(config);

    const applicationResource = await client.readResource({
      uri: 'gstack://application-model',
    });
    const applicationContent = applicationResource.contents[0];
    if (!applicationContent || !('text' in applicationContent)) {
      throw new Error('Expected text Application Model resource');
    }
    expect(JSON.parse(applicationContent.text)).toBeNull();

    const providerResource = await client.readResource({
      uri: 'gstack://provider/example',
    });
    const providerContent = providerResource.contents[0];
    if (!providerContent || !('text' in providerContent)) {
      throw new Error('Expected text Provider resource');
    }
    expect(JSON.parse(providerContent.text)).toMatchObject({ name: 'example' });

    const migrationStatus = await client.readResource({
      uri: 'gstack://migration/status',
    });
    const migrationContent = migrationStatus.contents[0];
    if (!migrationContent || !('text' in migrationContent)) {
      throw new Error('Expected text Migration status resource');
    }
    expect(JSON.parse(migrationContent.text)).toEqual(emptyMigrationStatus());
  });
});

function emptyMigrationStatus() {
  return {
    totalCount: 0,
    pendingCount: 0,
    applyingCount: 0,
    appliedCount: 0,
    failedCount: 0,
    rolledBackCount: 0,
    latestAttempt: null,
    latestApplied: null,
  };
}

function providerSummary() {
  return {
    name: 'example',
    packageName: '@example/provider-example',
    version: '0.1.0',
    minimumGstackVersion: '0.0.0',
    capabilities: {
      database: true,
      api: false,
      authentication: false,
      storage: false,
      deploy: false,
    },
    migrationSupport: {
      create_model: 'native' as const,
      drop_model: 'unsupported' as const,
      add_column: 'native' as const,
      drop_column: 'unsupported' as const,
      rename_column: 'unsupported' as const,
      alter_column: 'emulated' as const,
      add_index: 'unsupported' as const,
      drop_index: 'unsupported' as const,
      add_relation: 'unsupported' as const,
      drop_relation: 'unsupported' as const,
    },
  };
}

function emptyMigrationPlan() {
  return {
    baselineVersion: null,
    plan: {
      operations: [],
      risk: 'safe',
      destructive: false,
      reversible: true,
      capabilityStatus: 'supported',
      applicable: true,
      warnings: [],
    },
  };
}

function emptyGenerationPlan() {
  return {
    writes: [],
    deletes: [],
    manifest: { formatVersion: 1, artifacts: [] },
  };
}
