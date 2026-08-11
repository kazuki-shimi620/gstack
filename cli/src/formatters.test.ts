import { describe, expect, it } from 'vitest';

import {
  formatErrorHuman,
  formatJson,
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

    expect(formatValidationHuman(result)).toBe(
      'Schema syntax is valid (syntax).',
    );
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
});
