import type { Diagnostic } from '@gstack/schema';

import type {
  AstMapping,
  AstMappingEntry,
  AstNode,
  AstSequence,
  SchemaAst,
} from './ast.js';

const ROOT_KEYS = new Set([
  'name',
  'description',
  'model',
  'database',
  'api',
  'ui',
  'validation',
  'permissions',
  'workflow',
  'events',
  'metadata',
]);
const MODEL_KEYS = new Set(['displayName']);
const DATABASE_KEYS = new Set([
  'primaryKey',
  'columns',
  'indexes',
  'relations',
]);
const COLUMN_KEYS = new Set(['type', 'required', 'unique', 'values']);
const INDEX_KEYS = new Set(['name', 'columns', 'unique']);
const RELATION_KEYS = new Set(['type', 'field', 'model', 'references']);
const VALIDATION_KEYS = new Set([
  'minLength',
  'maxLength',
  'pattern',
  'min',
  'max',
]);
const API_KEYS = new Set(['resource', 'create', 'update', 'delete']);
const UI_KEYS = new Set(['list', 'form']);
const UI_LIST_KEYS = new Set(['columns']);
const UI_FORM_KEYS = new Set(['fields']);
const PERMISSION_KEYS = new Set(['read', 'create', 'update', 'delete']);
const ENABLED_KEYS = new Set(['enabled']);

export function validateSchemaShape(ast: SchemaAst): readonly Diagnostic[] {
  const errors: Diagnostic[] = [];
  const root = expectMapping(ast.root, '$', ast, errors);
  if (!root) return errors;

  validateKnownKeys(root, ROOT_KEYS, '$', ast, errors);
  for (const entry of root.entries) {
    switch (entry.key) {
      case 'name':
      case 'description':
        expectScalar(entry.value, entry.key, ast, errors);
        break;
      case 'model':
        validateFixedMapping(entry, MODEL_KEYS, ast, errors);
        break;
      case 'database':
        validateDatabase(entry, ast, errors);
        break;
      case 'validation':
        validateNamedMappings(entry, VALIDATION_KEYS, ast, errors);
        break;
      case 'api':
        validateFixedMapping(entry, API_KEYS, ast, errors);
        break;
      case 'ui':
        validateUi(entry, ast, errors);
        break;
      case 'permissions':
        validatePermissions(entry, ast, errors);
        break;
      case 'workflow':
      case 'events':
        validateFixedMapping(entry, ENABLED_KEYS, ast, errors);
        break;
      case 'metadata':
        expectMapping(entry.value, entry.key, ast, errors);
        break;
    }
  }
  return errors;
}

function validateDatabase(
  entry: AstMappingEntry,
  ast: SchemaAst,
  errors: Diagnostic[],
): void {
  const mapping = expectMapping(entry.value, 'database', ast, errors);
  if (!mapping) return;
  validateKnownKeys(mapping, DATABASE_KEYS, 'database', ast, errors);
  for (const child of mapping.entries) {
    switch (child.key) {
      case 'primaryKey':
        expectScalar(child.value, 'database.primaryKey', ast, errors);
        break;
      case 'columns':
        validateNamedMappings(child, COLUMN_KEYS, ast, errors);
        break;
      case 'indexes':
        validateMappingSequence(child, INDEX_KEYS, ast, errors);
        break;
      case 'relations':
        validateNamedMappings(child, RELATION_KEYS, ast, errors);
        break;
    }
  }
}

function validateFixedMapping(
  entry: AstMappingEntry,
  keys: ReadonlySet<string>,
  ast: SchemaAst,
  errors: Diagnostic[],
): void {
  const mapping = expectMapping(entry.value, entry.key, ast, errors);
  if (!mapping) return;
  validateKnownKeys(mapping, keys, entry.key, ast, errors);
  for (const child of mapping.entries) {
    if (!keys.has(child.key)) continue;
    expectScalar(child.value, `${entry.key}.${child.key}`, ast, errors);
  }
}

function validateUi(
  entry: AstMappingEntry,
  ast: SchemaAst,
  errors: Diagnostic[],
): void {
  const mapping = expectMapping(entry.value, entry.key, ast, errors);
  if (!mapping) return;
  validateKnownKeys(mapping, UI_KEYS, entry.key, ast, errors);
  for (const section of mapping.entries) {
    if (!UI_KEYS.has(section.key)) continue;
    const allowed = section.key === 'list' ? UI_LIST_KEYS : UI_FORM_KEYS;
    const sectionMapping = expectMapping(
      section.value,
      `ui.${section.key}`,
      ast,
      errors,
    );
    if (!sectionMapping) continue;
    validateKnownKeys(
      sectionMapping,
      allowed,
      `ui.${section.key}`,
      ast,
      errors,
    );
    for (const property of sectionMapping.entries) {
      if (!allowed.has(property.key)) continue;
      validateScalarSequence(
        property.value,
        `ui.${section.key}.${property.key}`,
        ast,
        errors,
      );
    }
  }
}

function validatePermissions(
  entry: AstMappingEntry,
  ast: SchemaAst,
  errors: Diagnostic[],
): void {
  const mapping = expectMapping(entry.value, entry.key, ast, errors);
  if (!mapping) return;
  validateKnownKeys(mapping, PERMISSION_KEYS, entry.key, ast, errors);
  for (const permission of mapping.entries) {
    if (!PERMISSION_KEYS.has(permission.key)) continue;
    validateScalarSequence(
      permission.value,
      `permissions.${permission.key}`,
      ast,
      errors,
    );
  }
}

function validateNamedMappings(
  entry: AstMappingEntry,
  childKeys: ReadonlySet<string>,
  ast: SchemaAst,
  errors: Diagnostic[],
): void {
  const mapping = expectMapping(entry.value, entry.key, ast, errors);
  if (!mapping) return;
  for (const namedEntry of mapping.entries) {
    const path = `${entry.key}.${namedEntry.key}`;
    const child = expectMapping(namedEntry.value, path, ast, errors);
    if (!child) continue;
    validateKnownKeys(child, childKeys, path, ast, errors);
    for (const property of child.entries) {
      if (!childKeys.has(property.key)) continue;
      const propertyPath = `${path}.${property.key}`;
      if (property.key === 'values') {
        validateScalarSequence(property.value, propertyPath, ast, errors);
      } else {
        expectScalar(property.value, propertyPath, ast, errors);
      }
    }
  }
}

function validateMappingSequence(
  entry: AstMappingEntry,
  childKeys: ReadonlySet<string>,
  ast: SchemaAst,
  errors: Diagnostic[],
): void {
  const sequence = expectSequence(entry.value, entry.key, ast, errors);
  if (!sequence) return;
  sequence.items.forEach((item, index) => {
    const path = `${entry.key}[${index}]`;
    const mapping = expectMapping(item, path, ast, errors);
    if (!mapping) return;
    validateKnownKeys(mapping, childKeys, path, ast, errors);
    for (const property of mapping.entries) {
      if (!childKeys.has(property.key)) continue;
      const propertyPath = `${path}.${property.key}`;
      if (property.key === 'columns') {
        validateScalarSequence(property.value, propertyPath, ast, errors);
      } else {
        expectScalar(property.value, propertyPath, ast, errors);
      }
    }
  });
}

function validateScalarSequence(
  node: AstNode,
  path: string,
  ast: SchemaAst,
  errors: Diagnostic[],
): void {
  const sequence = expectSequence(node, path, ast, errors);
  if (!sequence) return;
  sequence.items.forEach((item, index) =>
    expectScalar(item, `${path}[${index}]`, ast, errors),
  );
}

function validateKnownKeys(
  mapping: AstMapping,
  allowed: ReadonlySet<string>,
  path: string,
  ast: SchemaAst,
  errors: Diagnostic[],
): void {
  for (const entry of mapping.entries) {
    if (!allowed.has(entry.key)) {
      errors.push({
        code: 'SCHEMA_KEY_UNKNOWN',
        phase: 'syntax',
        severity: 'error',
        message: `Unknown Schema key "${entry.key}" at ${path}.`,
        file: ast.source.id,
        range: entry.keyRange,
      });
    }
  }
}

function expectMapping(
  node: AstNode,
  path: string,
  ast: SchemaAst,
  errors: Diagnostic[],
): AstMapping | undefined {
  return expectKind(node, 'mapping', path, ast, errors) as
    AstMapping | undefined;
}

function expectSequence(
  node: AstNode,
  path: string,
  ast: SchemaAst,
  errors: Diagnostic[],
): AstSequence | undefined {
  return expectKind(node, 'sequence', path, ast, errors) as
    AstSequence | undefined;
}

function expectScalar(
  node: AstNode,
  path: string,
  ast: SchemaAst,
  errors: Diagnostic[],
): void {
  expectKind(node, 'scalar', path, ast, errors);
}

function expectKind(
  node: AstNode,
  kind: AstNode['kind'],
  path: string,
  ast: SchemaAst,
  errors: Diagnostic[],
): AstNode | undefined {
  if (node.kind === kind) return node;
  errors.push({
    code: 'SCHEMA_NODE_TYPE_INVALID',
    phase: 'syntax',
    severity: 'error',
    message: `Schema value at ${path} must be a ${kind}.`,
    file: ast.source.id,
    range: node.range,
  });
  return undefined;
}
