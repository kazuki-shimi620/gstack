import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { configSourceChecksum, writePluginPackages } from './plugin-writer.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('Plugin Config writer', () => {
  it('commentと他設定を維持してallowlistだけをatomic更新する', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gstack-config-writer-'));
    roots.push(root);
    const source = `# project comment
version: 1
name: sample
schemaVersion: 1
schema: { directory: schema }
plugins:
  # allowlist comment
  packages: []
  configuration: {}
`;
    await writeFile(path.join(root, 'gstack.yaml'), source);
    await writePluginPackages({
      projectRoot: root,
      expectedChecksum: configSourceChecksum(source),
      packages: ['@example/generator'],
    });
    const written = await readFile(path.join(root, 'gstack.yaml'), 'utf8');
    expect(written).toContain('# project comment');
    expect(written).toContain('# allowlist comment');
    expect(written).toContain('configuration: {}');
    expect(written).toContain('- "@example/generator"');
  });

  it('Plan作成後に変わったConfigを上書きしない', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gstack-config-writer-'));
    roots.push(root);
    const target = path.join(root, 'gstack.yaml');
    await writeFile(target, 'version: 1\n');
    await expect(
      writePluginPackages({
        projectRoot: root,
        expectedChecksum: configSourceChecksum('different'),
        packages: [],
      }),
    ).rejects.toMatchObject({ code: 'CONFIG_STATE_CHANGED' });
    await expect(readFile(target, 'utf8')).resolves.toBe('version: 1\n');
  });
});
