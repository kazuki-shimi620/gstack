import type { Field, Index, Model, Relation } from '@gstack/application';

export type MigrationRisk = 'safe' | 'caution' | 'destructive';
export type OperationCapability =
  'not_evaluated' | 'native' | 'emulated' | 'unsupported';
export type MigrationCapabilityStatus =
  'not_evaluated' | 'supported' | 'unsupported';

interface OperationBase {
  readonly id: string;
  readonly model: string;
  readonly risk: MigrationRisk;
  readonly destructive: boolean;
  readonly reversible: boolean;
  readonly capability: OperationCapability;
}

export interface CreateModelOperation extends OperationBase {
  readonly type: 'create_model';
  readonly definition: Model;
}

export interface DropModelOperation extends OperationBase {
  readonly type: 'drop_model';
  readonly previous: Model;
}

export interface AddColumnOperation extends OperationBase {
  readonly type: 'add_column';
  readonly column: Field;
}

export interface DropColumnOperation extends OperationBase {
  readonly type: 'drop_column';
  readonly previous: Field;
}

export interface RenameColumnOperation extends OperationBase {
  readonly type: 'rename_column';
  readonly from: string;
  readonly to: string;
}

export interface AlterColumnOperation extends OperationBase {
  readonly type: 'alter_column';
  readonly column: string;
  readonly previous: Field;
  readonly target: Field;
  readonly changes: readonly ColumnChange[];
}

export interface AddIndexOperation extends OperationBase {
  readonly type: 'add_index';
  readonly index: Index;
}

export interface DropIndexOperation extends OperationBase {
  readonly type: 'drop_index';
  readonly previous: Index;
}

export interface AddRelationOperation extends OperationBase {
  readonly type: 'add_relation';
  readonly relation: Relation;
}

export interface DropRelationOperation extends OperationBase {
  readonly type: 'drop_relation';
  readonly previous: Relation;
}

export type MigrationOperation =
  | CreateModelOperation
  | DropModelOperation
  | AddColumnOperation
  | DropColumnOperation
  | RenameColumnOperation
  | AlterColumnOperation
  | AddIndexOperation
  | DropIndexOperation
  | AddRelationOperation
  | DropRelationOperation;

export interface ColumnChange {
  readonly property: 'type' | 'required' | 'unique' | 'enumValues';
  readonly previous: Field['type'] | boolean | readonly string[];
  readonly target: Field['type'] | boolean | readonly string[];
  readonly risk: 'safe' | 'caution';
}

export interface RenameColumnIntent {
  readonly model: string;
  readonly from: string;
  readonly to: string;
}

export interface MigrationPlan {
  readonly operations: readonly MigrationOperation[];
  readonly risk: MigrationRisk;
  readonly destructive: boolean;
  readonly reversible: boolean;
  readonly capabilityStatus: MigrationCapabilityStatus;
  readonly applicable: boolean;
  readonly warnings: readonly string[];
}
