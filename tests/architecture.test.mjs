import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packages = {
  '@gstack/application': 'packages/application',
  '@gstack/schema': 'packages/schema',
  '@gstack/config': 'packages/config',
  '@gstack/parser': 'packages/parser',
  '@gstack/analyzer': 'packages/analyzer',
  '@gstack/core': 'packages/core',
  '@gstack/mcp': 'packages/mcp',
  '@gstack/migration': 'packages/migration',
  '@gstack/generator': 'packages/generator',
  '@gstack/provider': 'packages/provider',
  '@gstack/provider-google': 'packages/provider-google',
  '@gstack/plugin': 'packages/plugin',
  '@gstack/runtime': 'packages/runtime',
  '@gstack/cli': 'cli',
};
const allowedInternalDependencies = {
  '@gstack/application': [],
  '@gstack/schema': [],
  '@gstack/config': [],
  '@gstack/parser': ['@gstack/schema'],
  '@gstack/analyzer': [
    '@gstack/application',
    '@gstack/parser',
    '@gstack/schema',
  ],
  '@gstack/core': [
    '@gstack/analyzer',
    '@gstack/application',
    '@gstack/config',
    '@gstack/generator',
    '@gstack/migration',
    '@gstack/parser',
    '@gstack/provider',
    '@gstack/schema',
  ],
  '@gstack/mcp': ['@gstack/core', '@gstack/runtime'],
  '@gstack/migration': ['@gstack/application'],
  '@gstack/generator': ['@gstack/application'],
  '@gstack/provider': ['@gstack/migration'],
  '@gstack/provider-google': ['@gstack/migration', '@gstack/provider'],
  '@gstack/plugin': [
    '@gstack/application',
    '@gstack/generator',
    '@gstack/provider',
  ],
  '@gstack/runtime': [
    '@gstack/config',
    '@gstack/core',
    '@gstack/migration',
    '@gstack/plugin',
    '@gstack/provider',
    '@gstack/provider-google',
  ],
  '@gstack/cli': ['@gstack/core', '@gstack/runtime'],
};

test('workspace packageの内部依存がArchitectureのallowlistに一致する', () => {
  for (const [name, directory] of Object.entries(packages)) {
    const manifest = json(path.join(directory, 'package.json'));
    const actual = Object.keys(manifest.dependencies ?? {})
      .filter((dependency) => dependency.startsWith('@gstack/'))
      .sort();
    assert.deepEqual(
      actual,
      [...allowedInternalDependencies[name]].sort(),
      name,
    );
  }
});

test('TypeScript project referenceがmanifestの内部依存と一致する', () => {
  const directoryToName = new Map(
    Object.entries(packages).map(([name, directory]) => [directory, name]),
  );
  for (const [name, directory] of Object.entries(packages)) {
    const config = json(path.join(directory, 'tsconfig.json'));
    const actual = (config.references ?? [])
      .map((reference) => {
        const target = path
          .relative(root, path.resolve(root, directory, reference.path))
          .replaceAll(path.sep, '/');
        return directoryToName.get(target);
      })
      .filter(Boolean)
      .sort();
    assert.deepEqual(
      actual,
      [...allowedInternalDependencies[name]].sort(),
      name,
    );
  }
});

test('基盤packageとCLIにProvider固有importやGoogle固有識別子を含めない', () => {
  for (const [name, directory] of Object.entries(packages)) {
    if (['@gstack/provider-google', '@gstack/runtime'].includes(name)) continue;
    for (const file of sourceFiles(path.join(root, directory, 'src'))) {
      if (file.endsWith('.test.ts')) continue;
      const source = readFileSync(file, 'utf8');
      assert.doesNotMatch(
        source,
        /from\s+['"]@gstack\/provider(?:-|\/)/u,
        file,
      );
      assert.doesNotMatch(source, /from\s+['"][^'"]*providers\//u, file);
      assert.doesNotMatch(
        source,
        /\bGoogle(?:Sheets|Drive|OAuth|Workspace|AppsScript)\b/u,
        file,
      );
    }
  }
});

function json(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
}

function sourceFiles(directory) {
  if (!statSync(directory).isDirectory()) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(target)
      : entry.isFile() && entry.name.endsWith('.ts')
        ? [target]
        : [];
  });
}
