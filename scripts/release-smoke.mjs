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

const root = path.resolve(import.meta.dirname, '..');
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
  if (version !== '0.0.0') fail(`CLI versionが一致しません: ${version}`);
  const help = execFileSync(cli, ['--help'], {
    cwd: installDirectory,
    encoding: 'utf8',
  });
  if (!help.includes('Schema-first application framework')) {
    fail('インストール済みCLIのhelpを確認できません。');
  }

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
