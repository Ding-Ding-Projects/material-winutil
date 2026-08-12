/**
 * Pure domain model for the local history manager.
 *
 * The module deliberately owns no credentials, filesystem, Git, or network I/O.
 * Callers inject authentication and append persistence, keeping credential material
 * and encrypted snapshot bodies outside the renderer-facing history catalogue.
 */

export const HISTORY_MANAGER_SCHEMA_VERSION = 1 as const;

export const HISTORY_MANAGER_LIMITS = Object.freeze({
  jsonBytes: 2 * 1024 * 1024,
  depth: 16,
  nodes: 25_000,
  revisions: 5_000,
  idLength: 96,
  actionLength: 64,
  labelLength: 160,
  metadataEntries: 64,
  metadataKeyLength: 64,
  metadataStringLength: 512,
  searchLength: 256,
  resultLimit: 500,
  bulkMutations: 500,
});

export type HistoryJson = null | boolean | number | string | HistoryJson[] | { [key: string]: HistoryJson };
export type HistoryAuthMethod = 'password' | 'pin' | 'totp';

export interface HistoryAuthRequest {
  readonly method: HistoryAuthMethod;
  /** Opaque reference understood only by the injected credential verifier. */
  readonly verifierReference: string;
  /** Ephemeral proof. It is forwarded to the verifier and is never retained. */
  readonly proof: string;
}

export interface HistoryAuthContext {
  readonly purpose: 'history-manager';
  readonly operation: HistoryOperation;
  readonly method: HistoryAuthMethod;
  readonly verifierReference: string;
  readonly proof: string;
}

export type HistoryVerifier = (context: HistoryAuthContext) => boolean | Promise<boolean>;
export type HistoryOperation = 'browse' | 'diff' | 'restore' | 'label' | 'prune' | 'export' | 'bulk';

export interface HistoryRevision {
  readonly id: string;
  readonly parentId: string | null;
  readonly stableRecordId: string;
  /** Stable authenticated-encryption context; it survives delete and restore. */
  readonly encryptionAad: string;
  readonly action: string;
  readonly recordedAt: string;
  readonly label?: string;
  readonly sourceRevisionId?: string;
  readonly metadata: Readonly<Record<string, HistoryJson>>;
  /** Redacted state only. Credential-bearing data belongs in separately encrypted storage. */
  readonly snapshot: HistoryJson;
}

export interface HistoryManagerDocument {
  readonly schemaVersion: typeof HISTORY_MANAGER_SCHEMA_VERSION;
  readonly revisions: readonly HistoryRevision[];
}

export interface HistoryRegexDescriptor {
  readonly source: string;
  readonly flags?: string;
}

export interface HistoryDateRange {
  readonly start?: string;
  readonly end?: string;
  readonly preset?: 'today' | 'last-7-days' | 'last-30-days' | 'this-month' | 'all-time';
}

export interface HistoryBrowseRequest {
  readonly query?: string;
  readonly regex?: HistoryRegexDescriptor;
  readonly actions?: readonly string[];
  readonly dateRange?: HistoryDateRange;
  readonly limit?: number;
}

export interface HistoryActionFilter {
  readonly action: string;
  readonly count: number;
  readonly selected: boolean;
}

export interface HistoryBrowseResult {
  readonly revisions: readonly HistoryRevisionSummary[];
  readonly actionFilters: readonly HistoryActionFilter[];
  readonly totalMatches: number;
}

export type HistoryRevisionSummary = Omit<HistoryRevision, 'snapshot'>;

export interface HistoryDiffEntry {
  readonly path: string;
  readonly kind: 'added' | 'removed' | 'changed';
  readonly before?: HistoryJson;
  readonly after?: HistoryJson;
}

export interface HistoryRetentionPolicy {
  readonly maximumRevisions?: number;
  readonly maximumAgeDays?: number;
  readonly keepLabeled?: boolean;
}

export interface HistoryRecoveryDescriptor {
  readonly visible: true;
  readonly kind: 'history-write-failed';
  readonly title: 'Version history was not recorded';
  readonly detail: string;
  readonly recoveryAction: 'open-history-manager';
  readonly retryable: true;
}

export interface HistoryMutationOutcome<T> {
  readonly value: T;
  readonly revision?: HistoryRevision;
  readonly recovery?: HistoryRecoveryDescriptor;
}

export interface HistoryExport {
  readonly schemaVersion: 1;
  readonly exportedAt: string;
  readonly revisions: readonly HistoryRevisionSummary[];
  readonly omissions: readonly ['snapshot contents', 'credentials and verifier proofs', 'encryption keys'];
}

export interface HistoryManagerOptions {
  readonly verify: HistoryVerifier;
  readonly append?: (revision: HistoryRevision) => void | Promise<void>;
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly initial?: HistoryManagerDocument;
}

export interface HistoryMutationInput {
  readonly action: string;
  readonly stableRecordId: string;
  readonly snapshot: HistoryJson;
  readonly metadata?: Readonly<Record<string, HistoryJson>>;
  readonly label?: string;
  readonly sourceRevisionId?: string;
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SENSITIVE_KEYS = new Set([
  'accesstoken', 'apikey', 'auth', 'authorization', 'credential', 'credentials', 'password',
  'passcode', 'pin', 'privatekey', 'proof', 'refreshtoken', 'secret', 'sessiontoken', 'token',
  'totp', 'otp', 'verifierreference', 'encryptionkey',
]);
const SECRET_VALUE = /(?:otpauth:\/\/|-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\bbearer\s+[a-z0-9._~+/-]+=*)/iu;
const ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,94}[A-Za-z0-9])?$/u;
const ACTION_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const ROOT_FIELDS = new Set(['schemaVersion', 'revisions']);
const REVISION_FIELDS = new Set([
  'id', 'parentId', 'stableRecordId', 'encryptionAad', 'action', 'recordedAt', 'label',
  'sourceRevisionId', 'metadata', 'snapshot',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function normalizedSensitiveKey(key: string): string {
  return key.replace(/[^a-z0-9]/giu, '').toLowerCase();
}

function assertExactFields(value: Record<string, unknown>, fields: ReadonlySet<string>, context: string): void {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) throw new Error(`${context} contains unexpected field ${key}`);
  }
}

function assertId(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || codePointLength(value) > HISTORY_MANAGER_LIMITS.idLength || !ID_PATTERN.test(value)) {
    throw new Error(`${context} must be a bounded stable identifier`);
  }
}

function assertAction(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || codePointLength(value) > HISTORY_MANAGER_LIMITS.actionLength || !ACTION_PATTERN.test(value)) {
    throw new Error(`${context} must be a bounded kebab-case action`);
  }
}

function calendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function assertIsoInstant(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/u.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${context} must be an ISO-8601 instant`);
  }
}

function cloneJson(value: HistoryJson): HistoryJson {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (value !== null && typeof value === 'object') {
    const result: Record<string, HistoryJson> = Object.create(null) as Record<string, HistoryJson>;
    for (const [key, item] of Object.entries(value)) result[key] = cloneJson(item);
    return result;
  }
  return value;
}

/** Reject unsafe keys and secret-looking values before anything enters history. */
export function assertRedactedHistoryValue(value: unknown): asserts value is HistoryJson {
  let nodes = 0;
  const visit = (candidate: unknown, depth: number, context: string): void => {
    nodes += 1;
    if (nodes > HISTORY_MANAGER_LIMITS.nodes) throw new Error('history value exceeds the node limit');
    if (depth > HISTORY_MANAGER_LIMITS.depth) throw new Error('history value exceeds the depth limit');
    if (candidate === null || typeof candidate === 'boolean') return;
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate)) throw new Error(`${context} must contain finite numbers`);
      return;
    }
    if (typeof candidate === 'string') {
      if (codePointLength(candidate) > HISTORY_MANAGER_LIMITS.metadataStringLength && context.includes('.metadata')) {
        throw new Error(`${context} exceeds the string length limit`);
      }
      if (SECRET_VALUE.test(candidate)) throw new Error(`${context} contains authentication secrets`);
      return;
    }
    if (Array.isArray(candidate)) {
      for (let index = 0; index < candidate.length; index += 1) visit(candidate[index], depth + 1, `${context}[${index}]`);
      return;
    }
    if (!isRecord(candidate)) throw new Error(`${context} must contain JSON values only`);
    for (const [key, item] of Object.entries(candidate)) {
      if (UNSAFE_KEYS.has(key)) throw new Error(`${context} contains unsafe key ${key}`);
      if (normalizedSensitiveKey(key) && SENSITIVE_KEYS.has(normalizedSensitiveKey(key))) {
        throw new Error(`${context} contains sensitive field ${key}`);
      }
      visit(item, depth + 1, `${context}.${key}`);
    }
  };
  visit(value, 0, 'history value');
}

export function createHistoryEncryptionAad(stableRecordId: string): string {
  assertId(stableRecordId, 'stableRecordId');
  return `material-winutil:history:v1:${stableRecordId}`;
}

function validateRevision(input: unknown, index: number): HistoryRevision {
  const context = `revisions[${index}]`;
  if (!isRecord(input)) throw new Error(`${context} must be an object`);
  assertExactFields(input, REVISION_FIELDS, context);
  assertId(input.id, `${context}.id`);
  if (input.parentId !== null) assertId(input.parentId, `${context}.parentId`);
  assertId(input.stableRecordId, `${context}.stableRecordId`);
  const expectedAad = createHistoryEncryptionAad(input.stableRecordId);
  if (input.encryptionAad !== expectedAad) throw new Error(`${context}.encryptionAad is not stable for its record`);
  assertAction(input.action, `${context}.action`);
  assertIsoInstant(input.recordedAt, `${context}.recordedAt`);
  if (input.label !== undefined && (typeof input.label !== 'string' || !input.label.trim() || codePointLength(input.label) > HISTORY_MANAGER_LIMITS.labelLength)) {
    throw new Error(`${context}.label must be a non-empty bounded string`);
  }
  if (input.sourceRevisionId !== undefined) assertId(input.sourceRevisionId, `${context}.sourceRevisionId`);
  if (!isRecord(input.metadata) || Object.keys(input.metadata).length > HISTORY_MANAGER_LIMITS.metadataEntries) {
    throw new Error(`${context}.metadata must be a bounded object`);
  }
  for (const key of Object.keys(input.metadata)) {
    if (!key || codePointLength(key) > HISTORY_MANAGER_LIMITS.metadataKeyLength) throw new Error(`${context}.metadata contains an invalid key`);
  }
  assertRedactedHistoryValue(input.metadata);
  assertRedactedHistoryValue(input.snapshot);
  return Object.freeze({
    id: input.id,
    parentId: input.parentId,
    stableRecordId: input.stableRecordId,
    encryptionAad: input.encryptionAad,
    action: input.action,
    recordedAt: input.recordedAt,
    ...(input.label === undefined ? {} : { label: input.label }),
    ...(input.sourceRevisionId === undefined ? {} : { sourceRevisionId: input.sourceRevisionId }),
    metadata: Object.freeze(cloneJson(input.metadata as HistoryJson) as Record<string, HistoryJson>),
    snapshot: cloneJson(input.snapshot as HistoryJson),
  });
}

class BoundedJsonParser {
  private offset = 0;
  private nodes = 0;
  constructor(private readonly source: string) {}

  parse(): unknown {
    this.skipWhitespace();
    const value = this.value(1);
    this.skipWhitespace();
    if (this.offset !== this.source.length) this.fail('malformed history JSON');
    return value;
  }

  private value(depth: number): unknown {
    this.nodes += 1;
    if (this.nodes > HISTORY_MANAGER_LIMITS.nodes) this.fail('history JSON exceeds the node limit');
    if (depth > HISTORY_MANAGER_LIMITS.depth) this.fail('history JSON exceeds the depth limit');
    const token = this.source[this.offset];
    if (token === '{') return this.object(depth);
    if (token === '[') return this.array(depth);
    if (token === '"') return this.string();
    if (token === '-' || (token !== undefined && token >= '0' && token <= '9')) return this.number();
    if (this.source.startsWith('true', this.offset)) return this.literal('true', true);
    if (this.source.startsWith('false', this.offset)) return this.literal('false', false);
    if (this.source.startsWith('null', this.offset)) return this.literal('null', null);
    return this.fail('malformed history JSON');
  }

  private object(depth: number): Record<string, unknown> {
    this.offset += 1;
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    const keys = new Set<string>();
    this.skipWhitespace();
    if (this.source[this.offset] === '}') { this.offset += 1; return result; }
    while (this.offset < this.source.length) {
      if (this.source[this.offset] !== '"') this.fail('malformed history JSON');
      const key = this.string();
      if (keys.has(key)) this.fail(`duplicate key ${key}`);
      if (UNSAFE_KEYS.has(key)) this.fail(`unsafe key ${key}`);
      keys.add(key);
      this.skipWhitespace();
      if (this.source[this.offset] !== ':') this.fail('malformed history JSON');
      this.offset += 1; this.skipWhitespace();
      result[key] = this.value(depth + 1);
      this.skipWhitespace();
      if (this.source[this.offset] === '}') { this.offset += 1; return result; }
      if (this.source[this.offset] !== ',') this.fail('malformed history JSON');
      this.offset += 1; this.skipWhitespace();
    }
    return this.fail('malformed history JSON');
  }

  private array(depth: number): unknown[] {
    this.offset += 1;
    const result: unknown[] = [];
    this.skipWhitespace();
    if (this.source[this.offset] === ']') { this.offset += 1; return result; }
    while (this.offset < this.source.length) {
      result.push(this.value(depth + 1));
      this.skipWhitespace();
      if (this.source[this.offset] === ']') { this.offset += 1; return result; }
      if (this.source[this.offset] !== ',') this.fail('malformed history JSON');
      this.offset += 1; this.skipWhitespace();
    }
    return this.fail('malformed history JSON');
  }

  private string(): string {
    const start = this.offset++;
    while (this.offset < this.source.length) {
      const character = this.source[this.offset];
      if (character === '"') {
        this.offset += 1;
        try { return JSON.parse(this.source.slice(start, this.offset)) as string; }
        catch { return this.fail('malformed history JSON'); }
      }
      if (character === '\\') {
        this.offset += 1;
        const escape = this.source[this.offset];
        if (escape === 'u') {
          if (!/^[0-9a-f]{4}$/iu.test(this.source.slice(this.offset + 1, this.offset + 5))) this.fail('malformed history JSON');
          this.offset += 5; continue;
        }
        if (escape === undefined || !'"\\/bfnrt'.includes(escape)) this.fail('malformed history JSON');
      } else if (character === undefined || character.charCodeAt(0) < 0x20) this.fail('malformed history JSON');
      this.offset += 1;
    }
    return this.fail('malformed history JSON');
  }

  private number(): number {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(this.source.slice(this.offset));
    if (!match) return this.fail('malformed history JSON');
    this.offset += match[0].length;
    const number = Number(match[0]);
    if (!Number.isFinite(number)) return this.fail('malformed history JSON');
    return number;
  }

  private literal<T>(token: string, value: T): T { this.offset += token.length; return value; }
  private skipWhitespace(): void { while (' \t\r\n'.includes(this.source[this.offset] ?? '\0')) this.offset += 1; }
  private fail(message: string): never { throw new Error(message); }
}

function decodeDocument(payload: string | Uint8Array): string {
  const bytes = typeof payload === 'string' ? new TextEncoder().encode(payload).byteLength : payload.byteLength;
  if (bytes > HISTORY_MANAGER_LIMITS.jsonBytes) throw new Error('history JSON exceeds the byte limit');
  if (typeof payload === 'string') return payload;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(payload); }
  catch { throw new Error('history JSON is not valid UTF-8'); }
}

export function validateHistoryManagerDocument(input: unknown): HistoryManagerDocument {
  if (!isRecord(input)) throw new Error('history document must be an object');
  assertExactFields(input, ROOT_FIELDS, 'history document');
  if (input.schemaVersion !== HISTORY_MANAGER_SCHEMA_VERSION) throw new Error('unsupported history schema version');
  if (!Array.isArray(input.revisions) || input.revisions.length > HISTORY_MANAGER_LIMITS.revisions) {
    throw new Error('history revisions must be a bounded array');
  }
  const revisions = input.revisions.map(validateRevision);
  const ids = new Set<string>();
  for (let index = 0; index < revisions.length; index += 1) {
    const revision = revisions[index];
    if (ids.has(revision.id)) throw new Error(`duplicate revision id ${revision.id}`);
    const expectedParent = index === 0 ? null : revisions[index - 1].id;
    if (revision.parentId !== expectedParent) throw new Error(`revision ${revision.id} breaks append-only ancestry`);
    if (revision.sourceRevisionId !== undefined && !ids.has(revision.sourceRevisionId)) {
      throw new Error(`revision ${revision.id} has an unknown source revision`);
    }
    ids.add(revision.id);
  }
  return Object.freeze({ schemaVersion: HISTORY_MANAGER_SCHEMA_VERSION, revisions: Object.freeze(revisions) });
}

export function parseHistoryManagerDocument(payload: string | Uint8Array): HistoryManagerDocument {
  return validateHistoryManagerDocument(new BoundedJsonParser(decodeDocument(payload)).parse());
}

export function serializeHistoryManagerDocument(document: HistoryManagerDocument): string {
  return JSON.stringify(validateHistoryManagerDocument(document));
}

function validateSearch(request: HistoryBrowseRequest): void {
  if (request.query !== undefined && codePointLength(request.query) > HISTORY_MANAGER_LIMITS.searchLength) {
    throw new Error('search query exceeds the length limit');
  }
  if (request.regex !== undefined) {
    if (codePointLength(request.regex.source) > HISTORY_MANAGER_LIMITS.searchLength) throw new Error('regex exceeds the length limit');
    const flags = request.regex.flags ?? 'iu';
    if (!/^(?!.*(.).*\1)[gimsuy]*$/u.test(flags)) throw new Error('regex flags are invalid or duplicated');
    if (/\\[1-9]|\(\?<([=!])|\([^)]*(?:[*+]\s*)\)[*+{]|(?:[*+?]|\{\d+(?:,\d*)?\})(?:[*+?]|\{)/u.test(request.regex.source)) {
      throw new Error('regex uses an unsafe construct');
    }
    try { new RegExp(request.regex.source, flags.replace('g', '')); }
    catch { throw new Error('regex is invalid'); }
  }
  if (request.limit !== undefined && (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > HISTORY_MANAGER_LIMITS.resultLimit)) {
    throw new Error(`limit must be between 1 and ${HISTORY_MANAGER_LIMITS.resultLimit}`);
  }
  if (request.actions !== undefined) for (const action of request.actions) assertAction(action, 'actions entry');
  const start = request.dateRange?.start;
  const end = request.dateRange?.end;
  if (start !== undefined && !calendarDate(start)) throw new Error('date range start is invalid');
  if (end !== undefined && !calendarDate(end)) throw new Error('date range end is invalid');
  if (start !== undefined && end !== undefined && start > end) throw new Error('date range start must not be after end');
}

export type HistoryDateInput =
  | { readonly state: 'empty'; readonly value: '' }
  | { readonly state: 'partial'; readonly value: string }
  | { readonly state: 'invalid'; readonly value: string; readonly message: string }
  | { readonly state: 'valid'; readonly value: string; readonly isoDate: string };

/** Model shared by typed input and an anchored calendar with month/year jump and range presets. */
export function parseHistoryDateInput(value: string): HistoryDateInput {
  const input = value.trim();
  if (!input) return { state: 'empty', value: '' };
  if (/^\d{1,4}(?:-\d{0,2})?(?:-\d{0,2})?$/u.test(input) && input.length < 10) return { state: 'partial', value };
  if (!calendarDate(input)) return { state: 'invalid', value, message: 'Enter a complete calendar date as YYYY-MM-DD.' };
  return { state: 'valid', value, isoDate: input };
}

function summary(revision: HistoryRevision): HistoryRevisionSummary {
  const { snapshot: _snapshot, ...metadata } = revision;
  return metadata;
}

function searchableText(revision: HistoryRevision): string {
  return [revision.action, revision.label ?? '', revision.stableRecordId, JSON.stringify(revision.metadata)].join('\n').slice(0, 4096);
}

export function deriveHistoryActionFilters(revisions: readonly HistoryRevision[], selected: readonly string[] = []): HistoryActionFilter[] {
  const counts = new Map<string, number>();
  for (const revision of revisions) counts.set(revision.action, (counts.get(revision.action) ?? 0) + 1);
  const chosen = new Set(selected);
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([action, count]) => Object.freeze({ action, count, selected: chosen.has(action) }));
}

function diffJson(before: HistoryJson | undefined, after: HistoryJson | undefined, path = '$', output: HistoryDiffEntry[] = []): HistoryDiffEntry[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return output;
  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) diffJson(before[key] as HistoryJson | undefined, after[key] as HistoryJson | undefined, `${path}.${key}`, output);
    return output;
  }
  output.push(Object.freeze({
    path,
    kind: before === undefined ? 'added' : after === undefined ? 'removed' : 'changed',
    ...(before === undefined ? {} : { before: cloneJson(before) }),
    ...(after === undefined ? {} : { after: cloneJson(after) }),
  }));
  return output;
}

export class HistoryManagerCore {
  private readonly verify: HistoryVerifier;
  private readonly appendSink?: HistoryManagerOptions['append'];
  private readonly now: () => Date;
  private readonly createId: () => string;
  private revisions: HistoryRevision[];

  constructor(options: HistoryManagerOptions) {
    if (typeof options.verify !== 'function') throw new Error('an injected verifier is required');
    this.verify = options.verify;
    this.appendSink = options.append;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? (() => globalThis.crypto.randomUUID());
    this.revisions = [...validateHistoryManagerDocument(options.initial ?? { schemaVersion: 1, revisions: [] }).revisions];
  }

  document(): HistoryManagerDocument {
    return validateHistoryManagerDocument({ schemaVersion: 1, revisions: this.revisions });
  }

  /** Primary work succeeds independently; history failure produces a visible recovery route. */
  async runMutation<T>(primary: () => T | Promise<T>, input: HistoryMutationInput): Promise<HistoryMutationOutcome<T>> {
    const value = await primary();
    try {
      return { value, revision: await this.appendMutation(input) };
    } catch (error) {
      return { value, recovery: recoveryDescriptor(error) };
    }
  }

  async appendMutation(input: HistoryMutationInput): Promise<HistoryRevision> {
    assertAction(input.action, 'action');
    assertId(input.stableRecordId, 'stableRecordId');
    assertRedactedHistoryValue(input.snapshot);
    const metadata = input.metadata ?? {};
    if (Object.keys(metadata).length > HISTORY_MANAGER_LIMITS.metadataEntries) throw new Error('metadata exceeds the entry limit');
    assertRedactedHistoryValue(metadata);
    if (input.label !== undefined && (!input.label.trim() || codePointLength(input.label) > HISTORY_MANAGER_LIMITS.labelLength)) {
      throw new Error('label must be a non-empty bounded string');
    }
    if (input.sourceRevisionId !== undefined && !this.revisions.some((revision) => revision.id === input.sourceRevisionId)) {
      throw new Error('source revision does not exist');
    }
    const revision = validateRevision({
      id: this.createId(),
      parentId: this.revisions.at(-1)?.id ?? null,
      stableRecordId: input.stableRecordId,
      encryptionAad: createHistoryEncryptionAad(input.stableRecordId),
      action: input.action,
      recordedAt: this.now().toISOString(),
      ...(input.label === undefined ? {} : { label: input.label }),
      ...(input.sourceRevisionId === undefined ? {} : { sourceRevisionId: input.sourceRevisionId }),
      metadata,
      snapshot: input.snapshot,
    }, this.revisions.length);
    await this.appendSink?.(revision);
    this.revisions = [...this.revisions, revision];
    return revision;
  }

  async browse(auth: HistoryAuthRequest, request: HistoryBrowseRequest = {}): Promise<HistoryBrowseResult> {
    await this.authorize('browse', auth);
    validateSearch(request);
    const selectedActions = new Set(request.actions ?? []);
    const query = request.query?.toLocaleLowerCase();
    const expression = request.regex === undefined ? undefined : new RegExp(request.regex.source, (request.regex.flags ?? 'iu').replace('g', ''));
    const start = request.dateRange?.start;
    const end = request.dateRange?.end;
    const matches = this.revisions.filter((revision) => {
      if (selectedActions.size && !selectedActions.has(revision.action)) return false;
      const day = revision.recordedAt.slice(0, 10);
      if (start !== undefined && day < start) return false;
      if (end !== undefined && day > end) return false;
      const text = searchableText(revision);
      if (expression && !expression.test(text)) return false;
      if (query !== undefined && !text.toLocaleLowerCase().includes(query)) return false;
      return true;
    }).reverse();
    const limit = request.limit ?? 100;
    return {
      revisions: Object.freeze(matches.slice(0, limit).map(summary)),
      actionFilters: Object.freeze(deriveHistoryActionFilters(this.revisions, request.actions)),
      totalMatches: matches.length,
    };
  }

  async diff(auth: HistoryAuthRequest, leftId: string, rightId: string): Promise<readonly HistoryDiffEntry[]> {
    await this.authorize('diff', auth);
    return Object.freeze(diffJson(this.revision(leftId).snapshot, this.revision(rightId).snapshot));
  }

  async restore(auth: HistoryAuthRequest, revisionId: string): Promise<HistoryRevision> {
    await this.authorize('restore', auth);
    const source = this.revision(revisionId);
    return this.appendMutation({
      action: 'restored', stableRecordId: source.stableRecordId, snapshot: source.snapshot,
      metadata: { restoredFrom: source.id }, sourceRevisionId: source.id,
    });
  }

  async label(auth: HistoryAuthRequest, revisionId: string, label: string): Promise<HistoryRevision> {
    await this.authorize('label', auth);
    const source = this.revision(revisionId);
    return this.appendMutation({
      action: 'labeled', stableRecordId: source.stableRecordId, snapshot: source.snapshot,
      metadata: { labeledRevision: source.id }, label, sourceRevisionId: source.id,
    });
  }

  retentionCandidates(policy: HistoryRetentionPolicy, at = this.now()): readonly string[] {
    const maximum = policy.maximumRevisions;
    if (maximum !== undefined && (!Number.isInteger(maximum) || maximum < 1 || maximum > HISTORY_MANAGER_LIMITS.revisions)) {
      throw new Error('maximumRevisions is invalid');
    }
    if (policy.maximumAgeDays !== undefined && (!Number.isInteger(policy.maximumAgeDays) || policy.maximumAgeDays < 1 || policy.maximumAgeDays > 36_500)) {
      throw new Error('maximumAgeDays is invalid');
    }
    const byCount = maximum === undefined ? new Set<string>() : new Set(this.revisions.slice(0, Math.max(0, this.revisions.length - maximum)).map((item) => item.id));
    const cutoff = policy.maximumAgeDays === undefined ? undefined : at.getTime() - policy.maximumAgeDays * 86_400_000;
    return Object.freeze(this.revisions.filter((revision) => {
      if (policy.keepLabeled !== false && revision.label !== undefined) return false;
      return byCount.has(revision.id) || (cutoff !== undefined && Date.parse(revision.recordedAt) < cutoff);
    }).map((revision) => revision.id));
  }

  /** Records the prune decision append-only; immutable revisions are never rewritten or deleted here. */
  async prune(auth: HistoryAuthRequest, policy: HistoryRetentionPolicy): Promise<HistoryRevision> {
    await this.authorize('prune', auth);
    const candidates = this.retentionCandidates(policy);
    const latest = this.revisions.at(-1);
    if (!latest) throw new Error('history is empty');
    return this.appendMutation({
      action: 'pruned', stableRecordId: latest.stableRecordId, snapshot: latest.snapshot,
      metadata: { candidateRevisionIds: [...candidates], retention: { ...policy } as HistoryJson },
      sourceRevisionId: latest.id,
    });
  }

  async discard(auth: HistoryAuthRequest, stableRecordId: string, snapshot: HistoryJson = null): Promise<HistoryRevision> {
    await this.authorize('bulk', auth);
    return this.appendMutation({ action: 'document-discarded', stableRecordId, snapshot, metadata: { discarded: true } });
  }

  async bulk(auth: HistoryAuthRequest, mutations: readonly HistoryMutationInput[]): Promise<readonly HistoryRevision[]> {
    await this.authorize('bulk', auth);
    if (mutations.length < 1 || mutations.length > HISTORY_MANAGER_LIMITS.bulkMutations) throw new Error('bulk mutation count is invalid');
    const appended: HistoryRevision[] = [];
    for (const mutation of mutations) appended.push(await this.appendMutation({
      ...mutation,
      metadata: { ...(mutation.metadata ?? {}), bulkIndex: appended.length, bulkSize: mutations.length },
    }));
    return Object.freeze(appended);
  }

  async exportRedacted(auth: HistoryAuthRequest, request: HistoryBrowseRequest = {}): Promise<HistoryExport> {
    await this.authorize('export', auth);
    const result = await this.browseAuthorized(request);
    return Object.freeze({
      schemaVersion: 1,
      exportedAt: this.now().toISOString(),
      revisions: result.revisions,
      omissions: Object.freeze(['snapshot contents', 'credentials and verifier proofs', 'encryption keys'] as const),
    });
  }

  private async browseAuthorized(request: HistoryBrowseRequest): Promise<HistoryBrowseResult> {
    validateSearch(request);
    const selectedActions = new Set(request.actions ?? []);
    const query = request.query?.toLocaleLowerCase();
    const expression = request.regex === undefined ? undefined : new RegExp(request.regex.source, (request.regex.flags ?? 'iu').replace('g', ''));
    const start = request.dateRange?.start;
    const end = request.dateRange?.end;
    const matches = this.revisions.filter((revision) => {
      if (selectedActions.size && !selectedActions.has(revision.action)) return false;
      const day = revision.recordedAt.slice(0, 10);
      if (start !== undefined && day < start) return false;
      if (end !== undefined && day > end) return false;
      const text = searchableText(revision);
      return !(expression && !expression.test(text)) && !(query !== undefined && !text.toLocaleLowerCase().includes(query));
    }).reverse();
    return {
      revisions: Object.freeze(matches.slice(0, request.limit ?? 100).map(summary)),
      actionFilters: Object.freeze(deriveHistoryActionFilters(this.revisions, request.actions)),
      totalMatches: matches.length,
    };
  }

  private revision(id: string): HistoryRevision {
    assertId(id, 'revisionId');
    const revision = this.revisions.find((candidate) => candidate.id === id);
    if (!revision) throw new Error('revision does not exist');
    return revision;
  }

  private async authorize(operation: HistoryOperation, auth: HistoryAuthRequest): Promise<void> {
    if (!auth || !['password', 'pin', 'totp'].includes(auth.method) || !auth.verifierReference || !auth.proof) {
      throw new Error('history authentication is required');
    }
    const accepted = await this.verify({ purpose: 'history-manager', operation, ...auth });
    if (!accepted) throw new Error('history authentication did not match');
  }
}

export function recoveryDescriptor(error: unknown): HistoryRecoveryDescriptor {
  const detail = error instanceof Error && error.message.trim()
    ? `The primary change completed, but its version-history entry could not be written: ${error.message}`
    : 'The primary change completed, but its version-history entry could not be written.';
  return Object.freeze({
    visible: true,
    kind: 'history-write-failed',
    title: 'Version history was not recorded',
    detail,
    recoveryAction: 'open-history-manager',
    retryable: true,
  });
}
