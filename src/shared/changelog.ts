export type ChangelogLanguage = 'English' | 'Yue' | 'Both';
export type FunnyLevel = 1 | 2 | 3 | 4 | 5;

export interface ChangelogEntryInput {
  schemaVersion: 1;
  version: string;
  releaseDate: string;
  category: string;
  facts: Readonly<{ English: string; Yue: string }>;
  commitSha: string;
  forgeBaseUrl: string;
}

export interface ChangelogEntry extends ChangelogEntryInput {
  readonly commitUrl: string;
}

export type CommitExists = (commitSha: string) => boolean | Promise<boolean>;

export const CHANGELOG_SCHEMA_VERSION = 1 as const;

export const CHANGELOG_LIMITS = Object.freeze({
  maxEntries: 2_000,
  maxVersionLength: 64,
  maxCategoryLength: 80,
  maxFactLength: 4_096,
  maxForgeUrlLength: 512,
  maxSearchTextLength: 32_768,
  maxPatternLength: 256,
  maxMatches: 1_000,
  regexTimeBudgetMs: 25,
  maxVoiceDecorationLength: 160,
});

const FULL_SHA = /^[0-9a-f]{40}$/;
const VERSION = /^[0-9A-Za-z](?:[0-9A-Za-z._+-]{0,62}[0-9A-Za-z])?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function assertBoundedText(name: string, value: unknown, maximum: number): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum || value.trim() !== value) {
    throw new TypeError(`${name} must be a non-empty, trimmed string of at most ${maximum} characters.`);
  }
  if (/\p{Cc}/u.test(value)) throw new TypeError(`${name} must not contain control characters.`);
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  if (![year, month, day].every(Number.isSafeInteger)) return false;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function assertIsoDate(name: string, value: string): void {
  const match = ISO_DATE.exec(value);
  if (!match || !isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))) {
    throw new TypeError(`${name} must be a real calendar date in YYYY-MM-DD form.`);
  }
}

function normalizeForgeBaseUrl(value: string): string {
  assertBoundedText('forgeBaseUrl', value, CHANGELOG_LIMITS.maxForgeUrlLength);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError('forgeBaseUrl must be a valid HTTPS URL.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new TypeError('forgeBaseUrl must be a credential-free HTTPS URL without a query or fragment.');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed.toString().replace(/\/$/, '');
}

export async function validateChangelogEntries(
  inputs: readonly ChangelogEntryInput[],
  commitExists: CommitExists,
): Promise<readonly ChangelogEntry[]> {
  if (!Array.isArray(inputs) || inputs.length > CHANGELOG_LIMITS.maxEntries) {
    throw new RangeError(`entries must contain at most ${CHANGELOG_LIMITS.maxEntries} releases.`);
  }
  if (typeof commitExists !== 'function') throw new TypeError('commitExists must be a function.');

  const releaseKeys = new Set<string>();
  const validated: ChangelogEntry[] = [];
  for (const [index, input] of inputs.entries()) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError(`entries[${index}] must be an object.`);
    }
    const expected = ['schemaVersion', 'version', 'releaseDate', 'category', 'facts', 'commitSha', 'forgeBaseUrl'];
    const unknown = Object.keys(input).filter((key) => !expected.includes(key));
    if (unknown.length > 0) throw new TypeError(`entries[${index}] contains unexpected fields: ${unknown.join(', ')}.`);
    if (input.schemaVersion !== CHANGELOG_SCHEMA_VERSION) {
      throw new TypeError(`entries[${index}].schemaVersion must be ${CHANGELOG_SCHEMA_VERSION}.`);
    }
    assertBoundedText(`entries[${index}].version`, input.version, CHANGELOG_LIMITS.maxVersionLength);
    if (!VERSION.test(input.version)) throw new TypeError(`entries[${index}].version has an invalid format.`);
    assertIsoDate(`entries[${index}].releaseDate`, input.releaseDate);
    assertBoundedText(`entries[${index}].category`, input.category, CHANGELOG_LIMITS.maxCategoryLength);
    if (!input.facts || typeof input.facts !== 'object' || Array.isArray(input.facts)) {
      throw new TypeError(`entries[${index}].facts must contain exact English and Yue text.`);
    }
    const factKeys = Object.keys(input.facts);
    if (factKeys.length !== 2 || !factKeys.includes('English') || !factKeys.includes('Yue')) {
      throw new TypeError(`entries[${index}].facts must contain only English and Yue.`);
    }
    assertBoundedText(`entries[${index}].facts.English`, input.facts.English, CHANGELOG_LIMITS.maxFactLength);
    assertBoundedText(`entries[${index}].facts.Yue`, input.facts.Yue, CHANGELOG_LIMITS.maxFactLength);
    if (typeof input.commitSha !== 'string' || !FULL_SHA.test(input.commitSha)) {
      throw new TypeError(`entries[${index}].commitSha must be a full lowercase 40-character SHA.`);
    }
    const releaseKey = `${input.version}\u0000${input.category}`;
    if (releaseKeys.has(releaseKey)) throw new TypeError(`Duplicate release category: ${input.version} / ${input.category}.`);
    releaseKeys.add(releaseKey);
    if (!await commitExists(input.commitSha)) {
      throw new TypeError(`entries[${index}].commitSha does not exist in the local repository.`);
    }
    const forgeBaseUrl = normalizeForgeBaseUrl(input.forgeBaseUrl);
    validated.push(Object.freeze({
      schemaVersion: CHANGELOG_SCHEMA_VERSION,
      version: input.version,
      releaseDate: input.releaseDate,
      category: input.category,
      facts: Object.freeze({ English: input.facts.English, Yue: input.facts.Yue }),
      commitSha: input.commitSha,
      forgeBaseUrl,
      commitUrl: `${forgeBaseUrl}/commit/${input.commitSha}`,
    }));
  }
  return Object.freeze(validated);
}

export type TypedDateResult =
  | Readonly<{ status: 'empty' | 'partial'; input: string }>
  | Readonly<{ status: 'invalid'; input: string; reason: string }>
  | Readonly<{ status: 'valid'; input: string; isoDate: string }>;

function localeDateOrder(locale: string): readonly Intl.DateTimeFormatPartTypes[] {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC',
    }).formatToParts(new Date(Date.UTC(2006, 10, 22)));
    const order = parts
      .map((part) => part.type)
      .filter((part): part is Intl.DateTimeFormatPartTypes => ['year', 'month', 'day'].includes(part));
    if (order.length === 3 && new Set(order).size === 3) return order;
  } catch {
    // The explicit invalid result below is more useful than leaking an Intl exception.
  }
  return [];
}

export function parseTypedDate(input: string, locale: string): TypedDateResult {
  if (typeof input !== 'string') throw new TypeError('input must be a string.');
  if (typeof locale !== 'string' || locale.length === 0 || locale.length > 64) {
    throw new TypeError('locale must be a non-empty BCP 47 locale string.');
  }
  const value = input.trim();
  if (value.length === 0) return Object.freeze({ status: 'empty', input });
  if (value.length > 32) return Object.freeze({ status: 'invalid', input, reason: 'Date input is too long.' });

  const iso = ISO_DATE.exec(value);
  if (iso) {
    const [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    return isCalendarDate(year, month, day)
      ? Object.freeze({ status: 'valid', input, isoDate: value })
      : Object.freeze({ status: 'invalid', input, reason: 'The date does not exist.' });
  }
  if (/^\d{1,4}(?:[-/.]\d{0,2})?(?:[-/.]\d{0,4})?$/.test(value)
      && (value.split(/[-/.]/).length < 3 || /[-/.]$/.test(value))) {
    return Object.freeze({ status: 'partial', input });
  }

  const match = /^(\d{1,4})([-/.])(\d{1,2})\2(\d{1,4})$/.exec(value);
  const order = localeDateOrder(locale);
  if (!match || order.length !== 3) {
    return Object.freeze({ status: 'invalid', input, reason: 'Use YYYY-MM-DD or the selected locale numeric date format.' });
  }
  const values = [Number(match[1]), Number(match[3]), Number(match[4])];
  const mapped = Object.fromEntries(order.map((part, index) => [part, values[index]])) as Record<string, number>;
  if (String(mapped.year).length !== 4) {
    return Object.freeze({ status: 'partial', input });
  }
  if (!isCalendarDate(mapped.year, mapped.month, mapped.day)) {
    return Object.freeze({ status: 'invalid', input, reason: 'The date does not exist.' });
  }
  return Object.freeze({ status: 'valid', input, isoDate: toIsoDate(mapped.year, mapped.month, mapped.day) });
}

export interface CalendarPosition { readonly month: number; readonly year: number }
export interface DateRange { readonly start: string; readonly end: string }
export type DatePreset = 'all' | 'last-7-days' | 'last-30-days' | 'this-month' | 'this-year';

export function createCalendarPosition(year: number, month: number): CalendarPosition {
  if (!Number.isSafeInteger(year) || year < 1 || year > 9_999 || !Number.isSafeInteger(month) || month < 1 || month > 12) {
    throw new RangeError('Calendar position requires a year from 1 to 9999 and a month from 1 to 12.');
  }
  return Object.freeze({ year, month });
}

export function createDateRange(start: string, end: string): DateRange {
  assertIsoDate('start', start);
  assertIsoDate('end', end);
  if (start > end) throw new RangeError('Date range start must not be after its end.');
  return Object.freeze({ start, end });
}

function shiftUtcDays(isoDate: string, offset: number): string {
  const match = ISO_DATE.exec(isoDate)!;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + offset));
  return toIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function resolveDatePreset(preset: DatePreset, today: string): DateRange | undefined {
  assertIsoDate('today', today);
  if (preset === 'all') return undefined;
  if (preset === 'last-7-days') return createDateRange(shiftUtcDays(today, -6), today);
  if (preset === 'last-30-days') return createDateRange(shiftUtcDays(today, -29), today);
  if (preset === 'this-month') return createDateRange(`${today.slice(0, 7)}-01`, today);
  if (preset === 'this-year') return createDateRange(`${today.slice(0, 4)}-01-01`, today);
  throw new TypeError('Unknown date preset.');
}

export interface SafeRegexRequest {
  readonly pattern: string;
  readonly flags: string;
  readonly text: string;
  readonly maxMatches: number;
  readonly timeBudgetMs: number;
}

export interface SafeRegexEvaluation {
  readonly matched: boolean;
  readonly ranges: readonly Readonly<{ start: number; end: number }>[];
  readonly truncated: boolean;
}

export interface SafeRegexEvaluator {
  evaluate(request: SafeRegexRequest): SafeRegexEvaluation;
}

function normalizeRegexFlags(flags: string): string {
  if (typeof flags !== 'string' || !/^[gimsuy]*$/.test(flags) || new Set(flags).size !== flags.length) {
    throw new TypeError('Regex flags may contain each of g, i, m, s, u, and y at most once.');
  }
  return flags.includes('g') ? flags : `${flags}g`;
}

function rejectUnsafeNativePattern(pattern: string): void {
  if (/(\\[1-9]|\\k<|\(\?<[-=!])/.test(pattern)) {
    throw new TypeError('Backreferences and lookbehind are not accepted by the bounded native evaluator.');
  }
  if (/\((?!\?[:=!])[^()]*(?:[*+]|{\d+,?\d*\})[^()]*\)\s*(?:[*+]|{\d+,?\d*\})/.test(pattern)) {
    throw new TypeError('Nested or repeated quantifiers are not accepted by the bounded native evaluator.');
  }
}

export const boundedNativeRegexEvaluator: SafeRegexEvaluator = Object.freeze({
  evaluate(request: SafeRegexRequest): SafeRegexEvaluation {
    rejectUnsafeNativePattern(request.pattern);
    const expression = new RegExp(request.pattern, normalizeRegexFlags(request.flags));
    const ranges: Array<Readonly<{ start: number; end: number }>> = [];
    const startedAt = Date.now();
    let truncated = false;
    while (ranges.length < request.maxMatches) {
      if (Date.now() - startedAt > request.timeBudgetMs) throw new RangeError('Regex evaluation exceeded its time budget.');
      const match = expression.exec(request.text);
      if (!match) break;
      ranges.push(Object.freeze({ start: match.index, end: match.index + match[0].length }));
      if (match[0].length === 0) {
        if (expression.lastIndex >= request.text.length) break;
        const codePoint = request.text.codePointAt(expression.lastIndex);
        expression.lastIndex += codePoint !== undefined && codePoint > 0xffff ? 2 : 1;
      }
    }
    if (ranges.length === request.maxMatches) {
      const next = expression.exec(request.text);
      truncated = Boolean(next);
    }
    return Object.freeze({ matched: ranges.length > 0, ranges: Object.freeze(ranges), truncated });
  },
});

export type ChangelogSearch =
  | Readonly<{ mode: 'plain'; query: string }>
  | Readonly<{ mode: 'regex'; pattern: string; flags?: string }>;

export interface ChangelogFilter {
  readonly dateRange?: DateRange;
  readonly search?: ChangelogSearch;
  readonly regexEvaluator?: SafeRegexEvaluator;
}

function searchableText(entry: ChangelogEntry): string {
  return [entry.version, entry.releaseDate, entry.category, entry.facts.English, entry.facts.Yue, entry.commitSha].join('\n');
}

function validateEvaluation(value: SafeRegexEvaluation, textLength: number): SafeRegexEvaluation {
  if (!value || typeof value.matched !== 'boolean' || typeof value.truncated !== 'boolean' || !Array.isArray(value.ranges)) {
    throw new TypeError('Regex evaluator returned an invalid result.');
  }
  for (const range of value.ranges) {
    if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)
        || range.start < 0 || range.end < range.start || range.end > textLength) {
      throw new TypeError('Regex evaluator returned an invalid match range.');
    }
  }
  if (value.matched !== (value.ranges.length > 0)) throw new TypeError('Regex evaluator returned inconsistent match state.');
  return value;
}

export function filterChangelog(
  entries: readonly ChangelogEntry[],
  filter: ChangelogFilter = {},
): readonly ChangelogEntry[] {
  if (!Array.isArray(entries) || entries.length > CHANGELOG_LIMITS.maxEntries) {
    throw new RangeError(`entries must contain at most ${CHANGELOG_LIMITS.maxEntries} releases.`);
  }
  if (filter.dateRange) createDateRange(filter.dateRange.start, filter.dateRange.end);
  const output = entries.filter((entry) => {
    if (filter.dateRange && (entry.releaseDate < filter.dateRange.start || entry.releaseDate > filter.dateRange.end)) return false;
    if (!filter.search) return true;
    const text = searchableText(entry);
    if (text.length > CHANGELOG_LIMITS.maxSearchTextLength) throw new RangeError('Searchable release text exceeds its bound.');
    if (filter.search.mode === 'plain') {
      if (filter.search.query.length > CHANGELOG_LIMITS.maxPatternLength) throw new RangeError('Plain-text query is too long.');
      return text.toLocaleLowerCase().includes(filter.search.query.toLocaleLowerCase());
    }
    if (filter.search.pattern.length > CHANGELOG_LIMITS.maxPatternLength) throw new RangeError('Regex pattern is too long.');
    if (filter.search.pattern.length === 0) return true;
    const evaluator = filter.regexEvaluator;
    if (!evaluator || typeof evaluator.evaluate !== 'function') {
      throw new TypeError('Regex search requires an injected SafeRegexEvaluator.');
    }
    return validateEvaluation(evaluator.evaluate(Object.freeze({
      pattern: filter.search.pattern,
      flags: filter.search.flags ?? 'u',
      text,
      maxMatches: CHANGELOG_LIMITS.maxMatches,
      timeBudgetMs: CHANGELOG_LIMITS.regexTimeBudgetMs,
    })), text.length).matched;
  });
  return Object.freeze(output);
}

export interface ChangelogPresentation {
  readonly language: ChangelogLanguage;
  readonly englishFunnyLevel: FunnyLevel;
  readonly yueFunnyLevel: FunnyLevel;
  readonly voiceWrapper?: (request: Readonly<{
    language: Exclude<ChangelogLanguage, 'Both'>;
    funnyLevel: FunnyLevel;
    fact: string;
  }>) => Readonly<{ before?: string; after?: string }>;
}

function renderFact(
  entry: ChangelogEntry,
  language: 'English' | 'Yue',
  funnyLevel: FunnyLevel,
  wrapper?: ChangelogPresentation['voiceWrapper'],
): string {
  const fact = entry.facts[language];
  const decoration = wrapper?.(Object.freeze({ language, funnyLevel, fact })) ?? {};
  for (const [name, value] of Object.entries(decoration)) {
    if (value !== undefined && (typeof value !== 'string' || value.length > CHANGELOG_LIMITS.maxVoiceDecorationLength || /[\r\n]/.test(value))) {
      throw new TypeError(`Voice ${name} must be a single-line string of at most ${CHANGELOG_LIMITS.maxVoiceDecorationLength} characters.`);
    }
  }
  return `${decoration.before ?? ''}${fact}${decoration.after ?? ''}`;
}

export function renderChangelogFacts(entry: ChangelogEntry, presentation: ChangelogPresentation): readonly string[] {
  if (!['English', 'Yue', 'Both'].includes(presentation.language)) throw new TypeError('Unsupported changelog language.');
  for (const [name, level] of [['englishFunnyLevel', presentation.englishFunnyLevel], ['yueFunnyLevel', presentation.yueFunnyLevel]] as const) {
    if (!Number.isSafeInteger(level) || level < 1 || level > 5) throw new RangeError(`${name} must be from 1 to 5.`);
  }
  const lines = presentation.language === 'Both'
    ? [
      renderFact(entry, 'English', presentation.englishFunnyLevel, presentation.voiceWrapper),
      renderFact(entry, 'Yue', presentation.yueFunnyLevel, presentation.voiceWrapper),
    ]
    : [renderFact(
      entry,
      presentation.language,
      presentation.language === 'English' ? presentation.englishFunnyLevel : presentation.yueFunnyLevel,
      presentation.voiceWrapper,
    )];
  return Object.freeze(lines);
}

export const CHANGELOG_EMPTY_STATE = Object.freeze({
  English: 'No changelog entries match these filters. Try clearing the search or widening the date range.',
  Yue: '冇更新記錄符合呢啲篩選。試吓清除搜尋，或者放寬日期範圍。',
});

function markdownText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/([`*_{}\[\]<>])/g, '\\$1').replace(/\r?\n/g, '<br>');
}

export interface ChangelogMarkdownExport {
  readonly markdown: string;
  readonly entries: readonly ChangelogEntry[];
  readonly rangeLabel: string;
}

export function exportFilteredChangelogMarkdown(
  entries: readonly ChangelogEntry[],
  filter: ChangelogFilter,
  presentation: ChangelogPresentation,
): ChangelogMarkdownExport {
  const filtered = filterChangelog(entries, filter);
  const rangeLabel = filter.dateRange ? `${filter.dateRange.start} to ${filter.dateRange.end}` : 'All release dates';
  const lines = ['# Changelog', '', `Date range: ${rangeLabel}`, ''];
  if (filtered.length === 0) {
    const emptyLines = presentation.language === 'Both'
      ? [CHANGELOG_EMPTY_STATE.English, CHANGELOG_EMPTY_STATE.Yue]
      : [CHANGELOG_EMPTY_STATE[presentation.language]];
    lines.push(...emptyLines, '');
  } else {
    for (const entry of filtered) {
      lines.push(`## ${markdownText(entry.version)} - ${entry.releaseDate}`, '');
      lines.push(`### ${markdownText(entry.category)}`, '');
      for (const fact of renderChangelogFacts(entry, presentation)) lines.push(`- ${markdownText(fact)}`);
      lines.push(`- Commit: [\`${entry.commitSha}\`](${entry.commitUrl})`, '');
    }
  }
  return Object.freeze({ markdown: `${lines.join('\n').trimEnd()}\n`, entries: filtered, rangeLabel });
}
