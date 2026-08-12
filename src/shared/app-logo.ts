/**
 * Local-only app-logo core.
 *
 * The UI owns file picking and application-data writes. This module accepts a
 * bounded byte buffer, decodes it locally, produces derived PNGs for the
 * runtime's declared display sizes, and only serializes derived output. It
 * deliberately has no network, filesystem, package-identity, or installer
 * concerns.
 */

import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

export const APP_LOGO_SCHEMA_VERSION = 1 as const;
export const APP_LOGO_LIMITS = Object.freeze({
  maxUploadBytes: 4 * 1024 * 1024,
  maxChunks: 128,
  maxChunkBytes: 2 * 1024 * 1024,
  maxWidth: 4_096,
  maxHeight: 4_096,
  maxPixels: 8_388_608,
  maxDecodedBytes: 32 * 1024 * 1024,
  maxPersistedDerivedBytes: 1 * 1024 * 1024,
  maxPersistedPayloadBytes: 2 * 1024 * 1024,
  maxFileNameLength: 120,
} as const);

export const APP_LOGO_OUTPUT_SPECS = Object.freeze([
  Object.freeze({ id: 'titlebar-20', format: 'png' as const, width: 20, height: 20, consumer: 'custom-title-bar' }),
  Object.freeze({ id: 'menu-24', format: 'png' as const, width: 24, height: 24, consumer: 'menus-and-lists' }),
  Object.freeze({ id: 'settings-preview-48', format: 'png' as const, width: 48, height: 48, consumer: 'settings-preview' }),
  Object.freeze({ id: 'app-64', format: 'png' as const, width: 64, height: 64, consumer: 'app-shell' }),
  Object.freeze({ id: 'app-128', format: 'png' as const, width: 128, height: 128, consumer: 'high-density-app-shell' }),
  Object.freeze({ id: 'app-256', format: 'png' as const, width: 256, height: 256, consumer: 'persistent-derived-logo' }),
] as const);

export const APP_LOGO_IDENTITY_BOUNDARY = Object.freeze({
  changesPackageIdentity: false,
  changesExecutableName: false,
  changesInstallerName: false,
  changesUpdateFeed: false,
  changesDataDirectory: false,
  note: 'A personal logo changes presentation only; installed identity remains stable.',
} as const);

export const APP_LOGO_PRESETS = Object.freeze([
  Object.freeze({
    id: 'material-blue',
    labels: Object.freeze({ English: 'Material blue', Yue: 'Material 藍' }),
    background: '#e8def8',
    foreground: '#6750a4',
    accent: '#1d192b',
  }),
  Object.freeze({
    id: 'material-teal',
    labels: Object.freeze({ English: 'Material teal', Yue: 'Material 青綠' }),
    background: '#d7e8e3',
    foreground: '#006b5f',
    accent: '#003731',
  }),
  Object.freeze({
    id: 'high-contrast',
    labels: Object.freeze({ English: 'High contrast', Yue: '高對比' }),
    background: '#ffffff',
    foreground: '#000000',
    accent: '#6750a4',
  }),
] as const);

export const APP_LOGO_CONTROL_CATALOG = Object.freeze([
  Object.freeze({ id: 'logo-preset', searchTerms: ['logo', 'preset', '標誌', '預設'], labels: { English: 'Shipped logo preset', Yue: '內置標誌預設' } }),
  Object.freeze({ id: 'logo-upload', searchTerms: ['logo', 'upload', 'local', '標誌', '上載', '本機'], labels: { English: 'Local custom logo upload', Yue: '本機自訂標誌上載' } }),
  Object.freeze({ id: 'logo-crop', searchTerms: ['logo', 'crop', '標誌', '裁剪'], labels: { English: 'Crop', Yue: '裁剪' } }),
  Object.freeze({ id: 'logo-fit', searchTerms: ['logo', 'fit', 'contain', 'cover', '標誌', '適應'], labels: { English: 'Fit', Yue: '適應方式' } }),
  Object.freeze({ id: 'logo-focal-point', searchTerms: ['logo', 'focal', 'focus', '標誌', '焦點'], labels: { English: 'Focal point', Yue: '焦點位置' } }),
  Object.freeze({ id: 'logo-background', searchTerms: ['logo', 'background', '標誌', '背景'], labels: { English: 'Background', Yue: '背景' } }),
  Object.freeze({ id: 'logo-reset', searchTerms: ['logo', 'reset', 'restore', '標誌', '重設'], labels: { English: 'Reset logo', Yue: '重設標誌' } }),
] as const);

export type AppLogoCrop = 'original' | 'square';
export type AppLogoFit = 'contain' | 'cover' | 'stretch';
export type AppLogoBackground = 'transparent' | `#${string}`;
export type AppLogoPresetId = (typeof APP_LOGO_PRESETS)[number]['id'];

export interface AppLogoTransform {
  readonly crop: AppLogoCrop;
  readonly fit: AppLogoFit;
  readonly focalPoint: Readonly<{ x: number; y: number }>;
  readonly background: AppLogoBackground;
}

export interface AppLogoUploadInput {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly mediaType: 'image/png' | string;
}

export interface ValidatedAppLogoUpload {
  readonly kind: 'validated-local-png';
  readonly sourceHash: `sha256:${string}`;
  readonly width: number;
  readonly height: number;
  readonly bytes: Uint8Array;
}

export interface AppLogoDerivedAsset {
  readonly id: (typeof APP_LOGO_OUTPUT_SPECS)[number]['id'];
  readonly format: 'png';
  readonly width: number;
  readonly height: number;
  readonly consumer: (typeof APP_LOGO_OUTPUT_SPECS)[number]['consumer'];
  readonly sha256: `sha256:${string}`;
  readonly dataUrl: `data:image/png;base64,${string}`;
}

export interface AppLogoCustomSelection {
  readonly kind: 'custom';
  /** A converted runtime PNG, never the selected source file. */
  readonly derivedAsset: AppLogoDerivedAsset;
}

export interface AppLogoPresetSelection {
  readonly kind: 'preset';
  readonly presetId: AppLogoPresetId;
}

export interface AppLogoPersistedState {
  readonly schemaVersion: 1;
  readonly storage: 'local-only';
  readonly transform: AppLogoTransform;
  readonly selection: AppLogoCustomSelection | AppLogoPresetSelection;
}

export interface AppLogoExportMetadata {
  readonly schemaVersion: 1;
  readonly selection: 'preset' | 'custom';
  readonly presetId?: AppLogoPresetId;
  readonly transform: AppLogoTransform;
  readonly omitted: readonly ['custom-logo-derived-raster'];
}

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,115}\.png$/u;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/u;
const HEX_COLOR = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const PERSISTED_KEYS = new Set(['schemaVersion', 'storage', 'transform', 'selection']);
const TRANSFORM_KEYS = new Set(['crop', 'fit', 'focalPoint', 'background']);
const FOCAL_KEYS = new Set(['x', 'y']);
const PRESET_KEYS = new Set(['kind', 'presetId']);
const CUSTOM_KEYS = new Set(['kind', 'derivedAsset']);
const DERIVED_KEYS = new Set(['id', 'format', 'width', 'height', 'consumer', 'sha256', 'dataUrl']);

function immutable<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.size && actual.every((key) => keys.has(key) && !UNSAFE_KEYS.has(key));
}

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function equalSignature(bytes: Uint8Array): boolean {
  return bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function readType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset] ?? 0, bytes[offset + 1] ?? 0, bytes[offset + 2] ?? 0, bytes[offset + 3] ?? 0);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] ?? 0) * 0x1000000) + ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0)) >>> 0;
}

function reject(message: string): never {
  throw new Error(`Custom app logo rejected: ${message}`);
}

/**
 * Reject dangerous PNG structure before delegating to the decoder. PNG's
 * declared pixel geometry bounds output memory, while its deliberately small
 * allowed chunk vocabulary avoids animation and metadata/polyglot surprises.
 */
function inspectPng(bytes: Uint8Array): Readonly<{ width: number; height: number }> {
  if (!equalSignature(bytes)) reject('only a real PNG signature is supported');
  let offset = PNG_SIGNATURE.length;
  let chunks = 0;
  let sawHeader = false;
  let sawData = false;
  let sawEnd = false;
  let width = 0;
  let height = 0;

  while (offset < bytes.length) {
    if (sawEnd || offset + 12 > bytes.length) reject('PNG chunk structure is malformed');
    const length = readU32(bytes, offset);
    const type = readType(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (++chunks > APP_LOGO_LIMITS.maxChunks || length > APP_LOGO_LIMITS.maxChunkBytes || chunkEnd > bytes.length) {
      reject('PNG chunks exceed the local resource limit');
    }
    if (!['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'].includes(type)) {
      reject(type === 'acTL' || type === 'fcTL' || type === 'fdAT' ? 'animated PNG is not supported' : 'unsupported or spoofed PNG chunk');
    }
    if (type === 'IHDR') {
      if (sawHeader || chunks !== 1 || length !== 13) reject('PNG header is malformed');
      width = readU32(bytes, dataStart);
      height = readU32(bytes, dataStart + 4);
      const bitDepth = bytes[dataStart + 8];
      const colorType = bytes[dataStart + 9];
      const compression = bytes[dataStart + 10];
      const filter = bytes[dataStart + 11];
      const interlace = bytes[dataStart + 12];
      if (!width || !height || width > APP_LOGO_LIMITS.maxWidth || height > APP_LOGO_LIMITS.maxHeight || width * height > APP_LOGO_LIMITS.maxPixels || width * height * 4 > APP_LOGO_LIMITS.maxDecodedBytes) {
        reject('PNG dimensions exceed the local decode limit');
      }
      if (![8, 16].includes(bitDepth ?? -1) || ![2, 6].includes(colorType ?? -1) || compression !== 0 || filter !== 0 || interlace !== 0) {
        reject('PNG encoding is unsupported');
      }
      sawHeader = true;
    } else if (type === 'PLTE' || type === 'tRNS') {
      reject('indexed and palette PNG encodings are not supported');
    } else if (type === 'IDAT') {
      if (!sawHeader || sawEnd) reject('PNG data order is malformed');
      sawData = true;
    } else if (type === 'IEND') {
      if (!sawHeader || !sawData || length !== 0 || chunkEnd !== bytes.length) reject('PNG end marker is malformed or has trailing bytes');
      sawEnd = true;
    }
    offset = chunkEnd;
  }
  if (!sawHeader || !sawData || !sawEnd) reject('PNG is incomplete');
  return immutable({ width, height });
}

function cloneBytes(bytes: Uint8Array): Uint8Array {
  return Uint8Array.from(bytes);
}

export function validateAppLogoUpload(input: unknown): ValidatedAppLogoUpload {
  if (!isRecord(input) || !hasOnlyKeys(input, new Set(['bytes', 'fileName', 'mediaType']))) reject('upload shape is invalid');
  if (!(input.bytes instanceof Uint8Array)) reject('upload bytes are invalid');
  if (typeof input.fileName !== 'string' || input.fileName.length === 0 || input.fileName.length > APP_LOGO_LIMITS.maxFileNameLength || !SAFE_FILE_NAME.test(input.fileName) || input.fileName.includes('..')) {
    reject('file name must be a simple .png name');
  }
  if (input.mediaType !== 'image/png') reject('declared media type must be image/png');
  const bytes = input.bytes;
  if (bytes.byteLength === 0 || bytes.byteLength > APP_LOGO_LIMITS.maxUploadBytes) reject('file exceeds the local upload limit');
  const inspected = inspectPng(bytes);
  let decoded: PNG;
  try {
    decoded = PNG.sync.read(Buffer.from(bytes), { checkCRC: true, skipRescale: true });
  } catch {
    reject('PNG decoder rejected the bytes');
  }
  if (decoded.width !== inspected.width || decoded.height !== inspected.height || decoded.data.byteLength !== decoded.width * decoded.height * 4) {
    reject('PNG decode result is inconsistent');
  }
  return immutable({ kind: 'validated-local-png', sourceHash: sha256(bytes), width: decoded.width, height: decoded.height, bytes: cloneBytes(bytes) });
}

function parseColor(value: AppLogoBackground): readonly [number, number, number, number] | null {
  if (value === 'transparent') return null;
  if (!HEX_COLOR.test(value)) return null;
  const opaque = value.length === 7 ? `${value}ff` : value;
  return immutable([
    Number.parseInt(opaque.slice(1, 3), 16),
    Number.parseInt(opaque.slice(3, 5), 16),
    Number.parseInt(opaque.slice(5, 7), 16),
    Number.parseInt(opaque.slice(7, 9), 16),
  ]);
}

export function defaultAppLogoTransform(): AppLogoTransform {
  return immutable({ crop: 'original', fit: 'contain', focalPoint: immutable({ x: 0.5, y: 0.5 }), background: 'transparent' });
}

export function validateAppLogoTransform(value: unknown): AppLogoTransform | null {
  if (!isRecord(value) || !hasOnlyKeys(value, TRANSFORM_KEYS) || !isRecord(value.focalPoint) || !hasOnlyKeys(value.focalPoint, FOCAL_KEYS)) return null;
  if (value.crop !== 'original' && value.crop !== 'square') return null;
  if (value.fit !== 'contain' && value.fit !== 'cover' && value.fit !== 'stretch') return null;
  if (typeof value.focalPoint.x !== 'number' || typeof value.focalPoint.y !== 'number' || !Number.isFinite(value.focalPoint.x) || !Number.isFinite(value.focalPoint.y) || value.focalPoint.x < 0 || value.focalPoint.x > 1 || value.focalPoint.y < 0 || value.focalPoint.y > 1) return null;
  if (value.background !== 'transparent' && (typeof value.background !== 'string' || !HEX_COLOR.test(value.background))) return null;
  return immutable({
    crop: value.crop,
    fit: value.fit,
    focalPoint: immutable({ x: value.focalPoint.x, y: value.focalPoint.y }),
    background: value.background as AppLogoBackground,
  });
}

function sourceRect(width: number, height: number, transform: AppLogoTransform): Readonly<{ x: number; y: number; width: number; height: number }> {
  if (transform.crop === 'original') return immutable({ x: 0, y: 0, width, height });
  const side = Math.min(width, height);
  return immutable({
    x: Math.round((width - side) * transform.focalPoint.x),
    y: Math.round((height - side) * transform.focalPoint.y),
    width: side,
    height: side,
  });
}

function fillPixel(destination: Uint8Array, pixel: number, color: readonly [number, number, number, number] | null): void {
  if (!color) return;
  destination[pixel] = color[0];
  destination[pixel + 1] = color[1];
  destination[pixel + 2] = color[2];
  destination[pixel + 3] = color[3];
}

function paintScaled(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  destination: Uint8Array,
  destinationWidth: number,
  destinationHeight: number,
  rect: Readonly<{ x: number; y: number; width: number; height: number }>,
  transform: AppLogoTransform,
): void {
  let drawWidth = destinationWidth;
  let drawHeight = destinationHeight;
  if (transform.fit === 'contain') {
    const scale = Math.min(destinationWidth / rect.width, destinationHeight / rect.height);
    drawWidth = Math.max(1, Math.round(rect.width * scale));
    drawHeight = Math.max(1, Math.round(rect.height * scale));
  } else if (transform.fit === 'cover') {
    const scale = Math.max(destinationWidth / rect.width, destinationHeight / rect.height);
    drawWidth = Math.max(1, Math.round(rect.width * scale));
    drawHeight = Math.max(1, Math.round(rect.height * scale));
  }
  const dx = Math.round((destinationWidth - drawWidth) * (transform.fit === 'contain' ? 0.5 : transform.focalPoint.x));
  const dy = Math.round((destinationHeight - drawHeight) * (transform.fit === 'contain' ? 0.5 : transform.focalPoint.y));
  for (let y = Math.max(0, dy); y < Math.min(destinationHeight, dy + drawHeight); y += 1) {
    const v = (y - dy + 0.5) / drawHeight;
    const sourceY = Math.min(sourceHeight - 1, rect.y + Math.min(rect.height - 1, Math.floor(v * rect.height)));
    for (let x = Math.max(0, dx); x < Math.min(destinationWidth, dx + drawWidth); x += 1) {
      const u = (x - dx + 0.5) / drawWidth;
      const sourceX = Math.min(sourceWidth - 1, rect.x + Math.min(rect.width - 1, Math.floor(u * rect.width)));
      const sourcePixel = (sourceY * sourceWidth + sourceX) * 4;
      const destinationPixel = (y * destinationWidth + x) * 4;
      const alpha = (source[sourcePixel + 3] ?? 0) / 255;
      const baseAlpha = (destination[destinationPixel + 3] ?? 0) / 255;
      const outputAlpha = alpha + baseAlpha * (1 - alpha);
      if (outputAlpha === 0) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        const foreground = source[sourcePixel + channel] ?? 0;
        const base = destination[destinationPixel + channel] ?? 0;
        destination[destinationPixel + channel] = Math.round((foreground * alpha + base * baseAlpha * (1 - alpha)) / outputAlpha);
      }
      destination[destinationPixel + 3] = Math.round(outputAlpha * 255);
    }
  }
}

function toAsset(spec: (typeof APP_LOGO_OUTPUT_SPECS)[number], pixels: Uint8Array): AppLogoDerivedAsset {
  const png = new PNG({ width: spec.width, height: spec.height });
  png.data = Buffer.from(pixels);
  const bytes = PNG.sync.write(png, { colorType: 6, inputColorType: 6 });
  const dataUrl = `data:image/png;base64,${bytes.toString('base64')}` as const;
  return immutable({ id: spec.id, format: 'png', width: spec.width, height: spec.height, consumer: spec.consumer, sha256: sha256(bytes), dataUrl });
}

function renderPng(source: PNG, transform: AppLogoTransform, spec: (typeof APP_LOGO_OUTPUT_SPECS)[number]): AppLogoDerivedAsset {
  const pixels = new Uint8Array(spec.width * spec.height * 4);
  const background = parseColor(transform.background);
  for (let pixel = 0; pixel < pixels.length; pixel += 4) fillPixel(pixels, pixel, background);
  paintScaled(source.data, source.width, source.height, pixels, spec.width, spec.height, sourceRect(source.width, source.height, transform), transform);
  return toAsset(spec, pixels);
}

function decodeValidatedUpload(upload: ValidatedAppLogoUpload): PNG {
  try {
    return PNG.sync.read(Buffer.from(upload.bytes), { checkCRC: true, skipRescale: true });
  } catch {
    throw new Error('Validated app logo could not be decoded again');
  }
}

export function renderCustomAppLogo(upload: ValidatedAppLogoUpload, transformValue: unknown): readonly AppLogoDerivedAsset[] {
  const transform = validateAppLogoTransform(transformValue);
  if (!transform) throw new Error('App logo transform is invalid');
  const source = decodeValidatedUpload(upload);
  return immutable(APP_LOGO_OUTPUT_SPECS.map((spec) => renderPng(source, transform, spec)));
}

function hex(value: string): readonly [number, number, number] {
  return immutable([Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16)]);
}

function presetSource(preset: (typeof APP_LOGO_PRESETS)[number]): PNG {
  const size = 256;
  const png = new PNG({ width: size, height: size });
  const background = hex(preset.background);
  const foreground = hex(preset.foreground);
  const accent = hex(preset.accent);
  const center = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const pixel = (y * size + x) * 4;
      const distance = Math.hypot(x - center, y - center);
      const primary = distance < 94;
      const diamond = Math.abs(x - center) + Math.abs(y - center) < 54;
      const color = diamond ? accent : primary ? foreground : background;
      png.data[pixel] = color[0];
      png.data[pixel + 1] = color[1];
      png.data[pixel + 2] = color[2];
      png.data[pixel + 3] = 255;
    }
  }
  return png;
}

function findPreset(id: unknown): (typeof APP_LOGO_PRESETS)[number] | null {
  return typeof id === 'string' ? APP_LOGO_PRESETS.find((preset) => preset.id === id) ?? null : null;
}

export function renderAppLogoPreset(presetId: AppLogoPresetId, transformValue: unknown = defaultAppLogoTransform()): readonly AppLogoDerivedAsset[] {
  const preset = findPreset(presetId);
  const transform = validateAppLogoTransform(transformValue);
  if (!preset || !transform) throw new Error('App logo preset or transform is invalid');
  const source = presetSource(preset);
  return immutable(APP_LOGO_OUTPUT_SPECS.map((spec) => renderPng(source, transform, spec)));
}

function validateDerivedAsset(value: unknown): AppLogoDerivedAsset | null {
  if (!isRecord(value) || !hasOnlyKeys(value, DERIVED_KEYS)) return null;
  const spec = APP_LOGO_OUTPUT_SPECS.find((candidate) => candidate.id === value.id) ?? null;
  if (!spec || value.format !== 'png' || value.width !== spec.width || value.height !== spec.height || value.consumer !== spec.consumer || typeof value.sha256 !== 'string' || !HASH.test(value.sha256) || typeof value.dataUrl !== 'string') return null;
  const match = DATA_URL.exec(value.dataUrl);
  if (!match) return null;
  const bytes = Buffer.from(match[1] ?? '', 'base64');
  if (bytes.byteLength === 0 || bytes.byteLength > APP_LOGO_LIMITS.maxPersistedDerivedBytes || sha256(bytes) !== value.sha256) return null;
  try {
    const decoded = PNG.sync.read(bytes, { checkCRC: true, skipRescale: true });
    if (decoded.width !== spec.width || decoded.height !== spec.height || decoded.data.byteLength !== decoded.width * decoded.height * 4) return null;
  } catch { return null; }
  return immutable({ id: spec.id, format: 'png', width: spec.width, height: spec.height, consumer: spec.consumer, sha256: value.sha256 as `sha256:${string}`, dataUrl: value.dataUrl as `data:image/png;base64,${string}` });
}

export function createCustomAppLogoState(transformValue: unknown, derivedAssets: readonly AppLogoDerivedAsset[]): AppLogoPersistedState {
  const transform = validateAppLogoTransform(transformValue);
  const persisted = derivedAssets.find((asset) => asset.id === 'app-256');
  const derivedAsset = validateDerivedAsset(persisted);
  if (!transform || !derivedAsset) throw new Error('A valid app-256 derived PNG is required for local persistence');
  return immutable({ schemaVersion: APP_LOGO_SCHEMA_VERSION, storage: 'local-only', transform, selection: immutable({ kind: 'custom', derivedAsset }) });
}

export function createPresetAppLogoState(presetId: AppLogoPresetId, transformValue: unknown = defaultAppLogoTransform()): AppLogoPersistedState {
  const transform = validateAppLogoTransform(transformValue);
  if (!findPreset(presetId) || !transform) throw new Error('App logo preset or transform is invalid');
  return immutable({ schemaVersion: APP_LOGO_SCHEMA_VERSION, storage: 'local-only', transform, selection: immutable({ kind: 'preset', presetId }) });
}

export function validateAppLogoPersistedState(value: unknown): AppLogoPersistedState | null {
  if (!isRecord(value) || !hasOnlyKeys(value, PERSISTED_KEYS) || value.schemaVersion !== APP_LOGO_SCHEMA_VERSION || value.storage !== 'local-only') return null;
  const transform = validateAppLogoTransform(value.transform);
  if (!transform || !isRecord(value.selection)) return null;
  if (value.selection.kind === 'preset' && hasOnlyKeys(value.selection, PRESET_KEYS) && findPreset(value.selection.presetId)) {
    return immutable({ schemaVersion: APP_LOGO_SCHEMA_VERSION, storage: 'local-only', transform, selection: immutable({ kind: 'preset', presetId: value.selection.presetId as AppLogoPresetId }) });
  }
  if (value.selection.kind === 'custom' && hasOnlyKeys(value.selection, CUSTOM_KEYS)) {
    const derivedAsset = validateDerivedAsset(value.selection.derivedAsset);
    if (!derivedAsset) return null;
    return immutable({ schemaVersion: APP_LOGO_SCHEMA_VERSION, storage: 'local-only', transform, selection: immutable({ kind: 'custom', derivedAsset }) });
  }
  return null;
}

export function serializeAppLogoPersistedState(value: unknown): string | null {
  const state = validateAppLogoPersistedState(value);
  if (!state) return null;
  const payload = JSON.stringify(state);
  return Buffer.byteLength(payload, 'utf8') <= APP_LOGO_LIMITS.maxPersistedPayloadBytes ? payload : null;
}

export function parseAppLogoPersistedState(payload: string | Uint8Array): AppLogoPersistedState | null {
  const bytes = typeof payload === 'string' ? Buffer.byteLength(payload, 'utf8') : payload.byteLength;
  if (bytes > APP_LOGO_LIMITS.maxPersistedPayloadBytes) return null;
  try {
    return validateAppLogoPersistedState(JSON.parse(typeof payload === 'string' ? payload : new TextDecoder('utf-8', { fatal: true }).decode(payload)) as unknown);
  } catch { return null; }
}

/** Exports remain useful while deliberately omitting any user-selected raster. */
export function createAppLogoExportMetadata(value: unknown): AppLogoExportMetadata | null {
  const state = validateAppLogoPersistedState(value);
  if (!state) return null;
  const base = { schemaVersion: APP_LOGO_SCHEMA_VERSION, selection: state.selection.kind, transform: state.transform, omitted: immutable(['custom-logo-derived-raster'] as const) };
  return state.selection.kind === 'preset'
    ? immutable({ ...base, presetId: state.selection.presetId })
    : immutable(base);
}

export function resetAppLogoState(): AppLogoPersistedState {
  return createPresetAppLogoState('material-blue');
}
