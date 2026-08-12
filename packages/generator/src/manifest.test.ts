import { describe, expect, it } from 'vitest';

import { normalizeGeneratedArtifacts } from './artifact.js';
import {
  createGeneratedManifest,
  parseGeneratedManifest,
  serializeGeneratedManifest,
} from './manifest.js';

describe('Generated Artifact Manifest', () => {
  it('contentを含めず決定的にserialize／parseする', () => {
    const manifest = createGeneratedManifest(
      normalizeGeneratedArtifacts([
        { path: 'generated/types/user.ts', content: 'export type User = {};' },
      ]),
    );
    const serialized = serializeGeneratedManifest(manifest);
    expect(serialized).not.toContain('export type User');
    expect(parseGeneratedManifest(serialized)).toEqual(manifest);
    expect(Object.isFrozen(parseGeneratedManifest(serialized).artifacts)).toBe(
      true,
    );
  });

  it.each([
    '{',
    '{"formatVersion":2,"artifacts":[]}',
    '{"formatVersion":1,"artifacts":[],"provider":"google"}',
    '{"formatVersion":1,"artifacts":[{"path":"app/x","checksum":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]}',
    '{"formatVersion":1,"artifacts":[{"path":"generated/.gstack-manifest.json","checksum":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]}',
  ])('不正Manifestを拒否する', (content) => {
    expect(() => parseGeneratedManifest(content)).toThrow();
  });
});
