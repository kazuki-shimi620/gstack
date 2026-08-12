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
      getMigrationStatus: vi.fn(),
      listMigrationHistory: vi.fn(),
      previewMigrationPlan: vi.fn(),
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
      getMigrationStatus: vi.fn(),
      listMigrationHistory: vi.fn(),
      previewMigrationPlan: vi.fn(),
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
  });
});
