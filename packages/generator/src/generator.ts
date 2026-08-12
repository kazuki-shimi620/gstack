import type { ApplicationModel } from '@gstack/application';

import { generateAiDocumentationArtifacts } from './ai-documentation.js';
import { generateApiArtifact } from './api.js';
import { generateDocumentationArtifact } from './documentation.js';
import type { GeneratedArtifactInput } from './artifact.js';
import type { GeneratedArtifactManifest } from './manifest.js';
import { generateOpenApiArtifact } from './openapi.js';
import { generateReactArtifacts } from './react.js';
import { createGenerationPlan, type GenerationPlan } from './plan.js';
import { generateTypeArtifacts } from './typescript.js';
import { generateValidationArtifacts } from './validation.js';

export interface GeneratorConfig {
  readonly formatVersion: 1;
  readonly types: boolean;
  readonly validation: boolean;
  readonly api: boolean;
  readonly frontend: boolean;
  readonly openapi: boolean;
  readonly documentation: boolean;
  readonly aiDocumentation: boolean;
}

export function generateApplication(
  application: ApplicationModel,
  config: GeneratorConfig,
  previousManifest: GeneratedArtifactManifest | null = null,
): GenerationPlan {
  const outputs: GeneratedArtifactInput[] = [];
  if (config.types) outputs.push(...generateTypeArtifacts(application));
  if (config.validation)
    outputs.push(...generateValidationArtifacts(application));
  if (config.api) outputs.push(generateApiArtifact(application));
  if (config.frontend) outputs.push(...generateReactArtifacts(application));
  if (config.openapi) outputs.push(generateOpenApiArtifact(application));
  if (config.documentation)
    outputs.push(generateDocumentationArtifact(application));
  if (config.aiDocumentation)
    outputs.push(...generateAiDocumentationArtifacts(application));
  return createGenerationPlan(outputs, previousManifest);
}
