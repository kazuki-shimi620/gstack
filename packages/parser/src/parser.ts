import {
  LineCounter,
  parseDocument,
  type YAMLParseError,
  type YAMLWarning,
} from 'yaml';

import type { Diagnostic, SchemaSource, SourceRange } from '@gstack/schema';

export interface ParsedSchemaDocument {
  readonly source: SchemaSource;
  readonly value: unknown;
}

export interface ParseSchemaResult {
  readonly document?: ParsedSchemaDocument;
  readonly errors: readonly Diagnostic[];
  readonly warnings: readonly Diagnostic[];
}

export function parseSchemaSource(source: SchemaSource): ParseSchemaResult {
  const lineCounter = new LineCounter();
  const document = parseDocument(source.content, {
    lineCounter,
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
    version: '1.2',
  });

  const errors = document.errors.map((error) =>
    toDiagnostic(error, 'SCHEMA_YAML_ERROR', 'error', source, lineCounter),
  );
  const warnings = document.warnings.map((warning) =>
    toDiagnostic(
      warning,
      'SCHEMA_YAML_WARNING',
      'warning',
      source,
      lineCounter,
    ),
  );

  if (errors.length > 0) {
    return { errors, warnings };
  }

  return {
    document: { source, value: document.toJS() as unknown },
    errors,
    warnings,
  };
}

function toDiagnostic(
  problem: YAMLParseError | YAMLWarning,
  code: string,
  severity: 'error' | 'warning',
  source: SchemaSource,
  lineCounter: LineCounter,
): Diagnostic {
  return {
    code,
    phase: 'syntax',
    severity,
    message: problem.message,
    file: source.id,
    ...(problem.pos ? { range: toRange(problem.pos, lineCounter) } : {}),
  };
}

function toRange(
  offsets: readonly [number, number],
  lineCounter: LineCounter,
): SourceRange {
  const start = lineCounter.linePos(offsets[0]);
  const end = lineCounter.linePos(offsets[1]);
  return {
    start: { line: start.line, column: start.col, offset: offsets[0] },
    end: { line: end.line, column: end.col, offset: offsets[1] },
  };
}
