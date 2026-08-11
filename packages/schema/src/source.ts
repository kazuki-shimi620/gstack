export interface SchemaSource {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly content: string;
}

export interface SourcePosition {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

export interface SourceRange {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}
