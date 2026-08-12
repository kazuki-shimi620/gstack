import { describe, expect, it } from 'vitest';

import {
  contentChecksum,
  createGeneratedArtifact,
  normalizeGeneratedArtifacts,
} from './artifact.js';

describe('Generated Artifact', () => {
  it('content checksumを付けてpath順へ正規化する', () => {
    const artifacts = normalizeGeneratedArtifacts([
      { path: 'generated/types/z.ts', content: 'z\n' },
      { path: 'generated/types/a.ts', content: 'a\n' },
    ]);
    expect(artifacts.map(({ path }) => path)).toEqual([
      'generated/types/a.ts',
      'generated/types/z.ts',
    ]);
    expect(artifacts[0]?.checksum).toBe(contentChecksum('a\n'));
    expect(Object.isFrozen(artifacts)).toBe(true);
  });

  it.each([
    '/generated/types/user.ts',
    'app/user.ts',
    'custom/user.ts',
    'generated/',
    'generated/../app/user.ts',
    'generated//user.ts',
    'generated\\user.ts',
  ])('所有範囲外または非正規pathを拒否する: %s', (path) => {
    expect(() => createGeneratedArtifact(path, '')).toThrow(
      expect.objectContaining({ code: 'GENERATED_ARTIFACT_PATH_INVALID' }),
    );
  });

  it('重複pathを拒否する', () => {
    expect(() =>
      normalizeGeneratedArtifacts([
        { path: 'generated/types/user.ts', content: 'first' },
        { path: 'generated/types/user.ts', content: 'second' },
      ]),
    ).toThrow(
      expect.objectContaining({ code: 'GENERATED_ARTIFACT_PATH_DUPLICATE' }),
    );
  });
});
