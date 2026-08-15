import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const cli = path.join(repositoryRoot, 'cli/dist/main.js');

function run(args, cwd = repositoryRoot) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function project(schema, extraConfig = '') {
  const root = mkdtempSync(path.join(tmpdir(), 'gstack-cli-contract-'));
  mkdirSync(path.join(root, 'schema'));
  writeFileSync(
    path.join(root, 'gstack.yaml'),
    `version: 1\nname: sample-app\nschemaVersion: 1\nschema:\n  directory: schema\ngenerator:\n  formatVersion: 1\n  types: true\n  validation: false\n  api: true\n  frontend: true\n  openapi: false\n  documentation: false\n  aiDocumentation: false\n${extraConfig}`,
  );
  writeFileSync(path.join(root, 'schema/users.yaml'), schema);
  return root;
}

test('helpとversionを表示する', () => {
  const help = run(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /schema/);
  assert.match(help.stdout, /migration/);
  assert.match(help.stdout, /version/);
  assert.equal(help.stderr, '');

  const version = run(['version']);
  assert.equal(version.status, 0);
  assert.equal(version.stdout, '0.0.0\n');
  assert.equal(version.stderr, '');
});

test('親方向にProject Rootを探索してsemantic validationを実行する', (t) => {
  const root = project(
    'name: users\nmodel: { displayName: User }\ndatabase: { primaryKey: id, columns: { id: { type: uuid } } }\n',
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const nested = path.join(root, 'app', 'nested');
  mkdirSync(nested, { recursive: true });

  const human = run(['schema', 'validate'], nested);
  assert.equal(human.status, 0);
  assert.equal(human.stdout, 'Schema is valid (semantic).\n');
  assert.equal(human.stderr, '');

  const json = run(['schema', 'validate', '--json'], nested);
  assert.equal(json.status, 0);
  assert.equal(json.stderr, '');
  assert.deepEqual(JSON.parse(json.stdout), {
    ok: true,
    data: { valid: true, level: 'semantic', errors: [], warnings: [] },
    warnings: [],
  });
});

test('syntaxとsemantic errorをexit code 2で返す', (t) => {
  const syntaxRoot = project('name: users\nname: duplicate\n');
  const semanticRoot = project(
    'name: users\nmodel: {}\ndatabase: { primaryKey: id, columns: {} }\n',
  );
  t.after(() => {
    rmSync(syntaxRoot, { recursive: true, force: true });
    rmSync(semanticRoot, { recursive: true, force: true });
  });

  const syntax = run(['schema', 'validate', '--json'], syntaxRoot);
  assert.equal(syntax.status, 2);
  assert.equal(JSON.parse(syntax.stdout).data.level, 'syntax');
  assert.equal(syntax.stderr, '');

  const semantic = run(['schema', 'validate', '--json'], semanticRoot);
  assert.equal(semantic.status, 2);
  assert.equal(JSON.parse(semantic.stdout).data.level, 'semantic');
  assert.equal(semantic.stderr, '');
});

test('Project未検出をexit code 3とJSON stderrで返す', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'gstack-cli-missing-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = run(['schema', 'validate', '--json'], root);
  assert.equal(result.status, 3);
  assert.equal(result.stdout, '');
  const error = JSON.parse(result.stderr);
  assert.deepEqual(
    { ok: error.ok, code: error.error.code, category: error.error.category },
    {
      ok: false,
      code: 'PROJECT_NOT_FOUND',
      category: 'configuration',
    },
  );
  assert.deepEqual(
    {
      message: error.error.message,
      hint: error.error.hint,
    },
    {
      message: 'No gstack project was found.',
      hint: 'Run the command inside a project containing gstack.yaml or provide an explicit project root.',
    },
  );
  assert.equal(path.basename(error.error.path), path.basename(root));
});

test('built CLIが実行可能である', () => {
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf8' }),
  );
});

test('generate dry-runと明示的writeを分離する', (t) => {
  const root = project(
    'name: users\nmodel: { displayName: User }\ndatabase: { primaryKey: id, columns: { id: { type: uuid } } }\n',
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const preview = run(['generate', '--dry-run', '--json'], root);
  assert.equal(preview.status, 0);
  assert.equal(preview.stderr, '');
  const previewJson = JSON.parse(preview.stdout);
  assert.equal(previewJson.ok, true);
  assert.equal(previewJson.data.dryRun, true);
  assert.deepEqual(
    previewJson.data.plan.writes.map(({ path: artifactPath }) => artifactPath),
    [
      'generated/api/contracts.ts',
      'generated/frontend/index.ts',
      'generated/types/index.ts',
      'generated/types/users.ts',
    ],
  );
  assert.equal(existsSync(path.join(root, 'generated')), false);

  const generated = run(['generate'], root);
  assert.equal(generated.status, 0);
  assert.match(generated.stdout, /Generated Artifacts:/u);
  assert.match(generated.stdout, /WRITE generated\/types\/users\.ts/u);
  assert.equal(generated.stderr, '');
  assert.match(
    readFileSync(path.join(root, 'generated', 'types', 'users.ts'), 'utf8'),
    /export interface Users/u,
  );
});

test('Provider list／info／validateを標準Runtime経由で実行する', (t) => {
  const root = project(
    'name: users\nmodel: { displayName: User }\ndatabase: { primaryKey: id, columns: { id: { type: uuid } } }\n',
    'providers:\n  google:\n    enabled: true\n    configuration:\n      spreadsheetId: spreadsheet-id\n      appsScriptProjectId: script-id\n      driveFolderId: folder-id\n      authentication:\n        mode: user_oauth\n        credentialSecret: GOOGLE_CREDENTIALS\n',
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const list = run(['provider', 'list', '--json'], root);
  assert.equal(list.status, 0);
  assert.equal(list.stderr, '');
  assert.deepEqual(
    JSON.parse(list.stdout).data.providers.map(({ name }) => name),
    ['google'],
  );

  const info = run(['provider', 'info', 'google'], root);
  assert.equal(info.status, 0);
  assert.match(info.stdout, /Provider: google/u);
  assert.match(
    info.stdout,
    /Capabilities: api,authentication,database,deploy,storage/u,
  );

  const validation = run(['provider', 'validate', 'google', '--json'], root);
  assert.equal(validation.status, 0);
  assert.deepEqual(JSON.parse(validation.stdout).data, {
    name: 'google',
    issues: [],
  });

  const missing = run(['provider', 'info', 'missing', '--json'], root);
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stderr).error.code, 'PROVIDER_NOT_FOUND');
});

test('Migration Applyはdry-runなしのProvider変更を拒否する', (t) => {
  const root = project(
    'name: users\nmodel: { displayName: User }\ndatabase: { primaryKey: id, columns: { id: { type: uuid } } }\n',
    'providers:\n  google:\n    enabled: true\n    configuration:\n      spreadsheetId: spreadsheet-id\n      appsScriptProjectId: script-id\n      driveFolderId: folder-id\n      authentication:\n        mode: user_oauth\n        credentialSecret: GOOGLE_CREDENTIALS\n',
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = run(
    [
      'migration',
      'apply',
      '--file',
      'migrations/20260813_000001_initial.yaml',
      '--json',
    ],
    root,
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(
    JSON.parse(result.stderr).error.code,
    'MIGRATION_DRY_RUN_REQUIRED',
  );
});

test('Migration Rollbackはdry-run以外を公開しない', (t) => {
  const root = project(
    'name: users\nmodel: { displayName: User }\ndatabase: { primaryKey: id, columns: { id: { type: uuid } } }\n',
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = run(
    [
      'migration',
      'rollback',
      '--file',
      'migrations/20260813_000001_initial.yaml',
      '--json',
    ],
    root,
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(
    JSON.parse(result.stderr).error.code,
    'MIGRATION_ROLLBACK_DRY_RUN_REQUIRED',
  );
});
