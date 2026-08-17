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
  formatVersion: 2,
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
    expected = JSON.parse(readFileSync(baselinePath, 'utf8'));
  } catch {
    fail('互換性baselineを読み込めません。');
  }
  const difference = firstDifference(expected, current);
  if (difference) {
    fail(
      `公開APIまたはCLI surfaceがbaselineと一致しません（${difference}）。互換性をレビューしてbaselineを明示更新してください。`,
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
    aliases: command.aliases(),
    description: command.description(),
    summary: command.summary(),
    version: command.version() ?? null,
    arguments: command.registeredArguments.map((argument) => ({
      name: argument.name(),
      description: argument.description,
      required: argument.required,
      variadic: argument.variadic,
      choices: argument.argChoices ?? null,
      defaultValue: jsonValue(argument.defaultValue),
    })),
    options: command.options.map((option) => ({
      flags: option.flags,
      description: option.description,
      required: option.required,
      optional: option.optional,
      variadic: option.variadic,
      mandatory: option.mandatory,
      negate: option.negate,
      hidden: option.hidden,
      choices: option.argChoices ?? null,
      defaultValue: jsonValue(option.defaultValue),
    })),
    commands: command.commands.map((child) => commandSurface(child, pathParts)),
  };
}

function jsonValue(value) {
  if (value === undefined) return null;
  if (value === process.cwd()) return '<cwd>';
  JSON.stringify(value);
  return value;
}

function firstDifference(expected, actual, location = '$') {
  if (Object.is(expected, actual)) return null;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return `${location}.length`;
    for (let index = 0; index < expected.length; index += 1) {
      const difference = firstDifference(
        expected[index],
        actual[index],
        `${location}[${index}]`,
      );
      if (difference) return difference;
    }
    return null;
  }
  if (object(expected) && object(actual)) {
    const expectedKeys = Object.keys(expected);
    const actualKeys = Object.keys(actual);
    if (expectedKeys.join('\0') !== actualKeys.join('\0'))
      return `${location}.keys`;
    for (const key of expectedKeys) {
      const difference = firstDifference(
        expected[key],
        actual[key],
        `${location}.${key}`,
      );
      if (difference) return difference;
    }
    return null;
  }
  return location;
}

function object(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
