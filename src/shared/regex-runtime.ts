import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';

export const REGEX_DIALECT = 'ECMAScript' as const;
export const REGEX_SUPPORTED_FLAGS = Object.freeze(['d', 'g', 'i', 'm', 's', 'u', 'v', 'y'] as const);

export const REGEX_LIMITS = Object.freeze({
  maxPatternCodeUnits: 512,
  maxQueryCodeUnits: 512,
  maxSampleCodeUnits: 65_536,
  maxMatches: 256,
  maxCapturesPerMatch: 32,
  maxBuilderNodes: 256,
  maxBuilderDepth: 24,
  defaultTimeoutMs: 75,
  maxTimeoutMs: 2_000,
});

export type RegexFlag = typeof REGEX_SUPPORTED_FLAGS[number];
export type RegexMode = 'plain' | 'regex';

export type RegexBuilderNode =
  | { readonly type: 'sequence'; readonly parts: readonly RegexBuilderNode[] }
  | { readonly type: 'literal'; readonly value: string }
  | { readonly type: 'character-class'; readonly value: string; readonly negated?: boolean }
  | { readonly type: 'anchor'; readonly kind: 'start' | 'end' | 'word-boundary' | 'non-word-boundary' }
  | { readonly type: 'group'; readonly child: RegexBuilderNode; readonly capturing?: boolean; readonly name?: string }
  | { readonly type: 'alternation'; readonly alternatives: readonly RegexBuilderNode[] }
  | {
    readonly type: 'quantifier';
    readonly child: RegexBuilderNode;
    readonly minimum: number;
    readonly maximum: number | null;
    readonly greedy?: boolean;
  }
  | { readonly type: 'raw'; readonly value: string };

export interface RegexValidation {
  readonly valid: boolean;
  readonly message: string | null;
}

export interface RegexSearchState {
  readonly mode: RegexMode;
  readonly query: string;
  readonly pattern: string;
  readonly flags: string;
  readonly validation: RegexValidation;
}

export interface RegexCapture {
  readonly number: number;
  readonly name: string | null;
  readonly text: string | null;
}

export interface RegexMatch {
  readonly index: number;
  readonly end: number;
  readonly text: string;
  readonly captures: readonly RegexCapture[];
}

export interface RegexEvaluationRequest {
  readonly generation: number;
  readonly mode: RegexMode;
  readonly query: string;
  readonly pattern: string;
  readonly flags: string;
  readonly sample: string;
  readonly maxMatches: number;
  readonly maxCapturesPerMatch: number;
}

export type RegexWorkerResponse =
  | { readonly status: 'ok'; readonly matches: readonly RegexMatch[]; readonly truncated: boolean }
  | { readonly status: 'invalid'; readonly message: string };

export type RegexEvaluationResult =
  | ({ readonly generation: number } & RegexWorkerResponse)
  | { readonly generation: number; readonly status: 'timed-out' | 'cancelled' | 'stale' }
  | { readonly generation: number; readonly status: 'failed'; readonly message: string };

export interface RegexEvaluationTicket {
  readonly generation: number;
  readonly completion: Promise<RegexEvaluationResult>;
  cancel(): boolean;
}

export interface RegexIsolatedEvaluator {
  evaluate(request: Readonly<RegexEvaluationRequest>, signal: AbortSignal): Promise<RegexWorkerResponse>;
}

export interface RegexRuntimeOptions {
  readonly evaluator?: RegexIsolatedEvaluator;
  readonly timeoutMs?: number;
  readonly maxMatches?: number;
  readonly maxCapturesPerMatch?: number;
}

export interface RegexExportDescriptor {
  readonly schemaVersion: 1;
  readonly dialect: typeof REGEX_DIALECT;
  readonly mode: RegexMode;
  readonly query: string;
  readonly pattern: string;
  readonly flags: string;
  readonly builder: RegexBuilderNode | null;
}

const FLAG_SET = new Set<string>(REGEX_SUPPORTED_FLAGS);
const WORKER_MARKER = 'material-winutil:bounded-regex-worker:v1';

function assertBoundedString(name: string, value: unknown, maximum: number): asserts value is string {
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string.`);
  if (value.length > maximum) throw new RangeError(`${name} exceeds the ${maximum} code-unit limit.`);
}

function assertBoundedInteger(name: string, value: number, minimum: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be a safe integer from ${minimum} to ${maximum}.`);
  }
}

export function normalizeRegexFlags(flags: string): string {
  assertBoundedString('flags', flags, REGEX_SUPPORTED_FLAGS.length);
  const unique = new Set<string>();
  for (const flag of flags) {
    if (!FLAG_SET.has(flag)) throw new TypeError(`Unsupported ECMAScript regular-expression flag: ${flag}.`);
    if (unique.has(flag)) throw new TypeError(`Duplicate ECMAScript regular-expression flag: ${flag}.`);
    unique.add(flag);
  }
  if (unique.has('u') && unique.has('v')) throw new TypeError('ECMAScript flags u and v cannot be combined.');
  return REGEX_SUPPORTED_FLAGS.filter((flag) => unique.has(flag)).join('');
}

export function escapeRegexLiteral(value: string): string {
  assertBoundedString('literal', value, REGEX_LIMITS.maxPatternCodeUnits);
  return value.replace(/[\\^$.*+?()[\]{}|/]/gu, '\\$&');
}

function escapeCharacterClass(value: string): string {
  return value.replace(/[\\\]\-^]/gu, '\\$&');
}

function nodeKeys(node: RegexBuilderNode): readonly string[] {
  switch (node.type) {
    case 'sequence': return ['type', 'parts'];
    case 'literal':
    case 'character-class':
    case 'raw': return node.type === 'character-class' ? ['type', 'value', 'negated'] : ['type', 'value'];
    case 'anchor': return ['type', 'kind'];
    case 'group': return ['type', 'child', 'capturing', 'name'];
    case 'alternation': return ['type', 'alternatives'];
    case 'quantifier': return ['type', 'child', 'minimum', 'maximum', 'greedy'];
  }
}

function assertPlainNode(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError('Builder nodes must be plain objects.');
  }
  for (const key of Object.keys(value)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      throw new TypeError('Builder nodes contain an unsafe key.');
    }
  }
}

function exactKeys(node: RegexBuilderNode): void {
  const allowed = new Set(nodeKeys(node));
  for (const key of Object.keys(node)) {
    if (!allowed.has(key)) throw new TypeError(`Unexpected builder field: ${key}.`);
  }
}

function compileNode(value: unknown, depth: number, counter: { count: number }): string {
  assertPlainNode(value);
  counter.count += 1;
  if (counter.count > REGEX_LIMITS.maxBuilderNodes) throw new RangeError('Builder node limit exceeded.');
  if (depth > REGEX_LIMITS.maxBuilderDepth) throw new RangeError('Builder depth limit exceeded.');
  if (typeof value.type !== 'string') throw new TypeError('Builder node type is required.');
  const node = value as unknown as RegexBuilderNode;
  exactKeys(node);
  switch (node.type) {
    case 'sequence':
      if (!Array.isArray(node.parts)) throw new TypeError('Sequence parts must be an array.');
      return node.parts.map((part) => compileNode(part, depth + 1, counter)).join('');
    case 'literal':
      assertBoundedString('literal', node.value, REGEX_LIMITS.maxPatternCodeUnits);
      return escapeRegexLiteral(node.value);
    case 'character-class':
      assertBoundedString('character class', node.value, REGEX_LIMITS.maxPatternCodeUnits);
      if (node.value.length === 0) throw new RangeError('Character classes cannot be empty.');
      if (node.negated !== undefined && typeof node.negated !== 'boolean') throw new TypeError('negated must be boolean.');
      return `[${node.negated ? '^' : ''}${escapeCharacterClass(node.value)}]`;
    case 'anchor': {
      const anchors = { start: '^', end: '$', 'word-boundary': '\\b', 'non-word-boundary': '\\B' } as const;
      if (!(node.kind in anchors)) throw new TypeError('Unsupported anchor kind.');
      return anchors[node.kind];
    }
    case 'group': {
      if (node.capturing !== undefined && typeof node.capturing !== 'boolean') throw new TypeError('capturing must be boolean.');
      if (node.name !== undefined && !/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(node.name)) {
        throw new TypeError('Group names must be 1 to 64 ECMAScript identifier-safe characters.');
      }
      if (node.name && node.capturing === false) throw new TypeError('Named groups must be capturing.');
      const body = compileNode(node.child, depth + 1, counter);
      return node.name ? `(?<${node.name}>${body})` : node.capturing === false ? `(?:${body})` : `(${body})`;
    }
    case 'alternation':
      if (!Array.isArray(node.alternatives) || node.alternatives.length < 2) {
        throw new RangeError('Alternation requires at least two alternatives.');
      }
      return `(?:${node.alternatives.map((part) => compileNode(part, depth + 1, counter)).join('|')})`;
    case 'quantifier': {
      assertBoundedInteger('quantifier minimum', node.minimum, 0, 10_000);
      if (node.maximum !== null) {
        assertBoundedInteger('quantifier maximum', node.maximum, node.minimum, 10_000);
      }
      if (node.greedy !== undefined && typeof node.greedy !== 'boolean') throw new TypeError('greedy must be boolean.');
      const body = compileNode(node.child, depth + 1, counter);
      const amount = node.maximum === null
        ? `{${node.minimum},}`
        : node.maximum === node.minimum
          ? `{${node.minimum}}`
          : `{${node.minimum},${node.maximum}}`;
      return `(?:${body})${amount}${node.greedy === false ? '?' : ''}`;
    }
    case 'raw':
      assertBoundedString('raw pattern', node.value, REGEX_LIMITS.maxPatternCodeUnits);
      return node.value;
    default:
      throw new TypeError(`Unsupported builder node type: ${String((node as { type?: unknown }).type)}.`);
  }
}

export function compileRegexBuilder(builder: RegexBuilderNode): string {
  const pattern = compileNode(builder, 1, { count: 0 });
  assertBoundedString('compiled pattern', pattern, REGEX_LIMITS.maxPatternCodeUnits);
  return pattern;
}

export function serializeRegexBuilder(builder: RegexBuilderNode): string {
  compileRegexBuilder(builder);
  return JSON.stringify(builder);
}

export function parseRegexBuilder(serialized: string): RegexBuilderNode {
  assertBoundedString('serialized builder', serialized, REGEX_LIMITS.maxPatternCodeUnits * 16);
  let parsed: unknown;
  try { parsed = JSON.parse(serialized); } catch { throw new TypeError('Builder JSON is malformed.'); }
  compileRegexBuilder(parsed as RegexBuilderNode);
  return deepFreeze(parsed as RegexBuilderNode);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function validateRegexPattern(pattern: string, flags: string): RegexValidation {
  try {
    assertBoundedString('pattern', pattern, REGEX_LIMITS.maxPatternCodeUnits);
    const normalized = normalizeRegexFlags(flags);
    void new RegExp(pattern, normalized);
    return Object.freeze({ valid: true, message: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The regular expression is invalid.';
    return Object.freeze({ valid: false, message });
  }
}

export function createRegexSearchState(initial: Partial<Omit<RegexSearchState, 'validation'>> = {}): RegexSearchState {
  const mode = initial.mode ?? 'plain';
  if (mode !== 'plain' && mode !== 'regex') throw new TypeError('mode must be plain or regex.');
  if (initial.query !== undefined && initial.pattern !== undefined && initial.query !== initial.pattern) {
    throw new TypeError('query and pattern must remain synchronized.');
  }
  const query = initial.query ?? initial.pattern ?? '';
  const pattern = initial.pattern ?? query;
  assertBoundedString('query', query, REGEX_LIMITS.maxQueryCodeUnits);
  assertBoundedString('pattern', pattern, REGEX_LIMITS.maxPatternCodeUnits);
  const flags = normalizeRegexFlags(initial.flags ?? 'iu');
  return Object.freeze({ mode, query, pattern, flags, validation: validateRegexPattern(pattern, flags) });
}

export class RegexSearchInstance {
  private state: RegexSearchState;

  constructor(initial: Partial<Omit<RegexSearchState, 'validation'>> = {}) {
    this.state = createRegexSearchState(initial);
  }

  snapshot(): RegexSearchState { return this.state; }

  setQuery(query: string): RegexSearchState {
    this.state = createRegexSearchState({ ...this.state, query, pattern: query });
    return this.state;
  }

  setPattern(pattern: string): RegexSearchState {
    this.state = createRegexSearchState({ ...this.state, query: pattern, pattern });
    return this.state;
  }

  setFlags(flags: string): RegexSearchState {
    this.state = createRegexSearchState({ ...this.state, flags });
    return this.state;
  }

  setMode(mode: RegexMode): RegexSearchState {
    this.state = createRegexSearchState({ ...this.state, mode });
    return this.state;
  }

  applyBuilder(builder: RegexBuilderNode): RegexSearchState {
    return this.setPattern(compileRegexBuilder(builder));
  }

  evaluate(runtime: RegexRuntime, sample: string): RegexEvaluationTicket {
    return runtime.evaluate(this.state, sample);
  }
}

function namedCaptureIndexes(source: string): Map<number, string> {
  const names = new Map<number, string>();
  let capture = 0;
  let inClass = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\\') { index += 1; continue; }
    if (character === '[') { inClass = true; continue; }
    if (character === ']' && inClass) { inClass = false; continue; }
    if (character !== '(' || inClass) continue;
    if (source[index + 1] !== '?') { capture += 1; continue; }
    if (source[index + 2] !== '<' || source[index + 3] === '=' || source[index + 3] === '!') continue;
    const end = source.indexOf('>', index + 3);
    if (end < 0) continue;
    capture += 1;
    names.set(capture, source.slice(index + 3, end));
  }
  return names;
}

function runEvaluation(request: Readonly<RegexEvaluationRequest>): RegexWorkerResponse {
  try {
    const source = request.mode === 'plain' ? escapeRegexLiteral(request.query) : request.pattern;
    const normalized = normalizeRegexFlags(request.flags);
    const executionFlags = normalizeRegexFlags(`${normalized.includes('d') ? normalized : `d${normalized}`}${normalized.includes('g') ? '' : 'g'}`);
    const expression = new RegExp(source, executionFlags);
    const names = namedCaptureIndexes(source);
    const matches: RegexMatch[] = [];
    let truncated = false;
    while (true) {
      const match = expression.exec(request.sample);
      if (!match) break;
      if (matches.length >= request.maxMatches) { truncated = true; break; }
      const count = match.length - 1;
      if (count > request.maxCapturesPerMatch) {
        return { status: 'invalid', message: `Capture count exceeds the ${request.maxCapturesPerMatch} limit.` };
      }
      matches.push(Object.freeze({
        index: match.index,
        end: match.index + match[0].length,
        text: match[0],
        captures: Object.freeze(Array.from({ length: count }, (_, offset) => Object.freeze({
          number: offset + 1,
          name: names.get(offset + 1) ?? null,
          text: match[offset + 1] ?? null,
        }))),
      }));
      if (match[0].length === 0) {
        if (expression.lastIndex >= request.sample.length) break;
        const first = request.sample.charCodeAt(expression.lastIndex);
        const second = request.sample.charCodeAt(expression.lastIndex + 1);
        const unicodeAware = executionFlags.includes('u') || executionFlags.includes('v');
        expression.lastIndex += unicodeAware && first >= 0xd800 && first <= 0xdbff
          && second >= 0xdc00 && second <= 0xdfff ? 2 : 1;
      }
    }
    return { status: 'ok', matches: Object.freeze(matches), truncated };
  } catch (error) {
    return { status: 'invalid', message: error instanceof Error ? error.message : 'The regular expression is invalid.' };
  }
}

if (!isMainThread && workerData?.marker === WORKER_MARKER) {
  const response = runEvaluation(workerData.request as RegexEvaluationRequest);
  parentPort?.postMessage(response);
}

export class NodeWorkerRegexEvaluator implements RegexIsolatedEvaluator {
  evaluate(request: Readonly<RegexEvaluationRequest>, signal: AbortSignal): Promise<RegexWorkerResponse> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
      const worker = new Worker(__filename, { workerData: { marker: WORKER_MARKER, request } });
      let settled = false;
      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', abort);
        callback();
      };
      const abort = (): void => finish(() => { void worker.terminate(); reject(new DOMException('Cancelled', 'AbortError')); });
      signal.addEventListener('abort', abort, { once: true });
      worker.once('message', (message: RegexWorkerResponse) => finish(() => { void worker.terminate(); resolve(message); }));
      worker.once('error', (error) => finish(() => reject(error)));
      worker.once('exit', (code) => {
        if (code !== 0) finish(() => reject(new Error(`Regex worker exited with code ${code}.`)));
      });
    });
  }
}

function validateEvaluationInput(state: RegexSearchState, sample: string): void {
  if (state.mode !== 'plain' && state.mode !== 'regex') throw new TypeError('mode must be plain or regex.');
  assertBoundedString('query', state.query, REGEX_LIMITS.maxQueryCodeUnits);
  assertBoundedString('pattern', state.pattern, REGEX_LIMITS.maxPatternCodeUnits);
  assertBoundedString('sample', sample, REGEX_LIMITS.maxSampleCodeUnits);
  normalizeRegexFlags(state.flags);
}

export class RegexRuntime {
  private readonly evaluator: RegexIsolatedEvaluator;
  private readonly timeoutMs: number;
  private readonly maxMatches: number;
  private readonly maxCapturesPerMatch: number;
  private generation = 0;
  private active?: { generation: number; controller: AbortController; settle: (result: RegexEvaluationResult) => void };

  constructor(options: RegexRuntimeOptions = {}) {
    this.evaluator = options.evaluator ?? new NodeWorkerRegexEvaluator();
    this.timeoutMs = options.timeoutMs ?? REGEX_LIMITS.defaultTimeoutMs;
    this.maxMatches = options.maxMatches ?? REGEX_LIMITS.maxMatches;
    this.maxCapturesPerMatch = options.maxCapturesPerMatch ?? REGEX_LIMITS.maxCapturesPerMatch;
    assertBoundedInteger('timeoutMs', this.timeoutMs, 1, REGEX_LIMITS.maxTimeoutMs);
    assertBoundedInteger('maxMatches', this.maxMatches, 1, REGEX_LIMITS.maxMatches);
    assertBoundedInteger('maxCapturesPerMatch', this.maxCapturesPerMatch, 0, REGEX_LIMITS.maxCapturesPerMatch);
  }

  evaluate(state: RegexSearchState, sample: string): RegexEvaluationTicket {
    validateEvaluationInput(state, sample);
    const generation = ++this.generation;
    if (this.active) {
      this.active.controller.abort();
      this.active.settle({ generation: this.active.generation, status: 'stale' });
    }
    const controller = new AbortController();
    let settled = false;
    let resolveCompletion!: (result: RegexEvaluationResult) => void;
    const completion = new Promise<RegexEvaluationResult>((resolve) => { resolveCompletion = resolve; });
    const settle = (result: RegexEvaluationResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (this.active?.generation === generation) this.active = undefined;
      resolveCompletion(result);
    };
    const timer = setTimeout(() => {
      controller.abort();
      settle({ generation, status: 'timed-out' });
    }, this.timeoutMs);
    this.active = { generation, controller, settle };
    const request: RegexEvaluationRequest = Object.freeze({
      generation, mode: state.mode, query: state.query, pattern: state.pattern, flags: state.flags, sample,
      maxMatches: this.maxMatches, maxCapturesPerMatch: this.maxCapturesPerMatch,
    });
    void this.evaluator.evaluate(request, controller.signal).then(
      (response) => settle(this.generation === generation
        ? { generation, ...response }
        : { generation, status: 'stale' }),
      () => settle(this.generation !== generation
        ? { generation, status: 'stale' }
        : controller.signal.aborted
          ? { generation, status: 'cancelled' }
          : { generation, status: 'failed', message: 'Regex evaluation failed safely.' }),
    );
    return {
      generation,
      completion,
      cancel: () => {
        if (settled) return false;
        controller.abort();
        settle({ generation, status: 'cancelled' });
        return true;
      },
    };
  }
}

export function createRegexExportDescriptor(
  state: RegexSearchState,
  builder: RegexBuilderNode | null = null,
): Readonly<RegexExportDescriptor> {
  validateEvaluationInput(state, '');
  const frozenBuilder = builder ? parseRegexBuilder(serializeRegexBuilder(builder)) : null;
  return Object.freeze({
    schemaVersion: 1,
    dialect: REGEX_DIALECT,
    mode: state.mode,
    query: state.query,
    pattern: state.pattern,
    flags: state.flags,
    builder: frozenBuilder,
  });
}

export function copyRegexDescriptor(descriptor: RegexExportDescriptor): string {
  return JSON.stringify(descriptor, null, 2);
}
