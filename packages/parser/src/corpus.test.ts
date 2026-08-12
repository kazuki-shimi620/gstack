import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { AstMapping, AstScalar } from './ast.js';
import { parseSchemaSource } from './parser.js';

const fixtureRoot = new URL('../../../tests/fixtures/schema/', import.meta.url);

function parseFixture(category: string, name: string) {
  const url = new URL(`${category}/${name}`, fixtureRoot);
  return parseSchemaSource({
    id: `${category}/${name}`,
    name: name.replace(/\.yaml$/, ''),
    path: url.pathname,
    content: readFileSync(url, 'utf8'),
  });
}

describe('YAML edge-case corpus', () => {
  it('preserves YAML 1.2 numeric, Unicode, null, and standard tag values', () => {
    const result = parseFixture('valid', 'yaml-edge-values.yaml');

    expect(result.errors).toEqual([]);
    const root = result.document?.ast.root as AstMapping;
    const metadata = root.entries.find((entry) => entry.key === 'metadata')
      ?.value as AstMapping;
    const values = Object.fromEntries(
      metadata.entries.map((entry) => [
        entry.key,
        (entry.value as AstScalar).value,
      ]),
    );
    expect(values).toEqual({
      japanese: '日本語',
      integer: 42,
      decimal: 1.5,
      boolean: true,
      nullValue: null,
      explicitlyTagged: '123',
    });
  });

  it.each([
    ['duplicate-key.yaml', 'SCHEMA_YAML_ERROR'],
    ['alias.yaml', 'SCHEMA_ALIAS_NOT_ALLOWED'],
    ['multiple-documents.yaml', 'SCHEMA_YAML_ERROR'],
    ['invalid-indentation.yaml', 'SCHEMA_YAML_ERROR'],
  ])('%sを構文errorとして固定する', (name, code) => {
    const result = parseFixture('syntax-invalid', name);

    expect(result.document).toBeUndefined();
    expect(result.errors.map((error) => error.code)).toContain(code);
  });

  it('nullの必須値をParserでは保持してSemantic Analyzerへ渡す', () => {
    const result = parseFixture('semantic-invalid', 'null-required-value.yaml');

    expect(result.errors).toEqual([]);
    expect(result.document).toBeDefined();
  });
});
