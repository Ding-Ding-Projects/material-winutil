import assert from 'node:assert/strict';
import test from 'node:test';

const vocabulary = await import(new URL('../../dist/shared/personal-vocabulary.js', import.meta.url));

const validPayload = JSON.stringify({
  version: 1,
  mappings: {
    'source phrase': 'replacement phrase',
    source: 'replacement',
  },
});

test('accepts a bounded complete payload and produces a deterministic private cache', () => {
  const result = vocabulary.validatePersonalVocabulary(validPayload);
  assert.equal(result.ok, true);
  assert.deepEqual({ ...result.document.mappings }, {
    'source phrase': 'replacement phrase',
    source: 'replacement',
  });
  assert.equal(result.canonicalCache, '{"version":1,"mappings":{"source":"replacement","source phrase":"replacement phrase"}}');
  assert.deepEqual(vocabulary.loadPersonalVocabularyCache(result.canonicalCache), result);
  assert.equal(vocabulary.serializePersonalVocabularyCache(result.document), result.canonicalCache);
});

test('rejects malformed JSON, duplicate keys, unsafe keys, and unexpected fields', () => {
  const cases = [
    ['{"version":1', 'invalid-json'],
    ['{"version":1,"version":1,"mappings":{}}', 'duplicate-key'],
    ['{"version":1,"mappings":{"source":"one","source":"two"}}', 'duplicate-key'],
    ['{"version":1,"mappings":{"__proto__":"replacement"}}', 'unsafe-key'],
    ['{"version":1,"mappings":{},"extra":true}', 'invalid-schema'],
    ['{"version":1,\u00a0"mappings":{}}', 'invalid-json'],
  ];
  for (const [payload, expectedCode] of cases) {
    const result = vocabulary.validatePersonalVocabulary(payload);
    assert.equal(result.ok, false);
    assert.equal(result.code, expectedCode);
    assert.equal(result.message, 'Personal vocabulary data is invalid.');
    assert.doesNotMatch(result.message, /source|replacement|proto/i);
  }
});

test('rejects unsupported schemas and non-string mapping values without partial application', () => {
  for (const payload of [
    '{"version":2,"mappings":{}}',
    '{"version":1,"mappings":[]}',
    '{"version":1,"mappings":{"source":7}}',
    '{"version":1,"mappings":{"source":{"nested":"value"}}}',
  ]) {
    const result = vocabulary.validatePersonalVocabulary(payload);
    assert.equal(result.ok, false);
    assert.ok(['invalid-schema', 'invalid-value'].includes(result.code));
  }
});

test('enforces byte, depth, entry, key, and value bounds', () => {
  const limits = vocabulary.PERSONAL_VOCABULARY_LIMITS;
  assert.equal(vocabulary.validatePersonalVocabulary(' '.repeat(limits.maxPayloadBytes + 1)).code, 'payload-too-large');
  const deep = `${'['.repeat(limits.maxDepth + 1)}null${']'.repeat(limits.maxDepth + 1)}`;
  assert.equal(vocabulary.validatePersonalVocabulary(deep).code, 'depth-limit');
  const entries = Object.fromEntries(Array.from({ length: limits.maxEntries + 1 }, (_, index) => [`key-${index}`, 'value']));
  assert.equal(vocabulary.validatePersonalVocabulary(JSON.stringify({ version: 1, mappings: entries })).code, 'too-many-entries');
  assert.equal(vocabulary.validatePersonalVocabulary(JSON.stringify({ version: 1, mappings: { ['k'.repeat(limits.maxKeyLength + 1)]: 'value' } })).code, 'invalid-key');
  assert.equal(vocabulary.validatePersonalVocabulary(JSON.stringify({ version: 1, mappings: { source: 'v'.repeat(limits.maxValueLength + 1) } })).code, 'invalid-value');
});

test('rejects invalid UTF-8 cache bytes', () => {
  const result = vocabulary.loadPersonalVocabularyCache(Uint8Array.from([0xc3, 0x28]));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid-encoding');
});

test('applies longest mappings once and lets callers preserve technical spans', () => {
  const validation = vocabulary.validatePersonalVocabulary(validPayload);
  assert.equal(validation.ok, true);
  const input = 'source phrase | source | `source`';
  const output = vocabulary.applyPersonalVocabulary(input, validation.document, {
    preserveMatch: (_match, start, end, completeInput) => completeInput[start - 1] === '`' && completeInput[end] === '`',
  });
  assert.equal(output, 'replacement phrase | replacement | `source`');
});

test('contains no network behavior or bundled vocabulary defaults', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) =>
    readFile(new URL('../../src/shared/personal-vocabulary.ts', import.meta.url), 'utf8'));
  assert.doesNotMatch(source, /\bfetch\s*\(|https?:\/\/|XMLHttpRequest|net\.request/);
  assert.doesNotMatch(source, /defaultMappings|sampleMappings|builtInMappings/);
});
