import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const serverEntry = path.join(repositoryRoot, 'packages/mcp/dist/main.js');

test(
  'build済みstdio serverからProject、Schema、Validationを読み取る',
  { timeout: 10_000 },
  async (t) => {
    const root = mkdtempSync(path.join(tmpdir(), 'gstack-mcp-contract-'));
    mkdirSync(path.join(root, 'schema'));
    writeFileSync(
      path.join(root, 'gstack.yaml'),
      'version: 1\nname: mcp-contract\nschemaVersion: 1\nschema:\n  directory: schema\n',
    );
    writeFileSync(
      path.join(root, 'schema/users.yaml'),
      'name: users\nmodel: { displayName: User }\ndatabase: { primaryKey: id, columns: { id: { type: uuid } } }\n',
    );
    t.after(() => rmSync(root, { recursive: true, force: true }));

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverEntry],
      env: { GSTACK_PROJECT_ROOT: root },
      cwd: repositoryRoot,
      stderr: 'pipe',
    });
    let stderr = '';
    transport.stderr?.setEncoding('utf8');
    transport.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });

    const client = new Client({ name: 'gstack-contract', version: '0.0.0' });
    t.after(async () => client.close());
    await client.connect(transport);

    const tools = await client.listTools();
    assert.equal(
      tools.tools.every((tool) => tool.annotations?.readOnlyHint === true),
      true,
    );
    assert.equal(
      tools.tools.some((tool) =>
        /apply|rollback|deploy|remove|delete/u.test(tool.name),
      ),
      false,
    );

    const status = await client.callTool({ name: 'get_project_status' });
    assert.equal(status.structuredContent.ok, true);
    assert.deepEqual(status.structuredContent.warnings, []);
    assert.deepEqual(status.structuredContent.data.status, {
      projectRoot: root,
      projectName: 'mcp-contract',
      gstackVersion: '0.0.0',
      schemaCount: 1,
      config: {
        version: 1,
        schemaVersion: 1,
        schemaDirectory: 'schema',
      },
      providers: { configured: true, details: { count: 0 } },
      generators: { configured: false, details: null },
      migration: { availability: 'not_configured' },
      validation: { checked: false, valid: null, level: null },
    });

    const schemas = await client.callTool({ name: 'list_schemas' });
    assert.equal(schemas.structuredContent.ok, true);
    assert.deepEqual(
      schemas.structuredContent.data.schemas.map((schema) => schema.name),
      ['users'],
    );

    const schema = await client.callTool({
      name: 'get_schema',
      arguments: { name: 'users' },
    });
    assert.equal(schema.structuredContent.ok, true);
    assert.match(schema.structuredContent.data.schema.content, /name: users/u);

    const validation = await client.callTool({ name: 'validate_schema' });
    assert.deepEqual(validation.structuredContent, {
      ok: true,
      data: {
        validation: {
          valid: true,
          level: 'semantic',
          errors: [],
          warnings: [],
        },
      },
      warnings: [],
    });
    assert.equal(stderr, '');
  },
);
