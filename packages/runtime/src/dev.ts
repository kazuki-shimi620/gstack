import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';

import type { GstackProject } from '@gstack/core';

const MAX_BODY_BYTES = 1_048_576;

export interface StandardDevServer {
  readonly url: string;
  close(): Promise<void>;
}

export async function startStandardDevServer(input: {
  readonly project: GstackProject;
  readonly host?: '127.0.0.1' | '::1';
  readonly port?: number;
}): Promise<StandardDevServer> {
  const application = await input.project.getApplicationModel();
  if (!application)
    throw new TypeError('Local Development requires a valid Schema.');
  const host = input.host ?? '127.0.0.1';
  const port = input.port ?? 3000;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError('Local Development port is invalid.');
  }
  const models = new Map(
    application.models
      .filter(({ api }) => api.resource !== null)
      .map((model) => [model.api.resource!, model]),
  );
  const records = new Map<
    string,
    Map<string, Readonly<Record<string, unknown>>>
  >();
  const server = createServer((request, response) => {
    void handle(request, response, models, records);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new TypeError('Local Development address is invalid.');
  }
  const displayHost =
    address.family === 'IPv6' ? `[${address.address}]` : address.address;
  return Object.freeze({
    url: `http://${displayHost}:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  });
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  models: Map<string, Model>,
  stores: Map<string, Map<string, Readonly<Record<string, unknown>>>>,
): Promise<void> {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const parts = url.pathname
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent);
    const model = parts[0] ? models.get(parts[0]) : undefined;
    if (!model) return json(response, 404, failure('RESOURCE_NOT_FOUND'));
    const store = stores.get(model.name) ?? new Map();
    stores.set(model.name, store);
    if (request.method === 'GET' && parts.length === 1) {
      return json(response, 200, { ok: true, data: [...store.values()] });
    }
    if (request.method === 'POST' && parts.length === 1 && model.api.create) {
      const record = validateDevRecord(model, await body(request), false);
      const key = String(record[model.primaryKey]);
      if (store.has(key) || hasDevDuplicate(model, store, record, null)) {
        return json(response, 409, failure('RECORD_CONFLICT'));
      }
      store.set(key, record);
      return json(response, 201, { ok: true, data: record });
    }
    if (request.method === 'PATCH' && parts.length === 2 && model.api.update) {
      const current = store.get(parts[1]!);
      if (!current) return json(response, 404, failure('RECORD_NOT_FOUND'));
      const changes = validateDevRecord(model, await body(request), true);
      if (
        Object.hasOwn(changes, model.primaryKey) &&
        String(changes[model.primaryKey]) !== parts[1]
      )
        return json(response, 400, failure('REQUEST_INVALID'));
      const updated = Object.freeze({ ...current, ...changes });
      if (hasDevDuplicate(model, store, updated, parts[1]!)) {
        return json(response, 409, failure('RECORD_CONFLICT'));
      }
      store.set(parts[1]!, updated);
      return json(response, 200, { ok: true, data: updated });
    }
    if (request.method === 'DELETE' && parts.length === 2 && model.api.delete) {
      if (!store.delete(parts[1]!)) {
        return json(response, 404, failure('RECORD_NOT_FOUND'));
      }
      return json(response, 200, { ok: true, data: null });
    }
    return json(response, 405, failure('OPERATION_NOT_ALLOWED'));
  } catch {
    return json(response, 400, failure('REQUEST_INVALID'));
  }
}

type Model = NonNullable<
  Awaited<ReturnType<GstackProject['getApplicationModel']>>
>['models'][number];

export function validateDevRecord(
  model: Model,
  value: unknown,
  partial: boolean,
): Readonly<Record<string, unknown>> {
  if (!record(value)) throw new TypeError('invalid');
  const fields = new Map(model.fields.map((field) => [field.name, field]));
  if (Object.keys(value).some((name) => !fields.has(name)))
    throw new TypeError('invalid');
  if (
    !partial &&
    model.fields.some(
      (field) => field.required && !Object.hasOwn(value, field.name),
    )
  ) {
    throw new TypeError('invalid');
  }
  for (const [name, child] of Object.entries(value)) {
    if (!validValue(fields.get(name)!, child)) throw new TypeError('invalid');
  }
  return Object.freeze({ ...value });
}

function validValue(field: Model['fields'][number], value: unknown): boolean {
  if (value === null || value === undefined) return !field.required;
  let valid = false;
  if (field.type === 'string' || field.type === 'text')
    valid = typeof value === 'string';
  if (field.type === 'uuid')
    valid =
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        value,
      );
  if (field.type === 'integer')
    valid = typeof value === 'number' && Number.isSafeInteger(value);
  if (field.type === 'number')
    valid = typeof value === 'number' && Number.isFinite(value);
  if (field.type === 'boolean') valid = typeof value === 'boolean';
  if (field.type === 'date')
    valid =
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
      !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  if (field.type === 'datetime')
    valid = typeof value === 'string' && !Number.isNaN(Date.parse(value));
  if (field.type === 'json') valid = true;
  if (field.type === 'enum')
    valid = typeof value === 'string' && field.enumValues.includes(value);
  if (!valid) return false;
  if (typeof value === 'string') {
    if (
      field.validation.minLength !== null &&
      value.length < field.validation.minLength
    )
      return false;
    if (
      field.validation.maxLength !== null &&
      value.length > field.validation.maxLength
    )
      return false;
    if (
      field.validation.pattern !== null &&
      !new RegExp(field.validation.pattern, 'u').test(value)
    )
      return false;
  }
  if (typeof value === 'number') {
    if (field.validation.min !== null && value < field.validation.min)
      return false;
    if (field.validation.max !== null && value > field.validation.max)
      return false;
  }
  return true;
}

export function hasDevDuplicate(
  model: Model,
  store: Map<string, Readonly<Record<string, unknown>>>,
  candidate: Readonly<Record<string, unknown>>,
  excludedKey: string | null,
): boolean {
  const unique = model.fields.filter(({ unique }) => unique);
  return [...store].some(
    ([key, existing]) =>
      key !== excludedKey &&
      unique.some(({ name }) =>
        candidate[name] === null || candidate[name] === ''
          ? false
          : String(existing[name]) === String(candidate[name]),
      ),
  );
}

async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new TypeError('too large');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function json(response: ServerResponse, status: number, value: unknown): void {
  const content = JSON.stringify(value);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(content),
    'cache-control': 'no-store',
  });
  response.end(content);
}

function failure(code: string) {
  return { ok: false, error: { code } };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
