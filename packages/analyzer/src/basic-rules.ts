import type { AstMapping, AstNode, SchemaAst } from '@gstack/parser';
import { compareDiagnostics, type Diagnostic } from '@gstack/schema';

const FIELD_TYPES = new Set([
  'string',
  'text',
  'integer',
  'number',
  'boolean',
  'uuid',
  'date',
  'datetime',
  'json',
  'enum',
]);
const SNAKE_CASE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

export function validateSchemaBasics(
  schemas: readonly SchemaAst[],
): readonly Diagnostic[] {
  const diagnostics = schemas.flatMap(validateOneSchema);
  const names = new Map<string, SchemaAst[]>();

  for (const schema of schemas) {
    const root = asMapping(schema.root);
    const name = root ? stringValue(root, 'name') : undefined;
    if (name === undefined) continue;
    const duplicates = names.get(name) ?? [];
    duplicates.push(schema);
    names.set(name, duplicates);
  }

  for (const [name, duplicates] of names) {
    if (duplicates.length < 2) continue;
    for (const schema of duplicates) {
      const root = asMapping(schema.root);
      const entry = root ? findEntry(root, 'name') : undefined;
      diagnostics.push({
        code: 'SCHEMA_MODEL_DUPLICATE',
        phase: 'semantic',
        severity: 'error',
        message: `Model name "${name}" is declared more than once.`,
        file: schema.source.id,
        ...(entry ? { range: entry.value.range } : {}),
      });
    }
  }

  return diagnostics.sort(compareDiagnostics);
}

function validateOneSchema(schema: SchemaAst): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const root = asMapping(schema.root);
  if (!root) return diagnostics;

  const name = requireString(root, 'name', '$', schema, diagnostics);
  if (name !== undefined) {
    validateSnakeCase(
      name,
      'Model',
      findEntry(root, 'name')?.value,
      schema,
      diagnostics,
    );
  }

  const model = requireMapping(root, 'model', '$', schema, diagnostics);
  if (model) {
    requireString(model, 'displayName', 'model', schema, diagnostics);
  }

  const database = requireMapping(root, 'database', '$', schema, diagnostics);
  if (database) validateDatabase(database, schema, diagnostics);

  return diagnostics;
}

function validateDatabase(
  database: AstMapping,
  schema: SchemaAst,
  diagnostics: Diagnostic[],
): void {
  const primaryKey = requireString(
    database,
    'primaryKey',
    'database',
    schema,
    diagnostics,
  );
  if (primaryKey !== undefined) {
    validateSnakeCase(
      primaryKey,
      'Primary key',
      findEntry(database, 'primaryKey')?.value,
      schema,
      diagnostics,
    );
  }

  const columns = requireMapping(
    database,
    'columns',
    'database',
    schema,
    diagnostics,
  );
  if (!columns) return;
  if (columns.entries.length === 0) {
    diagnostics.push({
      code: 'SCHEMA_COLUMNS_EMPTY',
      phase: 'semantic',
      severity: 'error',
      message: 'database.columns must contain at least one Column.',
      file: schema.source.id,
      range: columns.range,
    });
  }

  const columnNames = new Set(columns.entries.map((column) => column.key));
  if (primaryKey !== undefined && !columnNames.has(primaryKey)) {
    const entry = findEntry(database, 'primaryKey');
    diagnostics.push({
      code: 'SCHEMA_PRIMARY_KEY_UNKNOWN',
      phase: 'semantic',
      severity: 'error',
      message: `Primary key "${primaryKey}" does not name an existing Column.`,
      file: schema.source.id,
      ...(entry ? { range: entry.value.range } : {}),
    });
  }

  for (const column of columns.entries) {
    validateSnakeCase(
      column.key,
      'Column',
      { range: column.keyRange },
      schema,
      diagnostics,
    );
    const definition = asMapping(column.value);
    if (!definition) continue;
    const type = requireString(
      definition,
      'type',
      `database.columns.${column.key}`,
      schema,
      diagnostics,
    );
    if (type !== undefined && !FIELD_TYPES.has(type)) {
      const entry = findEntry(definition, 'type');
      diagnostics.push({
        code: 'SCHEMA_FIELD_TYPE_UNSUPPORTED',
        phase: 'semantic',
        severity: 'error',
        message: `Column "${column.key}" uses unsupported type "${type}".`,
        file: schema.source.id,
        ...(entry ? { range: entry.value.range } : {}),
      });
    }
    validateOptionalBoolean(
      definition,
      'required',
      column.key,
      schema,
      diagnostics,
    );
    validateOptionalBoolean(
      definition,
      'unique',
      column.key,
      schema,
      diagnostics,
    );
    const values = validateOptionalStringSequence(
      definition,
      'values',
      column.key,
      schema,
      diagnostics,
    );
    validateEnum(column.key, type, values, definition, schema, diagnostics);
  }

  validateIndexes(database, columnNames, schema, diagnostics);
}

function validateEnum(
  column: string,
  type: string | undefined,
  values: readonly string[] | undefined,
  definition: AstMapping,
  schema: SchemaAst,
  diagnostics: Diagnostic[],
): void {
  const valuesEntry = findEntry(definition, 'values');
  if (type === 'enum') {
    if (!valuesEntry) {
      missing(
        'values',
        `database.columns.${column}`,
        definition,
        schema,
        diagnostics,
      );
      return;
    }
    if (values?.length === 0) {
      diagnostics.push({
        code: 'SCHEMA_ENUM_VALUES_EMPTY',
        phase: 'semantic',
        severity: 'error',
        message: `Enum Column "${column}" must declare at least one value.`,
        file: schema.source.id,
        range: valuesEntry.value.range,
      });
    }
    if (values) {
      const seen = new Set<string>();
      for (const value of values) {
        if (seen.has(value)) {
          diagnostics.push({
            code: 'SCHEMA_ENUM_VALUE_DUPLICATE',
            phase: 'semantic',
            severity: 'error',
            message: `Enum Column "${column}" declares duplicate value "${value}".`,
            file: schema.source.id,
            range: valuesEntry.value.range,
          });
        }
        seen.add(value);
      }
    }
  } else if (valuesEntry) {
    diagnostics.push({
      code: 'SCHEMA_ENUM_VALUES_FORBIDDEN',
      phase: 'semantic',
      severity: 'error',
      message: `Non-enum Column "${column}" must not declare values.`,
      file: schema.source.id,
      range: valuesEntry.keyRange,
    });
  }
}

function validateIndexes(
  database: AstMapping,
  columnNames: ReadonlySet<string>,
  schema: SchemaAst,
  diagnostics: Diagnostic[],
): void {
  const indexesEntry = findEntry(database, 'indexes');
  if (!indexesEntry || indexesEntry.value.kind !== 'sequence') return;
  const indexNames = new Set<string>();

  indexesEntry.value.items.forEach((item, index) => {
    const definition = asMapping(item);
    if (!definition) return;
    const path = `database.indexes[${index}]`;
    const name = requireString(definition, 'name', path, schema, diagnostics);
    if (name !== undefined) {
      validateSnakeCase(
        name,
        'Index',
        findEntry(definition, 'name')?.value,
        schema,
        diagnostics,
      );
      if (indexNames.has(name)) {
        const entry = findEntry(definition, 'name');
        diagnostics.push({
          code: 'SCHEMA_INDEX_DUPLICATE',
          phase: 'semantic',
          severity: 'error',
          message: `Index name "${name}" is declared more than once.`,
          file: schema.source.id,
          ...(entry ? { range: entry.value.range } : {}),
        });
      }
      indexNames.add(name);
    }

    const columns = requireStringSequence(
      definition,
      'columns',
      path,
      schema,
      diagnostics,
    );
    if (columns) {
      if (columns.length === 0) {
        const entry = findEntry(definition, 'columns');
        diagnostics.push({
          code: 'SCHEMA_INDEX_COLUMNS_EMPTY',
          phase: 'semantic',
          severity: 'error',
          message: `Index at ${path} must reference at least one Column.`,
          file: schema.source.id,
          ...(entry ? { range: entry.value.range } : {}),
        });
      }
      const seen = new Set<string>();
      for (const column of columns) {
        if (!columnNames.has(column)) {
          const entry = findEntry(definition, 'columns');
          diagnostics.push({
            code: 'SCHEMA_INDEX_COLUMN_UNKNOWN',
            phase: 'semantic',
            severity: 'error',
            message: `Index "${name ?? index}" references unknown Column "${column}".`,
            file: schema.source.id,
            ...(entry ? { range: entry.value.range } : {}),
          });
        }
        if (seen.has(column)) {
          const entry = findEntry(definition, 'columns');
          diagnostics.push({
            code: 'SCHEMA_INDEX_COLUMN_DUPLICATE',
            phase: 'semantic',
            severity: 'error',
            message: `Index "${name ?? index}" references Column "${column}" more than once.`,
            file: schema.source.id,
            ...(entry ? { range: entry.value.range } : {}),
          });
        }
        seen.add(column);
      }
    }
    validateOptionalBooleanAtPath(
      definition,
      'unique',
      path,
      schema,
      diagnostics,
    );
  });
}

function requireString(
  mapping: AstMapping,
  key: string,
  path: string,
  schema: SchemaAst,
  diagnostics: Diagnostic[],
): string | undefined {
  const entry = findEntry(mapping, key);
  if (!entry) {
    missing(key, path, mapping, schema, diagnostics);
    return undefined;
  }
  if (entry.value.kind !== 'scalar' || typeof entry.value.value !== 'string') {
    invalidValueType(key, path, 'string', entry.value, schema, diagnostics);
    return undefined;
  }
  if (entry.value.value.length === 0) {
    diagnostics.push({
      code: 'SCHEMA_VALUE_EMPTY',
      phase: 'semantic',
      severity: 'error',
      message: `Schema value at ${joinPath(path, key)} must not be empty.`,
      file: schema.source.id,
      range: entry.value.range,
    });
    return undefined;
  }
  return entry.value.value;
}

function requireMapping(
  mapping: AstMapping,
  key: string,
  path: string,
  schema: SchemaAst,
  diagnostics: Diagnostic[],
): AstMapping | undefined {
  const entry = findEntry(mapping, key);
  if (!entry) {
    missing(key, path, mapping, schema, diagnostics);
    return undefined;
  }
  return asMapping(entry.value);
}

function validateOptionalBoolean(
  mapping: AstMapping,
  key: string,
  column: string,
  schema: SchemaAst,
  diagnostics: Diagnostic[],
): void {
  const entry = findEntry(mapping, key);
  if (!entry) return;
  if (entry.value.kind !== 'scalar' || typeof entry.value.value !== 'boolean') {
    invalidValueType(
      key,
      `database.columns.${column}`,
      'boolean',
      entry.value,
      schema,
      diagnostics,
    );
  }
}

function validateOptionalBooleanAtPath(
  mapping: AstMapping,
  key: string,
  path: string,
  schema: SchemaAst,
  diagnostics: Diagnostic[],
): void {
  const entry = findEntry(mapping, key);
  if (!entry) return;
  if (entry.value.kind !== 'scalar' || typeof entry.value.value !== 'boolean') {
    invalidValueType(key, path, 'boolean', entry.value, schema, diagnostics);
  }
}

function validateOptionalStringSequence(
  mapping: AstMapping,
  key: string,
  column: string,
  schema: SchemaAst,
  diagnostics: Diagnostic[],
): readonly string[] | undefined {
  const entry = findEntry(mapping, key);
  if (!entry) return undefined;
  if (entry.value.kind !== 'sequence') return undefined;
  const values: string[] = [];
  entry.value.items.forEach((item, index) => {
    if (item.kind !== 'scalar' || typeof item.value !== 'string') {
      invalidValueType(
        `${key}[${index}]`,
        `database.columns.${column}`,
        'string',
        item,
        schema,
        diagnostics,
      );
    } else {
      values.push(item.value);
    }
  });
  return values;
}

function requireStringSequence(
  mapping: AstMapping,
  key: string,
  path: string,
  schema: SchemaAst,
  diagnostics: Diagnostic[],
): readonly string[] | undefined {
  const entry = findEntry(mapping, key);
  if (!entry) {
    missing(key, path, mapping, schema, diagnostics);
    return undefined;
  }
  if (entry.value.kind !== 'sequence') return undefined;
  const values: string[] = [];
  entry.value.items.forEach((item, index) => {
    if (item.kind !== 'scalar' || typeof item.value !== 'string') {
      invalidValueType(
        `${key}[${index}]`,
        path,
        'string',
        item,
        schema,
        diagnostics,
      );
    } else {
      values.push(item.value);
    }
  });
  return values;
}

function validateSnakeCase(
  value: string,
  subject: string,
  node: { readonly range: AstNode['range'] } | undefined,
  schema: SchemaAst,
  diagnostics: Diagnostic[],
): void {
  if (SNAKE_CASE.test(value)) return;
  diagnostics.push({
    code: 'SCHEMA_NAME_INVALID',
    phase: 'semantic',
    severity: 'error',
    message: `${subject} name "${value}" must use snake_case.`,
    file: schema.source.id,
    ...(node ? { range: node.range } : {}),
  });
}

function missing(
  key: string,
  path: string,
  mapping: AstMapping,
  schema: SchemaAst,
  diagnostics: Diagnostic[],
): void {
  diagnostics.push({
    code: 'SCHEMA_PROPERTY_REQUIRED',
    phase: 'semantic',
    severity: 'error',
    message: `Required Schema property ${joinPath(path, key)} is missing.`,
    file: schema.source.id,
    range: mapping.range,
  });
}

function invalidValueType(
  key: string,
  path: string,
  expected: string,
  node: AstNode,
  schema: SchemaAst,
  diagnostics: Diagnostic[],
): void {
  diagnostics.push({
    code: 'SCHEMA_VALUE_TYPE_INVALID',
    phase: 'semantic',
    severity: 'error',
    message: `Schema value at ${joinPath(path, key)} must be a ${expected}.`,
    file: schema.source.id,
    range: node.range,
  });
}

function asMapping(node: AstNode): AstMapping | undefined {
  return node.kind === 'mapping' ? node : undefined;
}

function findEntry(mapping: AstMapping, key: string) {
  return mapping.entries.find((entry) => entry.key === key);
}

function stringValue(mapping: AstMapping, key: string): string | undefined {
  const node = findEntry(mapping, key)?.value;
  return node?.kind === 'scalar' && typeof node.value === 'string'
    ? node.value
    : undefined;
}

function joinPath(path: string, key: string): string {
  return path === '$' ? key : `${path}.${key}`;
}
