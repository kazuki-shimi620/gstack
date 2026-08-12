import type {
  ApplicationModel,
  Field,
  Index,
  Model,
  Relation,
} from '@gstack/application';

import { createMigrationPlan, operationId } from './plan.js';
import type {
  ColumnChange,
  MigrationOperation,
  MigrationPlan,
  RenameColumnIntent,
} from './types.js';

export interface DiffApplicationModelsOptions {
  readonly renameColumns?: readonly RenameColumnIntent[];
}

export class MigrationDiffError extends Error {
  public constructor(
    public readonly code:
      | 'MIGRATION_PRIMARY_KEY_CHANGE_UNSUPPORTED'
      | 'MIGRATION_RENAME_INTENT_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'MigrationDiffError';
  }
}

export function diffApplicationModels(
  previous: ApplicationModel | null,
  target: ApplicationModel,
  options: DiffApplicationModelsOptions = {},
): MigrationPlan {
  if (previous === null) {
    return createMigrationPlan(
      target.models.map((model) => createModel(model)),
    );
  }

  const operations: MigrationOperation[] = [];
  const previousModels = byName(previous.models);
  const targetModels = byName(target.models);
  for (const model of previous.models) {
    if (!targetModels.has(model.name)) operations.push(dropModel(model));
  }
  for (const model of target.models) {
    const oldModel = previousModels.get(model.name);
    if (!oldModel) {
      operations.push(createModel(model));
    } else {
      operations.push(
        ...diffModel(
          oldModel,
          model,
          options.renameColumns?.filter(
            (intent) => intent.model === model.name,
          ) ?? [],
        ),
      );
    }
  }
  validateRenameModels(
    options.renameColumns ?? [],
    previousModels,
    targetModels,
  );
  return createMigrationPlan(operations);
}

function diffModel(
  previous: Model,
  target: Model,
  renameIntents: readonly RenameColumnIntent[],
): readonly MigrationOperation[] {
  if (previous.primaryKey !== target.primaryKey) {
    throw new MigrationDiffError(
      'MIGRATION_PRIMARY_KEY_CHANGE_UNSUPPORTED',
      `Primary Key change is not supported for Model "${target.name}": ${previous.primaryKey} -> ${target.primaryKey}`,
    );
  }
  const operations: MigrationOperation[] = [];
  const previousFields = byName(previous.fields);
  const targetFields = byName(target.fields);
  const renameFrom = new Set(renameIntents.map((intent) => intent.from));
  const renameTo = new Set(renameIntents.map((intent) => intent.to));
  validateRenameIntents(renameIntents, previousFields, targetFields);

  for (const intent of renameIntents) {
    const oldField = previousFields.get(intent.from)!;
    const newField = targetFields.get(intent.to)!;
    operations.push({
      id: operationId(
        'rename_column',
        target.name,
        `${intent.from}->${intent.to}`,
      ),
      type: 'rename_column',
      model: target.name,
      from: intent.from,
      to: intent.to,
      risk: 'caution',
      destructive: false,
      reversible: true,
      capability: 'not_evaluated',
    });
    const changes = columnChanges(oldField, newField);
    if (changes.length > 0)
      operations.push(alterColumn(target.name, newField, oldField, changes));
  }

  for (const field of previous.fields) {
    if (!targetFields.has(field.name) && !renameFrom.has(field.name)) {
      operations.push(dropColumn(previous.name, field));
    }
  }
  for (const field of target.fields) {
    const oldField = previousFields.get(field.name);
    if (!oldField && !renameTo.has(field.name)) {
      operations.push(addColumn(target.name, field));
    } else if (oldField) {
      const changes = columnChanges(oldField, field);
      if (changes.length > 0)
        operations.push(alterColumn(target.name, field, oldField, changes));
    }
  }

  operations.push(
    ...diffNamed(
      previous.name,
      previous.indexes,
      target.indexes,
      indexEqual,
      addIndex,
      dropIndex,
    ),
  );
  operations.push(
    ...diffNamed(
      previous.name,
      previous.relations,
      target.relations,
      relationEqual,
      addRelation,
      dropRelation,
    ),
  );
  return operations;
}

function diffNamed<T extends { readonly name: string }>(
  model: string,
  previous: readonly T[],
  target: readonly T[],
  equal: (left: T, right: T) => boolean,
  add: (model: string, value: T) => MigrationOperation,
  drop: (model: string, value: T) => MigrationOperation,
): readonly MigrationOperation[] {
  const operations: MigrationOperation[] = [];
  const oldValues = byName(previous);
  const newValues = byName(target);
  for (const value of previous) {
    const replacement = newValues.get(value.name);
    if (!replacement || !equal(value, replacement))
      operations.push(drop(model, value));
  }
  for (const value of target) {
    const oldValue = oldValues.get(value.name);
    if (!oldValue || !equal(oldValue, value))
      operations.push(add(model, value));
  }
  return operations;
}

function columnChanges(
  previous: Field,
  target: Field,
): readonly ColumnChange[] {
  const changes: ColumnChange[] = [];
  if (previous.type !== target.type)
    changes.push(change('type', previous.type, target.type, 'caution'));
  if (previous.required !== target.required) {
    changes.push(
      change(
        'required',
        previous.required,
        target.required,
        target.required ? 'caution' : 'safe',
      ),
    );
  }
  if (previous.unique !== target.unique) {
    changes.push(
      change(
        'unique',
        previous.unique,
        target.unique,
        target.unique ? 'caution' : 'safe',
      ),
    );
  }
  if (!arrayEqual(previous.enumValues, target.enumValues)) {
    const removed = previous.enumValues.some(
      (value) => !target.enumValues.includes(value),
    );
    changes.push(
      change(
        'enumValues',
        previous.enumValues,
        target.enumValues,
        removed ? 'caution' : 'safe',
      ),
    );
  }
  return changes;
}

function change(
  property: ColumnChange['property'],
  previous: ColumnChange['previous'],
  target: ColumnChange['target'],
  risk: ColumnChange['risk'],
): ColumnChange {
  return { property, previous, target, risk };
}

function validateRenameIntents(
  intents: readonly RenameColumnIntent[],
  previous: ReadonlyMap<string, Field>,
  target: ReadonlyMap<string, Field>,
): void {
  const used = new Set<string>();
  for (const intent of intents) {
    if (used.has(intent.from) || used.has(intent.to))
      throw new MigrationDiffError(
        'MIGRATION_RENAME_INTENT_INVALID',
        'Rename intent must not reuse a Column.',
      );
    if (
      !previous.has(intent.from) ||
      target.has(intent.from) ||
      previous.has(intent.to) ||
      !target.has(intent.to)
    ) {
      throw new MigrationDiffError(
        'MIGRATION_RENAME_INTENT_INVALID',
        `Invalid rename intent: ${intent.model}.${intent.from}->${intent.to}`,
      );
    }
    used.add(intent.from);
    used.add(intent.to);
  }
}

function validateRenameModels(
  intents: readonly RenameColumnIntent[],
  previous: ReadonlyMap<string, Model>,
  target: ReadonlyMap<string, Model>,
): void {
  for (const intent of intents) {
    if (!previous.has(intent.model) || !target.has(intent.model)) {
      throw new MigrationDiffError(
        'MIGRATION_RENAME_INTENT_INVALID',
        `Rename intent references unavailable Model: ${intent.model}`,
      );
    }
  }
}

const createModel = (model: Model): MigrationOperation => ({
  id: operationId('create_model', model.name),
  type: 'create_model',
  model: model.name,
  definition: model,
  risk: 'safe',
  destructive: false,
  reversible: true,
  capability: 'not_evaluated',
});
const dropModel = (model: Model): MigrationOperation => ({
  id: operationId('drop_model', model.name),
  type: 'drop_model',
  model: model.name,
  previous: model,
  risk: 'destructive',
  destructive: true,
  reversible: false,
  capability: 'not_evaluated',
});
const addColumn = (model: string, column: Field): MigrationOperation => ({
  id: operationId('add_column', model, column.name),
  type: 'add_column',
  model,
  column,
  risk: column.required ? 'caution' : 'safe',
  destructive: false,
  reversible: true,
  capability: 'not_evaluated',
});
const dropColumn = (model: string, previous: Field): MigrationOperation => ({
  id: operationId('drop_column', model, previous.name),
  type: 'drop_column',
  model,
  previous,
  risk: 'destructive',
  destructive: true,
  reversible: false,
  capability: 'not_evaluated',
});
function alterColumn(
  model: string,
  target: Field,
  previous: Field,
  changes: readonly ColumnChange[],
): MigrationOperation {
  return {
    id: operationId('alter_column', model, target.name),
    type: 'alter_column',
    model,
    column: target.name,
    previous,
    target,
    changes,
    risk: changes.some((item) => item.risk === 'caution') ? 'caution' : 'safe',
    destructive: false,
    reversible: false,
    capability: 'not_evaluated',
  };
}
const addIndex = (model: string, index: Index): MigrationOperation => ({
  id: operationId('add_index', model, index.name),
  type: 'add_index',
  model,
  index,
  risk: 'safe',
  destructive: false,
  reversible: true,
  capability: 'not_evaluated',
});
const dropIndex = (model: string, previous: Index): MigrationOperation => ({
  id: operationId('drop_index', model, previous.name),
  type: 'drop_index',
  model,
  previous,
  risk: 'safe',
  destructive: false,
  reversible: true,
  capability: 'not_evaluated',
});
const addRelation = (
  model: string,
  relation: Relation,
): MigrationOperation => ({
  id: operationId('add_relation', model, relation.name),
  type: 'add_relation',
  model,
  relation,
  risk: 'safe',
  destructive: false,
  reversible: true,
  capability: 'not_evaluated',
});
const dropRelation = (
  model: string,
  previous: Relation,
): MigrationOperation => ({
  id: operationId('drop_relation', model, previous.name),
  type: 'drop_relation',
  model,
  previous,
  risk: 'safe',
  destructive: false,
  reversible: true,
  capability: 'not_evaluated',
});

function indexEqual(left: Index, right: Index): boolean {
  return (
    left.unique === right.unique && arrayEqual(left.columns, right.columns)
  );
}
function relationEqual(left: Relation, right: Relation): boolean {
  return (
    left.type === right.type &&
    left.field === right.field &&
    left.targetModel === right.targetModel &&
    left.references === right.references
  );
}
function arrayEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
function byName<T extends { readonly name: string }>(
  values: readonly T[],
): Map<string, T> {
  return new Map(values.map((value) => [value.name, value]));
}
