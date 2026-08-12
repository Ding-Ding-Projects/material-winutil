import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHANGELOG_EMPTY_STATE,
  CHANGELOG_LIMITS,
  boundedNativeRegexEvaluator,
  createCalendarPosition,
  createDateRange,
  exportFilteredChangelogMarkdown,
  filterChangelog,
  parseTypedDate,
  renderChangelogFacts,
  resolveDatePreset,
  validateChangelogEntries,
} from '../../dist/shared/changelog.js';

const SHA_ONE = '1111111111111111111111111111111111111111';
const SHA_TWO = '2222222222222222222222222222222222222222';
const knownCommits = new Set([SHA_ONE, SHA_TWO]);
const commitExists = (sha) => knownCommits.has(sha);

const input = (overrides = {}) => ({
  schemaVersion: 1,
  version: 'v1.2.3',
  releaseDate: '2026-08-12',
  category: 'Changed',
  facts: {
    English: 'The package catalogue now preserves exact selections.',
    Yue: '套件目錄而家會準確保留所選項目。',
  },
  commitSha: SHA_ONE,
  forgeBaseUrl: 'https://github.com/example/material-winutil',
  ...overrides,
});

test('validates the bounded versioned entry schema and derives an exact commit link', async () => {
  const [entry] = await validateChangelogEntries([input()], commitExists);
  assert.equal(entry.schemaVersion, 1);
  assert.equal(entry.commitUrl, `https://github.com/example/material-winutil/commit/${SHA_ONE}`);
  assert.equal(Object.isFrozen(entry), true);
  assert.equal(Object.isFrozen(entry.facts), true);
  assert.deepEqual(await validateChangelogEntries([], commitExists), []);
  await assert.rejects(
    validateChangelogEntries(Array.from({ length: CHANGELOG_LIMITS.maxEntries + 1 }, () => input()), commitExists),
    /at most/,
  );
  await assert.rejects(validateChangelogEntries([input({ schemaVersion: 2 })], commitExists), /schemaVersion/);
  await assert.rejects(validateChangelogEntries([input({ extra: true })], commitExists), /unexpected fields/);
});

test('rejects abbreviated, malformed, uppercase, and locally dead commit SHAs', async () => {
  for (const commitSha of ['1234abcd', 'z'.repeat(40), 'A'.repeat(40), `${SHA_ONE}0`]) {
    await assert.rejects(validateChangelogEntries([input({ commitSha })], commitExists), /full lowercase 40-character SHA/);
  }
  await assert.rejects(
    validateChangelogEntries([input({ commitSha: '3333333333333333333333333333333333333333' })], commitExists),
    /does not exist in the local repository/,
  );
});

test('rejects invalid dates, URLs, missing bilingual facts, and duplicate release categories', async () => {
  await assert.rejects(validateChangelogEntries([input({ releaseDate: '2026-02-30' })], commitExists), /real calendar date/);
  await assert.rejects(validateChangelogEntries([input({ forgeBaseUrl: 'http://example.test/repo' })], commitExists), /HTTPS/);
  await assert.rejects(validateChangelogEntries([input({ facts: { English: 'Only one fact' } })], commitExists), /only English and Yue/);
  await assert.rejects(validateChangelogEntries([input(), input({ commitSha: SHA_TWO })], commitExists), /Duplicate/);
});

test('parses exact ISO and locale numeric dates while preserving partial and invalid states', () => {
  assert.deepEqual(parseTypedDate('2026-08-12', 'en-CA'), { status: 'valid', input: '2026-08-12', isoDate: '2026-08-12' });
  assert.deepEqual(parseTypedDate('8/12/2026', 'en-US'), { status: 'valid', input: '8/12/2026', isoDate: '2026-08-12' });
  assert.deepEqual(parseTypedDate('12/8/2026', 'en-GB'), { status: 'valid', input: '12/8/2026', isoDate: '2026-08-12' });
  assert.equal(parseTypedDate('2026-', 'en-CA').status, 'partial');
  assert.equal(parseTypedDate('12/8/26', 'en-GB').status, 'partial');
  assert.equal(parseTypedDate('2026-02-30', 'en-CA').status, 'invalid');
  assert.equal(parseTypedDate('not a date', 'en-US').status, 'invalid');
  assert.equal(parseTypedDate(' ', 'en-US').status, 'empty');
});

test('represents calendar navigation, ordered ranges, and deterministic named presets', () => {
  assert.deepEqual(createCalendarPosition(2026, 8), { year: 2026, month: 8 });
  assert.deepEqual(createDateRange('2026-08-01', '2026-08-12'), { start: '2026-08-01', end: '2026-08-12' });
  assert.throws(() => createDateRange('2026-08-13', '2026-08-12'), /must not be after/);
  assert.deepEqual(resolveDatePreset('last-7-days', '2026-08-12'), { start: '2026-08-06', end: '2026-08-12' });
  assert.deepEqual(resolveDatePreset('last-30-days', '2026-03-01'), { start: '2026-01-31', end: '2026-03-01' });
  assert.deepEqual(resolveDatePreset('this-month', '2026-08-12'), { start: '2026-08-01', end: '2026-08-12' });
  assert.deepEqual(resolveDatePreset('this-year', '2026-08-12'), { start: '2026-01-01', end: '2026-08-12' });
  assert.equal(resolveDatePreset('all', '2026-08-12'), undefined);
});

test('plain search and date range compose across all factual fields', async () => {
  const entries = await validateChangelogEntries([
    input(),
    input({
      version: 'v1.2.2', releaseDate: '2026-07-01', category: 'Fixed', commitSha: SHA_TWO,
      facts: { English: 'Fixed Unicode export.', Yue: '修正 Unicode 匯出。' },
    }),
  ], commitExists);
  const results = filterChangelog(entries, {
    dateRange: createDateRange('2026-08-01', '2026-08-31'),
    search: { mode: 'plain', query: 'PRESERVES EXACT' },
  });
  assert.deepEqual(results.map(({ version }) => version), ['v1.2.3']);
});

test('bounded regex search supports Unicode, multiline, and zero-width matches', async () => {
  const entries = await validateChangelogEntries([input()], commitExists);
  for (const search of [
    { mode: 'regex', pattern: '目錄.*所選', flags: 'su' },
    { mode: 'regex', pattern: '^Changed$', flags: 'mu' },
    { mode: 'regex', pattern: '(?=package)', flags: 'u' },
  ]) {
    assert.equal(filterChangelog(entries, { search, regexEvaluator: boundedNativeRegexEvaluator }).length, 1);
  }
  const zeroWidth = boundedNativeRegexEvaluator.evaluate({
    pattern: '(?=.)', flags: 'gu', text: 'A😀', maxMatches: 10, timeBudgetMs: 25,
  });
  assert.deepEqual(zeroWidth.ranges, [{ start: 0, end: 0 }, { start: 1, end: 1 }]);
});

test('regex search requires a safe injected evaluator and enforces adversarial bounds', async () => {
  const entries = await validateChangelogEntries([input()], commitExists);
  assert.throws(() => filterChangelog(entries, { search: { mode: 'regex', pattern: 'package' } }), /injected/);
  assert.throws(() => filterChangelog(entries, {
    search: { mode: 'regex', pattern: 'x'.repeat(CHANGELOG_LIMITS.maxPatternLength + 1) },
    regexEvaluator: boundedNativeRegexEvaluator,
  }), /too long/);
  assert.throws(() => filterChangelog(entries, {
    search: { mode: 'regex', pattern: '(a+)+$' },
    regexEvaluator: boundedNativeRegexEvaluator,
  }), /Nested or repeated quantifiers/);

  let request;
  const injected = {
    evaluate(value) {
      request = value;
      return { matched: false, ranges: [], truncated: false };
    },
  };
  filterChangelog(entries, { search: { mode: 'regex', pattern: 'never' }, regexEvaluator: injected });
  assert.equal(request.maxMatches, CHANGELOG_LIMITS.maxMatches);
  assert.equal(request.timeBudgetMs, CHANGELOG_LIMITS.regexTimeBudgetMs);
  assert.ok(request.text.length <= CHANGELOG_LIMITS.maxSearchTextLength);
});

test('Markdown copy/export contains only the composed filtered view, its exact range, and full SHA', async () => {
  const entries = await validateChangelogEntries([
    input(),
    input({
      version: 'v1.2.2', releaseDate: '2026-07-01', category: 'Fixed', commitSha: SHA_TWO,
      facts: { English: 'Fixed old export.', Yue: '修正舊匯出。' },
    }),
  ], commitExists);
  const result = exportFilteredChangelogMarkdown(entries, {
    dateRange: createDateRange('2026-08-01', '2026-08-31'),
    search: { mode: 'plain', query: 'catalogue' },
  }, { language: 'Both', englishFunnyLevel: 1, yueFunnyLevel: 1 });
  assert.equal(result.rangeLabel, '2026-08-01 to 2026-08-31');
  assert.deepEqual(result.entries.map(({ version }) => version), ['v1.2.3']);
  assert.match(result.markdown, /Date range: 2026-08-01 to 2026-08-31/);
  assert.match(result.markdown, new RegExp(SHA_ONE));
  assert.match(result.markdown, /The package catalogue now preserves exact selections/);
  assert.match(result.markdown, /套件目錄而家會準確保留所選項目/);
  assert.doesNotMatch(result.markdown, /v1\.2\.2|Fixed old export/);
});

test('language and funny-level wrappers can style voice but cannot replace factual fields', async () => {
  const [entry] = await validateChangelogEntries([input()], commitExists);
  for (const language of ['English', 'Yue', 'Both']) {
    for (const level of [1, 5]) {
      const lines = renderChangelogFacts(entry, {
        language,
        englishFunnyLevel: level,
        yueFunnyLevel: level,
        voiceWrapper: ({ funnyLevel }) => ({ before: `[level ${funnyLevel}] `, after: ' !' }),
      });
      if (language !== 'Yue') assert.ok(lines.some((line) => line.includes(entry.facts.English)));
      if (language !== 'English') assert.ok(lines.some((line) => line.includes(entry.facts.Yue)));
      assert.equal(entry.version, 'v1.2.3');
      assert.equal(entry.releaseDate, '2026-08-12');
      assert.equal(entry.commitSha, SHA_ONE);
    }
  }
});

test('empty filtered export gives a useful localized recovery state without inventing entries', async () => {
  const entries = await validateChangelogEntries([input()], commitExists);
  const result = exportFilteredChangelogMarkdown(entries, { search: { mode: 'plain', query: 'absent' } }, {
    language: 'Both', englishFunnyLevel: 5, yueFunnyLevel: 5,
  });
  assert.deepEqual(result.entries, []);
  assert.match(result.markdown, new RegExp(CHANGELOG_EMPTY_STATE.English.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(result.markdown, new RegExp(CHANGELOG_EMPTY_STATE.Yue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(result.markdown, /v1\.2\.3/);
});
