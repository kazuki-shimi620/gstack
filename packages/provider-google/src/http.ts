export interface GoogleHttpRequest {
  readonly method: 'GET' | 'POST';
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | null;
  readonly retryable: boolean;
}

export interface GoogleHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface GoogleHttpTransport {
  send(
    request: GoogleHttpRequest,
    options: { readonly timeoutMilliseconds: number },
  ): Promise<GoogleHttpResponse>;
}

export interface GoogleHttpExecutorOptions {
  readonly timeoutMilliseconds: number;
  readonly maxAttempts: number;
  readonly retryDelaysMilliseconds: readonly number[];
}

export type GoogleHttpErrorCode =
  | 'GOOGLE_HTTP_UNAUTHORIZED'
  | 'GOOGLE_HTTP_FORBIDDEN'
  | 'GOOGLE_HTTP_NOT_FOUND'
  | 'GOOGLE_HTTP_RATE_LIMITED'
  | 'GOOGLE_HTTP_UNAVAILABLE'
  | 'GOOGLE_HTTP_FAILED';

export class GoogleHttpError extends Error {
  public constructor(
    public readonly code: GoogleHttpErrorCode,
    public readonly status: number | null,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GoogleHttpError';
  }
}

const DEFAULT_OPTIONS: GoogleHttpExecutorOptions = Object.freeze({
  timeoutMilliseconds: 10_000,
  maxAttempts: 3,
  retryDelaysMilliseconds: Object.freeze([250, 1_000]),
});

export class GoogleHttpExecutor {
  readonly #options: GoogleHttpExecutorOptions;

  public constructor(
    private readonly transport: GoogleHttpTransport,
    options: Partial<GoogleHttpExecutorOptions> = {},
    private readonly wait: (
      milliseconds: number,
    ) => Promise<void> = defaultWait,
  ) {
    this.#options = validateOptions({ ...DEFAULT_OPTIONS, ...options });
  }

  async execute(request: GoogleHttpRequest): Promise<GoogleHttpResponse> {
    validateRequest(request);
    for (let attempt = 1; attempt <= this.#options.maxAttempts; attempt += 1) {
      try {
        const response = await this.transport.send(request, {
          timeoutMilliseconds: this.#options.timeoutMilliseconds,
        });
        if (response.status >= 200 && response.status < 300) return response;
        if (shouldRetry(request, response.status, attempt, this.#options)) {
          await this.waitBeforeRetry(attempt);
          continue;
        }
        throw responseError(response.status);
      } catch (error: unknown) {
        if (error instanceof GoogleHttpError) throw error;
        if (shouldRetry(request, null, attempt, this.#options)) {
          await this.waitBeforeRetry(attempt);
          continue;
        }
        throw new GoogleHttpError(
          'GOOGLE_HTTP_UNAVAILABLE',
          null,
          'Google API is unavailable.',
          { cause: error },
        );
      }
    }
    throw new GoogleHttpError(
      'GOOGLE_HTTP_UNAVAILABLE',
      null,
      'Google API is unavailable.',
    );
  }

  private async waitBeforeRetry(attempt: number): Promise<void> {
    const delay = this.#options.retryDelaysMilliseconds[attempt - 1];
    if (delay !== undefined) await this.wait(delay);
  }
}

function shouldRetry(
  request: GoogleHttpRequest,
  status: number | null,
  attempt: number,
  options: GoogleHttpExecutorOptions,
): boolean {
  return (
    request.retryable &&
    attempt < options.maxAttempts &&
    (status === null || [429, 500, 502, 503, 504].includes(status))
  );
}

function responseError(status: number): GoogleHttpError {
  switch (status) {
    case 401:
      return error(
        'GOOGLE_HTTP_UNAUTHORIZED',
        status,
        'Google API rejected authentication.',
      );
    case 403:
      return error(
        'GOOGLE_HTTP_FORBIDDEN',
        status,
        'Google API denied access.',
      );
    case 404:
      return error(
        'GOOGLE_HTTP_NOT_FOUND',
        status,
        'Google API resource was not found.',
      );
    case 429:
      return error(
        'GOOGLE_HTTP_RATE_LIMITED',
        status,
        'Google API rate limit was exceeded.',
      );
    case 500:
    case 502:
    case 503:
    case 504:
      return error(
        'GOOGLE_HTTP_UNAVAILABLE',
        status,
        'Google API is unavailable.',
      );
    default:
      return error('GOOGLE_HTTP_FAILED', status, 'Google API request failed.');
  }
}

function error(
  code: GoogleHttpErrorCode,
  status: number,
  message: string,
): GoogleHttpError {
  return new GoogleHttpError(code, status, message);
}

function validateRequest(request: GoogleHttpRequest): void {
  const url = new URL(request.url);
  if (url.protocol !== 'https:') {
    throw new GoogleHttpError(
      'GOOGLE_HTTP_FAILED',
      null,
      'Google API request URL must use HTTPS.',
    );
  }
}

function validateOptions(
  options: GoogleHttpExecutorOptions,
): GoogleHttpExecutorOptions {
  if (
    !Number.isSafeInteger(options.timeoutMilliseconds) ||
    options.timeoutMilliseconds <= 0 ||
    !Number.isSafeInteger(options.maxAttempts) ||
    options.maxAttempts <= 0 ||
    options.retryDelaysMilliseconds.length < options.maxAttempts - 1 ||
    options.retryDelaysMilliseconds.some(
      (delay) => !Number.isSafeInteger(delay) || delay < 0,
    )
  ) {
    throw new TypeError('Google HTTP executor options are invalid.');
  }
  return Object.freeze({
    timeoutMilliseconds: options.timeoutMilliseconds,
    maxAttempts: options.maxAttempts,
    retryDelaysMilliseconds: Object.freeze([
      ...options.retryDelaysMilliseconds,
    ]),
  });
}

async function defaultWait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
