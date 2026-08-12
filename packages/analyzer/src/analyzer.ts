import type {
  ApplicationModel,
  Field,
  FieldType,
  MetadataObject,
  MetadataValue,
  Model,
} from '@gstack/application';
import type { AstMapping, AstNode, AstScalar, SchemaAst } from '@gstack/parser';
import type { Diagnostic } from '@gstack/schema';

import { validateSchemaBasics } from './basic-rules.js';

export interface AnalyzeSchemasOptions {
  readonly applicationName: string;
  readonly schemaVersion: 1;
}

export interface AnalyzeSchemasResult {
  readonly application?: ApplicationModel;
  readonly errors: readonly Diagnostic[];
  readonly warnings: readonly Diagnostic[];
}

export function analyzeSchemas(
  schemas: readonly SchemaAst[],
  options: AnalyzeSchemasOptions,
): AnalyzeSchemasResult {
  const errors = validateSchemaBasics(schemas);
  if (errors.length > 0) return { errors, warnings: [] };

  const models = schemas
    .map(buildModel)
    .sort((left, right) => left.name.localeCompare(right.name));
  return {
    application: deepFreeze({
      schemaVersion: options.schemaVersion,
      name: options.applicationName,
      models,
      metadata: {},
    }),
    errors,
    warnings: [],
  };
}

function buildModel(ast: SchemaAst): Model {
  const root = mapping(ast.root);
  const model = mapping(value(root, 'model'));
  const database = mapping(value(root, 'database'));
  const columns = mapping(value(database, 'columns'));
  const validations = optionalMapping(root, 'validation');
  return {
    name: string(root, 'name'),
    displayName: string(model, 'displayName'),
    description: optionalString(root, 'description'),
    primaryKey: string(database, 'primaryKey'),
    fields: columns.entries.map((entry) =>
      buildField(entry.key, mapping(entry.value), validations, ast),
    ),
    indexes: sequence(database, 'indexes').map((node) => {
      const index = mapping(node);
      return {
        name: string(index, 'name'),
        columns: stringSequence(index, 'columns'),
        unique: optionalBoolean(index, 'unique'),
        source: source(ast, node),
      };
    }),
    relations:
      optionalMapping(database, 'relations')?.entries.map((entry) => {
        const relation = mapping(entry.value);
        return {
          name: entry.key,
          type: 'belongs_to' as const,
          field: string(relation, 'field'),
          targetModel: string(relation, 'model'),
          references: string(relation, 'references'),
          source: source(ast, entry.value),
        };
      }) ?? [],
    api: buildApi(optionalMapping(root, 'api')),
    ui: buildUi(optionalMapping(root, 'ui')),
    permissions: buildPermissions(optionalMapping(root, 'permissions')),
    workflow: {
      enabled: optionalBoolean(optionalMapping(root, 'workflow'), 'enabled'),
    },
    events: {
      enabled: optionalBoolean(optionalMapping(root, 'events'), 'enabled'),
    },
    metadata: metadata(optionalMapping(root, 'metadata')),
    source: source(ast, ast.root),
  };
}

function buildField(
  name: string,
  definition: AstMapping,
  validations: AstMapping | undefined,
  ast: SchemaAst,
): Field {
  const validation = validations
    ? optionalMapping(validations, name)
    : undefined;
  return {
    name,
    type: string(definition, 'type') as FieldType,
    required: optionalBoolean(definition, 'required'),
    unique: optionalBoolean(definition, 'unique'),
    enumValues: stringSequence(definition, 'values'),
    validation: {
      minLength: optionalNumber(validation, 'minLength'),
      maxLength: optionalNumber(validation, 'maxLength'),
      pattern: optionalString(validation, 'pattern'),
      min: optionalNumber(validation, 'min'),
      max: optionalNumber(validation, 'max'),
    },
    source: source(ast, definition),
  };
}

function buildApi(api: AstMapping | undefined) {
  return {
    resource: optionalString(api, 'resource'),
    create: optionalBoolean(api, 'create'),
    update: optionalBoolean(api, 'update'),
    delete: optionalBoolean(api, 'delete'),
  };
}

function buildUi(ui: AstMapping | undefined) {
  return {
    list: { columns: stringSequence(optionalMapping(ui, 'list'), 'columns') },
    form: { fields: stringSequence(optionalMapping(ui, 'form'), 'fields') },
  };
}

function buildPermissions(permissions: AstMapping | undefined) {
  return {
    read: stringSequence(permissions, 'read'),
    create: stringSequence(permissions, 'create'),
    update: stringSequence(permissions, 'update'),
    delete: stringSequence(permissions, 'delete'),
  };
}

function metadata(node: AstMapping | undefined): MetadataObject {
  if (!node) return {};
  return Object.fromEntries(
    node.entries.map((entry) => [entry.key, metadataValue(entry.value)]),
  );
}

function metadataValue(node: AstNode): MetadataValue {
  if (node.kind === 'scalar') return node.value;
  if (node.kind === 'sequence') return node.items.map(metadataValue);
  return metadata(node);
}

function mapping(node: AstNode): AstMapping {
  if (node.kind !== 'mapping') throw new Error('Validated mapping expected.');
  return node;
}

function value(mappingNode: AstMapping, key: string): AstNode {
  const node = mappingNode.entries.find((entry) => entry.key === key)?.value;
  if (!node) throw new Error(`Validated property expected: ${key}`);
  return node;
}

function optionalMapping(
  mappingNode: AstMapping | undefined,
  key: string,
): AstMapping | undefined {
  if (!mappingNode) return undefined;
  const node = mappingNode.entries.find((entry) => entry.key === key)?.value;
  return node?.kind === 'mapping' ? node : undefined;
}

function scalar(mappingNode: AstMapping, key: string): AstScalar {
  const node = value(mappingNode, key);
  if (node.kind !== 'scalar') throw new Error('Validated scalar expected.');
  return node;
}

function string(mappingNode: AstMapping, key: string): string {
  return scalar(mappingNode, key).value as string;
}

function optionalString(
  mappingNode: AstMapping | undefined,
  key: string,
): string | null {
  if (!mappingNode) return null;
  const node = mappingNode.entries.find((entry) => entry.key === key)?.value;
  return node?.kind === 'scalar' && typeof node.value === 'string'
    ? node.value
    : null;
}

function optionalBoolean(
  mappingNode: AstMapping | undefined,
  key: string,
): boolean {
  if (!mappingNode) return false;
  const node = mappingNode.entries.find((entry) => entry.key === key)?.value;
  return node?.kind === 'scalar' && typeof node.value === 'boolean'
    ? node.value
    : false;
}

function optionalNumber(
  mappingNode: AstMapping | undefined,
  key: string,
): number | null {
  if (!mappingNode) return null;
  const node = mappingNode.entries.find((entry) => entry.key === key)?.value;
  return node?.kind === 'scalar' && typeof node.value === 'number'
    ? node.value
    : null;
}

function sequence(mappingNode: AstMapping, key: string): readonly AstNode[] {
  const node = mappingNode.entries.find((entry) => entry.key === key)?.value;
  return node?.kind === 'sequence' ? node.items : [];
}

function stringSequence(
  mappingNode: AstMapping | undefined,
  key: string,
): readonly string[] {
  if (!mappingNode) return [];
  return sequence(mappingNode, key).map(
    (node) => (node as AstScalar).value as string,
  );
}

function source(ast: SchemaAst, node: AstNode) {
  return { sourceId: ast.source.id, range: node.range };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
