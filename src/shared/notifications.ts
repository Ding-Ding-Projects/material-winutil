/**
 * Framework-neutral notification-centre state. Hosts own storage, rendering,
 * timers, localization, and destructive-action confirmation; this core keeps
 * the durable record bounded and makes every bulk outcome explicit.
 */

export const NOTIFICATION_SCHEMA_VERSION = 1 as const;
export const NOTIFICATION_LIMITS = Object.freeze({
  jsonBytes: 256 * 1024,
  maxEntries: 500,
  maxPageSize: 100,
  maxTextLength: 4_096,
  maxActionCount: 8,
  maxLinkCount: 8,
  maxIdLength: 160,
});

export type NotificationKind = 'info' | 'success' | 'progress' | 'warning' | 'error';
export type NotificationCorner = 'bottom-left' | 'bottom-right';
export type NotificationReviewState = 'unread' | 'read' | 'dismissed';
export type NotificationAction = Readonly<{ id: string; label: string }>;
export type NotificationLink = Readonly<{ label: string; href: string }>;

export interface NotificationText {
  readonly title: string;
  readonly detail: string;
}

export interface NotificationRecord {
  readonly id: string;
  readonly createdAt: number;
  readonly kind: NotificationKind;
  readonly text: NotificationText;
  readonly actions: readonly NotificationAction[];
  readonly links: readonly NotificationLink[];
  readonly review: NotificationReviewState;
  /** A screen reader announces a live notice at most once, even after reload. */
  readonly announced: boolean;
}

export interface NotificationState {
  readonly schemaVersion: typeof NOTIFICATION_SCHEMA_VERSION;
  readonly corner: NotificationCorner;
  readonly nextSequence: number;
  readonly entries: readonly NotificationRecord[];
}

export interface NotificationInput {
  readonly kind: NotificationKind;
  readonly text: NotificationText;
  readonly actions?: readonly NotificationAction[];
  readonly links?: readonly NotificationLink[];
  readonly id?: string;
}

export interface NotificationView {
  readonly id: string;
  readonly index: number;
  readonly record: NotificationRecord;
  readonly autoDismissMs: number | null;
  readonly anchor: NotificationCorner;
  readonly stackOrder: number;
  readonly liveAnnouncement: string | null;
}

export interface NotificationQuery {
  readonly text?: string;
  readonly kinds?: readonly NotificationKind[];
  readonly reviews?: readonly NotificationReviewState[];
}

export interface NotificationPage {
  readonly items: readonly NotificationRecord[];
  readonly totalMatches: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
}

export interface NotificationSelection {
  readonly ids: readonly string[];
  readonly anchorId: string | null;
}

export type NotificationBulkScope = 'current-page' | 'every-match';
export interface NotificationBulkPreview {
  readonly scope: NotificationBulkScope;
  readonly selected: number;
  readonly willChange: number;
  readonly excluded: number;
  readonly targetIds: readonly string[];
}
export interface NotificationBulkResult {
  readonly state: NotificationState;
  readonly preview: NotificationBulkPreview;
  readonly changedIds: readonly string[];
  readonly excludedIds: readonly string[];
}

const AUTO_DISMISS_MS: Readonly<Record<Exclude<NotificationKind, 'warning' | 'error'>, number>> = Object.freeze({
  info: 6_000,
  success: 5_000,
  progress: 8_000,
});
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const SAFE_ACTION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const SAFE_LINK = /^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]*(?::\d{1,5})?(?:\/[^\s]*)?$/u;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/** JSON.parse accepts duplicate keys, so scan the syntax before it can collapse one. */
class SafeJsonShapeGuard {
  private offset = 0;
  constructor(private readonly source: string) {}

  verify(): void { this.space(); this.value(); this.space(); if (this.offset !== this.source.length) this.fail(); }
  private value(): void {
    this.space(); const token = this.source[this.offset];
    if (token === '{') { this.object(); return; }
    if (token === '[') { this.array(); return; }
    if (token === '"') { this.string(); return; }
    if (token === '-' || (token !== undefined && token >= '0' && token <= '9')) { this.number(); return; }
    for (const literal of ['true', 'false', 'null']) if (this.source.startsWith(literal, this.offset)) { this.offset += literal.length; return; }
    this.fail();
  }
  private object(): void {
    this.offset += 1; this.space(); const keys = new Set<string>(); if (this.source[this.offset] === '}') { this.offset += 1; return; }
    while (true) {
      this.space(); if (this.source[this.offset] !== '"') this.fail(); const key = this.string();
      if (keys.has(key)) throw new TypeError('notification JSON contains a duplicate key.');
      if (UNSAFE_KEYS.has(key)) throw new TypeError('notification JSON contains an unsafe key.');
      keys.add(key); this.space(); if (this.source[this.offset] !== ':') this.fail(); this.offset += 1; this.value(); this.space();
      if (this.source[this.offset] === '}') { this.offset += 1; return; }
      if (this.source[this.offset] !== ',') this.fail(); this.offset += 1;
    }
  }
  private array(): void {
    this.offset += 1; this.space(); if (this.source[this.offset] === ']') { this.offset += 1; return; }
    while (true) { this.value(); this.space(); if (this.source[this.offset] === ']') { this.offset += 1; return; } if (this.source[this.offset] !== ',') this.fail(); this.offset += 1; }
  }
  private string(): string {
    const start = this.offset; this.offset += 1;
    while (this.offset < this.source.length) {
      const character = this.source[this.offset];
      if (character === '"') { this.offset += 1; try { return JSON.parse(this.source.slice(start, this.offset)) as string; } catch { this.fail(); } }
      if (character === '\\') { this.offset += 1; const escape = this.source[this.offset]; if (escape === 'u') { if (!/^[0-9a-fA-F]{4}$/u.test(this.source.slice(this.offset + 1, this.offset + 5))) this.fail(); this.offset += 5; continue; } if (escape === undefined || !'"\\/bfnrt'.includes(escape)) this.fail(); }
      else if (character === undefined || character.charCodeAt(0) < 0x20) this.fail();
      this.offset += 1;
    }
    return this.fail();
  }
  private number(): void { const match = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(this.source.slice(this.offset)); if (!match) this.fail(); this.offset += match[0].length; }
  private space(): void { while (/\s/u.test(this.source[this.offset] ?? '')) this.offset += 1; }
  private fail(): never { throw new TypeError('notification JSON is malformed.'); }
}

function ownPlainObject(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${name} must be a plain object.`);
  }
  for (const key of Object.keys(value)) if (UNSAFE_KEYS.has(key)) throw new TypeError(`${name} contains an unsafe key.`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], name: string): void {
  const actual = Object.keys(value).sort();
  if (actual.length !== keys.length || actual.some((key, index) => key !== [...keys].sort()[index])) {
    throw new TypeError(`${name} has an invalid shape.`);
  }
}

function assertText(value: unknown, name: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0) || value.length > NOTIFICATION_LIMITS.maxTextLength || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new RangeError(`${name} must be ${allowEmpty ? 'at most' : 'between 1 and'} ${NOTIFICATION_LIMITS.maxTextLength} safe characters.`);
  }
  return value;
}

function assertSafeId(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > NOTIFICATION_LIMITS.maxIdLength || !SAFE_ID.test(value)) {
    throw new RangeError(`${name} is invalid.`);
  }
  return value;
}

function assertFiniteTimestamp(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new RangeError(`${name} must be a non-negative safe integer.`);
  return value as number;
}

function freezeRecord(record: NotificationRecord): NotificationRecord {
  return Object.freeze({
    ...record,
    text: Object.freeze({ ...record.text }),
    actions: Object.freeze(record.actions.map((action) => Object.freeze({ ...action }))),
    links: Object.freeze(record.links.map((link) => Object.freeze({ ...link }))),
  });
}

function validateAction(value: unknown): NotificationAction {
  const object = ownPlainObject(value, 'action'); exactKeys(object, ['id', 'label'], 'action');
  const id = assertSafeId(object.id, 'action.id');
  if (!SAFE_ACTION_ID.test(id)) throw new RangeError('action.id is invalid.');
  return Object.freeze({ id, label: assertText(object.label, 'action.label') });
}

function validateLink(value: unknown): NotificationLink {
  const object = ownPlainObject(value, 'link'); exactKeys(object, ['href', 'label'], 'link');
  const href = assertText(object.href, 'link.href');
  if (!SAFE_LINK.test(href)) throw new RangeError('link.href must be an absolute HTTPS URL without whitespace.');
  return Object.freeze({ href, label: assertText(object.label, 'link.label') });
}

export function autoDismissMs(kind: NotificationKind): number | null {
  if (!['info', 'success', 'progress', 'warning', 'error'].includes(kind)) throw new TypeError('notification kind is invalid.');
  return kind === 'warning' || kind === 'error' ? null : AUTO_DISMISS_MS[kind];
}

export function createNotificationState(corner: NotificationCorner = 'bottom-right'): NotificationState {
  if (corner !== 'bottom-left' && corner !== 'bottom-right') throw new TypeError('corner is invalid.');
  return Object.freeze({ schemaVersion: NOTIFICATION_SCHEMA_VERSION, corner, nextSequence: 1, entries: Object.freeze([]) });
}

export function validateNotificationState(value: unknown): NotificationState {
  const state = ownPlainObject(value, 'notification state'); exactKeys(state, ['corner', 'entries', 'nextSequence', 'schemaVersion'], 'notification state');
  if (state.schemaVersion !== NOTIFICATION_SCHEMA_VERSION) throw new RangeError('unsupported notification schema version.');
  if (state.corner !== 'bottom-left' && state.corner !== 'bottom-right') throw new TypeError('corner is invalid.');
  if (!Number.isSafeInteger(state.nextSequence) || (state.nextSequence as number) < 1) throw new RangeError('nextSequence is invalid.');
  if (!Array.isArray(state.entries) || state.entries.length > NOTIFICATION_LIMITS.maxEntries) throw new RangeError('entries exceed the bound.');
  const ids = new Set<string>(); let prior = Number.MAX_SAFE_INTEGER;
  const entries = state.entries.map((raw, index) => {
    const item = ownPlainObject(raw, `entries[${index}]`); exactKeys(item, ['actions', 'announced', 'createdAt', 'id', 'kind', 'links', 'review', 'text'], `entries[${index}]`);
    const id = assertSafeId(item.id, 'entry.id'); if (ids.has(id)) throw new TypeError('entry ids must be unique.'); ids.add(id);
    const createdAt = assertFiniteTimestamp(item.createdAt, 'entry.createdAt'); if (createdAt > prior) throw new RangeError('entries must be newest-first.'); prior = createdAt;
    if (!['info', 'success', 'progress', 'warning', 'error'].includes(item.kind as string)) throw new TypeError('entry.kind is invalid.');
    if (!['unread', 'read', 'dismissed'].includes(item.review as string)) throw new TypeError('entry.review is invalid.');
    if (typeof item.announced !== 'boolean') throw new TypeError('entry.announced is invalid.');
    const text = ownPlainObject(item.text, 'entry.text'); exactKeys(text, ['detail', 'title'], 'entry.text');
    if (!Array.isArray(item.actions) || item.actions.length > NOTIFICATION_LIMITS.maxActionCount) throw new RangeError('too many actions.');
    if (!Array.isArray(item.links) || item.links.length > NOTIFICATION_LIMITS.maxLinkCount) throw new RangeError('too many links.');
    const actions = item.actions.map(validateAction); const actionIds = new Set(actions.map((action) => action.id)); if (actionIds.size !== actions.length) throw new TypeError('action ids must be unique.');
    const links = item.links.map(validateLink); const hrefs = new Set(links.map((link) => link.href)); if (hrefs.size !== links.length) throw new TypeError('link hrefs must be unique.');
    return freezeRecord({ id, createdAt, kind: item.kind as NotificationKind, text: { title: assertText(text.title, 'entry.text.title'), detail: assertText(text.detail, 'entry.text.detail', true) }, actions, links, review: item.review as NotificationReviewState, announced: item.announced });
  });
  return Object.freeze({ schemaVersion: NOTIFICATION_SCHEMA_VERSION, corner: state.corner, nextSequence: state.nextSequence as number, entries: Object.freeze(entries) });
}

export function parseNotificationStateJson(payload: string | Uint8Array): NotificationState {
  const bytes = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
  if (bytes.byteLength > NOTIFICATION_LIMITS.jsonBytes) throw new RangeError('notification JSON exceeds byte limit.');
  let source: string;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new TypeError('notification JSON is not valid UTF-8.'); }
  let parsed: unknown; try { new SafeJsonShapeGuard(source).verify(); parsed = JSON.parse(source); } catch (error) { if (error instanceof TypeError) throw error; throw new TypeError('notification JSON is malformed.'); }
  return validateNotificationState(parsed);
}

export function serializeNotificationState(state: NotificationState): string { return JSON.stringify(validateNotificationState(state)); }

export function addNotification(state: NotificationState, input: NotificationInput, createdAt: number): NotificationState {
  const valid = validateNotificationState(state); const time = assertFiniteTimestamp(createdAt, 'createdAt');
  if (valid.entries.length >= NOTIFICATION_LIMITS.maxEntries) throw new RangeError('notification history is full; review or delete entries before adding another.');
  const kind = input?.kind; const autoDismiss = autoDismissMs(kind as NotificationKind); void autoDismiss;
  const text = ownPlainObject(input?.text, 'notification text'); exactKeys(text, ['detail', 'title'], 'notification text');
  const id = input.id === undefined ? `notice-${valid.nextSequence}` : assertSafeId(input.id, 'notification id');
  if (valid.entries.some((entry) => entry.id === id)) throw new TypeError('notification id already exists.');
  const actions = (input.actions ?? []).map(validateAction); const links = (input.links ?? []).map(validateLink);
  if (actions.length > NOTIFICATION_LIMITS.maxActionCount || links.length > NOTIFICATION_LIMITS.maxLinkCount) throw new RangeError('too many action or link descriptors.');
  const record = freezeRecord({ id, createdAt: time, kind: kind as NotificationKind, text: { title: assertText(text.title, 'notification title'), detail: assertText(text.detail, 'notification detail', true) }, actions, links, review: 'unread', announced: false });
  return Object.freeze({ ...valid, nextSequence: valid.nextSequence + 1, entries: Object.freeze([record, ...valid.entries]) });
}

export function visibleNotifications(state: NotificationState): readonly NotificationView[] {
  const valid = validateNotificationState(state);
  return Object.freeze(valid.entries.filter((entry) => entry.review !== 'dismissed').map((record, index) => Object.freeze({
    id: record.id, index, record, autoDismissMs: autoDismissMs(record.kind), anchor: valid.corner, stackOrder: index, liveAnnouncement: record.announced ? null : [record.text.title, record.text.detail].filter(Boolean).join('. '),
  })));
}

export function markNotificationAnnounced(state: NotificationState, id: string): NotificationState {
  return updateOne(state, id, (record) => record.announced ? record : freezeRecord({ ...record, announced: true }));
}

export function dismissNotification(state: NotificationState, id: string): NotificationState {
  return updateOne(state, id, (record) => record.review === 'dismissed' ? record : freezeRecord({ ...record, review: 'dismissed' }));
}

export function setNotificationReview(state: NotificationState, id: string, review: NotificationReviewState): NotificationState {
  if (!['unread', 'read', 'dismissed'].includes(review)) throw new TypeError('review is invalid.');
  return updateOne(state, id, (record) => record.review === review ? record : freezeRecord({ ...record, review }));
}

function updateOne(state: NotificationState, id: string, update: (record: NotificationRecord) => NotificationRecord): NotificationState {
  const valid = validateNotificationState(state); assertSafeId(id, 'notification id'); let changed = false;
  const entries = valid.entries.map((record) => record.id === id ? (changed = true, update(record)) : record);
  if (!changed) throw new RangeError('notification id was not found.');
  return Object.freeze({ ...valid, entries: Object.freeze(entries) });
}

export function searchNotifications(state: NotificationState, query: NotificationQuery = {}): readonly NotificationRecord[] {
  const valid = validateNotificationState(state); const text = query.text?.trim().toLocaleLowerCase() ?? '';
  const kinds = query.kinds ? new Set(query.kinds) : undefined; const reviews = query.reviews ? new Set(query.reviews) : undefined;
  if (kinds && [...kinds].some((kind) => !['info', 'success', 'progress', 'warning', 'error'].includes(kind))) throw new TypeError('query kind is invalid.');
  if (reviews && [...reviews].some((review) => !['unread', 'read', 'dismissed'].includes(review))) throw new TypeError('query review is invalid.');
  return Object.freeze(valid.entries.filter((entry) => (!text || `${entry.text.title}\n${entry.text.detail}`.toLocaleLowerCase().includes(text)) && (!kinds || kinds.has(entry.kind)) && (!reviews || reviews.has(entry.review))));
}

export function pageNotifications(state: NotificationState, query: NotificationQuery = {}, page = 0, pageSize = 25): NotificationPage {
  if (!Number.isSafeInteger(page) || page < 0) throw new RangeError('page must be non-negative.');
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > NOTIFICATION_LIMITS.maxPageSize) throw new RangeError('pageSize is invalid.');
  const matched = searchNotifications(state, query); const pageCount = Math.ceil(matched.length / pageSize); const safePage = Math.min(page, Math.max(0, pageCount - 1));
  return Object.freeze({ items: Object.freeze(matched.slice(safePage * pageSize, (safePage + 1) * pageSize)), totalMatches: matched.length, page: safePage, pageSize, pageCount });
}

export function createNotificationSelection(): NotificationSelection { return Object.freeze({ ids: Object.freeze([]), anchorId: null }); }

export function selectNotification(selection: NotificationSelection, orderedIds: readonly string[], id: string, mode: 'replace' | 'toggle' | 'range' = 'replace'): NotificationSelection {
  assertSafeId(id, 'notification id'); if (!orderedIds.includes(id)) throw new RangeError('selection id is not in the supplied ordered list.');
  const current = new Set(selection.ids); let next: Set<string>;
  if (mode === 'replace') next = new Set([id]);
  else if (mode === 'toggle') { next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); }
  else { const anchor = selection.anchorId && orderedIds.includes(selection.anchorId) ? selection.anchorId : id; const start = orderedIds.indexOf(anchor); const end = orderedIds.indexOf(id); next = new Set(orderedIds.slice(Math.min(start, end), Math.max(start, end) + 1)); }
  return Object.freeze({ ids: Object.freeze(orderedIds.filter((candidate) => next.has(candidate))), anchorId: id });
}

export function selectAllNotifications(selection: NotificationSelection, page: NotificationPage, matched: readonly NotificationRecord[], scope: NotificationBulkScope): NotificationSelection {
  const target = scope === 'current-page' ? page.items : matched; const ids = new Set(selection.ids); target.forEach((record) => ids.add(record.id));
  return Object.freeze({ ids: Object.freeze([...ids]), anchorId: selection.anchorId });
}

export function invertNotificationSelection(selection: NotificationSelection, candidates: readonly NotificationRecord[]): NotificationSelection {
  const selected = new Set(selection.ids); return Object.freeze({ ids: Object.freeze(candidates.filter((record) => !selected.has(record.id)).map((record) => record.id)), anchorId: null });
}

function preview(state: NotificationState, selection: NotificationSelection, candidates: readonly NotificationRecord[], scope: NotificationBulkScope, predicate: (record: NotificationRecord) => boolean): NotificationBulkPreview {
  const valid = validateNotificationState(state); const selected = new Set(selection.ids); const allowed = new Set(candidates.map((record) => record.id));
  const picked = valid.entries.filter((record) => selected.has(record.id)); const targets = picked.filter((record) => allowed.has(record.id) && predicate(record));
  return Object.freeze({ scope, selected: picked.length, willChange: targets.length, excluded: picked.length - targets.length, targetIds: Object.freeze(targets.map((record) => record.id)) });
}

export function previewBulkDismiss(state: NotificationState, selection: NotificationSelection, candidates: readonly NotificationRecord[], scope: NotificationBulkScope): NotificationBulkPreview { return preview(state, selection, candidates, scope, (record) => record.review !== 'dismissed'); }
export function previewBulkDelete(state: NotificationState, selection: NotificationSelection, candidates: readonly NotificationRecord[], scope: NotificationBulkScope): NotificationBulkPreview { return preview(state, selection, candidates, scope, () => true); }

export function applyBulkDismiss(state: NotificationState, selection: NotificationSelection, candidates: readonly NotificationRecord[], scope: NotificationBulkScope): NotificationBulkResult {
  const info = previewBulkDismiss(state, selection, candidates, scope); const targets = new Set(info.targetIds); const valid = validateNotificationState(state);
  const next = Object.freeze({ ...valid, entries: Object.freeze(valid.entries.map((record) => targets.has(record.id) ? freezeRecord({ ...record, review: 'dismissed' }) : record)) });
  const picked = new Set(selection.ids); return Object.freeze({ state: next, preview: info, changedIds: info.targetIds, excludedIds: Object.freeze(valid.entries.filter((record) => picked.has(record.id) && !targets.has(record.id)).map((record) => record.id)) });
}

/** Call only after the host's two-key/slider super-confirmation flow succeeds. */
export function applyConfirmedBulkDelete(state: NotificationState, selection: NotificationSelection, candidates: readonly NotificationRecord[], scope: NotificationBulkScope, superConfirmed: boolean): NotificationBulkResult {
  if (superConfirmed !== true) throw new TypeError('external super-confirmation is required before deleting notification history.');
  const info = previewBulkDelete(state, selection, candidates, scope); const targets = new Set(info.targetIds); const valid = validateNotificationState(state); const picked = new Set(selection.ids);
  return Object.freeze({ state: Object.freeze({ ...valid, entries: Object.freeze(valid.entries.filter((record) => !targets.has(record.id))) }), preview: info, changedIds: info.targetIds, excludedIds: Object.freeze(valid.entries.filter((record) => picked.has(record.id) && !targets.has(record.id)).map((record) => record.id)) });
}

export function exportNotifications(state: NotificationState, selection: NotificationSelection, candidates: readonly NotificationRecord[], scope: NotificationBulkScope): Readonly<{ preview: NotificationBulkPreview; records: readonly NotificationRecord[] }> {
  const info = preview(state, selection, candidates, scope, () => true); const targets = new Set(info.targetIds); const records = validateNotificationState(state).entries.filter((record) => targets.has(record.id));
  return Object.freeze({ preview: info, records: Object.freeze(records) });
}

/** A host formatter may add playful/localized framing, never replace these facts. */
export function notificationFacts(text: NotificationText): NotificationText { return Object.freeze({ title: assertText(text.title, 'title'), detail: assertText(text.detail, 'detail', true) }); }
