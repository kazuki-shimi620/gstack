import type { ProviderRegistry } from './registry.js';
import type {
  ProviderHealth,
  ProviderInitializeContext,
  ProviderIssue,
  ProviderSession,
} from './types.js';

export type ProviderRuntimeErrorCode =
  | 'PROVIDER_NOT_REGISTERED'
  | 'PROVIDER_INITIALIZATION_FAILED'
  | 'PROVIDER_OPERATION_FAILED'
  | 'PROVIDER_RESULT_INVALID'
  | 'PROVIDER_DISPOSAL_FAILED';

export class ProviderRuntimeError extends Error {
  public constructor(
    public readonly code: ProviderRuntimeErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProviderRuntimeError';
  }
}

export class ProviderRuntime {
  public constructor(private readonly registry: ProviderRegistry) {}

  validate(
    name: string,
    context: ProviderInitializeContext,
  ): Promise<readonly ProviderIssue[]> {
    return this.withSession(name, context, async (session) =>
      normalizeIssues(await session.validate()),
    );
  }

  health(
    name: string,
    context: ProviderInitializeContext,
  ): Promise<ProviderHealth> {
    return this.withSession(name, context, async (session) =>
      normalizeHealth(await session.health()),
    );
  }

  private async withSession<Result>(
    name: string,
    context: ProviderInitializeContext,
    operation: (session: ProviderSession) => Promise<Result>,
  ): Promise<Result> {
    const factory = this.registry.get(name);
    if (!factory) {
      throw new ProviderRuntimeError(
        'PROVIDER_NOT_REGISTERED',
        `Provider is not registered: ${name}`,
      );
    }

    let session: ProviderSession;
    try {
      session = await factory.initialize(normalizeContext(context));
    } catch (error: unknown) {
      throw new ProviderRuntimeError(
        'PROVIDER_INITIALIZATION_FAILED',
        `Provider initialization failed: ${name}`,
        { cause: error },
      );
    }

    let result: Result | undefined;
    let operationError: ProviderRuntimeError | undefined;
    try {
      result = await operation(session);
    } catch (error: unknown) {
      operationError =
        error instanceof ProviderRuntimeError
          ? error
          : new ProviderRuntimeError(
              'PROVIDER_OPERATION_FAILED',
              `Provider operation failed: ${name}`,
              { cause: error },
            );
    }

    try {
      await session.dispose();
    } catch (error: unknown) {
      if (operationError === undefined) {
        throw new ProviderRuntimeError(
          'PROVIDER_DISPOSAL_FAILED',
          `Provider disposal failed: ${name}`,
          { cause: error },
        );
      }
    }

    if (operationError) throw operationError;
    return result as Result;
  }
}

function normalizeContext(
  context: ProviderInitializeContext,
): ProviderInitializeContext {
  return Object.freeze({
    projectRoot: context.projectRoot,
    configuration: deepFreeze(structuredClone(context.configuration)),
    secrets: context.secrets,
  });
}

function normalizeHealth(value: ProviderHealth): ProviderHealth {
  if (
    !value ||
    !['healthy', 'degraded', 'unavailable'].includes(value.status) ||
    !isSafeCode(value.code)
  ) {
    throw invalidResult('Provider health result is invalid.');
  }
  return Object.freeze({ status: value.status, code: value.code });
}

function normalizeIssues(
  values: readonly ProviderIssue[],
): readonly ProviderIssue[] {
  if (!Array.isArray(values)) {
    throw invalidResult('Provider validation result is invalid.');
  }
  return Object.freeze(
    values.map((value) => {
      if (
        !value ||
        !isSafeCode(value.code) ||
        !['error', 'warning'].includes(value.severity) ||
        typeof value.message !== 'string' ||
        value.message.length === 0
      ) {
        throw invalidResult('Provider validation result is invalid.');
      }
      return Object.freeze({
        code: value.code,
        severity: value.severity,
        message: value.message,
      });
    }),
  );
}

function isSafeCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]*$/u.test(value);
}

function invalidResult(message: string): ProviderRuntimeError {
  return new ProviderRuntimeError('PROVIDER_RESULT_INVALID', message);
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
