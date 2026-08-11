export interface SourcePosition {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

export interface SourceRange {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

export interface DiagnosticSourceReference {
  readonly sourceId: string;
  readonly range?: SourceRange;
}
