#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(import.meta.dirname, '..');
const releaseVersion = JSON.parse(
  readFileSync(path.join(root, 'package.json'), 'utf8'),
).version;
const workspaceDirectories = [
  'cli',
  'packages/analyzer',
  'packages/application',
  'packages/config',
  'packages/core',
  'packages/generator',
  'packages/mcp',
  'packages/migration',
  'packages/parser',
  'packages/plugin',
  'packages/provider',
  'packages/provider-google',
  'packages/runtime',
  'packages/schema',
];
const importablePackages = workspaceDirectories
  .map((directory) =>
    JSON.parse(
      readFileSync(path.join(root, directory, 'package.json'), 'utf8'),
    ),
  )
  .filter((manifest) => manifest.exports)
  .map((manifest) => manifest.name);

const temporary = mkdtempSync(path.join(tmpdir(), 'gstack-release-smoke-'));
const tarballDirectory = path.join(temporary, 'tarballs');
const installDirectory = path.join(temporary, 'consumer');
const npmCache = path.join(temporary, 'npm-cache');

try {
  mkdirSync(tarballDirectory);
  mkdirSync(installDirectory);
  writeFileSync(
    path.join(installDirectory, 'package.json'),
    '{"name":"gstack-release-smoke","private":true,"type":"module"}\n',
  );

  const tarballs = workspaceDirectories.map((directory) => {
    const output = runNpm(
      [
        'pack',
        '--json',
        '--ignore-scripts',
        '--pack-destination',
        tarballDirectory,
      ],
      path.join(root, directory),
    );
    const [packed] = JSON.parse(output);
    if (!packed?.filename) fail(`tarball名を取得できません: ${directory}`);
    return path.join(tarballDirectory, packed.filename);
  });

  runNpm(
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      ...tarballs,
    ],
    installDirectory,
  );

  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `await Promise.all(${JSON.stringify(importablePackages)}.map((name) => import(name)));`,
    ],
    { cwd: installDirectory, stdio: 'pipe' },
  );

  const cli = path.join(installDirectory, 'node_modules', '.bin', 'gstack');
  const version = execFileSync(cli, ['version'], {
    cwd: installDirectory,
    encoding: 'utf8',
  }).trim();
  if (version !== releaseVersion) fail(`CLI versionが一致しません: ${version}`);
  const help = execFileSync(cli, ['--help'], {
    cwd: installDirectory,
    encoding: 'utf8',
  });
  if (!help.includes('Schema-first application framework')) {
    fail('インストール済みCLIのhelpを確認できません。');
  }
  await verifyInstalledMcp();

  process.stdout.write(
    `Release smoke testに成功しました（${tarballs.length} Package）。\n`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

function runNpm(arguments_, cwd) {
  return execFileSync('npm', arguments_, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, npm_config_cache: npmCache },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function fail(message) {
  throw new Error(message);
}

async function verifyInstalledMcp() {
  const project = path.join(temporary, 'mcp-project');
  mkdirSync(path.join(project, 'schema'), { recursive: true });
  writeFileSync(
    path.join(project, 'gstack.yaml'),
    'version: 1\nname: release-smoke\nschemaVersion: 1\nschema:\n  directory: schema\n',
  );
  writeFileSync(
    path.join(project, 'schema/users.yaml'),
    'name: users\nmodel: { displayName: User }\ndatabase: { primaryKey: id, columns: { id: { type: uuid } } }\n',
  );

  const mcp = path.join(installDirectory, 'node_modules', '.bin', 'gstack-mcp');
  const transport = new StdioClientTransport({
    command: mcp,
    cwd: installDirectory,
    env: { GSTACK_PROJECT_ROOT: project },
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.setEncoding('utf8');
  transport.stderr?.on('data', (chunk) => {
    stderr += chunk;
  });
  const client = new Client({ name: 'gstack-release-smoke', version: '0.0.0' });
  const requestOptions = { timeout: 5_000, maxTotalTimeout: 5_000 };

  try {
    await client.connect(transport, requestOptions);
    const tools = await client.listTools(undefined, requestOptions);
    if (!tools.tools.some(({ name }) => name === 'get_project_status')) {
      fail('インストール済みMCPのTool一覧を確認できません。');
    }
    if (
      tools.tools.some(({ name }) =>
        /apply|rollback|deploy|remove|delete/u.test(name),
      )
    ) {
      fail('インストール済みMCPに危険なToolが含まれます。');
    }
    const result = await client.callTool(
      { name: 'get_project_status' },
      undefined,
      requestOptions,
    );
    if (
      result.structuredContent?.ok !== true ||
      result.structuredContent.data?.status?.projectName !== 'release-smoke'
    ) {
      fail('インストール済みMCPからProject statusを取得できません。');
    }
    if (stderr !== '') fail('インストール済みMCPがstderrへ出力しました。');
  } catch (error) {
    const detail = stderr === '' ? '' : ` stderr=${JSON.stringify(stderr)}`;
    throw new Error(`インストール済みMCPの検証に失敗しました。${detail}`, {
      cause: error,
    });
  } finally {
    await client.close();
  }
}
