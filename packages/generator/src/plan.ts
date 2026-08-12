import {
  normalizeGeneratedArtifacts,
  type GeneratedArtifact,
  type GeneratedArtifactInput,
} from './artifact.js';
import {
  createGeneratedManifest,
  type GeneratedArtifactManifest,
} from './manifest.js';

export interface GenerationPlan {
  readonly writes: readonly GeneratedArtifact[];
  readonly deletes: readonly string[];
  readonly manifest: GeneratedArtifactManifest;
}

export function createGenerationPlan(
  outputs: readonly GeneratedArtifactInput[],
  previous: GeneratedArtifactManifest | null,
): GenerationPlan {
  const writes = normalizeGeneratedArtifacts(outputs);
  const currentPaths = new Set(writes.map(({ path }) => path));
  const deletes = (previous?.artifacts ?? [])
    .map(({ path }) => path)
    .filter((path) => !currentPaths.has(path))
    .sort((left, right) => left.localeCompare(right));
  return deepFreeze({
    writes,
    deletes,
    manifest: createGeneratedManifest(writes),
  });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
