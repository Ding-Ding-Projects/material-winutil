import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import type {
  AuthenticatorBeginRequest, AuthenticatorCodes, AuthenticatorEntry,
  AuthenticatorRegistration,
} from '../shared/types';
import {
  base32Encode, buildTotpUri, generateTotp, parseTotpUri, verifyTotp,
  type TotpAlgorithm,
} from '../shared/totp';
import { deleteCredential, readCredential, writeCredential } from './credential-vault';
import { LocalHistory, type JsonValue } from './local-history';

interface MetadataDocument {
  schemaVersion: 1;
  entries: AuthenticatorEntry[];
}

interface PendingRegistration {
  expiresAt: number;
  entry: AuthenticatorEntry;
  secret: Buffer;
  imported: boolean;
  failedAttempts: number;
  nextAttemptAt: number;
  timer: NodeJS.Timeout;
}

interface AuthenticatorDependencies {
  now(): number;
  randomBytes(size: number): Buffer;
  randomUUID(): string;
  qrDataUrl(uri: string): Promise<string>;
  writeCredential(target: string, account: string, secret: Uint8Array): Promise<void>;
  readCredential(target: string, account: string): Promise<Buffer | null>;
  deleteCredential(target: string, account: string): Promise<boolean>;
  recordHistory(action: 'created' | 'deleted' | 'imported', snapshot: JsonValue): Promise<void>;
}

export interface AuthenticatorServiceOptions {
  appDataDirectory: string;
  dependencies?: Partial<AuthenticatorDependencies>;
  pendingLifetimeMs?: number;
}

const METADATA_FILE = 'authenticator-metadata.json';
const MAX_ENTRIES = 256;
const MAX_PENDING = 16;
const MAX_CONFIRM_ATTEMPTS = 5;
const PENDING_LIFETIME_MS = 5 * 60 * 1000;
export const AUTHENTICATOR_PNG_LIMITS = Object.freeze({
  maxBytes: 1_048_576,
  maxDimension: 2_048,
  maxPixels: 4_194_304,
});
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALGORITHMS = new Set<TotpAlgorithm>(['SHA1', 'SHA256', 'SHA512']);

function boundedText(value: unknown, field: string, maximum: number, optional = false): string | undefined {
  if (optional && (value === undefined || value === '')) return undefined;
  if (typeof value !== 'string') throw new Error(`${field} must be text.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new Error(`${field} is empty, too long, or contains control characters.`);
  }
  return normalized;
}

function projectEntry(value: unknown): AuthenticatorEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Authenticator metadata is invalid.');
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input).sort().join(',');
  if (keys !== 'account,algorithm,createdAt,digits,id,issuer,label,period'
    && keys !== 'account,algorithm,createdAt,digits,id,label,period') throw new Error('Authenticator metadata has unexpected fields.');
  const id = boundedText(input.id, 'id', 64)!;
  const label = boundedText(input.label, 'label', 256)!;
  const account = boundedText(input.account, 'account', 128)!;
  const issuer = boundedText(input.issuer, 'issuer', 128, true);
  const algorithm = input.algorithm;
  const digits = input.digits;
  const period = input.period;
  const createdAt = input.createdAt;
  if (!ID_PATTERN.test(id) || !ALGORITHMS.has(algorithm as TotpAlgorithm)
    || !Number.isInteger(digits) || Number(digits) < 6 || Number(digits) > 8
    || !Number.isInteger(period) || Number(period) < 1 || Number(period) > 86_400
    || typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt))) {
    throw new Error('Authenticator metadata is invalid.');
  }
  return {
    id, label, account, issuer, algorithm: algorithm as TotpAlgorithm,
    digits: Number(digits), period: Number(period), createdAt: new Date(createdAt).toISOString(),
  };
}

function parseMetadata(text: string): MetadataDocument {
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Authenticator metadata is invalid.');
  const input = raw as Record<string, unknown>;
  if (Object.keys(input).sort().join(',') !== 'entries,schemaVersion' || input.schemaVersion !== 1
    || !Array.isArray(input.entries) || input.entries.length > MAX_ENTRIES) {
    throw new Error('Authenticator metadata is invalid.');
  }
  const entries = input.entries.map(projectEntry);
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) throw new Error('Authenticator metadata contains duplicate entries.');
  return { schemaVersion: 1, entries };
}

function vaultTarget(id: string): string {
  return `totp-${id}`;
}

function requireExactKeys(value: object, expected: readonly string[]): void {
  const actual = Object.keys(value).sort().join(',');
  if (actual !== [...expected].sort().join(',')) throw new Error('Authenticator registration request has unexpected fields.');
}

function validPngDataUrl(value: string): boolean {
  if (!value.startsWith('data:image/png;base64,') || value.length > 256_000) return false;
  try {
    const bytes = Buffer.from(value.slice('data:image/png;base64,'.length), 'base64');
    return bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  } catch {
    return false;
  }
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function decodeAuthenticatorQrPng(payload: Uint8Array): string {
  if (!(payload instanceof Uint8Array) || payload.byteLength < 24 || payload.byteLength > AUTHENTICATOR_PNG_LIMITS.maxBytes) {
    throw new Error('The QR image must be a bounded PNG file no larger than 1 MiB.');
  }
  const bytes = Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
    || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Only PNG QR images are supported.');
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height || width > AUTHENTICATOR_PNG_LIMITS.maxDimension
    || height > AUTHENTICATOR_PNG_LIMITS.maxDimension
    || width * height > AUTHENTICATOR_PNG_LIMITS.maxPixels) {
    throw new Error('The QR PNG dimensions exceed the supported bound.');
  }
  let png: PNG;
  try {
    png = PNG.sync.read(bytes, { checkCRC: true });
  } catch {
    throw new Error('The QR PNG could not be decoded safely.');
  }
  if (png.width !== width || png.height !== height || png.data.byteLength !== width * height * 4) {
    png.data.fill(0);
    throw new Error('The QR PNG decoded to an unexpected shape.');
  }
  try {
    const decoded = jsQR(new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.byteLength), width, height, {
      inversionAttempts: 'dontInvert',
    });
    if (!decoded || typeof decoded.data !== 'string' || decoded.data.length === 0 || decoded.data.length > 4096) {
      throw new Error('The PNG does not contain one supported QR code.');
    }
    return decoded.data;
  } finally {
    png.data.fill(0);
  }
}

function redactedSnapshot(entries: readonly AuthenticatorEntry[], changedId: string): JsonValue {
  return {
    schemaVersion: 1,
    changedId,
    entries: entries.map((entry) => ({
      id: entry.id,
      label: entry.label,
      account: entry.account,
      issuer: entry.issuer ?? null,
      algorithm: entry.algorithm,
      digits: entry.digits,
      period: entry.period,
      createdAt: entry.createdAt,
    })),
    excluded: 'Authenticator secrets, current codes, registration URIs, and QR payloads are omitted.',
  };
}

export class AuthenticatorService {
  private readonly metadataPath: string;
  private readonly dependencies: AuthenticatorDependencies;
  private readonly pendingLifetimeMs: number;
  private readonly pending = new Map<string, PendingRegistration>();
  private readonly cancelRequested = new Set<string>();
  private operation: Promise<unknown> = Promise.resolve();

  constructor(options: AuthenticatorServiceOptions) {
    if (!path.isAbsolute(options.appDataDirectory)) throw new Error('appDataDirectory must be an absolute path.');
    this.metadataPath = path.join(options.appDataDirectory, METADATA_FILE);
    this.pendingLifetimeMs = options.pendingLifetimeMs ?? PENDING_LIFETIME_MS;
    if (!Number.isInteger(this.pendingLifetimeMs) || this.pendingLifetimeMs < 10 || this.pendingLifetimeMs > PENDING_LIFETIME_MS) {
      throw new Error(`pendingLifetimeMs must be between 10 and ${PENDING_LIFETIME_MS}.`);
    }
    const history = new LocalHistory({ appDataDirectory: options.appDataDirectory, repositoryDirectoryName: 'authenticator-history' });
    this.dependencies = {
      now: Date.now,
      randomBytes,
      randomUUID,
      qrDataUrl: (uri) => QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 4, width: 320 }),
      writeCredential,
      readCredential,
      deleteCredential,
      recordHistory: async (action, snapshot) => { await history.recordRedactedSnapshot(action, snapshot); },
      ...options.dependencies,
    };
  }

  async begin(request: AuthenticatorBeginRequest): Promise<AuthenticatorRegistration> {
    return this.enqueue(async () => {
      this.expirePending();
      if (this.pending.size >= MAX_PENDING) throw new Error('Too many authenticator registrations are awaiting confirmation.');

      let account: string;
      let issuer: string | undefined;
      let label: string;
      let algorithm: TotpAlgorithm;
      let digits: number;
      let period: number;
      let secret: Buffer;
      let imported = false;

      if (!request || typeof request !== 'object') throw new Error('Authenticator registration request is invalid.');
      if (request.mode === 'import') {
        requireExactKeys(request, ['mode', 'uri']);
        if (typeof request.uri !== 'string' || request.uri.length > 4096) throw new Error('The otpauth URI is invalid.');
        try {
          const parsed = parseTotpUri(request.uri);
          account = parsed.account;
          issuer = parsed.issuer;
          label = parsed.label;
          algorithm = parsed.algorithm;
          digits = parsed.digits;
          period = parsed.period;
          try { secret = Buffer.from(parsed.secret); } finally { parsed.secret.fill(0); }
          imported = true;
        } catch {
          throw new Error('The otpauth URI is invalid.');
        }
      } else if (request.mode === 'generate') {
        const optionalKeys = ['algorithm', 'digits', 'issuer', 'label', 'period'].filter((key) => Object.hasOwn(request, key));
        requireExactKeys(request, ['mode', 'account', ...optionalKeys]);
        account = boundedText(request.account, 'account', 128)!;
        issuer = boundedText(request.issuer, 'issuer', 128, true);
        label = boundedText(request.label ?? (issuer ? `${issuer}:${account}` : account), 'label', 256)!;
        algorithm = request.algorithm ?? 'SHA1';
        digits = request.digits ?? 6;
        period = request.period ?? 30;
        if (!ALGORITHMS.has(algorithm) || !Number.isInteger(digits) || digits < 6 || digits > 8
          || !Number.isInteger(period) || period < 1 || period > 86_400) throw new Error('Authenticator parameters are invalid.');
        secret = this.dependencies.randomBytes(20);
      } else {
        throw new Error('Authenticator registration mode is invalid.');
      }

      const registrationId = this.dependencies.randomUUID();
      const entry: AuthenticatorEntry = {
        id: registrationId, label, account, issuer, algorithm, digits, period,
        createdAt: new Date(this.dependencies.now()).toISOString(),
      };
      const manualSecret = base32Encode(secret);
      const uri = buildTotpUri({ account, issuer, label, secret, algorithm, digits, period });
      let qrDataUrl: string;
      try {
        qrDataUrl = await this.dependencies.qrDataUrl(uri);
      } catch {
        secret.fill(0);
        throw new Error('The authenticator QR code could not be rendered locally.');
      }
      if (!validPngDataUrl(qrDataUrl)) {
        secret.fill(0);
        throw new Error('The authenticator QR code renderer returned invalid output.');
      }
      const expiresAt = this.dependencies.now() + this.pendingLifetimeMs;
      const timer = setTimeout(() => {
        const pending = this.pending.get(registrationId);
        if (pending) {
          pending.secret.fill(0);
          this.pending.delete(registrationId);
        }
      }, this.pendingLifetimeMs);
      timer.unref();
      this.pending.set(registrationId, { entry, secret, imported, expiresAt, failedAttempts: 0, nextAttemptAt: 0, timer });
      return { registrationId, entry, manualSecret, uri, qrDataUrl, imported, expiresAt: new Date(expiresAt).toISOString() };
    });
  }

  async beginFromPng(payload: Uint8Array): Promise<AuthenticatorRegistration> {
    const uri = decodeAuthenticatorQrPng(payload);
    return this.begin({ mode: 'import', uri });
  }

  async confirm(registrationId: string, code: string): Promise<AuthenticatorEntry> {
    return this.enqueue(async () => {
      this.expirePending();
      if (typeof registrationId !== 'string' || !ID_PATTERN.test(registrationId) || typeof code !== 'string') {
        throw new Error('Authenticator confirmation is invalid.');
      }
      const pending = this.pending.get(registrationId);
      if (!pending) throw new Error('Authenticator registration expired or was not found.');
      const now = this.dependencies.now();
      if (now < pending.nextAttemptAt) throw new Error('Wait briefly before trying another confirmation code.');
      const matched = verifyTotp(code, pending.secret, {
        timestampMs: now, algorithm: pending.entry.algorithm,
        digits: pending.entry.digits, period: pending.entry.period, window: 1,
      });
      if (matched === null) {
        pending.failedAttempts += 1;
        if (pending.failedAttempts >= MAX_CONFIRM_ATTEMPTS) {
          clearTimeout(pending.timer);
          pending.secret.fill(0);
          this.pending.delete(registrationId);
          throw new Error('Too many confirmation attempts; start registration again.');
        }
        pending.nextAttemptAt = now + Math.min(5_000, pending.failedAttempts * 1_000);
        throw new Error('The confirmation code did not match.');
      }
      clearTimeout(pending.timer);
      this.pending.delete(registrationId);

      let document: MetadataDocument | undefined;
      let next: AuthenticatorEntry[] | undefined;
      const target = vaultTarget(pending.entry.id);
      let vaultWritten = false;
      try {
        const refuseCancelled = (): void => {
          if (this.cancelRequested.has(registrationId)) throw new Error('Authenticator registration was cancelled.');
        };
        refuseCancelled();
        document = await this.readMetadata();
        refuseCancelled();
        if (document.entries.length >= MAX_ENTRIES) throw new Error('The authenticator entry limit has been reached.');
        if (document.entries.some((entry) => entry.id === pending.entry.id)) throw new Error('Authenticator metadata contains a duplicate entry.');
        next = [...document.entries, pending.entry];
        await this.dependencies.writeCredential(target, pending.entry.id, pending.secret);
        vaultWritten = true;
        refuseCancelled();
        await this.writeMetadata(next);
        refuseCancelled();
        await this.dependencies.recordHistory(pending.imported ? 'imported' : 'created', redactedSnapshot(next, pending.entry.id));
        refuseCancelled();
      } catch (error) {
        const rollbackFailures: string[] = [];
        if (vaultWritten) {
          try { if (!await this.dependencies.deleteCredential(target, pending.entry.id)) rollbackFailures.push('credential'); }
          catch { rollbackFailures.push('credential'); }
        }
        if (document && next) {
          try { await this.writeMetadata(document.entries); }
          catch { rollbackFailures.push('metadata'); }
        }
        if (error instanceof Error && (error.message.includes('entry limit') || error.message.includes('duplicate entry'))) throw error;
        if (rollbackFailures.length) throw new Error(`The authenticator entry could not be saved or rolled back automatically (${rollbackFailures.join(' and ')} recovery failed).`);
        throw new Error('The authenticator entry could not be saved safely.');
      } finally {
        this.cancelRequested.delete(registrationId);
        pending.secret.fill(0);
      }
      return pending.entry;
    });
  }

  async cancel(registrationId: string): Promise<boolean> {
    if (typeof registrationId !== 'string' || !ID_PATTERN.test(registrationId)) throw new Error('Authenticator registration identifier is invalid.');
    this.cancelRequested.add(registrationId);
    return this.enqueue(async () => {
      const pending = this.pending.get(registrationId);
      if (!pending) { this.cancelRequested.delete(registrationId); return false; }
      clearTimeout(pending.timer);
      pending.secret.fill(0);
      this.pending.delete(registrationId);
      this.cancelRequested.delete(registrationId);
      return true;
    });
  }

  async list(): Promise<AuthenticatorEntry[]> {
    return this.enqueue(async () => (await this.readMetadata()).entries.map((entry) => ({ ...entry })));
  }

  async codes(id: string): Promise<AuthenticatorCodes> {
    return this.enqueue(async () => {
      if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw new Error('Authenticator entry identifier is invalid.');
      const entry = (await this.readMetadata()).entries.find((candidate) => candidate.id === id);
      if (!entry) throw new Error('Authenticator entry was not found.');
      const secret = await this.dependencies.readCredential(vaultTarget(id), id);
      if (!secret) throw new Error('The authenticator credential is unavailable.');
      try {
        const now = this.dependencies.now();
        const elapsed = Math.floor(now / 1000) % entry.period;
        return {
          id,
          current: generateTotp(secret, { timestampMs: now, algorithm: entry.algorithm, digits: entry.digits, period: entry.period }),
          next: generateTotp(secret, { timestampMs: now + (entry.period - elapsed) * 1000, algorithm: entry.algorithm, digits: entry.digits, period: entry.period }),
          secondsRemaining: entry.period - elapsed,
          period: entry.period,
          digits: entry.digits,
        };
      } finally {
        secret.fill(0);
      }
    });
  }

  async remove(id: string): Promise<boolean> {
    return this.enqueue(async () => {
      if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw new Error('Authenticator entry identifier is invalid.');
      const document = await this.readMetadata();
      const entry = document.entries.find((candidate) => candidate.id === id);
      if (!entry) return false;
      const target = vaultTarget(id);
      const secret = await this.dependencies.readCredential(target, id);
      if (!secret) throw new Error('The authenticator credential is unavailable; metadata was retained.');
      const next = document.entries.filter((candidate) => candidate.id !== id);
      let deleted = false;
      try {
        deleted = await this.dependencies.deleteCredential(target, id);
        if (!deleted) throw new Error('Credential deletion failed.');
        await this.writeMetadata(next);
        await this.dependencies.recordHistory('deleted', redactedSnapshot(next, id));
        return true;
      } catch {
        const rollbackFailures: string[] = [];
        if (deleted) {
          try { await this.dependencies.writeCredential(target, id, secret); }
          catch { rollbackFailures.push('credential'); }
        }
        try { await this.writeMetadata(document.entries); }
        catch { rollbackFailures.push('metadata'); }
        if (rollbackFailures.length) throw new Error(`The authenticator entry could not be removed or rolled back automatically (${rollbackFailures.join(' and ')} recovery failed).`);
        throw new Error('The authenticator entry could not be removed safely.');
      } finally {
        secret.fill(0);
      }
    });
  }

  private async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operation.then(operation, operation);
    this.operation = result.then(() => undefined, () => undefined);
    return result;
  }

  private expirePending(): void {
    const now = this.dependencies.now();
    for (const [id, pending] of this.pending) {
      if (pending.expiresAt <= now) {
        clearTimeout(pending.timer);
        pending.secret.fill(0);
        this.pending.delete(id);
      }
    }
  }

  private async readMetadata(): Promise<MetadataDocument> {
    try {
      return parseMetadata(await readFile(this.metadataPath, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schemaVersion: 1, entries: [] };
      throw error;
    }
  }

  private async writeMetadata(entries: readonly AuthenticatorEntry[]): Promise<void> {
    if (entries.length > MAX_ENTRIES) throw new Error('The authenticator entry limit has been reached.');
    const projected = entries.map(projectEntry);
    await mkdir(path.dirname(this.metadataPath), { recursive: true });
    const temporary = `${this.metadataPath}.${process.pid}.${this.dependencies.randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ schemaVersion: 1, entries: projected }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, this.metadataPath);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
