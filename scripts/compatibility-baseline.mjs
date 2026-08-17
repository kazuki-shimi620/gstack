#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createProgram } from '../cli/dist/program.js';

const root = path.resolve(import.meta.dirname, '..');
const baselinePath = path.join(root, 'compatibility', 'api-cli-baseline.json');
const packages = new Map([
  ['@gstack/core', 'packages/core'],
  ['@gstack/cli', 'cli'],
  ['@gstack/mcp', 'packages/mcp'],
  ['@gstack/provider', 'packages/provider'],
  ['@gstack/provider-google', 'packages/provider-google'],
]);

const current = {
  formatVersion: 1,
  packages: Object.fromEntries(
    [...packages].map(([name, directory]) => [name, packageSurface(directory)]),
  ),
  cli: commandSurface(createProgram({ stdout() {}, stderr() {} })),
};
const serialized = `${JSON.stringify(current, null, 2)}\n`;

if (process.argv.includes('--write')) {
  mkdirSync(path.dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, serialized, { encoding: 'utf8', flag: 'w' });
  process.stdout.write('公開API／CLI互換性baselineを更新しました。\n');
} else if (process.argv.includes('--print')) {
  process.stdout.write(serialized);
} else {
  let expected;
  try {
    expected = readFileSync(baselinePath, 'utf8');
  } catch {
    fail('互換性baselineを読み込めません。');
  }
  if (expected !== serialized) {
    fail(
      '公開APIまたはCLI surfaceがbaselineと一致しません。互換性をレビューしてbaselineを明示更新してください。',
    );
  }
  process.stdout.write('公開API／CLI互換性baselineは一致しています。\n');
}

function packageSurface(directory) {
  const manifest = JSON.parse(
    readFileSync(path.join(root, directory, 'package.json'), 'utf8'),
  );
  const declaration =
    typeof manifest.types === 'string'
      ? manifest.types.replace(/^\.\//, '')
      : undefined;
  return {
    exports: manifest.exports ?? null,
    types: manifest.types ?? null,
    bin: manifest.bin ?? null,
    declarationSha256: declaration
      ? sha256(readFileSync(path.join(root, directory, declaration), 'utf8'))
      : null,
  };
}

function commandSurface(command, parents = []) {
  const pathParts = [...parents, command.name()];
  return {
    path: pathParts.join(' '),
    helpSha256: sha256(command.helpInformation()),
    commands: command.commands.map((child) => commandSurface(child, pathParts)),
  };
}

function sha256(value) {
  return createHash('sha256')
    .update(value.replaceAll('\r\n', '\n'))
    .digest('hex');
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
