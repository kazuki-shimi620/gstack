import { describe, expect, expectTypeOf, it } from 'vitest';

import type { ApplicationModel, MetadataObject } from './index.js';

const emptyValidation = {
  minLength: null,
  maxLength: null,
  pattern: null,
  min: null,
  max: null,
} as const;

describe('ApplicationModel contract', () => {
  it('represents a normalized provider-independent application', () => {
    const application = {
      schemaVersion: 1,
      name: 'sample-app',
      models: [
        {
          name: 'users',
          displayName: 'User',
          description: null,
          primaryKey: 'id',
          fields: [
            {
              name: 'id',
              type: 'uuid',
              required: false,
              unique: false,
              enumValues: [],
              validation: emptyValidation,
            },
          ],
          indexes: [],
          relations: [],
          api: {
            resource: null,
            create: false,
            update: false,
            delete: false,
          },
          ui: { list: { columns: [] }, form: { fields: [] } },
          permissions: { read: [], create: [], update: [], delete: [] },
          workflow: { enabled: false },
          events: { enabled: false },
          metadata: { owner: 'team-a', nested: { active: true } },
          source: {
            sourceId: 'schema/users.yaml',
            range: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 10, column: 1, offset: 100 },
            },
          },
        },
      ],
      metadata: {},
    } satisfies ApplicationModel;

    expectTypeOf(application).toMatchTypeOf<ApplicationModel>();
    expect(application.models[0]?.api.create).toBe(false);
    expect(application.models[0]?.fields[0]?.enumValues).toEqual([]);
  });

  it('limits metadata to immutable YAML-compatible data', () => {
    const metadata = {
      string: 'value',
      number: 1,
      boolean: true,
      null: null,
      sequence: ['one', { nested: false }],
    } as const satisfies MetadataObject;

    expectTypeOf(metadata).toMatchTypeOf<MetadataObject>();
    expect(metadata.sequence).toHaveLength(2);
  });
});
