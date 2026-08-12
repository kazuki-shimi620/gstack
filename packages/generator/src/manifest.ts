import { validateGeneratedPath, type GeneratedArtifact } from './artifact.js';

export const GENERATED_MANIFEST_PATH = 'generated/.gstack-manifest.json';

export interface GeneratedArtifactManifestEntry {
  readonly path: string;
  readonly checksum: string;
}

export interface GeneratedArtifactManifest {
  readonly formatVersion: 1;
  readonly artifacts: readonly GeneratedArtifactManifestEntry[];
}

export class GeneratedManifestError extends Error {
  public constructor(
    public readonly code:
      'GENERATED_MANIFEST_JSON_INVALID' | 'GENERATED_MANIFEST_FORMAT_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'GeneratedManifestError';
  }
}

export function createGeneratedManifest(
  artifacts: readonly GeneratedArtifact[],
): GeneratedArtifactManifest {
  return deepFreeze({
    formatVersion: 1,
    artifacts: artifacts.map(({ path, checksum }) => ({ path, checksum })),
  });
}

export function serializeGeneratedManifest(
  manifest: GeneratedArtifactManifest,
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function parseGeneratedManifest(
  content: string,
): GeneratedArtifactManifest {
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch {
    throw new GeneratedManifestError(
      'GENERATED_MANIFEST_JSON_INVALID',
      'Generated Artifact Manifest JSON is invalid.',
    );
  }
  validateManifest(value);
  return deepFreeze(value);
}

function validateManifest(
  value: unknown,
): asserts value is GeneratedArtifactManifest {
  if (!record(value) || keys(value) !== 'artifacts,formatVersion') invalid();
  if (value.formatVersion !== 1 || !Array.isArray(value.artifacts)) invalid();
  const paths = new Set<string>();
  for (const item of value.artifacts) {
    if (!record(item) || keys(item) !== 'checksum,path') invalid();
    if (
      typeof item.path !== 'string' ||
      typeof item.checksum !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(item.checksum) ||
      item.path === GENERATED_MANIFEST_PATH
    )
      invalid();
    try {
      validateGeneratedPath(item.path);
    } catch {
      invalid();
    }
    if (paths.has(item.path)) invalid();
    paths.add(item.path);
  }
  const sorted = [...paths].sort((left, right) => left.localeCompare(right));
  if ([...paths].some((path, index) => path !== sorted[index])) invalid();
}

function keys(value: Readonly<Record<string, unknown>>): string {
  return Object.keys(value).sort().join(',');
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(): never {
  throw new GeneratedManifestError(
    'GENERATED_MANIFEST_FORMAT_INVALID',
    'Generated Artifact Manifest format is invalid.',
  );
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
