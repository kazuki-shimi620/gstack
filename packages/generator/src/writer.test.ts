import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createGenerationPlan } from './plan.js';
import { loadGeneratedManifest, writeGenerationPlan } from './writer.js';

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('Generated Artifact Writer', () => {
  it('Artifactを書いてstale fileを削除しManifestを最後に保存する', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'generated', 'types'), { recursive: true });
    await writeFile(path.join(root, 'generated', 'types', 'old.ts'), 'old');
    const previous = createGenerationPlan(
      [{ path: 'generated/types/old.ts', content: 'old' }],
      null,
    ).manifest;
    const plan = createGenerationPlan(
      [{ path: 'generated/types/user.ts', content: 'user\n' }],
      previous,
    );

    await writeGenerationPlan(root, plan);

    await expect(
      readFile(path.join(root, 'generated', 'types', 'user.ts'), 'utf8'),
    ).resolves.toBe('user\n');
    await expect(
      readFile(path.join(root, 'generated', 'types', 'old.ts'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    const manifest = JSON.parse(
      await readFile(
        path.join(root, 'generated', '.gstack-manifest.json'),
        'utf8',
      ),
    ) as { artifacts: Array<{ path: string }> };
    expect(
      manifest.artifacts.map(({ path: artifactPath }) => artifactPath),
    ).toEqual(['generated/types/user.ts']);
    await expect(loadGeneratedManifest(root)).resolves.toEqual(plan.manifest);
  });

  it('generated内のsymlinkを拒否して外部fileを変更しない', async () => {
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    await mkdir(path.join(root, 'generated'));
    await symlink(outside, path.join(root, 'generated', 'types'));
    const plan = createGenerationPlan(
      [{ path: 'generated/types/user.ts', content: 'unsafe' }],
      null,
    );

    await expect(writeGenerationPlan(root, plan)).rejects.toMatchObject({
      code: 'GENERATION_SYMLINK_FORBIDDEN',
    });
    await expect(
      readFile(path.join(outside, 'user.ts'), 'utf8'),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('absoluteでないProject Rootを拒否する', async () => {
    await expect(
      writeGenerationPlan('relative', createGenerationPlan([], null)),
    ).rejects.toMatchObject({ code: 'GENERATION_ROOT_INVALID' });
  });

  it('Manifestが存在しない場合はnullを返す', async () => {
    await expect(
      loadGeneratedManifest(await temporaryRoot()),
    ).resolves.toBeNull();
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'gstack-generator-'));
  roots.push(root);
  return root;
}
