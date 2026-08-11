#!/usr/bin/env node

import { loadProject } from '@gstack/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createMcpServer } from './server.js';

async function main(): Promise<void> {
  const project = await loadProject(
    process.env.GSTACK_PROJECT_ROOT
      ? { root: process.env.GSTACK_PROJECT_ROOT }
      : { startDirectory: process.cwd() },
  );
  const server = createMcpServer(project);
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`gstack MCP failed: ${message}\n`);
  process.exitCode = 1;
});
