import { describe, expect, it } from 'vitest';

import type { ApplicationModel } from '@gstack/application';

import { generateApplication, type GeneratorConfig } from './generator.js';

const application: ApplicationModel = {
  schemaVersion: 1,
  name: 'app',
  models: [],
  metadata: {},
};

describe('Generator orchestration', () => {
  it('有効なbuilt-in producerを1つのGeneration Planへ統合する', () => {
    const plan = generateApplication(application, allEnabled);
    expect(plan.writes.map(({ path }) => path)).toEqual([
      'generated/ai/AGENTS.md',
      'generated/ai/PROJECT_CONTEXT.md',
      'generated/api/contracts.ts',
      'generated/backend/appsscript/appsscript.json',
      'generated/backend/appsscript/main.gs',
      'generated/docs/models.md',
      'generated/frontend/index.ts',
      'generated/openapi/openapi.json',
      'generated/types/index.ts',
      'generated/validation/index.ts',
      'generated/validation/runtime.ts',
    ]);
    expect(plan.manifest.artifacts.map(({ path }) => path)).toEqual(
      plan.writes.map(({ path }) => path),
    );
  });

  it('無効化されたproducerのArtifactを生成しない', () => {
    const plan = generateApplication(application, {
      ...allEnabled,
      validation: false,
      api: false,
      backend: false,
      frontend: false,
      documentation: false,
      aiDocumentation: false,
    });
    expect(plan.writes.map(({ path }) => path)).toEqual([
      'generated/openapi/openapi.json',
      'generated/types/index.ts',
    ]);
  });

  it('無効化で過去ManifestからstaleになったArtifactだけを削除する', () => {
    const previous = generateApplication(application, allEnabled).manifest;
    const plan = generateApplication(
      application,
      { ...allEnabled, aiDocumentation: false },
      previous,
    );
    expect(plan.deletes).toEqual([
      'generated/ai/AGENTS.md',
      'generated/ai/PROJECT_CONTEXT.md',
    ]);
  });

  it('同じ入力から同じPlanを生成する', () => {
    expect(generateApplication(application, allEnabled)).toEqual(
      generateApplication(application, allEnabled),
    );
  });
});

const allEnabled: GeneratorConfig = {
  formatVersion: 1,
  types: true,
  validation: true,
  api: true,
  backend: true,
  frontend: true,
  openapi: true,
  documentation: true,
  aiDocumentation: true,
};
