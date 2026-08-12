import assert from 'node:assert/strict';
import test from 'node:test';

const regex = await import('../../dist/shared/regex-runtime.js');

async function evaluate(initial, sample, options) {
  const state = regex.createRegexSearchState(initial);
  return await new regex.RegexRuntime(options).evaluate(state, sample).completion;
}

test('declares the ECMAScript dialect, supported flags, and plain-text default', () => {
  assert.equal(regex.REGEX_DIALECT, 'ECMAScript');
  assert.deepEqual([...regex.REGEX_SUPPORTED_FLAGS], ['d', 'g', 'i', 'm', 's', 'u', 'v', 'y']);
  assert.deepEqual(regex.createRegexSearchState(), {
    mode: 'plain', query: '', pattern: '', flags: 'iu', validation: { valid: true, message: null },
  });
  assert.throws(() => regex.normalizeRegexFlags('ii'), /duplicate/i);
  assert.throws(() => regex.normalizeRegexFlags('x'), /unsupported/i);
  assert.throws(() => regex.normalizeRegexFlags('uv'), /cannot be combined/i);
});

test('builder covers guided constructs plus raw and round-trips exactly', () => {
  const builder = {
    type: 'sequence',
    parts: [
      { type: 'anchor', kind: 'start' },
      { type: 'group', name: 'word', child: { type: 'quantifier', child: { type: 'character-class', value: 'a-z' }, minimum: 1, maximum: null } },
      { type: 'alternation', alternatives: [{ type: 'literal', value: '.' }, { type: 'raw', value: '\\d{2}' }] },
      { type: 'group', capturing: false, child: { type: 'literal', value: 'end' } },
      { type: 'anchor', kind: 'end' },
    ],
  };
  const pattern = regex.compileRegexBuilder(builder);
  assert.equal(pattern, '^(?<word>(?:[a\\-z]){1,})(?:\\.|\\d{2})(?:end)$');
  const restored = regex.parseRegexBuilder(regex.serializeRegexBuilder(builder));
  assert.deepEqual(restored, builder);
  assert.equal(Object.isFrozen(restored), true);
  assert.equal(Object.isFrozen(restored.parts), true);
  assert.equal(Object.isFrozen(restored.parts[2].alternatives), true);
  assert.equal(regex.compileRegexBuilder(restored), pattern);
});

test('independent search instances synchronize query, pattern, flags, mode, and validation', () => {
  const first = new regex.RegexSearchInstance();
  const second = new regex.RegexSearchInstance();
  first.setMode('regex');
  first.setPattern('(?<value>a+)');
  first.setFlags('gim');
  assert.deepEqual(first.snapshot(), {
    mode: 'regex', query: '(?<value>a+)', pattern: '(?<value>a+)', flags: 'gim', validation: { valid: true, message: null },
  });
  assert.equal(second.snapshot().mode, 'plain');
  assert.equal(second.snapshot().query, '');
  first.setQuery('[');
  assert.equal(first.snapshot().pattern, '[');
  assert.equal(first.snapshot().validation.valid, false);
  assert.throws(() => regex.createRegexSearchState({ query: 'alpha', pattern: 'beta' }), /synchronized/i);
});

test('evaluates valid, no-match, Unicode, multiline, and capture cases', async () => {
  const result = await evaluate(
    { mode: 'regex', pattern: '^(?<animal>🐈|cat):(\\d+)$', flags: 'gmu' },
    '🐈:12\ncat:7\ndog:4',
  );
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.matches.map((match) => [match.index, match.text]), [[0, '🐈:12'], [6, 'cat:7']]);
  assert.deepEqual(result.matches[0].captures, [
    { number: 1, name: 'animal', text: '🐈' },
    { number: 2, name: null, text: '12' },
  ]);
  const none = await evaluate({ mode: 'regex', pattern: 'z+', flags: 'u' }, 'abc');
  assert.equal(none.status, 'ok');
  assert.deepEqual(none.matches, []);
});

test('invalid expressions return validation without throwing from the isolated worker', async () => {
  const state = regex.createRegexSearchState({ mode: 'regex', pattern: '[', flags: 'u' });
  assert.equal(state.validation.valid, false);
  const result = await new regex.RegexRuntime().evaluate(state, 'abc').completion;
  assert.equal(result.status, 'invalid');
  assert.match(result.message, /regular expression|unterminated|invalid/i);
});

test('plain and regex modes use different predicates while retaining synchronized text', async () => {
  const plain = await evaluate({ mode: 'plain', query: 'a.c', flags: 'iu' }, 'a.c abc');
  const expression = await evaluate({ mode: 'regex', pattern: 'a.c', flags: 'iu' }, 'a.c abc');
  assert.deepEqual(plain.matches.map((match) => match.text), ['a.c']);
  assert.deepEqual(expression.matches.map((match) => match.text), ['a.c', 'abc']);
});

test('zero-width matching always advances safely, including astral Unicode text', async () => {
  const result = await evaluate({ mode: 'regex', pattern: '(?=.)', flags: 'u' }, '🐈a');
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.matches.map((match) => match.index), [0, 2]);
  assert.deepEqual(result.matches.map((match) => match.text), ['', '']);
  const unicodeSets = await evaluate({ mode: 'regex', pattern: '(?=.)', flags: 'v' }, '🐈a');
  assert.equal(unicodeSets.status, 'ok');
  assert.deepEqual(unicodeSets.matches.map((match) => match.index), [0, 2]);
  assert.equal(unicodeSets.truncated, false);
});

test('named captures retain their actual number when nested captures share a span', async () => {
  const result = await evaluate({ mode: 'regex', pattern: '((?<named>a))', flags: 'u' }, 'a');
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.matches[0].captures, [
    { number: 1, name: null, text: 'a' },
    { number: 2, name: 'named', text: 'a' },
  ]);
});

test('hard timeout terminates catastrophic backtracking outside the caller thread', async () => {
  const started = Date.now();
  const result = await evaluate(
    { mode: 'regex', pattern: '^(a+)+$', flags: 'u' },
    `${'a'.repeat(32_000)}!`,
    { timeoutMs: 30 },
  );
  assert.equal(result.status, 'timed-out');
  assert.ok(Date.now() - started < 1_000, 'caller must remain responsive');
});

test('injected isolated evaluator supports explicit cancellation', async () => {
  const evaluator = {
    evaluate: (_request, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true });
    }),
  };
  const runtime = new regex.RegexRuntime({ evaluator, timeoutMs: 500 });
  const ticket = runtime.evaluate(regex.createRegexSearchState({ query: 'a' }), 'a');
  assert.equal(ticket.cancel(), true);
  assert.equal(ticket.cancel(), false);
  assert.deepEqual(await ticket.completion, { generation: 1, status: 'cancelled' });
});

test('the default worker can be cancelled while executing adversarial input', async () => {
  const runtime = new regex.RegexRuntime({ timeoutMs: 1_000 });
  const state = regex.createRegexSearchState({ mode: 'regex', pattern: '^(a+)+$', flags: 'u' });
  const ticket = runtime.evaluate(state, `${'a'.repeat(32_000)}!`);
  assert.equal(ticket.cancel(), true);
  assert.deepEqual(await ticket.completion, { generation: 1, status: 'cancelled' });
});

test('sticky evaluation preserves ECMAScript y semantics', async () => {
  const atStart = await evaluate({ mode: 'regex', pattern: 'a', flags: 'y' }, 'aa');
  assert.deepEqual(atStart.matches.map((match) => match.index), [0, 1]);
  const notAtStart = await evaluate({ mode: 'regex', pattern: 'a', flags: 'y' }, 'ba');
  assert.deepEqual(notAtStart.matches, []);
});

test('isolated evaluator failures are distinct from caller cancellation', async () => {
  const evaluator = { evaluate: async () => { throw new Error('worker broke'); } };
  const result = await evaluate({ query: 'a' }, 'a', { evaluator });
  assert.deepEqual(result, { generation: 1, status: 'failed', message: 'Regex evaluation failed safely.' });
});

test('new generations supersede stale work and cannot be overwritten by late results', async () => {
  const pending = [];
  const evaluator = { evaluate: (request) => new Promise((resolve) => pending.push({ request, resolve })) };
  const runtime = new regex.RegexRuntime({ evaluator, timeoutMs: 500 });
  const state = regex.createRegexSearchState({ mode: 'regex', pattern: 'a', flags: 'u' });
  const old = runtime.evaluate(state, 'a');
  const current = runtime.evaluate(state, 'a');
  assert.deepEqual(await old.completion, { generation: 1, status: 'stale' });
  pending[0].resolve({ status: 'ok', matches: [], truncated: false });
  pending[1].resolve({ status: 'ok', matches: [], truncated: false });
  assert.deepEqual(await current.completion, { generation: 2, status: 'ok', matches: [], truncated: false });
});

test('pattern, sample, match, capture, builder, and runtime bounds fail closed', async () => {
  assert.throws(() => regex.createRegexSearchState({ query: 'x'.repeat(regex.REGEX_LIMITS.maxQueryCodeUnits + 1) }), /limit/i);
  assert.throws(() => regex.createRegexSearchState({ pattern: 'x'.repeat(regex.REGEX_LIMITS.maxPatternCodeUnits + 1) }), /limit/i);
  const runtime = new regex.RegexRuntime({ maxMatches: 2 });
  assert.throws(() => runtime.evaluate(regex.createRegexSearchState({ query: 'a' }), 'x'.repeat(regex.REGEX_LIMITS.maxSampleCodeUnits + 1)), /limit/i);
  const truncated = await runtime.evaluate(regex.createRegexSearchState({ query: 'a' }), 'aaaa').completion;
  assert.equal(truncated.status, 'ok');
  assert.equal(truncated.matches.length, 2);
  assert.equal(truncated.truncated, true);
  const captures = await evaluate({ mode: 'regex', pattern: '(a)(b)', flags: 'u' }, 'ab', { maxCapturesPerMatch: 1 });
  assert.equal(captures.status, 'invalid');
  assert.match(captures.message, /capture count/i);
  let deep = { type: 'literal', value: 'x' };
  for (let index = 0; index <= regex.REGEX_LIMITS.maxBuilderDepth; index += 1) deep = { type: 'group', child: deep };
  assert.throws(() => regex.compileRegexBuilder(deep), /depth limit/i);
  assert.throws(() => new regex.RegexRuntime({ timeoutMs: regex.REGEX_LIMITS.maxTimeoutMs + 1 }), /timeoutMs/i);
});

test('copy and export descriptor is versioned, factual, and round-trippable', () => {
  const state = regex.createRegexSearchState({ mode: 'regex', pattern: 'cat+', flags: 'iu' });
  const builder = { type: 'quantifier', child: { type: 'literal', value: 'cat' }, minimum: 1, maximum: null };
  const descriptor = regex.createRegexExportDescriptor(state, builder);
  builder.child.value = 'mutated';
  assert.equal(Object.isFrozen(descriptor.builder), true);
  assert.equal(Object.isFrozen(descriptor.builder.child), true);
  assert.deepEqual(JSON.parse(regex.copyRegexDescriptor(descriptor)), descriptor);
  assert.deepEqual(descriptor, {
    schemaVersion: 1, dialect: 'ECMAScript', mode: 'regex', query: 'cat+', pattern: 'cat+', flags: 'iu',
    builder: { type: 'quantifier', child: { type: 'literal', value: 'cat' }, minimum: 1, maximum: null },
  });
});
