import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import {
  LOCK_LIMITS,
  LockRuntime,
  changeLock,
  createEmptyLocksState,
  createLock,
  createLockRecoveryDescriptor,
  parseLocksStateJson,
  removeLock,
  validateLockRecord,
  type LockRecord,
  type LocksState,
  type LockTarget,
  type LockUnlockDuration,
  type LockRecoveryDescriptor as SharedLockRecoveryDescriptor,
} from '../shared/locks';
import { base32Decode, base32Encode, buildTotpUri, verifyTotp } from '../shared/totp';
import { deleteCredential, readCredential, writeCredential } from './credential-vault';
import { LocalHistory, type JsonValue, type LocalHistoryAction } from './local-history';

export type LockRecoveryDescriptor = SharedLockRecoveryDescriptor;
const STATE_FILE = 'locks-state.json';
const VAULT_ACCOUNT_PREFIX = 'lock-';
const PASSWORD_MAX_CODE_POINTS = 512;
const TOTP_TOKEN_MAX_CODE_POINTS = 16;
const SEARCH_PATTERN_MAX_CODE_POINTS = 256;
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELISM = 1;
const SCRYPT_KEY_BYTES = 32;
const SCRYPT_MAX_MEMORY = 32 * 1024 * 1024;
const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/u;
const SAFE_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._:/-]{0,126}[A-Za-z0-9])?$/u;

export type LockCredentialInput =
  | Readonly<{ method: 'password'; credential: string }>
  | Readonly<{ method: 'totp'; credential: string; confirmationCode: string }>;

export interface PreparedLockTotp {
  readonly manualSecret: string;
  readonly uri: string;
  readonly qrDataUrl: string;
}

export interface LockCreateRequest {
  readonly target: LockTarget;
  readonly label: string;
  readonly credential: LockCredentialInput;
  readonly unlockDuration: LockUnlockDuration;
}

export interface LockUpdateRequest {
  readonly label?: string;
  readonly credential?: LockCredentialInput;
  readonly unlockDuration?: LockUnlockDuration;
}

export interface LockUnlockRequest {
  readonly lockId: string;
  readonly credential: string;
  readonly surfaceId?: string;
}

export interface LockSearchRequest {
  readonly query?: string;
  readonly regex?: Readonly<{ source: string; flags: string }>;
  readonly surfaceId?: string;
}

export interface LockPublicRecord {
  readonly id: string;
  readonly target: LockTarget;
  readonly label: string;
  readonly credential: Readonly<{ method: 'password-hash' | 'totp'; revision: number }>;
  readonly unlockDuration: LockUnlockDuration;
  readonly lockedOnLaunch: true;
}

export interface LockSurfaceEntry {
  readonly record: LockPublicRecord;
  readonly locked: boolean;
}

export interface LockSurfaceState {
  readonly generation: number;
  readonly appDataFolder: string;
  readonly locks: readonly LockSurfaceEntry[];
}

export interface LockUnlockResult {
  readonly ok: boolean;
  readonly code: 'unlocked' | 'credential-rejected' | 'credential-unavailable' | 'rate-limited' | 'lock-not-found';
  readonly retryAtMs: number | null;
}

interface PasswordVerifier {
  readonly schemaVersion: 1;
  readonly kind: 'password-scrypt';
  readonly saltBase64: string;
  readonly digestBase64: string;
  readonly cost: typeof SCRYPT_COST;
  readonly blockSize: typeof SCRYPT_BLOCK_SIZE;
  readonly parallelism: typeof SCRYPT_PARALLELISM;
  readonly keyBytes: typeof SCRYPT_KEY_BYTES;
}

interface TotpVerifier {
  readonly schemaVersion: 1;
  readonly kind: 'totp';
  readonly secretBase32: string;
  readonly algorithm: 'SHA1';
  readonly digits: 6 | 7 | 8;
  readonly period: 30;
}

type VaultVerifier = PasswordVerifier | TotpVerifier;

interface LockServiceDependencies {
  now(): number;
  randomBytes(size: number): Buffer;
  randomUUID(): string;
  writeCredential(target: string, account: string, secret: Uint8Array): Promise<void>;
  readCredential(target: string, account: string): Promise<Buffer | null>;
  deleteCredential(target: string, account: string): Promise<boolean>;
  recordHistory(action: Exclude<LocalHistoryAction, 'restored'>, snapshot: JsonValue): Promise<void>;
  openPath(folder: string): Promise<string | void>;
  qrDataUrl(uri: string): Promise<string>;
}

export interface LockServiceOptions {
  readonly appDataDirectory: string;
  readonly dependencies?: Partial<LockServiceDependencies>;
}

function exactKeys(value: unknown, required: readonly string[], optional: readonly string[] = []): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Lock request must be a plain object.');
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  if (required.some((key) => !Object.hasOwn(input, key)) || keys.some((key) => !required.includes(key) && !optional.includes(key))) {
    throw new Error('Lock request contains missing or unexpected fields.');
  }
}

function boundedText(value: unknown, field: string, maximum: number, pattern?: RegExp): string {
  if (typeof value !== 'string' || value.trim().length === 0 || Array.from(value).length > maximum
    || CONTROL_CHARACTERS.test(value) || (pattern && !pattern.test(value))) {
    throw new Error(`${field} is invalid.`);
  }
  return value;
}

function credentialText(value: unknown, method: LockCredentialInput['method']): string {
  const maximum = method === 'password' ? PASSWORD_MAX_CODE_POINTS : 256;
  return boundedText(value, method === 'password' ? 'Password' : 'TOTP secret', maximum);
}

function parseCredentialInput(value: unknown): LockCredentialInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Lock credential request must be a plain object.');
  const method = (value as Record<string, unknown>).method;
  exactKeys(value, method === 'totp' ? ['method', 'credential', 'confirmationCode'] : ['method', 'credential']);
  if (value.method !== 'password' && value.method !== 'totp') throw new Error('Credential method is invalid.');
  const credential = credentialText(value.credential, value.method);
  if (value.method === 'totp') {
    if (typeof value.confirmationCode !== 'string' || !/^\d{6,8}$/u.test(value.confirmationCode)) {
      throw new Error('TOTP confirmation code must contain 6 through 8 digits.');
    }
    return Object.freeze({ method: 'totp', credential, confirmationCode: value.confirmationCode });
  }
  return Object.freeze({ method: 'password', credential });
}

function parseCreateRequest(value: LockCreateRequest): LockCreateRequest {
  exactKeys(value, ['target', 'label', 'credential', 'unlockDuration']);
  const credential = parseCredentialInput(value.credential);
  const probe = validateLockRecord({
    id: randomUUID(), target: value.target, label: value.label,
    credential: { method: credential.method === 'password' ? 'password-hash' : 'totp', vaultKey: 'probe-key', revision: 1 },
    unlockDuration: value.unlockDuration, lockedOnLaunch: true,
  });
  return Object.freeze({ target: probe.target, label: probe.label, credential, unlockDuration: probe.unlockDuration });
}

function parseUpdateRequest(value: LockUpdateRequest): LockUpdateRequest {
  exactKeys(value, [], ['label', 'credential', 'unlockDuration']);
  if (Object.keys(value).length === 0) throw new Error('Lock update request is empty.');
  const credential = value.credential === undefined ? undefined : parseCredentialInput(value.credential);
  if (value.label !== undefined) boundedText(value.label, 'Lock label', LOCK_LIMITS.maxLabelCodePoints);
  return Object.freeze({ ...value, ...(credential ? { credential } : {}) });
}

function publicRecord(lock: LockRecord): LockPublicRecord {
  return Object.freeze({
    id: lock.id,
    target: Object.freeze({ ...lock.target }),
    label: lock.label,
    credential: Object.freeze({ method: lock.credential.method, revision: lock.credential.revision }),
    unlockDuration: Object.freeze({ ...lock.unlockDuration }),
    lockedOnLaunch: true,
  });
}

function vaultTarget(id: string): string {
  return `lock-${id.replace(/[^A-Za-z0-9._-]/gu, '-')}`;
}

function vaultAccount(id: string): string {
  return `${VAULT_ACCOUNT_PREFIX}${id.replace(/[^A-Za-z0-9@._+-]/gu, '-')}`;
}

function encodeVerifier(verifier: VaultVerifier): Buffer {
  return Buffer.from(JSON.stringify(verifier), 'utf8');
}

function deriveScrypt(password: Buffer, salt: Buffer, keyBytes: number, options: {
  N: number; r: number; p: number; maxmem: number;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyBytes, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(Buffer.from(derivedKey));
    });
  });
}

function canonicalBase64(value: unknown, bytes: number, field: string): Buffer {
  if (typeof value !== 'string' || value.length > 256) throw new Error(`Stored ${field} is invalid.`);
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== bytes || decoded.toString('base64') !== value) {
    decoded.fill(0);
    throw new Error(`Stored ${field} is invalid.`);
  }
  return decoded;
}

function parseVerifier(value: Buffer, expected: LockRecord['credential']['method']): VaultVerifier {
  if (value.length === 0 || value.length > 2_560) throw new Error('Stored lock verifier is invalid.');
  let parsed: unknown;
  try { parsed = JSON.parse(value.toString('utf8')); } catch { throw new Error('Stored lock verifier is invalid.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Stored lock verifier is invalid.');
  const input = parsed as Record<string, unknown>;
  if (expected === 'password-hash') {
    exactKeys(input, ['schemaVersion', 'kind', 'saltBase64', 'digestBase64', 'cost', 'blockSize', 'parallelism', 'keyBytes']);
    if (input.schemaVersion !== 1 || input.kind !== 'password-scrypt' || input.cost !== SCRYPT_COST
      || input.blockSize !== SCRYPT_BLOCK_SIZE || input.parallelism !== SCRYPT_PARALLELISM || input.keyBytes !== SCRYPT_KEY_BYTES) {
      throw new Error('Stored password verifier is unsupported.');
    }
    const salt = canonicalBase64(input.saltBase64, 16, 'password salt');
    const digest = canonicalBase64(input.digestBase64, SCRYPT_KEY_BYTES, 'password digest');
    salt.fill(0); digest.fill(0);
    return input as unknown as PasswordVerifier;
  }
  exactKeys(input, ['schemaVersion', 'kind', 'secretBase32', 'algorithm', 'digits', 'period']);
  if (input.schemaVersion !== 1 || input.kind !== 'totp' || input.algorithm !== 'SHA1'
    || !Number.isInteger(input.digits) || Number(input.digits) < 6 || Number(input.digits) > 8 || input.period !== 30
    || typeof input.secretBase32 !== 'string') throw new Error('Stored TOTP verifier is unsupported.');
  const secret = base32Decode(input.secretBase32);
  secret.fill(0);
  return input as unknown as TotpVerifier;
}

function historySnapshot(state: LocksState, action: string, changedLockId: string): JsonValue {
  return {
    schemaVersion: 1,
    generation: state.generation,
    action,
    changedLockId,
    locks: state.locks.map((lock) => ({
      id: lock.id,
      targetKind: lock.target.kind,
      targetId: lock.target.id,
      label: lock.label,
      verificationMethod: lock.credential.method,
      verificationRevision: lock.credential.revision,
      unlockDurationKind: lock.unlockDuration.kind,
      unlockMinutes: lock.unlockDuration.minutes,
      lockedOnLaunch: true,
    })),
    excluded: 'Passwords, TOTP secrets, verifier material, and credential-vault references are omitted.',
  };
}

function searchRegex(input: LockSearchRequest['regex']): RegExp | undefined {
  if (input === undefined) return undefined;
  exactKeys(input, ['source', 'flags']);
  if (typeof input.source !== 'string' || Array.from(input.source).length > SEARCH_PATTERN_MAX_CODE_POINTS
    || typeof input.flags !== 'string' || !/^(?:[imsuv]{0,5})$/u.test(input.flags)
    || new Set(input.flags).size !== input.flags.length
    || /\\[1-9]|\\k<|\(\?[=!<]|\([^)]*[+*{][^)]*\)[+*{]/u.test(input.source)) {
    throw new Error('Lock search regex is invalid or unsafe.');
  }
  try { return new RegExp(input.source, input.flags); }
  catch { throw new Error('Lock search regex is invalid or unsafe.'); }
}

export class LockService {
  private readonly appDataDirectory: string;
  private readonly statePath: string;
  private readonly dependencies: LockServiceDependencies;
  private readonly runtime: LockRuntime;
  private operation: Promise<unknown> = Promise.resolve();

  constructor(options: LockServiceOptions) {
    if (!options || typeof options !== 'object' || !path.isAbsolute(options.appDataDirectory)
      || Array.from(options.appDataDirectory).length > LOCK_LIMITS.maxPathCodePoints || CONTROL_CHARACTERS.test(options.appDataDirectory)) {
      throw new Error('appDataDirectory must be a bounded absolute path.');
    }
    this.appDataDirectory = path.normalize(options.appDataDirectory);
    this.statePath = path.join(this.appDataDirectory, STATE_FILE);
    const history = new LocalHistory({ appDataDirectory: this.appDataDirectory, repositoryDirectoryName: 'locks-history' });
    this.dependencies = {
      now: Date.now,
      randomBytes,
      randomUUID,
      writeCredential,
      readCredential,
      deleteCredential,
      recordHistory: async (action, snapshot) => { await history.recordRedactedSnapshot(action, snapshot); },
      qrDataUrl: (uri) => QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 4, width: 320 }),
      openPath: async (folder) => {
        const electron = await import('electron');
        return electron.shell.openPath(folder);
      },
      ...options.dependencies,
    };
    this.runtime = new LockRuntime(this.dependencies.now);
  }

  async initialize(): Promise<void> {
    await this.enqueue(async () => { await this.readState(); });
  }

  async prepareTotp(label: string, account = 'lock'): Promise<PreparedLockTotp> {
    const normalizedLabel = boundedText(label, 'Lock label', LOCK_LIMITS.maxLabelCodePoints);
    const normalizedAccount = boundedText(account, 'TOTP account', LOCK_LIMITS.maxLabelCodePoints);
    const secret = this.dependencies.randomBytes(20);
    if (!Buffer.isBuffer(secret) || secret.length !== 20) throw new Error('TOTP secret generator returned invalid output.');
    try {
      const manualSecret = base32Encode(secret);
      const uri = buildTotpUri({
        account: normalizedAccount,
        issuer: 'Material System Utility',
        label: `Material System Utility:${normalizedLabel}`,
        secret,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      });
      const qrDataUrl = await this.dependencies.qrDataUrl(uri);
      const encodedPng = qrDataUrl.startsWith('data:image/png;base64,') ? qrDataUrl.slice('data:image/png;base64,'.length) : '';
      const png = Buffer.from(encodedPng, 'base64');
      if (qrDataUrl.length > 256_000 || png.length < 24
        || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        throw new Error('The local QR renderer returned invalid output.');
      }
      return Object.freeze({ manualSecret, uri, qrDataUrl });
    } finally { secret.fill(0); }
  }

  async state(surfaceId = 'main'): Promise<LockSurfaceState> {
    return this.enqueue(async () => this.projectState(await this.readState(), this.surfaceId(surfaceId)));
  }

  async create(request: LockCreateRequest): Promise<LockPublicRecord> {
    return this.enqueue(async () => {
      const input = parseCreateRequest(request);
      const state = await this.readState();
      if (state.locks.length >= LOCK_LIMITS.maxLocks) throw new Error('The lock limit has been reached.');
      const id = this.dependencies.randomUUID();
      boundedText(id, 'Generated lock identity', LOCK_LIMITS.maxIdCodePoints, SAFE_ID);
      const verifier = await this.buildVerifier(input.credential);
      const target = vaultTarget(id);
      const account = vaultAccount(id);
      const record = validateLockRecord({
        id, target: input.target, label: input.label,
        credential: { method: input.credential.method === 'password' ? 'password-hash' : 'totp', vaultKey: target, revision: 1 },
        unlockDuration: input.unlockDuration, lockedOnLaunch: true,
      });
      const mutation = createLock(state, record, this.dependencies.now());
      await this.commitMutation(state, mutation.state, 'created', 'lock-created', id, target, account, null, verifier);
      return publicRecord(record);
    });
  }

  async update(lockId: string, request: LockUpdateRequest): Promise<LockPublicRecord> {
    return this.enqueue(async () => {
      const id = boundedText(lockId, 'Lock identity', LOCK_LIMITS.maxIdCodePoints, SAFE_ID);
      const input = parseUpdateRequest(request);
      const state = await this.readState();
      const before = state.locks.find((lock) => lock.id === id);
      if (!before) throw new Error('Lock does not exist.');
      const replacingCredential = input.credential !== undefined;
      if (replacingCredential && before.credential.revision >= LOCK_LIMITS.maxCredentialRevision) {
        throw new Error('Credential revision limit has been reached.');
      }
      const oldVerifier = replacingCredential
        ? await this.dependencies.readCredential(before.credential.vaultKey, vaultAccount(id))
        : null;
      if (replacingCredential && !oldVerifier) throw new Error('The existing lock credential is unavailable; the lock was retained.');
      const nextVerifier = input.credential ? await this.buildVerifier(input.credential) : null;
      const record = validateLockRecord({
        ...before,
        label: input.label ?? before.label,
        unlockDuration: input.unlockDuration ?? before.unlockDuration,
        credential: input.credential ? {
          method: input.credential.method === 'password' ? 'password-hash' : 'totp',
          vaultKey: before.credential.vaultKey,
          revision: before.credential.revision + 1,
        } : before.credential,
      });
      const mutation = changeLock(state, id, record, this.dependencies.now());
      if (mutation.changed) {
        await this.commitMutation(state, mutation.state, 'updated', 'lock-changed', id,
          before.credential.vaultKey, vaultAccount(id), oldVerifier, nextVerifier);
      }
      oldVerifier?.fill(0); nextVerifier?.fill(0);
      this.runtime.lockAgain(id);
      return publicRecord(record);
    });
  }

  async remove(lockId: string): Promise<void> {
    await this.enqueue(async () => {
      const id = boundedText(lockId, 'Lock identity', LOCK_LIMITS.maxIdCodePoints, SAFE_ID);
      const state = await this.readState();
      const before = state.locks.find((lock) => lock.id === id);
      if (!before) return;
      const account = vaultAccount(id);
      const verifier = await this.dependencies.readCredential(before.credential.vaultKey, account);
      if (!verifier) throw new Error('The lock credential is unavailable; lock metadata was retained.');
      const mutation = removeLock(state, id, this.dependencies.now());
      await this.commitMutation(state, mutation.state, 'deleted', 'lock-removed', id,
        before.credential.vaultKey, account, verifier, null);
      verifier.fill(0);
      this.runtime.lockAgain(id);
    });
  }

  async search(request: LockSearchRequest = {}): Promise<readonly LockSurfaceEntry[]> {
    return this.enqueue(async () => {
      exactKeys(request, [], ['query', 'regex', 'surfaceId']);
      const typed = request as LockSearchRequest;
      const query = typed.query === undefined || typed.query === ''
        ? ''
        : boundedText(typed.query, 'Lock search query', LOCK_LIMITS.maxLabelCodePoints);
      const regex = searchRegex(typed.regex);
      const surfaceId = this.surfaceId(typed.surfaceId ?? 'main');
      const state = await this.readState();
      const normalized = query.trim().toLocaleLowerCase('en-US');
      return Object.freeze(state.locks.filter((lock) => {
        const fields = [lock.id, lock.label, lock.target.kind, lock.target.id];
        return (!normalized || fields.some((field) => field.toLocaleLowerCase('en-US').includes(normalized)))
          && (!regex || fields.some((field) => { regex.lastIndex = 0; return regex.test(field); }));
      }).map((lock) => this.projectEntry(lock, surfaceId)));
    });
  }

  async unlock(request: LockUnlockRequest): Promise<LockUnlockResult>;
  async unlock(lockId: string, credential: string, surfaceId?: string): Promise<LockUnlockResult>;
  async unlock(requestOrId: LockUnlockRequest | string, credential?: string, surfaceId = 'main'): Promise<LockUnlockResult> {
    return this.enqueue(async () => {
      const request: LockUnlockRequest = typeof requestOrId === 'string'
        ? { lockId: requestOrId, credential: credential as string, surfaceId }
        : requestOrId;
      exactKeys(request, ['lockId', 'credential'], ['surfaceId']);
      const id = boundedText(request.lockId, 'Lock identity', LOCK_LIMITS.maxIdCodePoints, SAFE_ID);
      const state = await this.readState();
      const lock = state.locks.find((candidate) => candidate.id === id);
      if (!lock) return Object.freeze({ ok: false, code: 'lock-not-found', retryAtMs: null });
      const supplied = boundedText(request.credential, 'Unlock credential',
        lock.credential.method === 'password-hash' ? PASSWORD_MAX_CODE_POINTS : TOTP_TOKEN_MAX_CODE_POINTS);
      const result = await this.runtime.unlock(lock, async () => this.verify(lock, supplied), this.surfaceId(request.surfaceId ?? 'main'));
      return Object.freeze(result);
    });
  }

  async relock(lockId: string): Promise<void> {
    boundedText(lockId, 'Lock identity', LOCK_LIMITS.maxIdCodePoints, SAFE_ID);
    this.runtime.lockAgain(lockId);
  }

  closeSurface(surfaceId: string): void { this.runtime.closeSurface(this.surfaceId(surfaceId)); }
  closeApp(): void { this.runtime.closeApplication(); }
  recovery() { return createLockRecoveryDescriptor(this.appDataDirectory); }

  async openRecoveryFolder(): Promise<void> {
    const result = await this.dependencies.openPath(this.appDataDirectory);
    if (typeof result === 'string' && result) throw new Error('The application-data folder could not be opened.');
  }

  private async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operation.then(operation, operation);
    this.operation = result.then(() => undefined, () => undefined);
    return result;
  }

  private surfaceId(value: string): string {
    return boundedText(value, 'Surface identity', LOCK_LIMITS.maxIdCodePoints, SAFE_ID);
  }

  private projectEntry(lock: LockRecord, surfaceId: string): LockSurfaceEntry {
    return Object.freeze({ record: publicRecord(lock), locked: !this.runtime.isUnlocked(lock, surfaceId) });
  }

  private projectState(state: LocksState, surfaceId: string): LockSurfaceState {
    return Object.freeze({
      generation: state.generation,
      appDataFolder: state.appDataFolder,
      locks: Object.freeze(state.locks.map((lock) => this.projectEntry(lock, surfaceId))),
    });
  }

  private async readState(): Promise<LocksState> {
    try {
      const state = parseLocksStateJson(await readFile(this.statePath));
      if (path.normalize(state.appDataFolder) !== this.appDataDirectory) throw new Error('Locks state belongs to a different application-data folder.');
      return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return createEmptyLocksState(this.appDataDirectory);
    }
  }

  private async writeState(state: LocksState): Promise<void> {
    const body = JSON.stringify(state, null, 2) + '\n';
    if (Buffer.byteLength(body, 'utf8') > LOCK_LIMITS.jsonBytes) throw new Error('Locks state exceeds the byte limit.');
    await mkdir(this.appDataDirectory, { recursive: true });
    const temporary = `${this.statePath}.${process.pid}.${this.dependencies.randomUUID()}.tmp`;
    try {
      await writeFile(temporary, body, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, this.statePath);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private async buildVerifier(input: LockCredentialInput): Promise<Buffer> {
    if (input.method === 'totp') {
      const secret = base32Decode(input.credential);
      try {
        const digits = input.confirmationCode.length as 6 | 7 | 8;
        if (verifyTotp(input.confirmationCode, secret, {
          timestampMs: this.dependencies.now(), algorithm: 'SHA1', digits, period: 30, window: LOCK_LIMITS.totpSkewSteps,
        }) === null) throw new Error('The TOTP confirmation code did not match.');
        return encodeVerifier({ schemaVersion: 1, kind: 'totp', secretBase32: base32Encode(secret), algorithm: 'SHA1', digits, period: 30 });
      } finally { secret.fill(0); }
    }
    const salt = this.dependencies.randomBytes(16);
    if (!Buffer.isBuffer(salt) || salt.length !== 16) throw new Error('Password salt generator returned invalid output.');
    const password = Buffer.from(input.credential, 'utf8');
    let digest: Buffer | undefined;
    try {
      digest = await deriveScrypt(password, salt, SCRYPT_KEY_BYTES, {
        N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELISM, maxmem: SCRYPT_MAX_MEMORY,
      }) as Buffer;
      return encodeVerifier({
        schemaVersion: 1, kind: 'password-scrypt', saltBase64: salt.toString('base64'), digestBase64: digest.toString('base64'),
        cost: SCRYPT_COST, blockSize: SCRYPT_BLOCK_SIZE, parallelism: SCRYPT_PARALLELISM, keyBytes: SCRYPT_KEY_BYTES,
      });
    } finally { password.fill(0); salt.fill(0); digest?.fill(0); }
  }

  private async verify(lock: LockRecord, supplied: string): Promise<Readonly<{ status: 'accepted' | 'rejected' | 'unavailable'; matchedTotpStep: number | null }>> {
    const bytes = await this.dependencies.readCredential(lock.credential.vaultKey, vaultAccount(lock.id));
    if (!bytes) return Object.freeze({ status: 'unavailable', matchedTotpStep: null });
    try {
      const verifier = parseVerifier(bytes, lock.credential.method);
      if (verifier.kind === 'totp') {
        const secret = base32Decode(verifier.secretBase32);
        try {
          const matched = verifyTotp(supplied, secret, {
            timestampMs: this.dependencies.now(), algorithm: verifier.algorithm, digits: verifier.digits,
            period: verifier.period, window: LOCK_LIMITS.totpSkewSteps,
          });
          return Object.freeze({ status: matched === null ? 'rejected' : 'accepted', matchedTotpStep: matched });
        } finally { secret.fill(0); }
      }
      const salt = canonicalBase64(verifier.saltBase64, 16, 'password salt');
      const expected = canonicalBase64(verifier.digestBase64, verifier.keyBytes, 'password digest');
      const password = Buffer.from(supplied, 'utf8');
      let actual: Buffer | undefined;
      try {
        actual = await deriveScrypt(password, salt, verifier.keyBytes, {
          N: verifier.cost, r: verifier.blockSize, p: verifier.parallelism, maxmem: SCRYPT_MAX_MEMORY,
        }) as Buffer;
        return Object.freeze({ status: timingSafeEqual(actual, expected) ? 'accepted' : 'rejected', matchedTotpStep: null });
      } finally { salt.fill(0); expected.fill(0); password.fill(0); actual?.fill(0); }
    } catch {
      return Object.freeze({ status: 'unavailable', matchedTotpStep: null });
    } finally { bytes.fill(0); }
  }

  private async commitMutation(
    before: LocksState, after: LocksState, historyAction: Exclude<LocalHistoryAction, 'restored'>,
    historyName: string, lockId: string, target: string, account: string,
    previousVerifier: Buffer | null, nextVerifier: Buffer | null,
  ): Promise<void> {
    let credentialChanged = false;
    let stateChanged = false;
    try {
      if (nextVerifier) {
        await this.dependencies.writeCredential(target, account, nextVerifier);
        credentialChanged = true;
      } else if (previousVerifier) {
        if (!await this.dependencies.deleteCredential(target, account)) throw new Error('Credential deletion failed.');
        credentialChanged = true;
      }
      await this.writeState(after);
      stateChanged = true;
      await this.dependencies.recordHistory(historyAction, historySnapshot(after, historyName, lockId));
    } catch {
      const rollbackFailures: string[] = [];
      if (stateChanged) {
        try { await this.writeState(before); } catch { rollbackFailures.push('metadata'); }
      }
      if (credentialChanged) {
        try {
          if (previousVerifier) await this.dependencies.writeCredential(target, account, previousVerifier);
          else if (!await this.dependencies.deleteCredential(target, account)) rollbackFailures.push('credential');
        } catch { rollbackFailures.push('credential'); }
      }
      if (rollbackFailures.length) {
        throw new Error(`The lock mutation failed and automatic rollback also failed (${[...new Set(rollbackFailures)].join(' and ')} recovery failed).`);
      }
      throw new Error('The lock mutation could not be saved safely.');
    } finally {
      previousVerifier?.fill(0);
      nextVerifier?.fill(0);
    }
  }
}
