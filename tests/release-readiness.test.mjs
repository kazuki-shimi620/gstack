import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessPublishReadiness,
  PUBLISH_BLOCKER,
  resolvePublicationOrder,
} from '../scripts/release-readiness.mjs';

test('技術Gateと公開Gateを独立して判定する', () => {
  assert.deepEqual(
    assessPublishReadiness({
      diagnostics: [],
      version: '0.0.0',
      license: 'UNLICENSED',
    }),
    {
      ready: true,
      publishReady: false,
      publishBlockers: [
        PUBLISH_BLOCKER.versionPlaceholder,
        PUBLISH_BLOCKER.licenseUndecided,
      ],
    },
  );

  assert.deepEqual(
    assessPublishReadiness({
      diagnostics: [],
      version: '1.0.0',
      license: 'Apache-2.0',
    }),
    { ready: true, publishReady: true, publishBlockers: [] },
  );
});

test('技術診断をstable blocker codeへ変換する', () => {
  const result = assessPublishReadiness({
    diagnostics: ['package metadataが不正です。'],
    version: '1.0.0',
    license: 'MIT',
  });

  assert.equal(result.ready, false);
  assert.equal(result.publishReady, false);
  assert.deepEqual(result.publishBlockers, [
    PUBLISH_BLOCKER.technicalGateFailed,
  ]);
});

test('依存Packageを先にし、同順位はPackage名の辞書順にする', () => {
  const result = resolvePublicationOrder(
    new Map([
      ['@gstack/consumer', ['@gstack/base']],
      ['@gstack/z-independent', []],
      ['@gstack/base', []],
      ['@gstack/a-independent', []],
    ]),
  );

  assert.deepEqual(result, {
    publicationOrder: [
      '@gstack/a-independent',
      '@gstack/base',
      '@gstack/consumer',
      '@gstack/z-independent',
    ],
    cyclicPackages: [],
  });
});

test('循環依存時は部分的な公開順序を返さない', () => {
  const result = resolvePublicationOrder(
    new Map([
      ['@gstack/a', ['@gstack/b']],
      ['@gstack/b', ['@gstack/a']],
      ['@gstack/independent', []],
    ]),
  );

  assert.deepEqual(result, {
    publicationOrder: [],
    cyclicPackages: ['@gstack/a', '@gstack/b'],
  });
});
