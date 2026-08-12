import { describe, expect, it, vi } from 'vitest';

import { GoogleHttpExecutor } from './http.js';

const request = {
  method: 'GET' as const,
  url: 'https://sheets.googleapis.com/v4/spreadsheets/id',
  headers: { authorization: 'Bearer token' },
  body: null,
  retryable: true,
};

describe('Google HTTP executor', () => {
  it('成功responseをそのまま返してtimeoutをtransportへ渡す', async () => {
    const response = { status: 200, headers: {}, body: '{}' };
    const send = vi.fn().mockResolvedValue(response);
    await expect(
      new GoogleHttpExecutor({ send }).execute(request),
    ).resolves.toBe(response);
    expect(send).toHaveBeenCalledWith(request, { timeoutMilliseconds: 10_000 });
  });

  it.each([429, 500, 502, 503, 504])(
    'retryable requestのstatus %iを決定的delayで再試行する',
    async (status) => {
      const response = { status: 200, headers: {}, body: '{}' };
      const send = vi
        .fn()
        .mockResolvedValueOnce({ status, headers: {}, body: 'secret-body' })
        .mockResolvedValueOnce(response);
      const wait = vi.fn().mockResolvedValue(undefined);
      await expect(
        new GoogleHttpExecutor({ send }, {}, wait).execute(request),
      ).resolves.toBe(response);
      expect(wait).toHaveBeenCalledWith(250);
      expect(send).toHaveBeenCalledTimes(2);
    },
  );

  it('network failureを上限まで再試行してsafe errorへ変換する', async () => {
    const send = vi.fn().mockRejectedValue(new Error('token=secret'));
    const wait = vi.fn().mockResolvedValue(undefined);
    await expect(
      new GoogleHttpExecutor({ send }, {}, wait).execute(request),
    ).rejects.toMatchObject({
      code: 'GOOGLE_HTTP_UNAVAILABLE',
      status: null,
      message: 'Google API is unavailable.',
    });
    expect(send).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[250], [1_000]]);
  });

  it.each([
    [401, 'GOOGLE_HTTP_UNAUTHORIZED'],
    [403, 'GOOGLE_HTTP_FORBIDDEN'],
    [404, 'GOOGLE_HTTP_NOT_FOUND'],
    [418, 'GOOGLE_HTTP_FAILED'],
  ])('status %iをstable code %sへ変換する', async (status, code) => {
    const send = vi.fn().mockResolvedValue({
      status,
      headers: {},
      body: 'credential=secret',
    });
    await expect(
      new GoogleHttpExecutor({ send }).execute(request),
    ).rejects.toMatchObject({ code, status });
  });

  it('retry不可requestを再試行しない', async () => {
    const send = vi.fn().mockResolvedValue({
      status: 503,
      headers: {},
      body: 'unavailable',
    });
    await expect(
      new GoogleHttpExecutor({ send }).execute({
        ...request,
        method: 'POST',
        retryable: false,
      }),
    ).rejects.toMatchObject({ code: 'GOOGLE_HTTP_UNAVAILABLE', status: 503 });
    expect(send).toHaveBeenCalledOnce();
  });

  it('HTTPS以外と不正optionを拒否する', async () => {
    const executor = new GoogleHttpExecutor({ send: vi.fn() });
    await expect(
      executor.execute({ ...request, url: 'http://example.test' }),
    ).rejects.toMatchObject({ code: 'GOOGLE_HTTP_FAILED' });
    expect(
      () =>
        new GoogleHttpExecutor(
          { send: vi.fn() },
          { maxAttempts: 3, retryDelaysMilliseconds: [] },
        ),
    ).toThrow(TypeError);
  });
});
