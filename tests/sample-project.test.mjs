import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const sample = path.join(repositoryRoot, 'examples/quickstart');
const cli = path.join(repositoryRoot, 'cli/dist/main.js');

test('version管理済みQuickstartを検証して生成できる', (t) => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'gstack-sample-contract-'));
  const project = path.join(temporary, 'quickstart');
  cpSync(sample, project, { recursive: true });
  t.after(() => rmSync(temporary, { recursive: true, force: true }));

  const validation = run(['schema', 'validate', '--json'], project);
  assert.equal(validation.status, 0, validation.stderr);
  assert.deepEqual(JSON.parse(validation.stdout).data, {
    valid: true,
    level: 'semantic',
    errors: [],
    warnings: [],
  });

  const preview = run(['generate', '--dry-run', '--json'], project);
  assert.equal(preview.status, 0, preview.stderr);
  const previewResult = JSON.parse(preview.stdout);
  assert.equal(previewResult.data.dryRun, true);
  const previewPaths = new Set(
    previewResult.data.plan.writes.map(
      ({ path: artifactPath }) => artifactPath,
    ),
  );
  for (const artifactPath of [
    'generated/ai/PROJECT_CONTEXT.md',
    'generated/api/contracts.ts',
    'generated/backend/appsscript/main.gs',
    'generated/docs/models.md',
    'generated/frontend/users/list.tsx',
    'generated/openapi/openapi.json',
    'generated/types/users.ts',
    'generated/validation/users.ts',
  ]) {
    assert.equal(previewPaths.has(artifactPath), true, artifactPath);
  }
  assert.equal(
    existsSync(path.join(project, 'generated/.gstack-manifest.json')),
    false,
  );

  const migration = run(
    ['migration', 'create', 'initial_schema', '--json'],
    project,
  );
  assert.equal(migration.status, 0, migration.stderr);
  assert.equal(
    JSON.parse(migration.stdout).data.migrationCreation.operationCount,
    1,
  );

  const generation = run(['generate', '--json'], project);
  assert.equal(generation.status, 0, generation.stderr);
  assert.equal(
    existsSync(path.join(project, 'generated/.gstack-manifest.json')),
    true,
  );
  assert.match(
    readFileSync(path.join(project, 'generated/docs/models.md'), 'utf8'),
    /User/u,
  );

  assert.equal(
    existsSync(path.join(sample, 'generated/.gstack-manifest.json')),
    false,
  );
});

function run(args, cwd) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
  });
}
