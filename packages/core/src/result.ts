import type { Diagnostic } from '@gstack/schema';

import type { GstackErrorDetails } from './error.js';

export interface SuccessResult<T> {
  readonly ok: true;
  readonly data: T;
  readonly warnings: readonly Diagnostic[];
}

export interface FailureResult {
  readonly ok: false;
  readonly error: GstackErrorDetails;
}

export type MachineResult<T> = SuccessResult<T> | FailureResult;

export function successResult<T>(
  data: T,
  warnings: readonly Diagnostic[] = [],
): SuccessResult<T> {
  return { ok: true, data, warnings };
}

export function failureResult(error: GstackErrorDetails): FailureResult {
  return { ok: false, error };
}
