#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
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
const versionArgument = process.argv.indexOf('--set');

if (versionArgument !== -1) {
  const version = process.argv[versionArgument + 1];
  if (!version || !validVersion(version)) {
    fail('--setにはbuild metadataを含まない正規SemVerを指定してください。');
  }
  updateVersions(version);
  process.stdout.write(`Release versionを${version}へ更新しました。\n`);
} else {
  await checkVersions();
  process.stdout.write('Release versionは同期しています。\n');
}

async function checkVersions() {
  const rootManifest = json('package.json');
  const version = rootManifest.version;
  if (!validVersion(version))
    fail('root package versionが正規SemVerではありません。');

  const manifests = workspaceDirectories.map((directory) => ({
    directory,
    manifest: json(path.join(directory, 'package.json')),
  }));
  const internalNames = new Set(manifests.map(({ manifest }) => manifest.name));
  for (const { directory, manifest } of manifests) {
    if (manifest.version !== version)
      fail(`${directory}のversionが同期していません。`);
    for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
      if (internalNames.has(name) && range !== version) {
        fail(
          `${directory}の内部依存${name}が同期exact versionではありません。`,
        );
      }
    }
  }

  const lock = json('package-lock.json');
  if (lock.version !== version || lock.packages?.['']?.version !== version) {
    fail('package-lock.jsonのroot versionが同期していません。');
  }
  for (const { directory, manifest } of manifests) {
    const locked = lock.packages?.[directory];
    if (locked?.version !== version)
      fail(`${directory}のlock versionが同期していません。`);
    for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
      if (internalNames.has(name) && locked.dependencies?.[name] !== range) {
        fail(`${directory}のlock内部依存${name}が同期していません。`);
      }
    }
  }

  const [{ GSTACK_VERSION }, { googleProviderManifest }] = await Promise.all([
    import('../packages/core/dist/index.js'),
    import('../packages/provider-google/dist/provider.js'),
  ]);
  if (GSTACK_VERSION !== version)
    fail('Core Runtime versionが同期していません。');
  if (
    googleProviderManifest.version !== version ||
    googleProviderManifest.minimumGstackVersion !== version
  ) {
    fail('Google Provider versionが同期していません。');
  }
}

function updateVersions(version) {
  const files = [
    'package.json',
    ...workspaceDirectories.map((directory) =>
      path.join(directory, 'package.json'),
    ),
  ];
  const manifests = files.map((file) => ({ file, manifest: json(file) }));
  const internalNames = new Set(
    manifests.slice(1).map(({ manifest }) => manifest.name),
  );
  for (const { file, manifest } of manifests) {
    manifest.version = version;
    for (const name of Object.keys(manifest.dependencies ?? {})) {
      if (internalNames.has(name)) manifest.dependencies[name] = version;
    }
    writeFileSync(
      path.join(root, file),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  }
  replaceVersion('packages/core/src/version.ts', 'GSTACK_VERSION', version);
  replaceVersion(
    'packages/provider-google/src/version.ts',
    'GOOGLE_PROVIDER_VERSION',
    version,
  );
  replaceVersion(
    'packages/provider-google/src/version.ts',
    'MINIMUM_GSTACK_VERSION',
    version,
  );
  execFileSync(
    'npm',
    ['install', '--package-lock-only', '--ignore-scripts', '--offline'],
    { cwd: root, stdio: 'inherit' },
  );
}

function replaceVersion(file, constant, version) {
  const target = path.join(root, file);
  const source = readFileSync(target, 'utf8');
  const pattern = new RegExp(`(export const ${constant} = ')[^']+(';)`);
  const next = source.replace(pattern, `$1${version}$2`);
  if (next === source && !source.includes(`'${version}'`)) {
    fail(`${file}の${constant}を更新できません。`);
  }
  writeFileSync(target, next);
}

function json(file) {
  return JSON.parse(readFileSync(path.join(root, file), 'utf8'));
}

function validVersion(value) {
  return (
    typeof value === 'string' &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
      value,
    )
  );
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
