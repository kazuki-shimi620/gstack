import type { MetadataObject } from './metadata.js';
import type { Model } from './model.js';
import type { DiagnosticSourceReference } from './source-reference.js';

export interface ApplicationModel {
  readonly schemaVersion: 1;
  readonly name: string;
  readonly models: readonly Model[];
  readonly metadata: MetadataObject;
  readonly source?: DiagnosticSourceReference;
}
