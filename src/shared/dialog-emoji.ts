/**
 * Framework-neutral state and presentation contract for optional dialog emoji.
 *
 * This module has no I/O, DOM, logging, history, export, or network behavior.
 * Hosts persist the serialized preference and render the returned decoration as
 * a separate `aria-hidden` presentation-only element.
 */

export const DIALOG_EMOJI_LIMITS = Object.freeze({
  schemaVersion: 1 as const,
  maxPayloadBytes: 1_024,
  maxFactualTextCodePoints: 16_384,
  maxActions: 16,
});

export type DialogEmojiCategory =
  | 'information'
  | 'success'
  | 'warning'
  | 'error'
  | 'destructive'
  | 'security';

export type DialogEmojiLanguageMode = 'english' | 'cantonese' | 'bilingual';
export type DialogEmojiFunnyLevel = 1 | 2 | 3 | 4 | 5;

/** The only persisted datum. Presentation inputs never enter this payload. */
export interface DialogEmojiPreferences {
  readonly schemaVersion: 1;
  readonly showEmojisInDialogsAndMessageBoxes: boolean;
}

export interface DialogFactualText {
  readonly title: string;
  readonly message: string;
  readonly actionLabels: readonly string[];
  readonly accessibleName: string;
}

export interface DialogEmojiPresentationInput {
  readonly preferences: DialogEmojiPreferences;
  readonly category: DialogEmojiCategory;
  readonly schoolMode: boolean;
  readonly languageMode: DialogEmojiLanguageMode;
  readonly englishFunnyLevel: DialogEmojiFunnyLevel;
  readonly cantoneseFunnyLevel: DialogEmojiFunnyLevel;
  readonly factualText: DialogFactualText;
}

/**
 * A renderer-only decoration descriptor. It deliberately contains no control
 * labels or accessible text, so the glyph cannot become semantic content.
 */
export interface DialogEmojiDecoration {
  readonly category: DialogEmojiCategory;
  readonly glyph: string;
  readonly role: 'presentation';
  readonly ariaHidden: true;
  readonly includedInAccessibleName: false;
  readonly includedInControlText: false;
}

export interface DialogEmojiPresentation {
  readonly factualText: DialogFactualText;
  readonly decoration: DialogEmojiDecoration | null;
}

export type DialogEmojiPreferenceErrorCode =
  | 'invalid-json'
  | 'payload-too-large'
  | 'invalid-state'
  | 'unsupported-version'
  | 'unexpected-field'
  | 'unsafe-field'
  | 'invalid-preference';

export class DialogEmojiPreferenceError extends Error {
  constructor(readonly code: DialogEmojiPreferenceErrorCode) {
    super('Dialog emoji preferences are invalid.');
    this.name = 'DialogEmojiPreferenceError';
  }
}

export const DEFAULT_DIALOG_EMOJI_PREFERENCES: Readonly<DialogEmojiPreferences> = Object.freeze({
  schemaVersion: DIALOG_EMOJI_LIMITS.schemaVersion,
  showEmojisInDialogsAndMessageBoxes: true,
});

const PREFERENCE_FIELDS = new Set(['schemaVersion', 'showEmojisInDialogsAndMessageBoxes']);
const UNSAFE_FIELDS = new Set(['__proto__', 'prototype', 'constructor']);
const CATEGORIES = new Set<DialogEmojiCategory>([
  'information',
  'success',
  'warning',
  'error',
  'destructive',
  'security',
]);
const EMOJI_BY_CATEGORY: Readonly<Record<DialogEmojiCategory, string>> = Object.freeze({
  information: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '❌',
  destructive: '🗑️',
  security: '🔒',
});

function fail(code: DialogEmojiPreferenceErrorCode): never {
  throw new DialogEmojiPreferenceError(code);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function ownRecord(value: unknown): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') fail('invalid-state');
  const record = value as Record<string, unknown>;
  for (const field of Object.keys(record)) {
    if (UNSAFE_FIELDS.has(field)) fail('unsafe-field');
    if (!PREFERENCE_FIELDS.has(field)) fail('unexpected-field');
  }
  return record;
}

function assertFactualString(value: unknown): asserts value is string {
  if (typeof value !== 'string' || Array.from(value).length > DIALOG_EMOJI_LIMITS.maxFactualTextCodePoints) {
    throw new TypeError('Dialog factual text must be a bounded string.');
  }
}

function freezeFactualText(value: DialogFactualText): DialogFactualText {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Dialog factual text is required.');
  }
  assertFactualString(value.title);
  assertFactualString(value.message);
  assertFactualString(value.accessibleName);
  if (!Array.isArray(value.actionLabels) || value.actionLabels.length > DIALOG_EMOJI_LIMITS.maxActions) {
    throw new RangeError('Dialog actions must be a bounded array.');
  }
  for (const actionLabel of value.actionLabels) assertFactualString(actionLabel);
  return Object.freeze({
    title: value.title,
    message: value.message,
    actionLabels: Object.freeze([...value.actionLabels]),
    accessibleName: value.accessibleName,
  });
}

function assertPresentationInput(input: DialogEmojiPresentationInput): void {
  if (input === null || typeof input !== 'object') throw new TypeError('Dialog emoji presentation input is required.');
  if (!CATEGORIES.has(input.category)) throw new TypeError('Dialog category is not supported.');
  if (typeof input.schoolMode !== 'boolean') throw new TypeError('schoolMode must be a boolean.');
  if (!['english', 'cantonese', 'bilingual'].includes(input.languageMode)) {
    throw new TypeError('languageMode is not supported.');
  }
  for (const funnyLevel of [input.englishFunnyLevel, input.cantoneseFunnyLevel]) {
    if (!Number.isInteger(funnyLevel) || funnyLevel < 1 || funnyLevel > 5) {
      throw new RangeError('Funny levels must be integers from 1 to 5.');
    }
  }
}

/** Return the safe, versioned preference used before any persisted value exists. */
export function createDefaultDialogEmojiPreferences(): DialogEmojiPreferences {
  return Object.freeze({ ...DEFAULT_DIALOG_EMOJI_PREFERENCES });
}

/** Fully validate an untrusted persisted preference object before use. */
export function validateDialogEmojiPreferences(value: unknown): DialogEmojiPreferences {
  const record = ownRecord(value);
  if (Object.keys(record).length !== PREFERENCE_FIELDS.size) fail('unexpected-field');
  if (record.schemaVersion !== DIALOG_EMOJI_LIMITS.schemaVersion) fail('unsupported-version');
  if (typeof record.showEmojisInDialogsAndMessageBoxes !== 'boolean') fail('invalid-preference');
  return Object.freeze({
    schemaVersion: DIALOG_EMOJI_LIMITS.schemaVersion,
    showEmojisInDialogsAndMessageBoxes: record.showEmojisInDialogsAndMessageBoxes,
  });
}

/** Parse a bounded UTF-8/JSON preference payload and revalidate every field. */
export function parseDialogEmojiPreferences(payload: string | Uint8Array): DialogEmojiPreferences {
  const size = typeof payload === 'string' ? byteLength(payload) : payload.byteLength;
  if (size > DIALOG_EMOJI_LIMITS.maxPayloadBytes) fail('payload-too-large');
  let source: string;
  try {
    source = typeof payload === 'string'
      ? payload
      : new TextDecoder('utf-8', { fatal: true }).decode(payload);
  } catch {
    return fail('invalid-json');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    return fail('invalid-json');
  }
  return validateDialogEmojiPreferences(parsed);
}

/** Serialize exactly the versioned preference, with no text or presentation metadata. */
export function serializeDialogEmojiPreferences(value: DialogEmojiPreferences): string {
  const preferences = validateDialogEmojiPreferences(value);
  return JSON.stringify({
    schemaVersion: preferences.schemaVersion,
    showEmojisInDialogsAndMessageBoxes: preferences.showEmojisInDialogsAndMessageBoxes,
  });
}

/**
 * Return one deterministic non-semantic descriptor, or no descriptor when the
 * persisted toggle is off or School mode suppresses optional emoji UI.
 */
export function resolveDialogEmojiDecoration(
  preferences: DialogEmojiPreferences,
  category: DialogEmojiCategory,
  schoolMode: boolean,
): DialogEmojiDecoration | null {
  const validated = validateDialogEmojiPreferences(preferences);
  if (!CATEGORIES.has(category)) throw new TypeError('Dialog category is not supported.');
  if (typeof schoolMode !== 'boolean') throw new TypeError('schoolMode must be a boolean.');
  if (!validated.showEmojisInDialogsAndMessageBoxes || schoolMode) return null;
  return Object.freeze({
    category,
    glyph: EMOJI_BY_CATEGORY[category],
    role: 'presentation',
    ariaHidden: true,
    includedInAccessibleName: false,
    includedInControlText: false,
  });
}

/**
 * Preserve all factual text verbatim. Language and funny-level inputs are
 * validated only: they never alter a dialog's facts or its controls here.
 */
export function createDialogEmojiPresentation(input: DialogEmojiPresentationInput): DialogEmojiPresentation {
  assertPresentationInput(input);
  const factualText = freezeFactualText(input.factualText);
  return Object.freeze({
    factualText,
    decoration: resolveDialogEmojiDecoration(input.preferences, input.category, input.schoolMode),
  });
}
