import { describe, expect, it } from 'vitest';

import { createGeneratedManifest } from './manifest.js';
import { normalizeGeneratedArtifacts } from './artifact.js';
import { createGenerationPlan } from './plan.js';

describe('Generation Plan', () => {
  it('現在の全Artifactを書き、過去Manifestにだけあるpathを削除対象にする', () => {
    const previous = createGeneratedManifest(
      normalizeGeneratedArtifacts([
        { path: 'generated/types/old.ts', content: 'old' },
        { path: 'generated/types/user.ts', content: 'before' },
      ]),
    );
    const plan = createGenerationPlan(
      [{ path: 'generated/types/user.ts', content: 'after' }],
      previous,
    );

    expect(plan.writes.map(({ path }) => path)).toEqual([
      'generated/types/user.ts',
    ]);
    expect(plan.deletes).toEqual(['generated/types/old.ts']);
    expect(plan.manifest.artifacts).toEqual([
      expect.objectContaining({ path: 'generated/types/user.ts' }),
    ]);
    expect(Object.isFrozen(plan)).toBe(true);
  });

  it('過去Manifestがない場合は削除を生成しない', () => {
    expect(createGenerationPlan([], null)).toEqual({
      writes: [],
      deletes: [],
      manifest: { formatVersion: 1, artifacts: [] },
    });
  });
});
