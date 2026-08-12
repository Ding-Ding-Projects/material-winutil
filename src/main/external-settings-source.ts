import { isIP } from 'node:net';
import { promises as dns } from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';
import type { ScheduledSettingValue } from '../shared/scheduled-settings';

export const EXTERNAL_SETTINGS_SOURCE_SCHEMA_VERSION = 1 as const;
export const EXTERNAL_SETTINGS_SOURCE_LIMITS = Object.freeze({
  responseBytes: 64 * 1024,
  timeoutMs: 10_000,
  urlLength: 2_048,
  tokenLength: 4_096,
  fontLength: 120,
});

export type ExternalSettings = Readonly<Record<string, ScheduledSettingValue>>;
export type AddressFamily = 4 | 6;
export interface ResolvedAddress { readonly address: string; readonly family: AddressFamily }
export type AddressResolver = (hostname: string) => Promise<readonly ResolvedAddress[]>;
export interface PinnedTransportRequest {
  readonly url: URL;
  readonly address: string;
  readonly family: AddressFamily;
  readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
}
export type SourceTransport = (request: PinnedTransportRequest) => Promise<Response>;

export interface SourceLoadOptions {
  readonly transport?: SourceTransport;
  readonly resolve?: AddressResolver;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  readonly allowLoopbackHttpForDevelopment?: boolean;
  readonly generation?: number;
  readonly isGenerationCurrent?: (generation: number) => boolean;
}

export interface JsonSettingsSource {
  readonly kind: 'json-api';
  readonly url: string;
}

export interface HomeAssistantBooleanSource {
  readonly kind: 'home-assistant';
  readonly baseUrl: string;
  readonly entityId: string;
  readonly token: string;
}

export type ExternalSettingsSource = JsonSettingsSource | HomeAssistantBooleanSource;

export class ExternalSettingsSourceError extends Error {
  override readonly name = 'ExternalSettingsSourceError';
  constructor(readonly code: string, message = 'The external settings source could not be loaded safely.') {
    super(message);
  }
}

const API_FIELDS = new Set(['schemaVersion', 'settings']);
const HA_FIELDS = new Set(['entity_id', 'state', 'attributes', 'last_changed', 'last_updated', 'last_reported', 'context']);
const ENTITY_PATTERN = /^(?:binary_sensor|input_boolean)\.[a-z0-9_]{1,255}$/u;
const JSON_MEDIA_TYPE = /^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)$/u;
const HEX_COLOUR = /^#[0-9a-f]{6}$/iu;
const EXPORT_FORMATS = new Set(['md', 'txt', 'json', 'jsonl', 'yaml', 'toml', 'xml', 'csv', 'tsv', 'html', 'sql', 'ts', 'py', 'go', 'rs', 'proto', 'schema.json']);

function fail(code: string): never {
  throw new ExternalSettingsSourceError(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertOnlyFields(value: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  if (Object.keys(value).some((key) => !allowed.has(key))) fail('invalid-schema');
}

function inNumberRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validateSetting(key: string, value: unknown): ScheduledSettingValue {
  switch (key) {
    case 'theme': if (value === 'light' || value === 'dark') return value; break;
    case 'density': if (value === 'comfortable' || value === 'compact') return value; break;
    case 'language': if (value === 'English' || value === 'Yue' || value === 'Bilingual') return value; break;
    case 'narrator': if (value === 'English' || value === 'Yue' || value === 'Both') return value; break;
    case 'narratorEnabled':
    case 'reducedMotion': if (typeof value === 'boolean') return value; break;
    case 'enFunny':
    case 'yueFunny': if (Number.isInteger(value) && inNumberRange(value, 1, 5)) return value; break;
    case 'accent': if (typeof value === 'string' && HEX_COLOUR.test(value)) return value; break;
    case 'font': if (typeof value === 'string' && value.length > 0 && value.length <= EXTERNAL_SETTINGS_SOURCE_LIMITS.fontLength && !/[\u0000-\u001f\u007f]/u.test(value)) return value; break;
    case 'displayName': if (typeof value === 'string' && value.trim().length > 0 && value.length <= 80 && !/[\u0000-\u001f\u007f]/u.test(value)) return value.trim(); break;
    case 'scale': if (inNumberRange(value, 0.5, 3)) return value; break;
    case 'weight': if (Number.isInteger(value) && inNumberRange(value, 100, 1_000)) return value; break;
    case 'radius': if (inNumberRange(value, 0, 64)) return value; break;
    case 'exportFormat': if (typeof value === 'string' && EXPORT_FORMATS.has(value)) return value; break;
  }
  fail('invalid-setting');
}

export function validateExternalSettingsPayload(input: unknown): ExternalSettings {
  if (!isRecord(input)) fail('invalid-schema');
  assertOnlyFields(input, API_FIELDS);
  if (input.schemaVersion !== EXTERNAL_SETTINGS_SOURCE_SCHEMA_VERSION || !isRecord(input.settings)) fail('invalid-schema');
  const entries = Object.entries(input.settings);
  if (entries.length < 1 || entries.length > 32) fail('invalid-schema');
  const settings: Record<string, ScheduledSettingValue> = Object.create(null) as Record<string, ScheduledSettingValue>;
  for (const [key, value] of entries) settings[key] = validateSetting(key, value);
  return Object.freeze(settings);
}

function parseIpv4(address: string): readonly number[] | null {
  if (isIP(address) !== 4) return null;
  const parts = address.split('.').map(Number);
  return parts.length === 4 ? parts : null;
}

function isIpv4Loopback(address: string): boolean {
  return parseIpv4(address)?.[0] === 127;
}

function isPublicIpv4(address: string): boolean {
  const parts = parseIpv4(address);
  if (!parts) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 192 && b === 88 && parts[2] === 99) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
  if (a === 203 && b === 0 && parts[2] === 113) return false;
  return true;
}

function normalizeIpv6(address: string): string {
  return address.toLowerCase().split('%', 1)[0];
}

function isIpv6Loopback(address: string): boolean {
  return normalizeIpv6(address) === '::1';
}

function mappedIpv4(address: string): string | null {
  const normalized = normalizeIpv6(address);
  if (!normalized.startsWith('::ffff:')) return null;
  const tail = normalized.slice(7);
  if (isIP(tail) === 4) return tail;
  const pieces = tail.split(':');
  if (pieces.length !== 2 || !pieces.every((piece) => /^[0-9a-f]{1,4}$/u.test(piece))) return null;
  const high = Number.parseInt(pieces[0], 16);
  const low = Number.parseInt(pieces[1], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function isPublicIpv6(address: string): boolean {
  if (isIP(address.split('%', 1)[0]) !== 6) return false;
  const mapped = mappedIpv4(address);
  if (mapped) return isPublicIpv4(mapped);
  const normalized = normalizeIpv6(address);
  const first = Number.parseInt(normalized.split(':')[0] || '0', 16);
  return first >= 0x2000 && first <= 0x3fff && !normalized.startsWith('2001:db8:');
}

function addressIsLoopback(address: string): boolean {
  return isIpv4Loopback(address) || isIpv6Loopback(address) || mappedIpv4(address)?.startsWith('127.') === true;
}

function addressIsPublic(address: string): boolean {
  return isPublicIpv4(address) || isPublicIpv6(address);
}

async function defaultResolve(hostname: string): Promise<readonly ResolvedAddress[]> {
  const values = await dns.lookup(hostname, { all: true, verbatim: true });
  return values.map(({ address, family }) => ({ address, family: family as AddressFamily }));
}

function normalizedAddresses(addresses: readonly ResolvedAddress[]): readonly string[] {
  if (addresses.length < 1 || addresses.length > 16) fail('unsafe-target');
  const values = addresses.map(({ address, family }) => {
    const actualFamily = isIP(address.split('%', 1)[0]);
    if ((family !== 4 && family !== 6) || actualFamily !== family) fail('unsafe-target');
    return family === 6 ? normalizeIpv6(address) : address;
  });
  return [...new Set(values)].sort();
}

function sameAddresses(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

interface ValidatedTarget { readonly url: URL; readonly addresses: readonly ResolvedAddress[]; readonly loopbackDevelopment: boolean }

async function validateTarget(rawUrl: string, options: SourceLoadOptions): Promise<ValidatedTarget> {
  if (typeof rawUrl !== 'string' || rawUrl.length < 1 || rawUrl.length > EXTERNAL_SETTINGS_SOURCE_LIMITS.urlLength) fail('invalid-url');
  let url: URL;
  try { url = new URL(rawUrl); } catch { fail('invalid-url'); }
  if (url.username || url.password || url.hash || (url.protocol !== 'https:' && url.protocol !== 'http:')) fail('invalid-url');
  const explicitLoopbackHttp = url.protocol === 'http:' && options.allowLoopbackHttpForDevelopment === true;
  if (url.protocol === 'http:' && !explicitLoopbackHttp) fail('insecure-transport');

  const resolver = options.resolve ?? defaultResolve;
  let first: readonly ResolvedAddress[];
  let second: readonly ResolvedAddress[];
  try {
    const firstResolved = await resolver(url.hostname);
    const secondResolved = await resolver(url.hostname);
    const firstAddresses = normalizedAddresses(firstResolved);
    const secondAddresses = normalizedAddresses(secondResolved);
    first = firstAddresses.map((address) => ({ address, family: isIP(address) as AddressFamily }));
    second = secondAddresses.map((address) => ({ address, family: isIP(address) as AddressFamily }));
  } catch (error) {
    if (error instanceof ExternalSettingsSourceError) throw error;
    fail('resolution-failed');
  }
  if (!sameAddresses(first.map(({ address }) => address), second.map(({ address }) => address))) fail('dns-rebinding');
  if (explicitLoopbackHttp) {
    if (!first.every(({ address }) => addressIsLoopback(address))) fail('unsafe-target');
  } else if (!first.every(({ address }) => addressIsPublic(address))) {
    fail('unsafe-target');
  }
  return { url, addresses: first, loopbackDevelopment: explicitLoopbackHttp };
}

function normalizedPeerAddress(address: string | undefined): string {
  if (!address) fail('transport-peer-mismatch');
  return normalizeIpv6(address).replace(/^::ffff:/u, '');
}

/**
 * Node's request lookup is replaced with a one-address resolver. TLS still uses
 * the URL hostname for SNI and certificate verification, and Host remains the
 * original authority. The connected peer is checked before any body is read.
 */
export async function pinnedNodeTransport(input: PinnedTransportRequest): Promise<Response> {
  return await new Promise<Response>((resolve, reject) => {
    const pinnedLookup = ((
      _hostname: string,
      options: { all?: boolean },
      callback: (error: NodeJS.ErrnoException | null, address: string | readonly ResolvedAddress[], family?: number) => void,
    ): void => {
      if (options.all) callback(null, [{ address: input.address, family: input.family }]);
      else callback(null, input.address, input.family);
    }) as NonNullable<Parameters<typeof httpRequest>[1]>['lookup'];
    const request = (input.url.protocol === 'https:' ? httpsRequest : httpRequest)(input.url, {
      method: 'GET',
      headers: input.headers,
      signal: input.signal,
      agent: false,
      ...(input.url.protocol === 'https:' ? { servername: input.url.hostname } : {}),
      lookup: pinnedLookup,
    }, (response) => {
      const peer = normalizedPeerAddress(response.socket.remoteAddress);
      const expected = normalizedPeerAddress(input.address);
      if (peer !== expected) {
        response.destroy();
        reject(new ExternalSettingsSourceError('transport-peer-mismatch'));
        return;
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) for (const item of value) headers.append(key, item);
        else if (value !== undefined) headers.set(key, value);
      }
      resolve(new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, {
        status: response.statusCode ?? 500,
        statusText: response.statusMessage,
        headers,
      }));
    });
    request.once('error', () => reject(new ExternalSettingsSourceError(input.signal.aborted ? 'request-aborted' : 'request-failed')));
    request.end();
  });
}

function validateBound(value: number | undefined, fallback: number, maximum: number, code: string): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) fail(code);
  return result;
}

function checkGeneration(options: SourceLoadOptions): void {
  const hasGeneration = options.generation !== undefined;
  const hasChecker = options.isGenerationCurrent !== undefined;
  if (hasGeneration !== hasChecker) fail('invalid-generation');
  if (hasGeneration && !options.isGenerationCurrent?.(options.generation as number)) fail('superseded');
}

function createAbort(options: SourceLoadOptions, timeoutMs: number): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  timer.unref();
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    },
  };
}

async function readBoundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const mediaType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (!mediaType || !JSON_MEDIA_TYPE.test(mediaType)) fail('invalid-content-type');
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > maxBytes)) fail('response-too-large');
  if (!response.body) fail('invalid-response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        fail('response-too-large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('invalid-response'); }
  try { return JSON.parse(text) as unknown; } catch { fail('invalid-response'); }
}

async function requestJson(target: ValidatedTarget, headers: HeadersInit, options: SourceLoadOptions): Promise<unknown> {
  const timeoutMs = validateBound(options.timeoutMs, EXTERNAL_SETTINGS_SOURCE_LIMITS.timeoutMs, 60_000, 'invalid-timeout');
  const maxBytes = validateBound(options.maxResponseBytes, EXTERNAL_SETTINGS_SOURCE_LIMITS.responseBytes, EXTERNAL_SETTINGS_SOURCE_LIMITS.responseBytes, 'invalid-size-limit');
  const abort = createAbort(options, timeoutMs);
  checkGeneration(options);
  try {
    let response: Response;
    const selected = target.addresses[0];
    if (!selected) fail('unsafe-target');
    const transportHeaders: Record<string, string> = Object.create(null) as Record<string, string>;
    new Headers(headers).forEach((value, key) => { transportHeaders[key] = value; });
    try {
      response = await (options.transport ?? pinnedNodeTransport)({
        url: target.url,
        address: selected.address,
        family: selected.family,
        headers: transportHeaders,
        signal: abort.signal,
      });
    } catch {
      fail(abort.signal.aborted ? 'request-aborted' : 'request-failed');
    }
    if (response.status >= 300 && response.status < 400) fail('redirect-rejected');
    if (!response.ok) fail('request-failed');
    const resolver = options.resolve ?? defaultResolve;
    let rebound: readonly string[];
    try { rebound = normalizedAddresses(await resolver(target.url.hostname)); } catch { fail('resolution-failed'); }
  if (!sameAddresses(target.addresses.map(({ address }) => address), rebound)) fail('dns-rebinding');
    checkGeneration(options);
    let result: unknown;
    try { result = await readBoundedJson(response, maxBytes); }
    catch (error) {
      if (error instanceof ExternalSettingsSourceError) throw error;
      fail(abort.signal.aborted ? 'request-aborted' : 'invalid-response');
    }
    checkGeneration(options);
    return result;
  } finally {
    abort.dispose();
  }
}

export async function loadJsonSettingsSource(source: JsonSettingsSource, options: SourceLoadOptions = {}): Promise<ExternalSettings> {
  if (!source || source.kind !== 'json-api') fail('invalid-source');
  const target = await validateTarget(source.url, options);
  const payload = await requestJson(target, { Accept: 'application/json' }, options);
  return validateExternalSettingsPayload(payload);
}

function validateEntityId(entityId: string): void {
  if (typeof entityId !== 'string' || !ENTITY_PATTERN.test(entityId)) fail('invalid-entity');
}

function validateToken(token: string): void {
  if (typeof token !== 'string' || token.length < 1 || token.length > EXTERNAL_SETTINGS_SOURCE_LIMITS.tokenLength || /[\u0000-\u001f\u007f]/u.test(token)) fail('missing-token');
}

function homeAssistantStateUrl(baseUrl: URL, entityId: string): URL {
  if (baseUrl.search || (baseUrl.pathname !== '/' && baseUrl.pathname !== '')) fail('invalid-url');
  const result = new URL(baseUrl.href);
  result.pathname = `/api/states/${encodeURIComponent(entityId)}`;
  return result;
}

export async function loadHomeAssistantBooleanSource(source: HomeAssistantBooleanSource, options: SourceLoadOptions = {}): Promise<boolean> {
  if (!source || source.kind !== 'home-assistant') fail('invalid-source');
  validateEntityId(source.entityId);
  validateToken(source.token);
  const baseTarget = await validateTarget(source.baseUrl, options);
  const target = { ...baseTarget, url: homeAssistantStateUrl(baseTarget.url, source.entityId) };
  const payload = await requestJson(target, { Accept: 'application/json', Authorization: `Bearer ${source.token}` }, options);
  if (!isRecord(payload)) fail('invalid-response');
  assertOnlyFields(payload, HA_FIELDS);
  if (payload.entity_id !== undefined && payload.entity_id !== source.entityId) fail('invalid-response');
  if (payload.state === 'on') return true;
  if (payload.state === 'off') return false;
  fail('invalid-response');
}

export async function loadExternalSettingsSource(source: ExternalSettingsSource, options: SourceLoadOptions = {}): Promise<ExternalSettings | boolean> {
  if (source?.kind === 'json-api') return loadJsonSettingsSource(source, options);
  if (source?.kind === 'home-assistant') return loadHomeAssistantBooleanSource(source, options);
  fail('invalid-source');
}
