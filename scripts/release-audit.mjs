#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const strict = process.argv.includes('--strict');
const supportedCandidates = new Map([
  ['@gstack/core', 'packages/core'],
  ['@gstack/cli', 'cli'],
  ['@gstack/mcp', 'packages/mcp'],
  ['@gstack/provider', 'packages/provider'],
  ['@gstack/provider-google', 'packages/provider-google'],
]);

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

const manifests = new Map(
  workspaceDirectories.map((directory) => {
    const manifest = JSON.parse(
      readFileSync(path.join(root, directory, 'package.json'), 'utf8'),
    );
    return [manifest.name, { directory, manifest }];
  }),
);
const versions = new Set(
  [...manifests.values()].map(({ manifest }) => manifest.version),
);
const diagnostics = [];

if (versions.size !== 1) {
  diagnostics.push('全Workspace Packageのversionが同期していません。');
}

for (const [name, { directory, manifest }] of manifests) {
  const expectedDirectory = supportedCandidates.get(name);
  if (expectedDirectory && expectedDirectory !== directory) {
    diagnostics.push(
      `${name}: 公開候補Packageを所定のDirectoryで確認できません。`,
    );
  }
  if (manifest.private !== false) {
    diagnostics.push(`${name}: package.jsonのprivateがfalseではありません。`);
  }
  if (
    typeof manifest.description !== 'string' ||
    manifest.description.length === 0
  ) {
    diagnostics.push(`${name}: descriptionがありません。`);
  }
  if (typeof manifest.license !== 'string' || manifest.license.length === 0) {
    diagnostics.push(`${name}: licenseがありません。`);
  }
  if (typeof manifest.repository !== 'object' || manifest.repository === null) {
    diagnostics.push(`${name}: repository metadataがありません。`);
  }
  if (
    !Array.isArray(manifest.files) ||
    manifest.files.length !== 1 ||
    manifest.files[0] !== 'dist'
  ) {
    diagnostics.push(`${name}: filesはdistだけを収録する設定ではありません。`);
  }

  const requiredEntries = packageEntries(manifest);
  for (const file of requiredEntries) {
    if (!existsSync(path.join(root, directory, file))) {
      diagnostics.push(
        `${name}: 配布entry ${file} がBuild後にも存在しません。`,
      );
    }
  }

  for (const [dependency, range] of Object.entries(
    manifest.dependencies ?? {},
  )) {
    const internal = manifests.get(dependency);
    if (!internal) continue;
    if (range !== manifest.version) {
      diagnostics.push(
        `${name}: 内部依存${dependency}は同期exact versionではありません。`,
      );
    }
    if (internal.manifest.private !== false) {
      diagnostics.push(
        `${name}: 非公開Workspace Package ${dependency} へ実行時依存しています。`,
      );
    }
  }

  try {
    const raw = execFileSync(
      'npm',
      ['pack', '--dry-run', '--json', '--ignore-scripts'],
      {
        cwd: path.join(root, directory),
        encoding: 'utf8',
        env: {
          ...process.env,
          npm_config_cache: path.join(
            tmpdir(),
            'gstack-release-audit-npm-cache',
          ),
        },
      },
    );
    const [pack] = JSON.parse(raw);
    const files = new Set(pack.files.map(({ path: file }) => file));
    for (const file of ['package.json', ...requiredEntries]) {
      if (!files.has(file))
        diagnostics.push(`${name}: npm packに${file}が含まれません。`);
    }
    const sensitive = [...files].find((file) =>
      /(^|\/)(\.env(?:\.|$)|credentials?\.json$|secrets?\.json$|service-account(?:\.|$))/i.test(
        file,
      ),
    );
    if (sensitive)
      diagnostics.push(
        `${name}: npm packに機密file候補${sensitive}が含まれます。`,
      );
  } catch {
    diagnostics.push(`${name}: npm pack --dry-runに失敗しました。`);
  }
}

const result = {
  ready: diagnostics.length === 0,
  version: versions.size === 1 ? [...versions][0] : null,
  candidates: [...supportedCandidates.keys()],
  distributionPackages: [...manifests.keys()].sort(),
  diagnostics,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (strict && !result.ready) process.exitCode = 1;

function packageEntries(manifest) {
  const entries = [];
  collectExport(manifest.exports, entries);
  if (typeof manifest.types === 'string') entries.push(manifest.types);
  if (typeof manifest.bin === 'string') entries.push(manifest.bin);
  else if (manifest.bin && typeof manifest.bin === 'object') {
    for (const value of Object.values(manifest.bin)) {
      if (typeof value === 'string') entries.push(value);
    }
  }
  return [...new Set(entries.map((entry) => entry.replace(/^\.\//, '')))];
}

function collectExport(value, entries) {
  if (typeof value === 'string') entries.push(value);
  else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) collectExport(child, entries);
  }
}
