/**
 * Framework-neutral toy-lock model.
 *
 * Credentials and entered values stay behind the host's credential-vault and
 * verifier boundaries. This module stores only stable vault references and
 * keeps transient unlock leases and attempt throttles in memory.
 */

export const LOCKS_SCHEMA_VERSION = 1 as const;
export const LOCK_DISCLOSURE = 'This is a user-experience lock, not a security boundary.' as const;

export const LOCK_LIMITS = Object.freeze({
  jsonBytes: 128 * 1024,
  maxDepth: 10,
  maxLocks: 1_024,
  maxIdCodePoints: 128,
  maxLabelCodePoints: 160,
  maxPathCodePoints: 1_024,
  maxGeneration: 2_147_483_647,
  maxCredentialRevision: 2_147_483_647,
  maxUnlockMinutes: 24 * 60,
  maxFailedAttempts: 3,
  failedAttemptWindowMs: 60_000,
  throttleMs: 30_000,
  totpSkewSteps: 1,
});

export type LockTargetKind = 'tab' | 'group' | 'appearance-property';
export type LockCredentialMethod = 'password-hash' | 'totp';
export type LockUnlockDuration =
  | Readonly<{ kind: 'surface'; minutes: null }>
  | Readonly<{ kind: 'minutes'; minutes: number }>
  | Readonly<{ kind: 'until-close'; minutes: null }>;

export interface LockTarget {
  readonly kind: LockTargetKind;
  readonly id: string;
}

/** Metadata only. The referenced vault item owns the hash or TOTP material. */
export interface LockCredentialReference {
  readonly method: LockCredentialMethod;
  readonly vaultKey: string;
  readonly revision: number;
}

export interface LockRecord {
  readonly id: string;
  readonly target: LockTarget;
  readonly label: string;
  readonly credential: LockCredentialReference;
  readonly unlockDuration: LockUnlockDuration;
  readonly lockedOnLaunch: true;
}

export interface LocksState {
  readonly schemaVersion: typeof LOCKS_SCHEMA_VERSION;
  readonly generation: number;
  readonly appDataFolder: string;
  readonly locks: readonly LockRecord[];
}

export interface LockRecoveryDescriptor {
  readonly appDataFolder: string;
  readonly disclosure: typeof LOCK_DISCLOSURE;
  readonly resetInstruction: string;
  readonly copyText: string;
  readonly action: 'open-folder-only';
  readonly deletesData: false;
}

export interface LockVerificationRequest {
  readonly lockId: string;
  readonly targetKind: LockTargetKind;
  readonly targetId: string;
  readonly credentialMethod: LockCredentialMethod;
  readonly vaultKey: string;
  readonly credentialRevision: number;
  readonly purpose: 'unlock';
  readonly allowedTotpSkewSteps: number;
}

export interface LockVerificationResult {
  readonly status: 'accepted' | 'rejected' | 'unavailable';
  readonly matchedTotpStep: number | null;
}

export type LockVerifier = (
  request: Readonly<LockVerificationRequest>,
) => Promise<Readonly<LockVerificationResult>> | Readonly<LockVerificationResult>;

export interface LockMutationSummary {
  readonly lockId: string;
  readonly targetKind: LockTargetKind;
  readonly targetId: string;
  readonly label: string;
  readonly credentialMethod: LockCredentialMethod;
  readonly credentialRevision: number;
  readonly credentialReference: 'redacted';
  readonly unlockDurationKind: LockUnlockDuration['kind'];
  readonly unlockMinutes: number | null;
  readonly lockedOnLaunch: true;
}

export interface LockHistoryMutation {
  readonly schemaVersion: typeof LOCKS_SCHEMA_VERSION;
  readonly action: 'lock-created' | 'lock-changed' | 'lock-removed' | 'lock-restored';
  readonly occurredAtMs: number;
  readonly before: LockMutationSummary | null;
  readonly after: LockMutationSummary | null;
}

export type LockStateMutationResult = Readonly<{
  changed: boolean;
  state: LocksState;
  history: LockHistoryMutation | null;
}>;

export type RestoreLockResult =
  | Readonly<{ ok: true; state: LocksState; history: LockHistoryMutation }>
  | Readonly<{ ok: false; code: 'credential-unavailable' | 'target-already-locked'; state: LocksState; history: null }>;

export interface LockSearchResult {
  readonly id: string;
  readonly label: string;
  readonly targetKind: LockTargetKind;
  readonly targetId: string;
  readonly locked: boolean;
  readonly statusLabel: 'Locked' | 'Unlocked';
  readonly paletteLabel: string;
}

export interface BulkClosePreview {
  readonly requested: number;
  readonly closeable: readonly string[];
  readonly excludedLocked: readonly string[];
  readonly includeLocked: boolean;
}

export interface SchoolModeLockPresentation {
  readonly schoolModeEnabled: boolean;
  readonly schoolModeLabel: string;
  readonly language: 'English' | 'configured';
  readonly locksRemainEnforced: true;
  readonly lockControlsDiscoverable: true;
  readonly disclosure: typeof LOCK_DISCLOSURE;
}

const ROOT_FIELDS = new Set(['schemaVersion', 'generation', 'appDataFolder', 'locks']);
const LOCK_FIELDS = new Set(['id', 'target', 'label', 'credential', 'unlockDuration', 'lockedOnLaunch']);
const TARGET_FIELDS = new Set(['kind', 'id']);
const CREDENTIAL_FIELDS = new Set(['method', 'vaultKey', 'revision']);
const DURATION_FIELDS = new Set(['kind', 'minutes']);
const VERIFICATION_RESULT_FIELDS = new Set(['status', 'matchedTotpStep']);
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const SAFE_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._:/-]{0,126}[A-Za-z0-9])?$/u;
const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/u;

class LockContractError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'LockContractError';
  }
}

class BoundedJsonParser {
  private offset = 0;

  constructor(private readonly source: string) {}

  parse(): unknown {
    this.skipWhitespace();
    const value = this.value(1);
    this.skipWhitespace();
    if (this.offset !== this.source.length) this.fail('Locks state is malformed JSON.');
    return value;
  }

  private value(depth: number): unknown {
    if (depth > LOCK_LIMITS.maxDepth) this.fail('Locks state exceeds the nesting limit.');
    const token = this.source[this.offset];
    if (token === '{') return this.object(depth);
    if (token === '[') return this.array(depth);
    if (token === '"') return this.string();
    if (token === '-' || (token !== undefined && token >= '0' && token <= '9')) return this.number();
    if (this.source.startsWith('true', this.offset)) return this.literal('true', true);
    if (this.source.startsWith('false', this.offset)) return this.literal('false', false);
    if (this.source.startsWith('null', this.offset)) return this.literal('null', null);
    return this.fail('Locks state is malformed JSON.');
  }

  private object(depth: number): Record<string, unknown> {
    this.offset += 1;
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    const keys = new Set<string>();
    this.skipWhitespace();
    if (this.source[this.offset] === '}') { this.offset += 1; return result; }
    while (this.offset < this.source.length) {
      if (this.source[this.offset] !== '"') this.fail('Locks state is malformed JSON.');
      const key = this.string();
      if (keys.has(key)) this.fail('Locks state contains a duplicate key.');
      if (UNSAFE_KEYS.has(key)) this.fail('Locks state contains an unsafe key.');
      keys.add(key);
      this.skipWhitespace();
      if (this.source[this.offset] !== ':') this.fail('Locks state is malformed JSON.');
      this.offset += 1;
      this.skipWhitespace();
      result[key] = this.value(depth + 1);
      this.skipWhitespace();
      if (this.source[this.offset] === '}') { this.offset += 1; return result; }
      if (this.source[this.offset] !== ',') this.fail('Locks state is malformed JSON.');
      this.offset += 1;
      this.skipWhitespace();
    }
    return this.fail('Locks state is malformed JSON.');
  }

  private array(depth: number): unknown[] {
    this.offset += 1;
    const result: unknown[] = [];
    this.skipWhitespace();
    if (this.source[this.offset] === ']') { this.offset += 1; return result; }
    while (this.offset < this.source.length) {
      result.push(this.value(depth + 1));
      if (result.length > LOCK_LIMITS.maxLocks) this.fail('Locks state contains too many records.');
      this.skipWhitespace();
      if (this.source[this.offset] === ']') { this.offset += 1; return result; }
      if (this.source[this.offset] !== ',') this.fail('Locks state is malformed JSON.');
      this.offset += 1;
      this.skipWhitespace();
    }
    return this.fail('Locks state is malformed JSON.');
  }

  private string(): string {
    const start = this.offset;
    this.offset += 1;
    while (this.offset < this.source.length) {
      const character = this.source[this.offset];
      if (character === '"') {
        this.offset += 1;
        try { return JSON.parse(this.source.slice(start, this.offset)) as string; }
        catch { return this.fail('Locks state is malformed JSON.'); }
      }
      if (character === '\\') {
        this.offset += 1;
        const escape = this.source[this.offset];
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/u.test(this.source.slice(this.offset + 1, this.offset + 5))) {
            this.fail('Locks state is malformed JSON.');
          }
          this.offset += 5;
          continue;
        }
        if (escape === undefined || !'"\\/bfnrt'.includes(escape)) this.fail('Locks state is malformed JSON.');
      } else if (character === undefined || character.charCodeAt(0) < 0x20) {
        this.fail('Locks state is malformed JSON.');
      }
      this.offset += 1;
    }
    return this.fail('Locks state is malformed JSON.');
  }

  private number(): number {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(this.source.slice(this.offset));
    if (!match) return this.fail('Locks state is malformed JSON.');
    this.offset += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) this.fail('Locks state is malformed JSON.');
    return value;
  }

  private literal<T>(token: string, value: T): T { this.offset += token.length; return value; }
  private skipWhitespace(): void { while (' \t\r\n'.includes(this.source[this.offset] ?? 'x')) this.offset += 1; }
  private fail(message: string): never { throw new LockContractError(message); }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function onlyFields(value: Record<string, unknown>, fields: ReadonlySet<string>, context: string): void {
  const keys = Object.keys(value);
  if (keys.length !== fields.size) throw new LockContractError(`${context} must contain the exact fields.`);
  for (const key of keys) {
    if (UNSAFE_KEYS.has(key)) throw new LockContractError(`${context} contains an unsafe key.`);
    if (!fields.has(key)) throw new LockContractError(`${context} contains an unexpected field.`);
  }
}

function text(value: unknown, maximum: number, context: string, pattern?: RegExp): string {
  if (
    typeof value !== 'string'
    || value.trim().length === 0
    || Array.from(value).length > maximum
    || CONTROL_CHARACTERS.test(value)
    || (pattern && !pattern.test(value))
  ) throw new LockContractError(`${context} is invalid.`);
  return value;
}

function integer(value: unknown, minimum: number, maximum: number, context: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new LockContractError(`${context} is invalid.`);
  }
  return value as number;
}

function target(input: unknown): LockTarget {
  if (!isPlainRecord(input)) throw new LockContractError('Lock target must be a plain object.');
  onlyFields(input, TARGET_FIELDS, 'Lock target');
  if (input.kind !== 'tab' && input.kind !== 'group' && input.kind !== 'appearance-property') {
    throw new LockContractError('Lock target kind is invalid.');
  }
  return Object.freeze({ kind: input.kind, id: text(input.id, LOCK_LIMITS.maxIdCodePoints, 'Lock target identity', SAFE_ID) });
}

function credential(input: unknown): LockCredentialReference {
  if (!isPlainRecord(input)) throw new LockContractError('Lock credential reference must be a plain object.');
  onlyFields(input, CREDENTIAL_FIELDS, 'Lock credential reference');
  if (input.method !== 'password-hash' && input.method !== 'totp') {
    throw new LockContractError('Lock credential method is invalid.');
  }
  return Object.freeze({
    method: input.method,
    vaultKey: text(input.vaultKey, LOCK_LIMITS.maxIdCodePoints, 'Credential-vault key', SAFE_ID),
    revision: integer(input.revision, 1, LOCK_LIMITS.maxCredentialRevision, 'Credential revision'),
  });
}

function duration(input: unknown): LockUnlockDuration {
  if (!isPlainRecord(input)) throw new LockContractError('Unlock duration must be a plain object.');
  onlyFields(input, DURATION_FIELDS, 'Unlock duration');
  if (input.kind === 'minutes') {
    return Object.freeze({ kind: 'minutes', minutes: integer(input.minutes, 1, LOCK_LIMITS.maxUnlockMinutes, 'Unlock minutes') });
  }
  if ((input.kind === 'surface' || input.kind === 'until-close') && input.minutes === null) {
    return Object.freeze({ kind: input.kind, minutes: null });
  }
  throw new LockContractError('Unlock duration is invalid.');
}

export function validateLockRecord(input: unknown): LockRecord {
  if (!isPlainRecord(input)) throw new LockContractError('Lock record must be a plain object.');
  onlyFields(input, LOCK_FIELDS, 'Lock record');
  if (input.lockedOnLaunch !== true) throw new LockContractError('Locks must be locked on launch.');
  return Object.freeze({
    id: text(input.id, LOCK_LIMITS.maxIdCodePoints, 'Lock identity', SAFE_ID),
    target: target(input.target),
    label: text(input.label, LOCK_LIMITS.maxLabelCodePoints, 'Lock label'),
    credential: credential(input.credential),
    unlockDuration: duration(input.unlockDuration),
    lockedOnLaunch: true,
  });
}

function freezeState(generation: number, appDataFolder: string, locks: readonly LockRecord[]): LocksState {
  return Object.freeze({
    schemaVersion: LOCKS_SCHEMA_VERSION,
    generation,
    appDataFolder,
    locks: Object.freeze(locks.map((lock) => validateLockRecord(lock))),
  });
}

export function validateLocksState(input: unknown): LocksState {
  if (!isPlainRecord(input)) throw new LockContractError('Locks state must be a plain object.');
  onlyFields(input, ROOT_FIELDS, 'Locks state');
  if (input.schemaVersion !== LOCKS_SCHEMA_VERSION) throw new LockContractError('Locks schema version is unsupported.');
  if (!Array.isArray(input.locks) || input.locks.length > LOCK_LIMITS.maxLocks) {
    throw new LockContractError('Locks list is invalid.');
  }
  const locks = input.locks.map(validateLockRecord);
  const ids = new Set<string>();
  const targets = new Set<string>();
  const credentialKeys = new Set<string>();
  for (const lock of locks) {
    if (ids.has(lock.id)) throw new LockContractError('Lock identities must be unique.');
    const targetKey = `${lock.target.kind}\0${lock.target.id}`;
    if (targets.has(targetKey)) throw new LockContractError('Each target may have only one independent lock.');
    if (credentialKeys.has(lock.credential.vaultKey)) {
      throw new LockContractError('Each lock must use an independent credential-vault key.');
    }
    ids.add(lock.id);
    targets.add(targetKey);
    credentialKeys.add(lock.credential.vaultKey);
  }
  return freezeState(
    integer(input.generation, 0, LOCK_LIMITS.maxGeneration, 'Locks generation'),
    text(input.appDataFolder, LOCK_LIMITS.maxPathCodePoints, 'Application-data folder'),
    locks,
  );
}

export function parseLocksStateJson(source: string | Uint8Array): LocksState {
  const bytes = typeof source === 'string' ? new TextEncoder().encode(source) : source;
  if (bytes.byteLength > LOCK_LIMITS.jsonBytes) throw new LockContractError('Locks state exceeds the byte limit.');
  let decoded: string;
  try { decoded = typeof source === 'string' ? source : new TextDecoder('utf-8', { fatal: true }).decode(source); }
  catch { throw new LockContractError('Locks state is not valid UTF-8.'); }
  return validateLocksState(new BoundedJsonParser(decoded).parse());
}

export function createEmptyLocksState(appDataFolder: string): LocksState {
  return freezeState(0, text(appDataFolder, LOCK_LIMITS.maxPathCodePoints, 'Application-data folder'), []);
}

function nextGeneration(state: LocksState): number {
  if (state.generation >= LOCK_LIMITS.maxGeneration) throw new RangeError('Locks generation limit has been reached.');
  return state.generation + 1;
}

function summary(lock: LockRecord): LockMutationSummary {
  return Object.freeze({
    lockId: lock.id,
    targetKind: lock.target.kind,
    targetId: lock.target.id,
    label: lock.label,
    credentialMethod: lock.credential.method,
    credentialRevision: lock.credential.revision,
    credentialReference: 'redacted',
    unlockDurationKind: lock.unlockDuration.kind,
    unlockMinutes: lock.unlockDuration.minutes,
    lockedOnLaunch: true,
  });
}

function history(
  action: LockHistoryMutation['action'], before: LockRecord | null, after: LockRecord | null, occurredAtMs: number,
): LockHistoryMutation {
  return Object.freeze({
    schemaVersion: LOCKS_SCHEMA_VERSION,
    action,
    occurredAtMs: integer(occurredAtMs, 0, Number.MAX_SAFE_INTEGER, 'Mutation timestamp'),
    before: before ? summary(before) : null,
    after: after ? summary(after) : null,
  });
}

function replaceLocks(stateInput: LocksState, locks: readonly LockRecord[]): LocksState {
  const state = validateLocksState(stateInput);
  return freezeState(nextGeneration(state), state.appDataFolder, locks);
}

export function createLock(stateInput: LocksState, recordInput: LockRecord, occurredAtMs = Date.now()): LockStateMutationResult {
  const state = validateLocksState(stateInput);
  const record = validateLockRecord(recordInput);
  if (state.locks.some((item) => item.id === record.id || (item.target.kind === record.target.kind && item.target.id === record.target.id))) {
    throw new LockContractError('Lock identity and target must be unique.');
  }
  if (state.locks.some((item) => item.credential.vaultKey === record.credential.vaultKey)) {
    throw new LockContractError('Each lock must use an independent credential-vault key.');
  }
  const next = replaceLocks(state, [...state.locks, record]);
  return Object.freeze({ changed: true, state: next, history: history('lock-created', null, record, occurredAtMs) });
}

export function changeLock(stateInput: LocksState, lockId: string, recordInput: LockRecord, occurredAtMs = Date.now()): LockStateMutationResult {
  const state = validateLocksState(stateInput);
  const id = text(lockId, LOCK_LIMITS.maxIdCodePoints, 'Lock identity', SAFE_ID);
  const index = state.locks.findIndex((item) => item.id === id);
  if (index < 0) throw new LockContractError('Lock does not exist.');
  const record = validateLockRecord(recordInput);
  if (record.id !== id) throw new LockContractError('A lock identity cannot be changed.');
  if (state.locks.some((item, candidate) => candidate !== index && item.target.kind === record.target.kind && item.target.id === record.target.id)) {
    throw new LockContractError('Lock target is already in use.');
  }
  if (state.locks.some((item, candidate) => candidate !== index && item.credential.vaultKey === record.credential.vaultKey)) {
    throw new LockContractError('Each lock must use an independent credential-vault key.');
  }
  const before = state.locks[index];
  if (JSON.stringify(before) === JSON.stringify(record)) return Object.freeze({ changed: false, state, history: null });
  const locks = [...state.locks];
  locks[index] = record;
  const next = replaceLocks(state, locks);
  return Object.freeze({ changed: true, state: next, history: history('lock-changed', before, record, occurredAtMs) });
}

export function removeLock(stateInput: LocksState, lockId: string, occurredAtMs = Date.now()): LockStateMutationResult {
  const state = validateLocksState(stateInput);
  const id = text(lockId, LOCK_LIMITS.maxIdCodePoints, 'Lock identity', SAFE_ID);
  const before = state.locks.find((item) => item.id === id);
  if (!before) return Object.freeze({ changed: false, state, history: null });
  const next = replaceLocks(state, state.locks.filter((item) => item.id !== id));
  return Object.freeze({ changed: true, state: next, history: history('lock-removed', before, null, occurredAtMs) });
}

export async function restoreLock(
  stateInput: LocksState,
  recordInput: LockRecord,
  credentialAvailable: (reference: Readonly<LockCredentialReference>) => Promise<boolean> | boolean,
  occurredAtMs = Date.now(),
): Promise<RestoreLockResult> {
  const state = validateLocksState(stateInput);
  const record = validateLockRecord(recordInput);
  if (state.locks.some((item) => item.id === record.id || (item.target.kind === record.target.kind && item.target.id === record.target.id))) {
    return Object.freeze({ ok: false, code: 'target-already-locked', state, history: null });
  }
  let available = false;
  try { available = await credentialAvailable(record.credential); } catch { available = false; }
  if (available !== true) return Object.freeze({ ok: false, code: 'credential-unavailable', state, history: null });
  const next = replaceLocks(state, [...state.locks, record]);
  return Object.freeze({ ok: true, state: next, history: history('lock-restored', null, record, occurredAtMs) });
}

export function createLockRecoveryDescriptor(appDataFolder: string): LockRecoveryDescriptor {
  const folder = text(appDataFolder, LOCK_LIMITS.maxPathCodePoints, 'Application-data folder');
  const resetInstruction = `To reset every lock, close the app and delete this application-data folder yourself: ${folder}`;
  return Object.freeze({
    appDataFolder: folder,
    disclosure: LOCK_DISCLOSURE,
    resetInstruction,
    copyText: `${LOCK_DISCLOSURE}\n${resetInstruction}\nThe app opens the folder only and never deletes it for you.`,
    action: 'open-folder-only',
    deletesData: false,
  });
}

export function deriveSchoolModeLockPresentation(schoolModeEnabled: boolean, schoolModeLabel: string): SchoolModeLockPresentation {
  if (typeof schoolModeEnabled !== 'boolean') throw new LockContractError('School-mode state must be boolean.');
  const label = text(schoolModeLabel, LOCK_LIMITS.maxLabelCodePoints, 'School-mode label');
  return Object.freeze({
    schoolModeEnabled,
    schoolModeLabel: label,
    language: schoolModeEnabled ? 'English' : 'configured',
    locksRemainEnforced: true,
    lockControlsDiscoverable: true,
    disclosure: LOCK_DISCLOSURE,
  });
}

interface RuntimeLease { readonly kind: LockUnlockDuration['kind']; readonly surfaceId: string | null; readonly expiresAtMs: number | null; }
interface AttemptState { failures: number[]; throttledUntilMs: number; }

export class LockRuntime {
  private readonly leases = new Map<string, RuntimeLease>();
  private readonly attempts = new Map<string, AttemptState>();

  constructor(private readonly now: () => number = Date.now) {}

  isUnlocked(lockInput: LockRecord, surfaceId?: string): boolean {
    const lock = validateLockRecord(lockInput);
    const lease = this.leases.get(lock.id);
    if (!lease) return false;
    const current = this.time();
    if (lease.expiresAtMs !== null && lease.expiresAtMs <= current) {
      this.leases.delete(lock.id);
      return false;
    }
    if (lease.kind === 'surface') return typeof surfaceId === 'string' && surfaceId === lease.surfaceId;
    return true;
  }

  lockAgain(lockId: string): boolean {
    const id = text(lockId, LOCK_LIMITS.maxIdCodePoints, 'Lock identity', SAFE_ID);
    this.attempts.delete(id);
    return this.leases.delete(id);
  }

  closeSurface(surfaceId: string): readonly string[] {
    const id = text(surfaceId, LOCK_LIMITS.maxIdCodePoints, 'Surface identity', SAFE_ID);
    const relocked: string[] = [];
    for (const [lockId, lease] of this.leases) {
      if (lease.kind === 'surface' && lease.surfaceId === id) {
        this.leases.delete(lockId);
        relocked.push(lockId);
      }
    }
    return Object.freeze(relocked);
  }

  closeApplication(): readonly string[] {
    const relocked = Object.freeze([...this.leases.keys()]);
    this.leases.clear();
    this.attempts.clear();
    return relocked;
  }

  async unlock(lockInput: LockRecord, verifier: LockVerifier, surfaceId?: string): Promise<Readonly<{
    ok: boolean;
    code: 'unlocked' | 'credential-rejected' | 'credential-unavailable' | 'rate-limited';
    retryAtMs: number | null;
  }>> {
    const lock = validateLockRecord(lockInput);
    const current = this.time();
    const attempt = this.currentAttempt(lock.id, current);
    if (attempt.throttledUntilMs > current) {
      return Object.freeze({ ok: false, code: 'rate-limited', retryAtMs: attempt.throttledUntilMs });
    }
    const normalizedSurface = lock.unlockDuration.kind === 'surface'
      ? text(surfaceId, LOCK_LIMITS.maxIdCodePoints, 'Surface identity', SAFE_ID)
      : null;
    const request: Readonly<LockVerificationRequest> = Object.freeze({
      lockId: lock.id,
      targetKind: lock.target.kind,
      targetId: lock.target.id,
      credentialMethod: lock.credential.method,
      vaultKey: lock.credential.vaultKey,
      credentialRevision: lock.credential.revision,
      purpose: 'unlock',
      allowedTotpSkewSteps: lock.credential.method === 'totp' ? LOCK_LIMITS.totpSkewSteps : 0,
    });
    let raw: unknown;
    try { raw = await verifier(request); } catch { raw = null; }
    const result = this.verificationResult(raw, lock.credential.method);
    if (result?.status === 'accepted') {
      this.attempts.delete(lock.id);
      this.leases.set(lock.id, Object.freeze({
        kind: lock.unlockDuration.kind,
        surfaceId: normalizedSurface,
        expiresAtMs: lock.unlockDuration.kind === 'minutes'
          ? current + lock.unlockDuration.minutes * 60_000
          : null,
      }));
      return Object.freeze({ ok: true, code: 'unlocked', retryAtMs: null });
    }
    if (result?.status === 'rejected') {
      const retryAtMs = this.recordFailure(lock.id, current);
      return Object.freeze({ ok: false, code: retryAtMs === null ? 'credential-rejected' : 'rate-limited', retryAtMs });
    }
    return Object.freeze({ ok: false, code: 'credential-unavailable', retryAtMs: null });
  }

  private time(): number {
    return integer(this.now(), 0, Number.MAX_SAFE_INTEGER, 'Current time');
  }

  private currentAttempt(lockId: string, current: number): AttemptState {
    const previous = this.attempts.get(lockId) ?? { failures: [], throttledUntilMs: 0 };
    if (previous.throttledUntilMs > 0 && previous.throttledUntilMs <= current) return { failures: [], throttledUntilMs: 0 };
    const failures = previous.failures.filter((time) => current - time < LOCK_LIMITS.failedAttemptWindowMs);
    const result = { failures, throttledUntilMs: previous.throttledUntilMs };
    this.attempts.set(lockId, result);
    return result;
  }

  private recordFailure(lockId: string, current: number): number | null {
    const attempt = this.currentAttempt(lockId, current);
    attempt.failures.push(current);
    if (attempt.failures.length < LOCK_LIMITS.maxFailedAttempts) return null;
    attempt.throttledUntilMs = current + LOCK_LIMITS.throttleMs;
    return attempt.throttledUntilMs;
  }

  private verificationResult(value: unknown, method: LockCredentialMethod): LockVerificationResult | null {
    if (!isPlainRecord(value)) return null;
    try { onlyFields(value, VERIFICATION_RESULT_FIELDS, 'Lock verification result'); } catch { return null; }
    if (value.status !== 'accepted' && value.status !== 'rejected' && value.status !== 'unavailable') return null;
    if (value.matchedTotpStep !== null && !Number.isInteger(value.matchedTotpStep)) return null;
    if (method === 'password-hash' && value.matchedTotpStep !== null) return null;
    if (
      method === 'totp'
      && value.status === 'accepted'
      && (typeof value.matchedTotpStep !== 'number' || Math.abs(value.matchedTotpStep) > LOCK_LIMITS.totpSkewSteps)
    ) return null;
    if (value.status !== 'accepted' && value.matchedTotpStep !== null) return null;
    return Object.freeze({ status: value.status, matchedTotpStep: value.matchedTotpStep as number | null });
  }
}

export function listLocks(stateInput: LocksState): readonly LockRecord[] {
  return validateLocksState(stateInput).locks;
}

export function searchLocks(stateInput: LocksState, runtime: LockRuntime, query: string, surfaceId?: string): readonly LockSearchResult[] {
  const state = validateLocksState(stateInput);
  if (typeof query !== 'string' || Array.from(query).length > LOCK_LIMITS.maxLabelCodePoints) {
    throw new LockContractError('Lock search query is invalid.');
  }
  const normalized = query.trim().toLocaleLowerCase('en-US');
  return Object.freeze(state.locks
    .filter((lock) => !normalized || [lock.id, lock.label, lock.target.kind, lock.target.id]
      .some((value) => value.toLocaleLowerCase('en-US').includes(normalized)))
    .map((lock) => {
      const locked = !runtime.isUnlocked(lock, surfaceId);
      const statusLabel = locked ? 'Locked' as const : 'Unlocked' as const;
      return Object.freeze({
        id: lock.id,
        label: lock.label,
        targetKind: lock.target.kind,
        targetId: lock.target.id,
        locked,
        statusLabel,
        paletteLabel: `${lock.label} — ${statusLabel}`,
      });
    }));
}

export function previewBulkClose(
  stateInput: LocksState,
  runtime: LockRuntime,
  tabIds: readonly string[],
  options: Readonly<{ includeLocked?: boolean; surfaceId?: string }> = {},
): BulkClosePreview {
  const state = validateLocksState(stateInput);
  const requested = [...new Set(tabIds.map((id) => text(id, LOCK_LIMITS.maxIdCodePoints, 'Tab identity', SAFE_ID)))];
  const lockedTargets = new Set(state.locks
    .filter((lock) => lock.target.kind === 'tab' && !runtime.isUnlocked(lock, options.surfaceId))
    .map((lock) => lock.target.id));
  const includeLocked = options.includeLocked === true;
  const excludedLocked = includeLocked ? [] : requested.filter((id) => lockedTargets.has(id));
  return Object.freeze({
    requested: requested.length,
    closeable: Object.freeze(includeLocked ? requested : requested.filter((id) => !lockedTargets.has(id))),
    excludedLocked: Object.freeze(excludedLocked),
    includeLocked,
  });
}
