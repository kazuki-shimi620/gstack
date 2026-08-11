import type { SchemaSource, SourceRange } from '@gstack/schema';

export type AstScalarValue = string | number | boolean | null;

export interface AstScalar {
  readonly kind: 'scalar';
  readonly value: AstScalarValue;
  readonly range: SourceRange;
}

export interface AstSequence {
  readonly kind: 'sequence';
  readonly items: readonly AstNode[];
  readonly range: SourceRange;
}

export interface AstMappingEntry {
  readonly key: string;
  readonly keyRange: SourceRange;
  readonly value: AstNode;
  readonly range: SourceRange;
}

export interface AstMapping {
  readonly kind: 'mapping';
  readonly entries: readonly AstMappingEntry[];
  readonly range: SourceRange;
}

export type AstNode = AstScalar | AstSequence | AstMapping;

export interface SchemaAst {
  readonly source: SchemaSource;
  readonly root: AstNode;
}
