import { createHmac, timingSafeEqual } from 'node:crypto';

export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

export interface HotpOptions {
  counter: bigint | number;
  algorithm?: TotpAlgorithm;
  digits?: number;
}

export interface TotpOptions {
  timestampMs?: number;
  algorithm?: TotpAlgorithm;
  digits?: number;
  period?: number;
}

export interface TotpVerificationOptions extends TotpOptions {
  window?: number;
}

export interface TotpUriRecord {
  type: 'totp';
  label: string;
  account: string;
  issuer?: string;
  secret: Uint8Array;
  algorithm: TotpAlgorithm;
  digits: number;
  period: number;
}

export interface TotpUriInput {
  account: string;
  issuer?: string;
  label?: string;
  secret: Uint8Array | string;
  algorithm?: TotpAlgorithm;
  digits?: number;
  period?: number;
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const MAX_BASE32_LENGTH = 4096;
const MAX_SECRET_BYTES = 512;
const MAX_URI_LENGTH = 4096;
const MAX_LABEL_LENGTH = 256;
const MAX_NAME_LENGTH = 128;
const MAX_PERIOD_SECONDS = 86_400;
const MAX_VERIFICATION_WINDOW = 10;
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;

function assertDigits(digits: number): void {
  if (!Number.isInteger(digits) || digits < 6 || digits > 8) {
    throw new RangeError('digits must be an integer from 6 through 8');
  }
}

function assertPeriod(period: number): void {
  if (!Number.isInteger(period) || period <= 0 || period > MAX_PERIOD_SECONDS) {
    throw new RangeError(`period must be an integer from 1 through ${MAX_PERIOD_SECONDS}`);
  }
}

function normalizeAlgorithm(algorithm: string | undefined): TotpAlgorithm {
  const normalized = (algorithm ?? 'SHA1').toUpperCase().replace(/-/g, '');
  if (normalized !== 'SHA1' && normalized !== 'SHA256' && normalized !== 'SHA512') {
    throw new RangeError('algorithm must be SHA1, SHA256, or SHA512');
  }
  return normalized;
}

function validateName(value: string, field: string, maximum = MAX_NAME_LENGTH): string {
  if (value.length === 0 || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new RangeError(`${field} must be non-empty, bounded text without control characters`);
  }
  return value;
}

function normalizeSecret(secret: Uint8Array | string): Uint8Array {
  const decoded = typeof secret === 'string' ? base32Decode(secret) : Uint8Array.from(secret);
  if (decoded.length === 0 || decoded.length > MAX_SECRET_BYTES) {
    throw new RangeError(`secret must contain from 1 through ${MAX_SECRET_BYTES} bytes`);
  }
  return decoded;
}

export function base32Encode(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('bytes must be a Uint8Array');
  }
  if (bytes.length > MAX_SECRET_BYTES) {
    throw new RangeError(`input must not exceed ${MAX_SECRET_BYTES} bytes`);
  }

  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(encoded: string): Uint8Array {
  if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length > MAX_BASE32_LENGTH) {
    throw new RangeError(`base32 input must contain from 1 through ${MAX_BASE32_LENGTH} characters`);
  }
  if (/\s|-/u.test(encoded)) {
    throw new SyntaxError('base32 input must not contain whitespace or separators');
  }

  const upper = encoded.toUpperCase();
  const firstPadding = upper.indexOf('=');
  const body = firstPadding === -1 ? upper : upper.slice(0, firstPadding);
  const padding = firstPadding === -1 ? '' : upper.slice(firstPadding);
  if (!/^[A-Z2-7]+$/u.test(body) || (padding && !/^=+$/u.test(padding))) {
    throw new SyntaxError('base32 input contains an invalid character or padding position');
  }
  const expectedPadding = (8 - (body.length % 8)) % 8;
  if (padding && (padding.length !== expectedPadding || ![0, 1, 3, 4, 6].includes(padding.length))) {
    throw new SyntaxError('base32 input has invalid padding');
  }
  if ([1, 3, 6].includes(body.length % 8)) {
    throw new SyntaxError('base32 input has an impossible encoded length');
  }

  const output: number[] = [];
  let bits = 0;
  let value = 0;
  for (const character of body) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }
  if (value !== 0) {
    throw new SyntaxError('base32 input has non-zero trailing bits');
  }
  if (output.length === 0 || output.length > MAX_SECRET_BYTES) {
    throw new RangeError(`decoded secret must contain from 1 through ${MAX_SECRET_BYTES} bytes`);
  }
  return Uint8Array.from(output);
}

export function generateHotp(secret: Uint8Array | string, options: HotpOptions): string {
  const key = normalizeSecret(secret);
  const algorithm = normalizeAlgorithm(options.algorithm);
  const digits = options.digits ?? 6;
  assertDigits(digits);

  if (typeof options.counter === 'number' && !Number.isSafeInteger(options.counter)) {
    throw new RangeError('counter must be a non-negative unsigned 64-bit integer');
  }
  const counter = typeof options.counter === 'number' ? BigInt(options.counter) : options.counter;
  if (counter < 0n || counter > UINT64_MAX) {
    throw new RangeError('counter must be a non-negative unsigned 64-bit integer');
  }
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(counter);
  const digest = createHmac(algorithm.toLowerCase(), key).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fff_ffff;
  return String(binary % (10 ** digits)).padStart(digits, '0');
}

export function generateTotp(secret: Uint8Array | string, options: TotpOptions = {}): string {
  const timestampMs = options.timestampMs ?? Date.now();
  const period = options.period ?? 30;
  if (!Number.isSafeInteger(timestampMs) || timestampMs < 0) {
    throw new RangeError('timestampMs must be a non-negative safe integer');
  }
  assertPeriod(period);
  const counter = BigInt(Math.floor(timestampMs / 1000 / period));
  return generateHotp(secret, {
    counter,
    algorithm: options.algorithm,
    digits: options.digits,
  });
}

export function verifyTotp(token: string, secret: Uint8Array | string, options: TotpVerificationOptions = {}): number | null {
  const digits = options.digits ?? 6;
  const window = options.window ?? 0;
  assertDigits(digits);
  if (!Number.isInteger(window) || window < 0 || window > MAX_VERIFICATION_WINDOW) {
    throw new RangeError(`window must be an integer from 0 through ${MAX_VERIFICATION_WINDOW}`);
  }
  if (!new RegExp(`^\\d{${digits}}$`, 'u').test(token)) {
    return null;
  }

  const timestampMs = options.timestampMs ?? Date.now();
  const period = options.period ?? 30;
  if (!Number.isSafeInteger(timestampMs) || timestampMs < 0) {
    throw new RangeError('timestampMs must be a non-negative safe integer');
  }
  assertPeriod(period);
  const baseCounter = BigInt(Math.floor(timestampMs / 1000 / period));
  const supplied = Buffer.from(token, 'ascii');
  let matchedOffset: number | null = null;
  for (let offset = -window; offset <= window; offset += 1) {
    const counter = baseCounter + BigInt(offset);
    if (counter < 0n) continue;
    const expected = Buffer.from(generateHotp(secret, {
      counter,
      algorithm: options.algorithm,
      digits,
    }), 'ascii');
    if (timingSafeEqual(supplied, expected) && matchedOffset === null) matchedOffset = offset;
  }
  return matchedOffset;
}

function onlyKnownParameters(parameters: URLSearchParams): void {
  const known = new Set(['secret', 'issuer', 'algorithm', 'digits', 'period']);
  for (const key of parameters.keys()) {
    if (!known.has(key)) throw new SyntaxError(`unsupported otpauth parameter: ${key}`);
    if (parameters.getAll(key).length !== 1) throw new SyntaxError(`duplicate otpauth parameter: ${key}`);
  }
}

export function parseTotpUri(input: string): TotpUriRecord {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_URI_LENGTH) {
    throw new RangeError(`otpauth URI must contain from 1 through ${MAX_URI_LENGTH} characters`);
  }
  let uri: URL;
  try {
    uri = new URL(input);
  } catch {
    throw new SyntaxError('otpauth URI is invalid');
  }
  if (uri.protocol !== 'otpauth:' || uri.hostname !== 'totp' || uri.username || uri.password || uri.port || uri.hash) {
    throw new SyntaxError('URI must be an otpauth TOTP URI without credentials, port, or fragment');
  }
  onlyKnownParameters(uri.searchParams);

  let label: string;
  try {
    label = decodeURIComponent(uri.pathname.replace(/^\//u, ''));
  } catch {
    throw new SyntaxError('otpauth label contains invalid percent encoding');
  }
  validateName(label, 'label', MAX_LABEL_LENGTH);
  if (label.includes('/')) throw new SyntaxError('otpauth label must be one path segment');

  const secretText = uri.searchParams.get('secret');
  if (!secretText) throw new SyntaxError('otpauth secret is required');
  const secret = normalizeSecret(secretText);
  const issuerParameter = uri.searchParams.get('issuer') ?? undefined;
  if (issuerParameter !== undefined) validateName(issuerParameter, 'issuer');

  const separator = label.indexOf(':');
  const labelIssuer = separator === -1 ? undefined : label.slice(0, separator).trim();
  const account = (separator === -1 ? label : label.slice(separator + 1)).trim();
  validateName(account, 'account');
  if (labelIssuer !== undefined) validateName(labelIssuer, 'label issuer');
  if (issuerParameter !== undefined && labelIssuer !== undefined && issuerParameter !== labelIssuer) {
    throw new SyntaxError('issuer parameter must match the label issuer');
  }

  const algorithm = normalizeAlgorithm(uri.searchParams.get('algorithm') ?? undefined);
  const digitsText = uri.searchParams.get('digits');
  const periodText = uri.searchParams.get('period');
  const digits = digitsText === null ? 6 : Number(digitsText);
  const period = periodText === null ? 30 : Number(periodText);
  if (digitsText !== null && !/^\d+$/u.test(digitsText)) throw new SyntaxError('digits must be a decimal integer');
  if (periodText !== null && !/^\d+$/u.test(periodText)) throw new SyntaxError('period must be a decimal integer');
  assertDigits(digits);
  assertPeriod(period);

  return {
    type: 'totp',
    label,
    account,
    issuer: issuerParameter ?? labelIssuer,
    secret,
    algorithm,
    digits,
    period,
  };
}

export function buildTotpUri(input: TotpUriInput): string {
  const account = validateName(input.account.trim(), 'account');
  const issuer = input.issuer === undefined ? undefined : validateName(input.issuer.trim(), 'issuer');
  const defaultLabel = issuer ? `${issuer}:${account}` : account;
  const label = validateName((input.label ?? defaultLabel).trim(), 'label', MAX_LABEL_LENGTH);
  const secret = normalizeSecret(input.secret);
  const algorithm = normalizeAlgorithm(input.algorithm);
  const digits = input.digits ?? 6;
  const period = input.period ?? 30;
  assertDigits(digits);
  assertPeriod(period);

  if (label.includes('/')) throw new SyntaxError('otpauth label must be one path segment');
  if (issuer !== undefined) {
    const separator = label.indexOf(':');
    if (separator !== -1 && label.slice(0, separator).trim() !== issuer) {
      throw new SyntaxError('issuer must match the label issuer');
    }
  }

  const parameters = new URLSearchParams();
  parameters.set('secret', base32Encode(secret));
  if (issuer !== undefined) parameters.set('issuer', issuer);
  parameters.set('algorithm', algorithm);
  parameters.set('digits', String(digits));
  parameters.set('period', String(period));
  const result = `otpauth://totp/${encodeURIComponent(label)}?${parameters.toString()}`;
  if (result.length > MAX_URI_LENGTH) throw new RangeError(`otpauth URI must not exceed ${MAX_URI_LENGTH} characters`);
  return result;
}
