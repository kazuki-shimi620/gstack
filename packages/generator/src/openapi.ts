import type { ApplicationModel, Field, Model } from '@gstack/application';

import type { GeneratedArtifactInput } from './artifact.js';
import { typescriptTypeName } from './typescript.js';

export function generateOpenApiArtifact(
  application: ApplicationModel,
): GeneratedArtifactInput {
  const models = [...application.models].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const exposed = models.filter(({ api }) => api.resource !== null);
  const document = {
    openapi: '3.1.0',
    info: { title: application.name, version: '0.0.0' },
    paths: Object.fromEntries(exposed.flatMap(modelPaths)),
    components: {
      schemas: Object.fromEntries(
        models.map((model) => [
          typescriptTypeName(model.name),
          modelSchema(model),
        ]),
      ),
    },
  };
  return Object.freeze({
    path: 'generated/openapi/openapi.json',
    content: `${JSON.stringify(document, null, 2)}\n`,
  });
}

function modelPaths(model: Model): readonly [string, unknown][] {
  const resource = model.api.resource!;
  const schemaName = typescriptTypeName(model.name);
  const collection: Record<string, unknown> = {
    get: operation(`list${schemaName}`, '200', arrayResponse(schemaName)),
  };
  if (model.api.create) {
    collection.post = {
      ...operation(`create${schemaName}`, '201', schemaResponse(schemaName)),
      requestBody: requestBody(schemaName),
    };
  }
  const entries: [string, unknown][] = [[`/${resource}`, collection]];
  const item: Record<string, unknown> = {};
  if (model.api.update) {
    item.patch = {
      ...operation(`update${schemaName}`, '200', schemaResponse(schemaName)),
      requestBody: requestBody(schemaName),
    };
  }
  if (model.api.delete) {
    item.delete = operation(`delete${schemaName}`, '204', null);
  }
  if (Object.keys(item).length > 0) {
    entries.push([
      `/${resource}/{${model.primaryKey}}`,
      {
        parameters: [pathParameter(model)],
        ...item,
      },
    ]);
  }
  return entries;
}

function operation(
  operationId: string,
  status: string,
  schema: unknown,
): Record<string, unknown> {
  return {
    operationId,
    responses: {
      [status]: {
        description: status === '204' ? 'No Content' : 'Success',
        ...(schema === null
          ? {}
          : { content: { 'application/json': { schema } } }),
      },
    },
  };
}

function requestBody(schemaName: string) {
  return {
    required: true,
    content: { 'application/json': { schema: schemaResponse(schemaName) } },
  };
}

function schemaResponse(schemaName: string) {
  return { $ref: `#/components/schemas/${schemaName}` };
}

function arrayResponse(schemaName: string) {
  return { type: 'array', items: schemaResponse(schemaName) };
}

function pathParameter(model: Model) {
  const primaryKey = model.fields.find(({ name }) => name === model.primaryKey);
  return {
    name: model.primaryKey,
    in: 'path',
    required: true,
    schema: primaryKey ? fieldSchema(primaryKey) : { type: 'string' },
  };
}

function modelSchema(model: Model) {
  const fields = [...model.fields].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const required = fields
    .filter((field) => field.required)
    .map(({ name }) => name);
  return {
    type: 'object',
    properties: Object.fromEntries(
      fields.map((field) => [field.name, fieldSchema(field)]),
    ),
    ...(required.length === 0 ? {} : { required }),
  };
}

function fieldSchema(field: Field): Record<string, unknown> {
  const schema = baseFieldSchema(field);
  const validation = field.validation;
  return {
    ...schema,
    ...(field.type === 'enum' ? { enum: [...field.enumValues].sort() } : {}),
    ...(validation.minLength === null
      ? {}
      : { minLength: validation.minLength }),
    ...(validation.maxLength === null
      ? {}
      : { maxLength: validation.maxLength }),
    ...(validation.pattern === null ? {} : { pattern: validation.pattern }),
    ...(validation.min === null ? {} : { minimum: validation.min }),
    ...(validation.max === null ? {} : { maximum: validation.max }),
  };
}

function baseFieldSchema(field: Field): Record<string, unknown> {
  switch (field.type) {
    case 'integer':
      return { type: 'integer' };
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'json':
      return {};
    case 'uuid':
      return { type: 'string', format: 'uuid' };
    case 'date':
      return { type: 'string', format: 'date' };
    case 'datetime':
      return { type: 'string', format: 'date-time' };
    case 'string':
    case 'text':
    case 'enum':
      return { type: 'string' };
  }
}
