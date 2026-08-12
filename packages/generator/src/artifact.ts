import { createHash } from 'node:crypto';

export interface GeneratedArtifactInput {
  readonly path: string;
  readonly content: string;
}

export interface GeneratedArtifact extends GeneratedArtifactInput {
  readonly checksum: string;
}

export class GeneratedArtifactError extends Error {
  public constructor(
    public readonly code:
      'GENERATED_ARTIFACT_PATH_INVALID' | 'GENERATED_ARTIFACT_PATH_DUPLICATE',
    message: string,
  ) {
    super(message);
    this.name = 'GeneratedArtifactError';
  }
}

export function createGeneratedArtifact(
  path: string,
  content: string,
): GeneratedArtifact {
  validateGeneratedPath(path);
  return Object.freeze({ path, content, checksum: contentChecksum(content) });
}

export function normalizeGeneratedArtifacts(
  inputs: readonly GeneratedArtifactInput[],
): readonly GeneratedArtifact[] {
  const paths = new Set<string>();
  const artifacts = inputs.map(({ path, content }) => {
    if (paths.has(path)) {
      throw new GeneratedArtifactError(
        'GENERATED_ARTIFACT_PATH_DUPLICATE',
        `Generated Artifact path is duplicated: ${path}`,
      );
    }
    paths.add(path);
    return createGeneratedArtifact(path, content);
  });
  return Object.freeze(
    artifacts.sort((left, right) => left.path.localeCompare(right.path)),
  );
}

export function contentChecksum(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function validateGeneratedPath(path: string): void {
  if (
    !path.startsWith('generated/') ||
    path === 'generated/' ||
    path.includes('\\') ||
    path
      .split('/')
      .some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new GeneratedArtifactError(
      'GENERATED_ARTIFACT_PATH_INVALID',
      `Generated Artifact path must be a normalized path below generated/: ${path}`,
    );
  }
}
