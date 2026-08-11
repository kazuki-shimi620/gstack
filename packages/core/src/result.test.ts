import { describe, expect, it } from 'vitest';

import { failureResult, successResult } from './result.js';

describe('machine-readable result envelope', () => {
  it('wraps successful structured data and warnings', () => {
    expect(successResult({ value: 1 })).toEqual({
      ok: true,
      data: { value: 1 },
      warnings: [],
    });
  });

  it('wraps safe error details', () => {
    expect(
      failureResult({
        code: 'PROJECT_NOT_FOUND',
        category: 'configuration',
        message: 'No gstack project was found.',
      }),
    ).toEqual({
      ok: false,
      error: {
        code: 'PROJECT_NOT_FOUND',
        category: 'configuration',
        message: 'No gstack project was found.',
      },
    });
  });
});
