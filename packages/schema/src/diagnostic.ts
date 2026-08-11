import type { SourceRange } from './source.js';

export type DiagnosticPhase = 'load' | 'syntax' | 'semantic' | 'core';
export type DiagnosticSeverity = 'error' | 'warning';

export interface Diagnostic {
  readonly code: string;
  readonly phase: DiagnosticPhase;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly file?: string;
  readonly range?: SourceRange;
  readonly hint?: string;
}

export function compareDiagnostics(
  left: Diagnostic,
  right: Diagnostic,
): number {
  return (
    (left.file ?? '').localeCompare(right.file ?? '') ||
    (left.range?.start.offset ?? -1) - (right.range?.start.offset ?? -1) ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  );
}
