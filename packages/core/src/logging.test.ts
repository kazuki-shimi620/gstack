import { describe, expect, it, vi } from 'vitest';

import { createGstackLogger, noopGstackLogger } from './logging.js';

describe('Core structured logging contract', () => {
  it('注入時刻とallowlist済みfieldだけをimmutable eventへ出力する', () => {
    const write = vi.fn();
    const logger = createGstackLogger(
      { write },
      () => new Date('2026-08-15T00:00:00.000Z'),
    );
    logger.emit({
      level: 'info',
      category: 'migration',
      code: 'MIGRATION_PLAN_PREVIEWED',
    });
    expect(write).toHaveBeenCalledWith({
      timestamp: '2026-08-15T00:00:00.000Z',
      level: 'info',
      category: 'migration',
      code: 'MIGRATION_PLAN_PREVIEWED',
    });
    expect(Object.isFrozen(write.mock.calls[0]?.[0])).toBe(true);
  });

  it('任意message／metadataを契約に持たず不正eventを出力しない', () => {
    const write = vi.fn();
    const logger = createGstackLogger({ write });
    logger.emit({ level: 'info', category: 'schema', code: 'invalid-code' });
    logger.emit({ level: 'trace', category: 'schema', code: 'VALID' } as never);
    logger.emit({ level: 'info', category: 'secret', code: 'VALID' } as never);
    expect(write).not.toHaveBeenCalled();
  });

  it('clock／sink失敗をdomain処理へ伝播しない', () => {
    const clockFailure = createGstackLogger({ write: vi.fn() }, () => {
      throw new Error('clock failed');
    });
    expect(() =>
      clockFailure.emit({
        level: 'error',
        category: 'internal',
        code: 'FAILED',
      }),
    ).not.toThrow();

    const sinkFailure = createGstackLogger({
      write: () => {
        throw new Error('sink failed');
      },
    });
    expect(() =>
      sinkFailure.emit({
        level: 'error',
        category: 'internal',
        code: 'FAILED',
      }),
    ).not.toThrow();
    expect(() =>
      noopGstackLogger.emit({
        level: 'debug',
        category: 'internal',
        code: 'IGNORED',
      }),
    ).not.toThrow();
  });
});
