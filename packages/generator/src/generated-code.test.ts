import { describe, expect, it } from 'vitest';
import ts from 'typescript';

import type { ApplicationModel } from '@gstack/application';

import { generateApplication, type GeneratorConfig } from './generator.js';

describe('Generated TypeScript contract', () => {
  it('全built-in producerのTS／TSX出力に構文diagnosticがない', () => {
    const artifacts = generateApplication(application, config).writes.filter(
      ({ path }) => path.endsWith('.ts') || path.endsWith('.tsx'),
    );
    const diagnostics = artifacts.flatMap(
      (artifact) =>
        ts
          .transpileModule(artifact.content, {
            fileName: artifact.path,
            reportDiagnostics: true,
            compilerOptions: {
              target: ts.ScriptTarget.ES2023,
              module: ts.ModuleKind.NodeNext,
              moduleResolution: ts.ModuleResolutionKind.NodeNext,
              jsx: ts.JsxEmit.ReactJSX,
            },
          })
          .diagnostics?.map(
            (diagnostic) =>
              `${artifact.path}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
          ) ?? [],
    );
    expect(diagnostics).toEqual([]);
  });
});

const application: ApplicationModel = {
  schemaVersion: 1,
  name: 'app',
  models: [
    {
      name: 'users',
      displayName: 'User',
      description: null,
      primaryKey: 'id',
      fields: [
        {
          name: 'id',
          type: 'uuid',
          required: true,
          unique: true,
          enumValues: [],
          validation: {
            minLength: null,
            maxLength: null,
            pattern: null,
            min: null,
            max: null,
          },
        },
        {
          name: 'role',
          type: 'enum',
          required: true,
          unique: false,
          enumValues: ['admin', 'member'],
          validation: {
            minLength: null,
            maxLength: null,
            pattern: null,
            min: null,
            max: null,
          },
        },
      ],
      indexes: [],
      relations: [],
      api: { resource: 'users', create: true, update: true, delete: true },
      ui: {
        list: { columns: ['id', 'role'] },
        form: { fields: ['role'] },
      },
      permissions: { read: [], create: [], update: [], delete: [] },
      workflow: { enabled: false },
      events: { enabled: false },
      metadata: {},
    },
  ],
  metadata: {},
};

const config: GeneratorConfig = {
  formatVersion: 1,
  types: true,
  validation: true,
  api: true,
  frontend: true,
  openapi: true,
  documentation: true,
  aiDocumentation: true,
};
