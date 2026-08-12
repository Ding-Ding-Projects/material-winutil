/**
 * Framework-neutral application display-name state.
 *
 * This module deliberately performs no I/O. Callers own persistence and local
 * history storage; the values below keep product identity independent from the
 * user-facing name chosen at runtime.
 */

export const SHIPPED_DISPLAY_NAME = 'Material System Utility' as const;
export const STABLE_APPLICATION_ID = 'org.dingdingprojects.materialsystemutility' as const;
export const STABLE_PACKAGE_ID = 'MaterialSystemUtility' as const;
export const STABLE_APP_DATA_DIRECTORY_NAME = 'material-system-utility' as const;
export const STABLE_UPDATE_FEED_ID = 'material-system-utility' as const;
export const STABLE_HISTORY_REPOSITORY_ID = 'material-system-utility-history' as const;

export const SHIPPED_PRODUCT_IDENTITY = Object.freeze({
  displayName: SHIPPED_DISPLAY_NAME,
  applicationId: STABLE_APPLICATION_ID,
  packageId: STABLE_PACKAGE_ID,
  appDataDirectoryName: STABLE_APP_DATA_DIRECTORY_NAME,
  updateFeedId: STABLE_UPDATE_FEED_ID,
  historyRepositoryId: STABLE_HISTORY_REPOSITORY_ID,
} as const);

export const DISPLAY_NAME_LIMITS = Object.freeze({
  schemaVersion: 1 as const,
  mutationSchemaVersion: 1 as const,
  maxPayloadBytes: 4 * 1024,
  maxCodePoints: 80,
  maxUtf8Bytes: 256,
} as const);

export type DisplayNameLanguageMode = 'english' | 'cantonese' | 'bilingual';
export type DisplayNameFunnyLevel = 1 | 2 | 3 | 4 | 5;

export interface DisplayNamePresentationInputs {
  readonly languageMode: DisplayNameLanguageMode;
  readonly englishFunnyLevel: DisplayNameFunnyLevel;
  readonly cantoneseFunnyLevel: DisplayNameFunnyLevel;
}

export interface DisplayNameState {
  readonly schemaVersion: 1;
  readonly displayName: string;
}

export interface DisplayNameUiPresentation extends DisplayNamePresentationInputs {
  readonly displayName: string;
}

export interface DisplayNameMutationRecord {
  readonly schemaVersion: 1;
  readonly action: 'display-name-renamed' | 'display-name-reset';
  readonly occurredAt: string;
  readonly field: 'display-name';
  readonly previousState: 'shipped' | 'custom';
  readonly nextState: 'shipped' | 'custom';
  readonly redacted: true;
  readonly summary: 'Application display name changed.' | 'Application display name reset.';
}

export interface DisplayNameChangeResult {
  readonly state: DisplayNameState;
  readonly mutation: DisplayNameMutationRecord | null;
}

export type DisplayNameErrorCode =
  | 'invalid-state'
  | 'invalid-json'
  | 'payload-too-large'
  | 'unsupported-version'
  | 'duplicate-field'
  | 'unexpected-field'
  | 'unsafe-field'
  | 'invalid-display-name'
  | 'display-name-too-long'
  | 'invalid-presentation'
  | 'invalid-timestamp';

export class DisplayNameContractError extends Error {
  constructor(readonly code: DisplayNameErrorCode) {
    super('Display-name data is invalid.');
    this.name = 'DisplayNameContractError';
  }
}

const ROOT_FIELDS = new Set(['schemaVersion', 'displayName']);
const UNSAFE_FIELDS = new Set(['__proto__', 'prototype', 'constructor']);
const CONTROL_OR_LINE_BREAK = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const INVISIBLE_DIRECTIONAL_FORMAT = /[\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u;
const UNPAIRED_SURROGATE = /[\ud800-\udfff]/u;
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function fail(code: DisplayNameErrorCode): never {
  throw new DisplayNameContractError(code);
}

function ownRecord(value: unknown): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') fail('invalid-state');
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (UNSAFE_FIELDS.has(key)) fail('unsafe-field');
    if (!ROOT_FIELDS.has(key)) fail('unexpected-field');
  }
  return record;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function skipWhitespace(source: string, offset: number): number {
  while (offset < source.length && ' \t\r\n'.includes(source[offset])) offset += 1;
  return offset;
}

function scanString(source: string, offset: number): { readonly value: string; readonly end: number } {
  if (source[offset] !== '"') fail('invalid-json');
  const start = offset;
  offset += 1;
  while (offset < source.length) {
    if (source[offset] === '"') {
      const end = offset + 1;
      try {
        return { value: JSON.parse(source.slice(start, end)) as string, end };
      } catch {
        return fail('invalid-json');
      }
    }
    if (source[offset] === '\\') offset += 1;
    offset += 1;
  }
  return fail('invalid-json');
}

function scanValue(source: string, offset: number): number {
  offset = skipWhitespace(source, offset);
  if (source[offset] === '"') return scanString(source, offset).end;
  if (source[offset] === '{' || source[offset] === '[') {
    const opening = source[offset];
    const closing = opening === '{' ? '}' : ']';
    let depth = 1;
    offset += 1;
    while (offset < source.length && depth > 0) {
      if (source[offset] === '"') {
        offset = scanString(source, offset).end;
        continue;
      }
      if (source[offset] === opening) depth += 1;
      if (source[offset] === closing) depth -= 1;
      offset += 1;
    }
    return offset;
  }
  while (offset < source.length && source[offset] !== ',' && source[offset] !== '}') offset += 1;
  return offset;
}

/** JSON.parse accepts duplicate object keys; reject them before trusting persisted state. */
function assertUniqueRootFields(source: string): void {
  let offset = skipWhitespace(source, 0);
  if (source[offset] !== '{') return;
  offset = skipWhitespace(source, offset + 1);
  const fields = new Set<string>();
  while (offset < source.length && source[offset] !== '}') {
    const key = scanString(source, offset);
    if (UNSAFE_FIELDS.has(key.value)) fail('unsafe-field');
    if (fields.has(key.value)) fail('duplicate-field');
    fields.add(key.value);
    offset = skipWhitespace(source, key.end);
    if (source[offset] !== ':') fail('invalid-json');
    offset = skipWhitespace(source, scanValue(source, offset + 1));
    if (source[offset] === ',') offset = skipWhitespace(source, offset + 1);
    else if (source[offset] !== '}') fail('invalid-json');
  }
}

/** Trim and NFC-normalize a user-entered name, then enforce bounded single-line text. */
export function normalizeDisplayName(value: unknown): string {
  if (typeof value !== 'string') fail('invalid-display-name');
  const normalized = value.trim().normalize('NFC');
  if (
    normalized.length === 0
    || normalized === '.'
    || normalized === '..'
    || CONTROL_OR_LINE_BREAK.test(normalized)
    || INVISIBLE_DIRECTIONAL_FORMAT.test(normalized)
    || UNPAIRED_SURROGATE.test(normalized)
  ) {
    fail('invalid-display-name');
  }
  if (
    Array.from(normalized).length > DISPLAY_NAME_LIMITS.maxCodePoints
    || byteLength(normalized) > DISPLAY_NAME_LIMITS.maxUtf8Bytes
  ) {
    fail('display-name-too-long');
  }
  return normalized;
}

export function createDefaultDisplayNameState(): DisplayNameState {
  return Object.freeze({
    schemaVersion: DISPLAY_NAME_LIMITS.schemaVersion,
    displayName: SHIPPED_PRODUCT_IDENTITY.displayName,
  });
}

export function validateDisplayNameState(value: unknown): DisplayNameState {
  const record = ownRecord(value);
  if (Object.keys(record).length !== ROOT_FIELDS.size) fail('unexpected-field');
  if (record.schemaVersion !== DISPLAY_NAME_LIMITS.schemaVersion) fail('unsupported-version');
  const displayName = normalizeDisplayName(record.displayName);
  if (displayName !== record.displayName) fail('invalid-display-name');
  return Object.freeze({ schemaVersion: DISPLAY_NAME_LIMITS.schemaVersion, displayName });
}

/** Parse and fully revalidate persisted state before it reaches the UI. */
export function parseDisplayNameState(payload: string | Uint8Array): DisplayNameState {
  const payloadSize = typeof payload === 'string' ? byteLength(payload) : payload.byteLength;
  if (payloadSize > DISPLAY_NAME_LIMITS.maxPayloadBytes) fail('payload-too-large');
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
  assertUniqueRootFields(source);
  return validateDisplayNameState(parsed);
}

/** Return a stable, minimal persistence payload containing no presentation metadata. */
export function serializeDisplayNameState(state: DisplayNameState): string {
  const validated = validateDisplayNameState(state);
  return JSON.stringify({ schemaVersion: validated.schemaVersion, displayName: validated.displayName });
}

function validateTimestamp(occurredAt: string): string {
  const timestamp = Date.parse(occurredAt);
  if (
    !ISO_UTC_TIMESTAMP.test(occurredAt)
    || Number.isNaN(timestamp)
    || new Date(timestamp).toISOString() !== occurredAt
  ) fail('invalid-timestamp');
  return occurredAt;
}

function stateKind(displayName: string): 'shipped' | 'custom' {
  return displayName === SHIPPED_PRODUCT_IDENTITY.displayName ? 'shipped' : 'custom';
}

function mutation(
  action: DisplayNameMutationRecord['action'],
  occurredAt: string,
  previousName: string,
  nextName: string,
): DisplayNameMutationRecord {
  return Object.freeze({
    schemaVersion: DISPLAY_NAME_LIMITS.mutationSchemaVersion,
    action,
    occurredAt: validateTimestamp(occurredAt),
    field: 'display-name',
    previousState: stateKind(previousName),
    nextState: stateKind(nextName),
    redacted: true,
    summary: action === 'display-name-reset'
      ? 'Application display name reset.'
      : 'Application display name changed.',
  });
}

/** Rename the UI label. Equivalent normalized edits are deterministic no-ops. */
export function renameDisplayName(
  state: DisplayNameState,
  requestedName: unknown,
  occurredAt: string,
): DisplayNameChangeResult {
  const current = validateDisplayNameState(state);
  const nextName = normalizeDisplayName(requestedName);
  if (nextName === current.displayName) return Object.freeze({ state: current, mutation: null });
  const nextState = Object.freeze({ schemaVersion: DISPLAY_NAME_LIMITS.schemaVersion, displayName: nextName });
  return Object.freeze({
    state: nextState,
    mutation: mutation('display-name-renamed', occurredAt, current.displayName, nextName),
  });
}

/** Restore the shipped UI label without changing any stable product identifier. */
export function resetDisplayName(state: DisplayNameState, occurredAt: string): DisplayNameChangeResult {
  const current = validateDisplayNameState(state);
  if (current.displayName === SHIPPED_PRODUCT_IDENTITY.displayName) {
    return Object.freeze({ state: current, mutation: null });
  }
  const nextState = createDefaultDisplayNameState();
  return Object.freeze({
    state: nextState,
    mutation: mutation('display-name-reset', occurredAt, current.displayName, nextState.displayName),
  });
}

function validatePresentationInputs(inputs: DisplayNamePresentationInputs): DisplayNamePresentationInputs {
  const expectedFields = new Set(['languageMode', 'englishFunnyLevel', 'cantoneseFunnyLevel']);
  if (
    inputs === null
    || typeof inputs !== 'object'
    || Object.keys(inputs).length !== expectedFields.size
    || Object.keys(inputs).some((key) => UNSAFE_FIELDS.has(key) || !expectedFields.has(key))
    || !['english', 'cantonese', 'bilingual'].includes(inputs.languageMode)
    || !Number.isInteger(inputs.englishFunnyLevel)
    || inputs.englishFunnyLevel < 1
    || inputs.englishFunnyLevel > 5
    || !Number.isInteger(inputs.cantoneseFunnyLevel)
    || inputs.cantoneseFunnyLevel < 1
    || inputs.cantoneseFunnyLevel > 5
  ) {
    fail('invalid-presentation');
  }
  return Object.freeze({
    languageMode: inputs.languageMode,
    englishFunnyLevel: inputs.englishFunnyLevel,
    cantoneseFunnyLevel: inputs.cantoneseFunnyLevel,
  });
}

/** Resolve UI-introducing copy while keeping language and tone as presentation-only inputs. */
export function resolveDisplayNameForUi(
  state: DisplayNameState,
  inputs: DisplayNamePresentationInputs,
): DisplayNameUiPresentation {
  const validatedState = validateDisplayNameState(state);
  const presentation = validatePresentationInputs(inputs);
  return Object.freeze({ displayName: validatedState.displayName, ...presentation });
}

/** Public diagnostics always identify the shipped product, never a user-selected label. */
export function getPublicDiagnosticIdentity(): typeof SHIPPED_PRODUCT_IDENTITY {
  return SHIPPED_PRODUCT_IDENTITY;
}
