/**
 * Framework-neutral startup decision core for the dim-sum surprise.
 *
 * This module performs no I/O. The application shell supplies one
 * cryptographically secure random draw for each launch, authoritative dish
 * names from the public catalog, and already-resolved public release metadata.
 */

export const DIM_SUM_SURPRISE_CACHE_SCHEMA_VERSION = 1 as const;

export const DIM_SUM_SURPRISE_LIMITS = Object.freeze({
  probability: 0.1,
  autoDismissMs: 6_500,
  maxCachePayloadBytes: 8 * 1024,
  maxNameCodePoints: 120,
  maxNameUtf8Bytes: 480,
  maxRevisionLength: 128,
  maxReleaseTagLength: 128,
  maxAssetNameLength: 240,
  maxAssetBytes: 32 * 1024 * 1024,
} as const);

export const DIM_SUM_PHOTO_REPOSITORY = 'Ding-Ding-Projects/dim-sum-photos' as const;

export type DimSumLanguageMode = 'English' | 'Yue' | 'Bilingual';
export type DimSumFunnyLevel = 1 | 2 | 3 | 4 | 5;

export interface DimSumDishNames {
  readonly English: string;
  readonly Yue: string;
}

export interface DimSumPublicAssetProvenance {
  readonly repository: typeof DIM_SUM_PHOTO_REPOSITORY;
  readonly catalogSchemaVersion: '1.0.0';
  readonly catalogRevision: string;
  readonly catalogUrl: string;
  readonly dishId: string;
  readonly names: DimSumDishNames;
  readonly imageAlt: DimSumDishNames;
  readonly imagePath: string;
  readonly releaseTag: string;
  readonly releaseDraft: false;
  readonly releasePrerelease: false;
  readonly assetName: string;
  readonly assetUrl: string;
  readonly assetState: 'uploaded';
  readonly contentType: 'image/png';
  readonly assetSize: number;
  readonly sha256: string;
}

export interface DimSumStartupContext {
  readonly firstRun: boolean;
  readonly errorPath: boolean;
  readonly updateFlow: boolean;
  readonly activeTask: boolean;
  readonly quietHours: boolean;
  readonly doNotDisturb: boolean;
  readonly schoolMode: boolean;
}

export interface DimSumStartupInput {
  readonly context: DimSumStartupContext;
  readonly language: DimSumLanguageMode;
  readonly englishFunnyLevel: DimSumFunnyLevel;
  readonly yueFunnyLevel: DimSumFunnyLevel;
  readonly dish: Readonly<{ names: DimSumDishNames }>;
  readonly publicAsset?: DimSumPublicAssetProvenance;
  readonly reducedMotion: boolean;
}

export interface DimSumSurpriseDescriptor {
  readonly kind: 'dim-sum-startup-surprise';
  readonly presentation: 'non-blocking';
  readonly autoDismissMs: 6500;
  readonly requestsFocus: false;
  readonly blocksStartup: false;
  readonly motion: 'standard' | 'reduced';
  readonly language: DimSumLanguageMode;
  readonly dish: Readonly<{ names: Readonly<DimSumDishNames> }>;
  readonly copy: Readonly<{ title: string; message: string }>;
  readonly image: Readonly<{
    source: 'public-catalog-release';
    url: string;
    alt: string;
  }>;
  readonly provenance: Readonly<DimSumPublicAssetProvenance>;
}

export type DimSumSuppressionReason =
  | 'first-run'
  | 'error-path'
  | 'update-flow'
  | 'active-task'
  | 'quiet-hours'
  | 'do-not-disturb'
  | 'school-mode'
  | 'missing-public-asset'
  | 'invalid-public-asset'
  | 'invalid-input'
  | 'invalid-random-draw';

export type DimSumStartupDecision =
  | Readonly<{ status: 'shown'; descriptor: DimSumSurpriseDescriptor }>
  | Readonly<{ status: 'missed' }>
  | Readonly<{ status: 'suppressed'; reason: DimSumSuppressionReason }>
  | Readonly<{ status: 'already-evaluated' }>;

export interface DimSumSurpriseCacheMetadata {
  readonly schemaVersion: 1;
  readonly repository: typeof DIM_SUM_PHOTO_REPOSITORY;
  readonly catalogSchemaVersion: '1.0.0';
  readonly catalogRevision: string;
  readonly catalogUrl: string;
  readonly releaseTag: string;
  readonly assetName: string;
  readonly assetUrl: string;
  readonly cachedAt: string;
}

const CACHE_FIELDS = new Set([
  'schemaVersion',
  'repository',
  'catalogSchemaVersion',
  'catalogRevision',
  'catalogUrl',
  'releaseTag',
  'assetName',
  'assetUrl',
  'cachedAt',
]);
const PROVENANCE_FIELDS = new Set([
  'repository',
  'catalogSchemaVersion',
  'catalogRevision',
  'catalogUrl',
  'dishId',
  'names',
  'imageAlt',
  'imagePath',
  'releaseTag',
  'releaseDraft',
  'releasePrerelease',
  'assetName',
  'assetUrl',
  'assetState',
  'contentType',
  'assetSize',
  'sha256',
]);
const CONTEXT_FIELDS = new Set([
  'firstRun',
  'errorPath',
  'updateFlow',
  'activeTask',
  'quietHours',
  'doNotDisturb',
  'schoolMode',
]);
const INPUT_FIELDS = new Set([
  'context',
  'language',
  'englishFunnyLevel',
  'yueFunnyLevel',
  'dish',
  'publicAsset',
  'reducedMotion',
]);
const REQUIRED_INPUT_FIELDS = new Set([...INPUT_FIELDS].filter((field) => field !== 'publicAsset'));
const OPTIONAL_INPUT_FIELDS = new Set(['publicAsset']);
const DISH_FIELDS = new Set(['names']);
const NAME_FIELDS = new Set(['English', 'Yue']);
const UNSAFE_FIELDS = new Set(['__proto__', 'prototype', 'constructor']);
const IMMUTABLE_GIT_REVISION = /^[0-9a-f]{40}$/u;
const SAFE_RELEASE_TAG = /^catalog-v1(?:$|[-._][A-Za-z0-9][A-Za-z0-9._-]*)$/u;
const SAFE_IMAGE_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._ -]{0,234}[A-Za-z0-9])?\.png$/iu;
const SAFE_IMAGE_PATH = /^(?:[A-Za-z0-9._ -]+\/)*[A-Za-z0-9][A-Za-z0-9._ -]*\.png$/iu;
const DISH_ID = /^hk-dish-[1-9]\d*$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const CONTROL_OR_LINE_BREAK = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const INVISIBLE_DIRECTIONAL_FORMAT = /[\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u;
const UNPAIRED_SURROGATE = /[\ud800-\udfff]/u;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

const ENGLISH_COPY = Object.freeze([
  Object.freeze({ title: 'A dim sum moment', message: 'A small dish for the start of your day.' }),
  Object.freeze({ title: 'A dim sum moment', message: 'A small dish has rolled by to say hello.' }),
  Object.freeze({ title: 'Dim sum delivery', message: 'A tiny steamer basket has joined the startup crew.' }),
  Object.freeze({ title: 'Dim sum delivery', message: 'The startup kitchen sent a snack-sized morale upgrade.' }),
  Object.freeze({ title: 'Dim sum has entered the chat', message: 'A tiny steamer basket clocked in before the progress bar did.' }),
] as const);

const YUE_COPY = Object.freeze([
  Object.freeze({ title: '點心一刻', message: '開工之前，送上一款小點心。' }),
  Object.freeze({ title: '點心一刻', message: '有件小點心路過，同你打個招呼。' }),
  Object.freeze({ title: '點心送到', message: '細細個蒸籠加入咗開工隊伍。' }),
  Object.freeze({ title: '點心送到', message: '開工廚房送上迷你士氣補給。' }),
  Object.freeze({ title: '點心嚟報到', message: '進度條未起步，個蒸籠已經返咗工。' }),
] as const);

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyFields(value: Record<string, unknown>, expected: ReadonlySet<string>): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every((key) => expected.has(key) && !UNSAFE_FIELDS.has(key));
}

function hasRequiredAndOptionalFields(
  value: Record<string, unknown>,
  required: ReadonlySet<string>,
  optional: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(value);
  return [...required].every((key) => Object.hasOwn(value, key))
    && keys.every((key) => (required.has(key) || optional.has(key)) && !UNSAFE_FIELDS.has(key));
}

function isBoundedText(value: unknown, maxCodePoints: number, maxBytes: number): value is string {
  if (typeof value !== 'string' || value !== value.trim() || value.length === 0 || value !== value.normalize('NFC')) return false;
  if (CONTROL_OR_LINE_BREAK.test(value) || INVISIBLE_DIRECTIONAL_FORMAT.test(value) || UNPAIRED_SURROGATE.test(value)) return false;
  return Array.from(value).length <= maxCodePoints && byteLength(value) <= maxBytes;
}

function validFunnyLevel(value: unknown): value is DimSumFunnyLevel {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5;
}

function expectedCatalogUrl(revision: string): string {
  return `https://raw.githubusercontent.com/${DIM_SUM_PHOTO_REPOSITORY}/${revision}/catalog/index.json`;
}

function expectedAssetUrl(releaseTag: string, assetName: string): string {
  return `https://github.com/${DIM_SUM_PHOTO_REPOSITORY}/releases/download/${releaseTag}/${encodeURIComponent(assetName)}`;
}

function exactPublicHttpsUrl(value: unknown, expected: string): boolean {
  if (typeof value !== 'string' || value !== expected) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && parsed.username === ''
      && parsed.password === ''
      && parsed.port === ''
      && parsed.search === ''
      && parsed.hash === '';
  } catch {
    return false;
  }
}

/** Validate provenance without fetching, downloading, decoding, or caching an image. */
export function validateDimSumPublicAsset(value: unknown): DimSumPublicAssetProvenance | null {
  if (!isRecord(value) || !hasOnlyFields(value, PROVENANCE_FIELDS)) return null;
  if (
    value.repository !== DIM_SUM_PHOTO_REPOSITORY
    || value.catalogSchemaVersion !== '1.0.0'
  ) return null;
  if (typeof value.dishId !== 'string' || !DISH_ID.test(value.dishId)) return null;
  const names = validateNames(value.names);
  const imageAlt = validateNames(value.imageAlt);
  if (!names || !imageAlt) return null;
  if (
    typeof value.catalogRevision !== 'string'
    || value.catalogRevision.length > DIM_SUM_SURPRISE_LIMITS.maxRevisionLength
    || !IMMUTABLE_GIT_REVISION.test(value.catalogRevision)
  ) return null;
  if (value.releaseDraft !== false || value.releasePrerelease !== false) return null;
  if (
    typeof value.releaseTag !== 'string'
    || value.releaseTag.length > DIM_SUM_SURPRISE_LIMITS.maxReleaseTagLength
    || !SAFE_RELEASE_TAG.test(value.releaseTag)
  ) return null;
  if (
    typeof value.assetName !== 'string'
    || value.assetName.length > DIM_SUM_SURPRISE_LIMITS.maxAssetNameLength
    || !SAFE_IMAGE_NAME.test(value.assetName)
    || value.assetName.includes('..')
  ) return null;
  if (
    typeof value.imagePath !== 'string'
    || !SAFE_IMAGE_PATH.test(value.imagePath)
    || value.imagePath.includes('..')
    || value.imagePath.split('/').at(-1) !== value.assetName
  ) return null;
  if (
    value.assetState !== 'uploaded'
    || value.contentType !== 'image/png'
    || !Number.isSafeInteger(value.assetSize)
    || Number(value.assetSize) < 1
    || Number(value.assetSize) > DIM_SUM_SURPRISE_LIMITS.maxAssetBytes
    || typeof value.sha256 !== 'string'
    || !SHA256.test(value.sha256)
  ) return null;
  if (!exactPublicHttpsUrl(value.catalogUrl, expectedCatalogUrl(value.catalogRevision))) return null;
  if (!exactPublicHttpsUrl(value.assetUrl, expectedAssetUrl(value.releaseTag, value.assetName))) return null;
  return Object.freeze({
    repository: DIM_SUM_PHOTO_REPOSITORY,
    catalogSchemaVersion: '1.0.0',
    catalogRevision: value.catalogRevision,
    catalogUrl: value.catalogUrl as string,
    dishId: value.dishId,
    names,
    imageAlt,
    imagePath: value.imagePath,
    releaseTag: value.releaseTag,
    releaseDraft: false,
    releasePrerelease: false,
    assetName: value.assetName,
    assetUrl: value.assetUrl as string,
    assetState: 'uploaded',
    contentType: 'image/png',
    assetSize: value.assetSize as number,
    sha256: value.sha256,
  });
}

function validateNames(value: unknown): DimSumDishNames | null {
  if (!isRecord(value) || !hasOnlyFields(value, NAME_FIELDS)) return null;
  if (!isBoundedText(value.English, DIM_SUM_SURPRISE_LIMITS.maxNameCodePoints, DIM_SUM_SURPRISE_LIMITS.maxNameUtf8Bytes)) return null;
  if (!isBoundedText(value.Yue, DIM_SUM_SURPRISE_LIMITS.maxNameCodePoints, DIM_SUM_SURPRISE_LIMITS.maxNameUtf8Bytes)) return null;
  return Object.freeze({ English: value.English, Yue: value.Yue });
}

function validateContext(value: unknown): DimSumStartupContext | null {
  if (!isRecord(value) || !hasOnlyFields(value, CONTEXT_FIELDS)) return null;
  for (const field of CONTEXT_FIELDS) if (typeof value[field] !== 'boolean') return null;
  return Object.freeze({
    firstRun: value.firstRun as boolean,
    errorPath: value.errorPath as boolean,
    updateFlow: value.updateFlow as boolean,
    activeTask: value.activeTask as boolean,
    quietHours: value.quietHours as boolean,
    doNotDisturb: value.doNotDisturb as boolean,
    schoolMode: value.schoolMode as boolean,
  });
}

function suppressionReason(context: DimSumStartupContext): DimSumSuppressionReason | null {
  if (context.firstRun) return 'first-run';
  if (context.errorPath) return 'error-path';
  if (context.updateFlow) return 'update-flow';
  if (context.activeTask) return 'active-task';
  if (context.quietHours) return 'quiet-hours';
  if (context.doNotDisturb) return 'do-not-disturb';
  if (context.schoolMode) return 'school-mode';
  return null;
}

function validateInput(value: unknown): {
  context: DimSumStartupContext;
  language: DimSumLanguageMode;
  englishFunnyLevel: DimSumFunnyLevel;
  yueFunnyLevel: DimSumFunnyLevel;
  names: DimSumDishNames;
  publicAsset?: unknown;
  reducedMotion: boolean;
} | null {
  if (!isRecord(value) || !hasRequiredAndOptionalFields(value, REQUIRED_INPUT_FIELDS, OPTIONAL_INPUT_FIELDS)) return null;
  const context = validateContext(value.context);
  if (!context || !['English', 'Yue', 'Bilingual'].includes(String(value.language))) return null;
  if (!validFunnyLevel(value.englishFunnyLevel) || !validFunnyLevel(value.yueFunnyLevel)) return null;
  if (typeof value.reducedMotion !== 'boolean') return null;
  if (!isRecord(value.dish) || !hasOnlyFields(value.dish, DISH_FIELDS)) return null;
  const names = validateNames(value.dish.names);
  if (!names) return null;
  return {
    context,
    language: value.language as DimSumLanguageMode,
    englishFunnyLevel: value.englishFunnyLevel,
    yueFunnyLevel: value.yueFunnyLevel,
    names,
    publicAsset: value.publicAsset,
    reducedMotion: value.reducedMotion,
  };
}

function localizedCopy(
  language: DimSumLanguageMode,
  englishFunnyLevel: DimSumFunnyLevel,
  yueFunnyLevel: DimSumFunnyLevel,
): Readonly<{ title: string; message: string }> {
  const english = ENGLISH_COPY[englishFunnyLevel - 1];
  const yue = YUE_COPY[yueFunnyLevel - 1];
  if (language === 'English') return Object.freeze({ ...english });
  if (language === 'Yue') return Object.freeze({ ...yue });
  return Object.freeze({
    title: `${english.title} · ${yue.title}`,
    message: `${english.message}\n${yue.message}`,
  });
}

function descriptor(
  input: NonNullable<ReturnType<typeof validateInput>>,
  provenance: DimSumPublicAssetProvenance,
): DimSumSurpriseDescriptor {
  const names = Object.freeze({ ...input.names });
  return Object.freeze({
    kind: 'dim-sum-startup-surprise',
    presentation: 'non-blocking',
    autoDismissMs: DIM_SUM_SURPRISE_LIMITS.autoDismissMs,
    requestsFocus: false,
    blocksStartup: false,
    motion: input.reducedMotion ? 'reduced' : 'standard',
    language: input.language,
    dish: Object.freeze({ names }),
    copy: localizedCopy(input.language, input.englishFunnyLevel, input.yueFunnyLevel),
    image: Object.freeze({
      source: 'public-catalog-release',
      url: provenance.assetUrl,
      alt: `Photo of ${names.English} · ${names.Yue}`,
    }),
    provenance,
  });
}

/**
 * One instance represents exactly one application launch. The injected draw is
 * consumed during construction and is never called again by this instance.
 */
export class DimSumStartupSurpriseLaunch {
  private readonly draw: number | null;
  private evaluated = false;

  constructor(cryptographicRandomDraw: () => number) {
    if (typeof cryptographicRandomDraw !== 'function') {
      this.draw = null;
      return;
    }
    try {
      const candidate = cryptographicRandomDraw();
      this.draw = Number.isFinite(candidate) && candidate >= 0 && candidate < 1 ? candidate : null;
    } catch {
      this.draw = null;
    }
  }

  decide(input: DimSumStartupInput): DimSumStartupDecision {
    if (this.evaluated) return Object.freeze({ status: 'already-evaluated' });
    this.evaluated = true;
    if (this.draw === null) return Object.freeze({ status: 'suppressed', reason: 'invalid-random-draw' });

    const validated = validateInput(input);
    if (!validated) return Object.freeze({ status: 'suppressed', reason: 'invalid-input' });
    const blocked = suppressionReason(validated.context);
    if (blocked) return Object.freeze({ status: 'suppressed', reason: blocked });
    if (this.draw >= DIM_SUM_SURPRISE_LIMITS.probability) return Object.freeze({ status: 'missed' });
    if (validated.publicAsset === undefined) {
      return Object.freeze({ status: 'suppressed', reason: 'missing-public-asset' });
    }
    const provenance = validateDimSumPublicAsset(validated.publicAsset);
    if (!provenance) return Object.freeze({ status: 'suppressed', reason: 'invalid-public-asset' });
    if (provenance.names.English !== validated.names.English || provenance.names.Yue !== validated.names.Yue) {
      return Object.freeze({ status: 'suppressed', reason: 'invalid-public-asset' });
    }
    return Object.freeze({ status: 'shown', descriptor: descriptor(validated, provenance) });
  }
}

function validateTimestamp(value: unknown): value is string {
  return typeof value === 'string' && UTC_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));
}

/** Build bounded application-data cache metadata; image bytes and dish names are deliberately absent. */
export function createDimSumSurpriseCacheMetadata(
  provenanceValue: unknown,
  cachedAt: string,
): DimSumSurpriseCacheMetadata | null {
  const provenance = validateDimSumPublicAsset(provenanceValue);
  if (!provenance || !validateTimestamp(cachedAt)) return null;
  return Object.freeze({
    schemaVersion: DIM_SUM_SURPRISE_CACHE_SCHEMA_VERSION,
    repository: provenance.repository,
    catalogSchemaVersion: provenance.catalogSchemaVersion,
    catalogRevision: provenance.catalogRevision,
    catalogUrl: provenance.catalogUrl,
    releaseTag: provenance.releaseTag,
    assetName: provenance.assetName,
    assetUrl: provenance.assetUrl,
    cachedAt,
  });
}

export function validateDimSumSurpriseCacheMetadata(value: unknown): DimSumSurpriseCacheMetadata | null {
  if (!isRecord(value) || !hasOnlyFields(value, CACHE_FIELDS)) return null;
  if (
    value.schemaVersion !== DIM_SUM_SURPRISE_CACHE_SCHEMA_VERSION
    || value.repository !== DIM_SUM_PHOTO_REPOSITORY
    || value.catalogSchemaVersion !== '1.0.0'
    || typeof value.catalogRevision !== 'string'
    || !IMMUTABLE_GIT_REVISION.test(value.catalogRevision)
    || typeof value.releaseTag !== 'string'
    || !SAFE_RELEASE_TAG.test(value.releaseTag)
    || typeof value.assetName !== 'string'
    || !SAFE_IMAGE_NAME.test(value.assetName)
    || value.assetName.includes('..')
    || !exactPublicHttpsUrl(value.catalogUrl, expectedCatalogUrl(value.catalogRevision))
    || !exactPublicHttpsUrl(value.assetUrl, expectedAssetUrl(value.releaseTag, value.assetName))
    || !validateTimestamp(value.cachedAt)
  ) return null;
  return Object.freeze({
    schemaVersion: DIM_SUM_SURPRISE_CACHE_SCHEMA_VERSION,
    repository: DIM_SUM_PHOTO_REPOSITORY,
    catalogSchemaVersion: '1.0.0',
    catalogRevision: value.catalogRevision,
    catalogUrl: value.catalogUrl as string,
    releaseTag: value.releaseTag,
    assetName: value.assetName,
    assetUrl: value.assetUrl as string,
    cachedAt: value.cachedAt,
  });
}

export function parseDimSumSurpriseCacheMetadata(payload: string | Uint8Array): DimSumSurpriseCacheMetadata | null {
  const length = typeof payload === 'string' ? byteLength(payload) : payload.byteLength;
  if (length > DIM_SUM_SURPRISE_LIMITS.maxCachePayloadBytes) return null;
  let source: string;
  try {
    source = typeof payload === 'string' ? payload : new TextDecoder('utf-8', { fatal: true }).decode(payload);
  } catch {
    return null;
  }
  try {
    return validateDimSumSurpriseCacheMetadata(JSON.parse(source) as unknown);
  } catch {
    return null;
  }
}

export function serializeDimSumSurpriseCacheMetadata(value: unknown): string | null {
  const metadata = validateDimSumSurpriseCacheMetadata(value);
  return metadata ? JSON.stringify(metadata) : null;
}
