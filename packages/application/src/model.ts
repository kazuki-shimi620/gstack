import type { MetadataObject } from './metadata.js';
import type { DiagnosticSourceReference } from './source-reference.js';

export type FieldType =
  | 'string'
  | 'text'
  | 'integer'
  | 'number'
  | 'boolean'
  | 'uuid'
  | 'date'
  | 'datetime'
  | 'json'
  | 'enum';

export interface FieldValidation {
  readonly minLength: number | null;
  readonly maxLength: number | null;
  readonly pattern: string | null;
  readonly min: number | null;
  readonly max: number | null;
}

export interface Field {
  readonly name: string;
  readonly type: FieldType;
  readonly required: boolean;
  readonly unique: boolean;
  readonly enumValues: readonly string[];
  readonly validation: FieldValidation;
  readonly source?: DiagnosticSourceReference;
}

export interface Index {
  readonly name: string;
  readonly columns: readonly string[];
  readonly unique: boolean;
  readonly source?: DiagnosticSourceReference;
}

export interface Relation {
  readonly name: string;
  readonly type: 'belongs_to';
  readonly field: string;
  readonly targetModel: string;
  readonly references: string;
  readonly source?: DiagnosticSourceReference;
}

export interface ApiDefinition {
  readonly resource: string | null;
  readonly create: boolean;
  readonly update: boolean;
  readonly delete: boolean;
}

export interface UiDefinition {
  readonly list: {
    readonly columns: readonly string[];
  };
  readonly form: {
    readonly fields: readonly string[];
  };
}

export interface PermissionDefinition {
  readonly read: readonly string[];
  readonly create: readonly string[];
  readonly update: readonly string[];
  readonly delete: readonly string[];
}

export interface WorkflowDefinition {
  readonly enabled: boolean;
}

export interface EventDefinition {
  readonly enabled: boolean;
}

export interface Model {
  readonly name: string;
  readonly displayName: string;
  readonly description: string | null;
  readonly primaryKey: string;
  readonly fields: readonly Field[];
  readonly indexes: readonly Index[];
  readonly relations: readonly Relation[];
  readonly api: ApiDefinition;
  readonly ui: UiDefinition;
  readonly permissions: PermissionDefinition;
  readonly workflow: WorkflowDefinition;
  readonly events: EventDefinition;
  readonly metadata: MetadataObject;
  readonly source?: DiagnosticSourceReference;
}
