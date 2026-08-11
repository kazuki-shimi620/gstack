import {
  isAlias,
  isMap,
  isScalar,
  isSeq,
  LineCounter,
  parseDocument,
  type Pair,
  type YAMLParseError,
  type YAMLWarning,
} from 'yaml';

import type { Diagnostic, SchemaSource, SourceRange } from '@gstack/schema';
import type {
  AstMappingEntry,
  AstNode,
  AstScalarValue,
  SchemaAst,
} from './ast.js';
import { validateSchemaShape } from './shape.js';

export interface ParsedSchemaDocument {
  readonly ast: SchemaAst;
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

  if (document.contents === null) {
    return {
      errors: [
        {
          code: 'SCHEMA_DOCUMENT_EMPTY',
          phase: 'syntax',
          severity: 'error',
          message: 'Schema document must not be empty.',
          file: source.id,
        },
      ],
      warnings,
    };
  }

  const astErrors: Diagnostic[] = [];
  const root = buildAstNode(document.contents, source, lineCounter, astErrors);
  if (!root || astErrors.length > 0) {
    return { errors: astErrors, warnings };
  }

  const ast: SchemaAst = { source, root };
  const shapeErrors = validateSchemaShape(ast);
  if (shapeErrors.length > 0) {
    return { errors: shapeErrors, warnings };
  }

  return {
    document: { ast },
    errors,
    warnings,
  };
}

function buildAstNode(
  node: unknown,
  source: SchemaSource,
  lineCounter: LineCounter,
  errors: Diagnostic[],
): AstNode | undefined {
  if (isAlias(node)) {
    errors.push({
      code: 'SCHEMA_ALIAS_NOT_ALLOWED',
      phase: 'syntax',
      severity: 'error',
      message: 'YAML aliases are not supported in gstack Schema.',
      file: source.id,
      range: nodeRange(node, lineCounter),
    });
    return undefined;
  }

  if (isScalar(node)) {
    if (!isAstScalarValue(node.value)) {
      errors.push({
        code: 'SCHEMA_SCALAR_UNSUPPORTED',
        phase: 'syntax',
        severity: 'error',
        message: 'Schema scalar must be a string, number, boolean, or null.',
        file: source.id,
        range: nodeRange(node, lineCounter),
      });
      return undefined;
    }
    return {
      kind: 'scalar',
      value: node.value,
      range: nodeRange(node, lineCounter),
    };
  }

  if (isSeq(node)) {
    const items: AstNode[] = [];
    for (const item of node.items) {
      if (item === null) {
        errors.push({
          code: 'SCHEMA_SEQUENCE_ITEM_EMPTY',
          phase: 'syntax',
          severity: 'error',
          message: 'Schema sequence items must have a value.',
          file: source.id,
          range: nodeRange(node, lineCounter),
        });
        continue;
      }
      const astItem = buildAstNode(item, source, lineCounter, errors);
      if (astItem) items.push(astItem);
    }
    return { kind: 'sequence', items, range: nodeRange(node, lineCounter) };
  }

  if (isMap(node)) {
    const entries: AstMappingEntry[] = [];
    for (const pair of node.items) {
      const entry = buildMappingEntry(pair, source, lineCounter, errors);
      if (entry) entries.push(entry);
    }
    return { kind: 'mapping', entries, range: nodeRange(node, lineCounter) };
  }

  errors.push({
    code: 'SCHEMA_NODE_UNSUPPORTED',
    phase: 'syntax',
    severity: 'error',
    message: 'Schema contains an unsupported YAML node.',
    file: source.id,
    range: nodeRange(node, lineCounter),
  });
  return undefined;
}

function buildMappingEntry(
  pair: Pair,
  source: SchemaSource,
  lineCounter: LineCounter,
  errors: Diagnostic[],
): AstMappingEntry | undefined {
  if (!isScalar(pair.key) || typeof pair.key.value !== 'string') {
    errors.push({
      code: 'SCHEMA_MAPPING_KEY_INVALID',
      phase: 'syntax',
      severity: 'error',
      message: 'Schema mapping keys must be strings.',
      file: source.id,
      ...(pair.key ? { range: nodeRange(pair.key, lineCounter) } : {}),
    });
    return undefined;
  }
  if (pair.value === null) {
    errors.push({
      code: 'SCHEMA_MAPPING_VALUE_EMPTY',
      phase: 'syntax',
      severity: 'error',
      message: `Schema mapping key "${pair.key.value}" must have a value.`,
      file: source.id,
      range: nodeRange(pair.key, lineCounter),
    });
    return undefined;
  }
  const value = buildAstNode(pair.value, source, lineCounter, errors);
  if (!value) return undefined;
  const keyRange = nodeRange(pair.key, lineCounter);
  return {
    key: pair.key.value,
    keyRange,
    value,
    range: { start: keyRange.start, end: value.range.end },
  };
}

function isAstScalarValue(value: unknown): value is AstScalarValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function nodeRange(node: unknown, lineCounter: LineCounter): SourceRange {
  const range =
    typeof node === 'object' && node !== null && 'range' in node
      ? (node.range as readonly number[] | null | undefined)
      : undefined;
  const startOffset = range?.[0] ?? 0;
  const endOffset = range?.[2] ?? range?.[1] ?? startOffset;
  return toRange([startOffset, endOffset], lineCounter);
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
