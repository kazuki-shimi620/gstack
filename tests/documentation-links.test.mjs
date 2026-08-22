import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  findMarkdownLinks,
  validateDocumentationLinks,
} from '../scripts/documentation-links.mjs';

test('外部link、anchor、code blockを除外してMarkdown linkを抽出する', () => {
  assert.deepEqual(
    findMarkdownLinks(`
[local](docs/guide.md)
[external](https://example.com/guide)
[anchor](#section)
![image](missing.png)
\`\`\`
[code](missing.md)
\`\`\`
`),
    ['docs/guide.md', 'https://example.com/guide', '#section'],
  );
});

test('存在しない参照先とRepository外参照を診断する', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'gstack-doc-links-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(root, 'README.md'), '[guide](docs/guide.md)\n');
  writeFileSync(
    path.join(root, 'docs/guide.md'),
    '[home](../README.md)\n[missing](missing.md)\n[outside](../../outside.md)\n',
  );

  assert.deepEqual(validateDocumentationLinks(root), [
    'docs/guide.md: missing.md: 参照先が存在しません',
    'docs/guide.md: ../../outside.md: Repository外を参照しています',
  ]);
});
