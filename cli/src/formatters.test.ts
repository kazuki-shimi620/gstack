import { describe, expect, it } from 'vitest';

import {
  formatErrorHuman,
  formatGenerationHuman,
  formatJson,
  formatProviderHealthHuman,
  formatProviderInfoHuman,
  formatProviderListHuman,
  formatProviderValidationHuman,
  formatValidationHuman,
} from './formatters.js';

describe('CLI formatters', () => {
  it('keeps human and JSON presentation outside Core', () => {
    const result = {
      valid: true,
      level: 'syntax' as const,
      errors: [],
      warnings: [],
    };

    expect(formatValidationHuman(result)).toBe('Schema is valid (syntax).');
    expect(JSON.parse(formatJson(result))).toEqual(result);
  });

  it('formats safe structured Core errors without a stack trace', () => {
    expect(
      formatErrorHuman({
        code: 'PROJECT_NOT_FOUND',
        category: 'configuration',
        message: 'No gstack project was found.',
        path: '/project/app',
        hint: 'Run inside a gstack project.',
      }),
    ).toBe(
      [
        'PROJECT_NOT_FOUND: No gstack project was found.',
        'Path: /project/app',
        'Hint: Run inside a gstack project.',
      ].join('\n'),
    );
  });

  it('Generation Planのwrite／deleteをhuman表示する', () => {
    expect(
      formatGenerationHuman(
        {
          writes: [
            {
              path: 'generated/types/users.ts',
              content: 'content',
              checksum: 'a'.repeat(64),
            },
          ],
          deletes: ['generated/types/old.ts'],
          manifest: { formatVersion: 1, artifacts: [] },
        },
        true,
      ),
    ).toBe(
      'Generation Plan:\nWRITE generated/types/users.ts\nDELETE generated/types/old.ts\nSummary: 1 write(s), 1 delete(s).',
    );
  });

  it('Providerの安全なRead modelだけをhuman表示する', () => {
    const provider = {
      name: 'google',
      packageName: '@gstack/provider-google',
      version: '0.0.0',
      minimumGstackVersion: '0.0.0',
      capabilities: {
        database: true,
        api: true,
        authentication: true,
        storage: true,
        deploy: true,
      },
      migrationSupport: {
        create_model: 'unsupported' as const,
        drop_model: 'unsupported' as const,
        add_column: 'unsupported' as const,
        drop_column: 'unsupported' as const,
        rename_column: 'unsupported' as const,
        alter_column: 'unsupported' as const,
        add_index: 'unsupported' as const,
        drop_index: 'unsupported' as const,
        add_relation: 'unsupported' as const,
        drop_relation: 'unsupported' as const,
      },
    };
    expect(formatProviderListHuman([provider])).toContain(
      'google 0.0.0 api,authentication,database,deploy,storage',
    );
    expect(formatProviderInfoHuman(provider)).toContain(
      'Package: @gstack/provider-google',
    );
    expect(formatProviderValidationHuman('google', [])).toBe(
      'Provider google configuration is valid.',
    );
    expect(
      formatProviderHealthHuman('google', {
        status: 'healthy',
        code: 'GOOGLE_WORKSPACE_READY',
      }),
    ).toBe('Provider google: healthy (GOOGLE_WORKSPACE_READY)');
  });
});
