import { describe, expect, it } from 'vitest';

import {
  formatErrorHuman,
  formatGenerationHuman,
  formatJson,
  formatMigrationHistoryHuman,
  formatMigrationApplyDryRunHuman,
  formatMigrationPlanHuman,
  formatMigrationStatusHuman,
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
        create_model: 'native' as const,
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

  it('Migration status／history／planを安全なread modelから表示する', () => {
    const history = {
      version: '20260813_000001',
      name: 'initial',
      checksum: 'a'.repeat(64),
      status: 'pending' as const,
      operationCount: 1,
      completedOperationCount: 0,
      startedAt: null,
      completedAt: null,
      rolledBackAt: null,
      failedOperationId: null,
      errorCode: null,
      appliedSnapshot: null,
    };
    expect(
      formatMigrationStatusHuman({
        totalCount: 1,
        pendingCount: 1,
        applyingCount: 0,
        appliedCount: 0,
        failedCount: 0,
        rolledBackCount: 0,
        latestAttempt: history,
        latestApplied: null,
      }),
    ).toContain('Latest: 20260813_000001');
    expect(formatMigrationHistoryHuman([history])).toBe(
      '20260813_000001 initial pending 0/1',
    );
    expect(
      formatMigrationPlanHuman({
        baselineVersion: null,
        plan: {
          operations: [
            {
              id: 'create_model:users:users',
              risk: 'safe',
              capability: 'not_evaluated',
            } as never,
          ],
          risk: 'safe',
          destructive: false,
          reversible: true,
          capabilityStatus: 'not_evaluated',
          applicable: false,
          warnings: [],
        },
      }),
    ).toContain('SAFE create_model:users:users [not_evaluated]');
  });

  it('Migration Apply dry-runにchecksumとfingerprintを表示する', () => {
    const fingerprint = 'b'.repeat(64);
    expect(
      formatMigrationApplyDryRunHuman({
        version: '20260813_000001',
        name: 'initial',
        checksum: 'a'.repeat(64),
        planFingerprint: fingerprint,
        plan: {
          operations: [
            {
              id: 'create_model:users:users',
              risk: 'safe',
              capability: 'native',
            } as never,
          ],
          risk: 'safe',
          destructive: false,
          reversible: true,
          capabilityStatus: 'supported',
          applicable: true,
          warnings: [],
        },
      }),
    ).toContain(`Plan fingerprint: ${fingerprint}`);
  });
});
