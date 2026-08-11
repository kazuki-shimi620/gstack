import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  failureResult,
  getErrorDetails,
  GstackError,
  successResult,
  type GstackProject,
} from '@gstack/core';

import { createReadHandlers } from './handlers.js';

export function createMcpServer(project: GstackProject): McpServer {
  const handlers = createReadHandlers(project);
  const server = new McpServer(
    { name: 'gstack', version: '0.0.0' },
    {
      instructions:
        'Use read and validation tools to inspect this gstack project. This server exposes no apply, rollback, deploy, remove, or delete operation.',
    },
  );

  server.registerTool(
    'get_project_status',
    {
      title: 'Get gstack project status',
      description:
        'Returns structured, read-only status for the current gstack project.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () =>
      safeStructured(async () => ({
        status: await handlers.getProjectStatus(),
      })),
  );

  server.registerTool(
    'list_schemas',
    {
      title: 'List gstack schemas',
      description: 'Lists Schema files in deterministic order.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () =>
      safeStructured(async () => ({ schemas: await handlers.listSchemas() })),
  );

  server.registerTool(
    'get_schema',
    {
      title: 'Get a gstack schema',
      description:
        'Returns one Schema source by its name or schema-relative id.',
      inputSchema: { name: z.string().min(1) },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ name }) =>
      safeStructured(async () => {
        const schema = await handlers.getSchema(name);
        if (!schema) {
          throw new GstackError({
            code: 'SCHEMA_NOT_FOUND',
            category: 'schema',
            message: `Schema not found: ${name}`,
          });
        }
        return { schema };
      }),
  );

  server.registerTool(
    'validate_schema',
    {
      title: 'Validate gstack schema syntax',
      description:
        'Runs the currently implemented syntax-level Schema validation and returns structured diagnostics.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () =>
      safeStructured(async () => ({
        validation: await handlers.validateSchema(),
      })),
  );

  server.registerResource(
    'project',
    'gstack://project',
    {
      title: 'gstack project status',
      description: 'Structured status and available subsystem state.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(await handlers.getProjectStatus(), null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    'project-context',
    'gstack://project-context',
    {
      title: 'gstack project context',
      description:
        'Aggregated Schema, validation, status, and capability context for an AI agent entering the project.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(await handlers.getProjectContext(), null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    'config',
    'gstack://config',
    {
      title: 'gstack project configuration',
      description: 'Validated, non-secret gstack project configuration.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(await handlers.getConfig(), null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    'schema-index',
    'gstack://schema',
    {
      title: 'gstack Schema index',
      description: 'Lists the Schema sources available in this project.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(await handlers.listSchemas(), null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    'schema-source',
    new ResourceTemplate('gstack://schema/{name}', {
      list: async () => ({
        resources: (await handlers.listSchemas()).map((schema) => ({
          name: schema.name,
          title: `gstack Schema: ${schema.name}`,
          uri: `gstack://schema/${encodeURIComponent(schema.name)}`,
          mimeType: 'application/yaml',
        })),
      }),
      complete: {
        name: async (value) =>
          (await handlers.listSchemas())
            .map((schema) => schema.name)
            .filter((name) => name.startsWith(value)),
      },
    }),
    {
      title: 'gstack Schema source',
      description: 'Returns one raw Schema source by name.',
      mimeType: 'application/yaml',
    },
    async (uri, variables) => {
      const name = String(variables.name);
      const schema = await handlers.getSchema(name);
      if (!schema) {
        throw new GstackError({
          code: 'SCHEMA_NOT_FOUND',
          category: 'schema',
          message: `Schema not found: ${name}`,
        });
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/yaml',
            text: schema.content,
          },
        ],
      };
    },
  );

  server.registerResource(
    'architecture',
    'gstack://architecture',
    {
      title: 'gstack architecture entry point',
      description:
        'Points agents to the repository architecture and invariant documents.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: [
            '# gstack Architecture Context',
            '',
            'Read `README.md`, then `docs/ARCHITECTURE.md`, and obey its Architecture Invariants.',
            'Use `AGENTS.md` for repository development rules, `docs/DECISIONS.md` for accepted contracts, and `docs/TODO.md` for remaining work.',
          ].join('\n'),
        },
      ],
    }),
  );

  return server;
}

function structured(value: object) {
  const normalized = normalize(value);
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(normalized, null, 2) },
    ],
    structuredContent: normalized,
  };
}

async function safeStructured(
  operation: () => Promise<Record<string, unknown>>,
) {
  try {
    return structured(successResult(await operation()));
  } catch (error: unknown) {
    const details = getErrorDetails(error);
    const result = failureResult(details);
    const normalized = normalize(result);
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(normalized, null, 2),
        },
      ],
      structuredContent: normalized,
    };
  }
}

function normalize(value: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
