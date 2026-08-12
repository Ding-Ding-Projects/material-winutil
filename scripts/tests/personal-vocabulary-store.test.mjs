import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const { PersonalVocabularyStore } = await import('../../dist/main/personal-vocabulary-store.js');

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'material-winutil-vocabulary-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, store: new PersonalVocabularyStore(directory) };
}

test('starts empty, stores only canonical cache bytes, and survives a new store instance', async (t) => {
  const { directory, store } = await fixture(t);
  const empty = await store.load();
  assert.equal(empty.state, 'empty');
  assert.equal(empty.entryCount, 0);
  assert.deepEqual({ ...empty.mappings }, {});

  const source = new TextEncoder().encode('{"mappings":{"second label":"new label","first label":"other label"},"version":1}');
  const uploaded = await store.upload(source);
  assert.equal(uploaded.ok, true);
  assert.deepEqual(uploaded.vocabulary, {
    state: 'loaded', entryCount: 2,
    mappings: { 'first label': 'other label', 'second label': 'new label' },
  });

  const cache = await readFile(path.join(directory, 'personal-vocabulary.cache.json'), 'utf8');
  assert.equal(cache, '{"version":1,"mappings":{"first label":"other label","second label":"new label"}}');
  assert.doesNotMatch(cache, /sourcePath|fileName|lastModified/);
  assert.deepEqual(await new PersonalVocabularyStore(directory).load(), uploaded.vocabulary);
});

test('invalid replacement never partially applies and retains the previous valid cache', async (t) => {
  const { directory, store } = await fixture(t);
  const valid = new TextEncoder().encode('{"version":1,"mappings":{"old label":"new label"}}');
  assert.equal((await store.upload(valid)).ok, true);
  const before = await readFile(path.join(directory, 'personal-vocabulary.cache.json'), 'utf8');

  const malformed = await store.upload(new TextEncoder().encode('{"version":1,"mappings":{"old label":7}}'));
  assert.deepEqual(malformed, {
    ok: false, code: 'invalid-value', message: 'Personal vocabulary data is invalid.',
  });
  assert.equal(await readFile(path.join(directory, 'personal-vocabulary.cache.json'), 'utf8'), before);
  assert.equal((await store.load()).state, 'loaded');
});

test('corrupt cache fails closed without returning any mapping', async (t) => {
  const { directory, store } = await fixture(t);
  await writeFile(path.join(directory, 'personal-vocabulary.cache.json'), '{"version":1,"mappings":{"label":', 'utf8');
  const invalid = await store.load();
  assert.equal(invalid.state, 'invalid');
  assert.equal(invalid.entryCount, 0);
  assert.deepEqual({ ...invalid.mappings }, {});
});

test('clear purges the private cache and restores the empty state', async (t) => {
  const { directory, store } = await fixture(t);
  await store.upload(new TextEncoder().encode('{"version":1,"mappings":{"old":"new"}}'));
  const cleared = await store.clear();
  assert.equal(cleared.state, 'empty');
  assert.deepEqual({ ...cleared.mappings }, {});
  const restarted = await store.load();
  assert.equal(restarted.state, 'empty');
  assert.deepEqual({ ...restarted.mappings }, {});
  await assert.rejects(readFile(path.join(directory, 'personal-vocabulary.cache.json')), { code: 'ENOENT' });
});

test('store implementation has no network, history, logging, or export path', async () => {
  const source = await readFile(new URL('../../src/main/personal-vocabulary-store.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|https?:\/\/|net\.request|XMLHttpRequest/);
  assert.doesNotMatch(source, /console\.|history|exportView|sourcePath|fileName/);
});

test('serializes replace, clear, and restart-visible loads in invocation order', async (t) => {
  const { directory, store } = await fixture(t);
  const first = new TextEncoder().encode('{"version":1,"mappings":{"one":"first"}}');
  const second = new TextEncoder().encode('{"version":1,"mappings":{"one":"second"}}');
  const operations = [store.upload(first), store.clear(), store.upload(second)];
  const [, cleared, final] = await Promise.all(operations);
  assert.equal(cleared.state, 'empty');
  assert.equal(final.ok, true);
  const restarted = await new PersonalVocabularyStore(directory).load();
  assert.equal(restarted.state, 'loaded');
  assert.deepEqual({ ...restarted.mappings }, { one: 'second' });
});
