/**
 * Framework-neutral shared School-mode contract.
 *
 * This module deliberately performs no storage, credential, history, logging,
 * export, or network work. Hosts provide those boundaries and keep credential
 * material outside this core; only bounded lookup metadata crosses the API.
 */

export const SCHOOL_MODE_SCHEMA_VERSION = 1 as const;
export const SCHOOL_MODE_SHARED_RECORD_ID = 'org.dingdingprojects.shared.school-mode' as const;
export const SCHOOL_MODE_DEFAULT_LABEL = 'School mode' as const;

export const SCHOOL_MODE_LIMITS = Object.freeze({
  jsonBytes: 16 * 1024,
  displayLabelCodePoints: 80,
  credentialIdCodePoints: 128,
  maxGeneration: 2_147_483_647,
  maxCredentialRevision: 2_147_483_647,
});

export type SchoolModeLanguage = 'English' | 'Yue' | 'Bilingual';
export type SchoolModeCredentialMethod = 'none' | 'password' | 'totp';

export interface SchoolModePreferences {
  readonly language: SchoolModeLanguage;
  readonly englishFunnyLevel: number;
  readonly cantoneseFunnyLevel: number;
  readonly personalVocabularyEnabled: boolean;
  readonly dimSumEnabled: boolean;
}

/** Fixed-shape metadata for an operating-system-vault entry. */
export interface SchoolModeCredentialMetadata {
  readonly method: SchoolModeCredentialMethod;
  readonly credentialId: string | null;
  readonly revision: number;
}

export interface SchoolModeState {
  readonly schemaVersion: typeof SCHOOL_MODE_SCHEMA_VERSION;
  readonly recordId: typeof SCHOOL_MODE_SHARED_RECORD_ID;
  readonly generation: number;
  readonly enabled: boolean;
  readonly displayLabel: string;
  readonly preferences: SchoolModePreferences;
  readonly credential: SchoolModeCredentialMetadata;
}

export interface EffectiveSchoolModeState {
  readonly recordId: typeof SCHOOL_MODE_SHARED_RECORD_ID;
  readonly generation: number;
  readonly enabled: boolean;
  readonly displayLabel: string;
  readonly language: SchoolModeLanguage;
  readonly englishFunnyLevel: number | null;
  readonly cantoneseFunnyLevel: number | null;
  readonly personalVocabularyEnabled: boolean;
  readonly dimSumEnabled: boolean;
  readonly discoverability: Readonly<{
    languageModes: readonly SchoolModeLanguage[];
    funnyLevels: boolean;
    personalVocabulary: boolean;
    dimSum: boolean;
  }>;
  readonly suppressed: Readonly<{
    cantonese: boolean;
    bilingual: boolean;
    funnyLevels: boolean;
    personalVocabulary: boolean;
    dimSum: boolean;
  }>;
  readonly disclosure: 'This is a user-experience lock, not a security boundary.';
}

export interface SchoolModeCredentialValidationRequest {
  readonly recordId: typeof SCHOOL_MODE_SHARED_RECORD_ID;
  readonly credentialMethod: SchoolModeCredentialMethod;
  readonly credentialId: string | null;
  readonly credentialRevision: number;
  readonly purpose: 'disable-school-mode';
}

export interface SchoolModeCredentialValidationResult {
  readonly status: 'accepted' | 'rejected' | 'unavailable';
}

export type SchoolModeCredentialValidator = (
  request: Readonly<SchoolModeCredentialValidationRequest>,
) => Promise<Readonly<SchoolModeCredentialValidationResult>> | Readonly<SchoolModeCredentialValidationResult>;

export type SchoolModeTransitionResult =
  | Readonly<{ ok: true; changed: boolean; state: SchoolModeState }>
  | Readonly<{ ok: false; code: 'credential-rejected' | 'credential-unavailable'; state: SchoolModeState }>;

export type SchoolModeUnavailableCause = 'read-failed' | 'watch-failed';

export type SchoolModeSnapshot =
  | Readonly<{
      status: 'ready';
      eventGeneration: number;
      recordGeneration: number;
      state: SchoolModeState;
      effective: EffectiveSchoolModeState;
    }>
  | Readonly<{
      status: 'unavailable';
      eventGeneration: number;
      recordGeneration: number | null;
      code: 'shared-store-unavailable';
      cause: SchoolModeUnavailableCause;
    }>;

export type SchoolModeIngestResult = Readonly<{
  accepted: boolean;
  reason: 'accepted' | 'recovered' | 'duplicate' | 'stale';
  snapshot: SchoolModeSnapshot;
}>;

export type SchoolModeSubscriber = (snapshot: SchoolModeSnapshot) => void;

const ROOT_FIELDS = new Set(['schemaVersion', 'recordId', 'generation', 'enabled', 'displayLabel', 'preferences', 'credential']);
const PREFERENCE_FIELDS = new Set(['language', 'englishFunnyLevel', 'cantoneseFunnyLevel', 'personalVocabularyEnabled', 'dimSumEnabled']);
const CREDENTIAL_FIELDS = new Set(['method', 'credentialId', 'revision']);
const VALIDATION_RESULT_FIELDS = new Set(['status']);
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const CREDENTIAL_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._:/-]{0,126}[A-Za-z0-9])?$/u;
const CONTROL_CHARACTER_PATTERN = /[\p{Cc}\p{Cf}]/u;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertOnlyFields(value: Record<string, unknown>, fields: ReadonlySet<string>, context: string): void {
  for (const key of Object.keys(value)) {
    if (UNSAFE_KEYS.has(key)) throw new TypeError(`${context} contains an unsafe key.`);
    if (!fields.has(key)) throw new TypeError(`${context} contains an unexpected field.`);
  }
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function validateDisplayLabel(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.trim().length === 0
    || codePointLength(value) > SCHOOL_MODE_LIMITS.displayLabelCodePoints
    || CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    throw new RangeError('School-mode display label must be a non-empty bounded text value.');
  }
  return value;
}

function validateBoundedInteger(value: unknown, maximum: number, context: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) {
    throw new RangeError(`${context} must be a bounded non-negative integer.`);
  }
  return value as number;
}

function validateFunnyLevel(value: unknown, context: string): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 5) {
    throw new RangeError(`${context} must be an integer from 1 to 5.`);
  }
  return value as number;
}

function validatePreferences(value: unknown): SchoolModePreferences {
  if (!isPlainRecord(value)) throw new TypeError('School-mode preferences must be a plain object.');
  assertOnlyFields(value, PREFERENCE_FIELDS, 'School-mode preferences');
  if (value.language !== 'English' && value.language !== 'Yue' && value.language !== 'Bilingual') {
    throw new TypeError('School-mode language preference is invalid.');
  }
  if (typeof value.personalVocabularyEnabled !== 'boolean' || typeof value.dimSumEnabled !== 'boolean') {
    throw new TypeError('School-mode feature preferences must be boolean.');
  }
  return Object.freeze({
    language: value.language,
    englishFunnyLevel: validateFunnyLevel(value.englishFunnyLevel, 'English funny level'),
    cantoneseFunnyLevel: validateFunnyLevel(value.cantoneseFunnyLevel, 'Cantonese funny level'),
    personalVocabularyEnabled: value.personalVocabularyEnabled,
    dimSumEnabled: value.dimSumEnabled,
  });
}

function validateCredentialMetadata(value: unknown): SchoolModeCredentialMetadata {
  if (!isPlainRecord(value)) throw new TypeError('School-mode credential metadata must be a plain object.');
  assertOnlyFields(value, CREDENTIAL_FIELDS, 'School-mode credential metadata');
  if (value.method !== 'none' && value.method !== 'password' && value.method !== 'totp') {
    throw new TypeError('School-mode credential method is invalid.');
  }
  const revision = validateBoundedInteger(
    value.revision,
    SCHOOL_MODE_LIMITS.maxCredentialRevision,
    'School-mode credential revision',
  );
  if (value.method === 'none') {
    if (value.credentialId !== null || revision !== 0) {
      throw new TypeError('School-mode credential metadata is inconsistent.');
    }
  } else if (
    typeof value.credentialId !== 'string'
    || codePointLength(value.credentialId) > SCHOOL_MODE_LIMITS.credentialIdCodePoints
    || !CREDENTIAL_ID_PATTERN.test(value.credentialId)
    || revision < 1
  ) {
    throw new TypeError('School-mode credential metadata is invalid.');
  }
  return Object.freeze({ method: value.method, credentialId: value.credentialId as string | null, revision });
}

function freezeState(input: {
  generation: number;
  enabled: boolean;
  displayLabel: string;
  preferences: SchoolModePreferences;
  credential: SchoolModeCredentialMetadata;
}): SchoolModeState {
  return Object.freeze({
    schemaVersion: SCHOOL_MODE_SCHEMA_VERSION,
    recordId: SCHOOL_MODE_SHARED_RECORD_ID,
    generation: input.generation,
    enabled: input.enabled,
    displayLabel: input.displayLabel,
    preferences: Object.freeze({ ...input.preferences }),
    credential: Object.freeze({ ...input.credential }),
  });
}

export function validateSchoolModeState(input: unknown): SchoolModeState {
  if (!isPlainRecord(input)) throw new TypeError('School-mode state must be a plain object.');
  assertOnlyFields(input, ROOT_FIELDS, 'School-mode state');
  if (input.schemaVersion !== SCHOOL_MODE_SCHEMA_VERSION) {
    throw new TypeError('School-mode schema version is unsupported.');
  }
  if (input.recordId !== SCHOOL_MODE_SHARED_RECORD_ID) {
    throw new TypeError('School-mode shared-record identity is invalid.');
  }
  if (typeof input.enabled !== 'boolean') throw new TypeError('School-mode enabled state must be boolean.');
  return freezeState({
    generation: validateBoundedInteger(input.generation, SCHOOL_MODE_LIMITS.maxGeneration, 'School-mode generation'),
    enabled: input.enabled,
    displayLabel: validateDisplayLabel(input.displayLabel),
    preferences: validatePreferences(input.preferences),
    credential: validateCredentialMetadata(input.credential),
  });
}

export function parseSchoolModeStateJson(source: string | Uint8Array): SchoolModeState {
  const bytes = typeof source === 'string' ? new TextEncoder().encode(source) : source;
  if (bytes.byteLength > SCHOOL_MODE_LIMITS.jsonBytes) throw new RangeError('School-mode state exceeds the byte limit.');
  let text: string;
  try {
    text = typeof source === 'string' ? source : new TextDecoder('utf-8', { fatal: true }).decode(source);
  } catch {
    throw new TypeError('School-mode state is not valid UTF-8.');
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new TypeError('School-mode state is malformed JSON.');
  }
  return validateSchoolModeState(value);
}

export function createDefaultSchoolModeState(
  preferences: SchoolModePreferences = {
    language: 'English',
    englishFunnyLevel: 1,
    cantoneseFunnyLevel: 1,
    personalVocabularyEnabled: false,
    dimSumEnabled: true,
  },
): SchoolModeState {
  return freezeState({
    generation: 0,
    enabled: false,
    displayLabel: SCHOOL_MODE_DEFAULT_LABEL,
    preferences: validatePreferences(preferences),
    credential: Object.freeze({ method: 'none', credentialId: null, revision: 0 }),
  });
}

export function deriveEffectiveSchoolMode(stateInput: SchoolModeState): EffectiveSchoolModeState {
  const state = validateSchoolModeState(stateInput);
  const enabled = state.enabled;
  const languageModes: readonly SchoolModeLanguage[] = enabled
    ? Object.freeze(['English'] as SchoolModeLanguage[])
    : Object.freeze(['English', 'Yue', 'Bilingual'] as SchoolModeLanguage[]);
  return Object.freeze({
    recordId: SCHOOL_MODE_SHARED_RECORD_ID,
    generation: state.generation,
    enabled,
    displayLabel: state.displayLabel,
    language: enabled ? 'English' : state.preferences.language,
    englishFunnyLevel: enabled ? null : state.preferences.englishFunnyLevel,
    cantoneseFunnyLevel: enabled ? null : state.preferences.cantoneseFunnyLevel,
    personalVocabularyEnabled: enabled ? false : state.preferences.personalVocabularyEnabled,
    dimSumEnabled: enabled ? false : state.preferences.dimSumEnabled,
    discoverability: Object.freeze({
      languageModes,
      funnyLevels: !enabled,
      personalVocabulary: !enabled,
      dimSum: !enabled,
    }),
    suppressed: Object.freeze({
      cantonese: enabled,
      bilingual: enabled,
      funnyLevels: enabled,
      personalVocabulary: enabled,
      dimSum: enabled,
    }),
    disclosure: 'This is a user-experience lock, not a security boundary.',
  });
}

function nextGeneration(state: SchoolModeState): number {
  if (state.generation >= SCHOOL_MODE_LIMITS.maxGeneration) {
    throw new RangeError('School-mode generation limit has been reached.');
  }
  return state.generation + 1;
}

function updateState(
  stateInput: SchoolModeState,
  change: Partial<Pick<SchoolModeState, 'enabled' | 'displayLabel' | 'preferences' | 'credential'>>,
): SchoolModeState {
  const state = validateSchoolModeState(stateInput);
  return freezeState({
    generation: nextGeneration(state),
    enabled: change.enabled ?? state.enabled,
    displayLabel: change.displayLabel ?? state.displayLabel,
    preferences: change.preferences ?? state.preferences,
    credential: change.credential ?? state.credential,
  });
}

export function renameSchoolMode(stateInput: SchoolModeState, displayLabel: string): SchoolModeState {
  const state = validateSchoolModeState(stateInput);
  const label = validateDisplayLabel(displayLabel);
  return label === state.displayLabel ? state : updateState(state, { displayLabel: label });
}

export function updateSchoolModePreferences(
  stateInput: SchoolModeState,
  preferencesInput: SchoolModePreferences,
): SchoolModeState {
  const state = validateSchoolModeState(stateInput);
  const preferences = validatePreferences(preferencesInput);
  if (JSON.stringify(preferences) === JSON.stringify(state.preferences)) return state;
  return updateState(state, { preferences });
}

export function setSchoolModeCredentialMetadata(
  stateInput: SchoolModeState,
  credentialInput: SchoolModeCredentialMetadata,
): SchoolModeState {
  const state = validateSchoolModeState(stateInput);
  const credential = validateCredentialMetadata(credentialInput);
  if (JSON.stringify(credential) === JSON.stringify(state.credential)) return state;
  return updateState(state, { credential });
}

export function resetSchoolModeCredentialMetadata(stateInput: SchoolModeState): SchoolModeState {
  return setSchoolModeCredentialMetadata(stateInput, { method: 'none', credentialId: null, revision: 0 });
}

function credentialRequest(state: SchoolModeState): Readonly<SchoolModeCredentialValidationRequest> {
  return Object.freeze({
    recordId: SCHOOL_MODE_SHARED_RECORD_ID,
    credentialMethod: state.credential.method,
    credentialId: state.credential.credentialId,
    credentialRevision: state.credential.revision,
    purpose: 'disable-school-mode',
  });
}

function validationStatus(value: unknown): SchoolModeCredentialValidationResult['status'] | null {
  if (!isPlainRecord(value)) return null;
  try {
    assertOnlyFields(value, VALIDATION_RESULT_FIELDS, 'School-mode credential validation result');
  } catch {
    return null;
  }
  return value.status === 'accepted' || value.status === 'rejected' || value.status === 'unavailable'
    ? value.status
    : null;
}

export async function changeSchoolModeEnabled(
  stateInput: SchoolModeState,
  enabled: boolean,
  validator?: SchoolModeCredentialValidator,
): Promise<SchoolModeTransitionResult> {
  const state = validateSchoolModeState(stateInput);
  if (typeof enabled !== 'boolean') throw new TypeError('School-mode enabled state must be boolean.');
  if (enabled === state.enabled) return Object.freeze({ ok: true, changed: false, state });
  if (enabled) {
    return Object.freeze({ ok: true, changed: true, state: updateState(state, { enabled }) });
  }
  if (!validator) return Object.freeze({ ok: false, code: 'credential-unavailable', state });

  let result: unknown;
  try {
    result = await validator(credentialRequest(state));
  } catch {
    return Object.freeze({ ok: false, code: 'credential-unavailable', state });
  }
  const status = validationStatus(result);
  if (status === 'accepted') {
    return Object.freeze({ ok: true, changed: true, state: updateState(state, { enabled: false }) });
  }
  return Object.freeze({
    ok: false,
    code: status === 'rejected' ? 'credential-rejected' : 'credential-unavailable',
    state,
  });
}

function statesEqual(left: SchoolModeState, right: SchoolModeState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Applies live shared-record updates in generation order. A same-generation
 * replay can recover a failed watcher only when it exactly matches the last
 * accepted record; conflicting or older records are rejected as stale.
 */
export class SchoolModeSubscription {
  private eventGeneration = 0;
  private lastAccepted: SchoolModeState | null = null;
  private current: SchoolModeSnapshot = Object.freeze({
    status: 'unavailable',
    eventGeneration: 0,
    recordGeneration: null,
    code: 'shared-store-unavailable',
    cause: 'read-failed',
  });
  private readonly subscribers = new Set<SchoolModeSubscriber>();

  snapshot(): SchoolModeSnapshot {
    return this.current;
  }

  subscribe(subscriber: SchoolModeSubscriber, emitCurrent = true): () => void {
    if (typeof subscriber !== 'function') throw new TypeError('School-mode subscriber must be a function.');
    this.subscribers.add(subscriber);
    if (emitCurrent) subscriber(this.current);
    return () => { this.subscribers.delete(subscriber); };
  }

  ingest(input: unknown): SchoolModeIngestResult {
    const state = validateSchoolModeState(input);
    if (this.lastAccepted && state.generation < this.lastAccepted.generation) {
      return Object.freeze({ accepted: false, reason: 'stale', snapshot: this.current });
    }
    if (this.lastAccepted && state.generation === this.lastAccepted.generation) {
      if (!statesEqual(state, this.lastAccepted)) {
        return Object.freeze({ accepted: false, reason: 'stale', snapshot: this.current });
      }
      if (this.current.status === 'ready') {
        return Object.freeze({ accepted: false, reason: 'duplicate', snapshot: this.current });
      }
      this.setReady(state);
      return Object.freeze({ accepted: true, reason: 'recovered', snapshot: this.current });
    }
    this.lastAccepted = state;
    this.setReady(state);
    return Object.freeze({ accepted: true, reason: 'accepted', snapshot: this.current });
  }

  markUnavailable(cause: SchoolModeUnavailableCause): SchoolModeSnapshot {
    if (cause !== 'read-failed' && cause !== 'watch-failed') {
      throw new TypeError('School-mode unavailability cause is invalid.');
    }
    this.eventGeneration += 1;
    this.current = Object.freeze({
      status: 'unavailable',
      eventGeneration: this.eventGeneration,
      recordGeneration: this.lastAccepted?.generation ?? null,
      code: 'shared-store-unavailable',
      cause,
    });
    this.emit();
    return this.current;
  }

  private setReady(state: SchoolModeState): void {
    this.lastAccepted = state;
    this.eventGeneration += 1;
    this.current = Object.freeze({
      status: 'ready',
      eventGeneration: this.eventGeneration,
      recordGeneration: state.generation,
      state,
      effective: deriveEffectiveSchoolMode(state),
    });
    this.emit();
  }

  private emit(): void {
    for (const subscriber of [...this.subscribers]) subscriber(this.current);
  }
}
