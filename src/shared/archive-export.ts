import path from 'node:path';

export const ARCHIVE_EXPORT_SCHEMA_VERSION = 1 as const;

export const ARCHIVE_EXPORT_LIMITS = Object.freeze({
  configBytes: 64 * 1024,
  entries: 1_000,
  entryPathBytes: 1_024,
  entryBytes: 256 * 1024 * 1024 * 1024,
  totalBytes: 1024 * 1024 * 1024 * 1024,
  dictionarySizeMiB: 1_536,
  wordSize: 273,
  solidBlockSizeMiB: 65_536,
  threads: 64,
  splitVolumeSizeMiB: 1_048_576,
});

export const ARCHIVE_COMPRESSION_COSTS = Object.freeze({
  store: 'No compression; fastest and lowest CPU use, with the largest archive.',
  fastest: 'Very fast compression with low CPU and memory use.',
  fast: 'Fast compression with modest CPU and memory use.',
  normal: 'Balanced compression, time, and memory; recommended for most exports.',
  maximum: 'Smaller output at a substantial time and memory cost.',
  ultra: 'Smallest practical output at the highest time and memory cost.',
});

export const SEVEN_ZIP_METHOD_COSTS = Object.freeze({
  LZMA2: 'Recommended general-purpose method with strong compression and multi-threading.',
  LZMA: 'Strong compression and broad compatibility, usually with less parallelism than LZMA2.',
  PPMd: 'Often effective for text, but can require substantial memory.',
  BZip2: 'Moderate compression with lower memory use and broad tool support.',
  Deflate: 'Fast and widely compatible, with a larger result than modern methods.',
});

export type ArchiveFormat = 'zip' | '7z';
export type ArchiveCompressionLevel = keyof typeof ARCHIVE_COMPRESSION_COSTS;
export type SevenZipMethod = keyof typeof SEVEN_ZIP_METHOD_COSTS;

export interface ArchiveExportEntry {
  path: string;
  bytes: number;
  sensitive?: boolean;
}

export interface ZipArchiveOptions {
  format: 'zip';
  compressionLevel?: ArchiveCompressionLevel;
}

export interface SevenZipArchiveOptions {
  format: '7z';
  method?: SevenZipMethod;
  compressionLevel?: ArchiveCompressionLevel;
  dictionarySizeMiB?: number;
  wordSize?: number;
  solid?: boolean;
  solidBlockSizeMiB?: number;
  threads?: number;
  splitVolumeSizeMiB?: number;
  encryption?: {
    enabled: boolean;
    encryptHeaders?: boolean;
  };
}

export interface ArchiveExportRequest {
  schemaVersion: typeof ARCHIVE_EXPORT_SCHEMA_VERSION;
  options: ZipArchiveOptions | SevenZipArchiveOptions;
  entries: ArchiveExportEntry[];
  sensitiveFlowAuthorized?: boolean;
}

export interface NormalizedZipArchiveOptions {
  format: 'zip';
  compressionLevel: ArchiveCompressionLevel;
}

export interface NormalizedSevenZipArchiveOptions {
  format: '7z';
  method: SevenZipMethod;
  compressionLevel: ArchiveCompressionLevel;
  dictionarySizeMiB: number;
  wordSize: number;
  solid: boolean;
  solidBlockSizeMiB: number;
  threads: number;
  splitVolumeSizeMiB?: number;
  encryption: {
    algorithm: 'AES-256';
    enabled: boolean;
    encryptHeaders: boolean;
  };
}

export interface ArchiveExportManifest {
  schemaVersion: typeof ARCHIVE_EXPORT_SCHEMA_VERSION;
  format: ArchiveFormat;
  options: NormalizedZipArchiveOptions | NormalizedSevenZipArchiveOptions;
  entries: Array<{ path: string; bytes: number; sensitive: boolean }>;
  entryCount: number;
  totalBytes: number;
  warnings: string[];
}

export interface SevenZipCommandDescriptor {
  executable: string;
  args: string[];
  cwd: string;
  shell: false;
  stdin: { kind: 'none' } | {
    kind: 'secret';
    purpose: 'archive-password';
    prompts: 2;
    encoding: 'utf8';
    appendNewline: true;
  };
  redactedLog: {
    executable: string;
    args: string[];
    cwd: string;
    shell: false;
  };
}

const COMPRESSION_LEVELS = new Set<ArchiveCompressionLevel>(['store', 'fastest', 'fast', 'normal', 'maximum', 'ultra']);
const METHODS = new Set<SevenZipMethod>(['LZMA2', 'LZMA', 'PPMd', 'BZip2', 'Deflate']);
const COMPRESSION_SWITCH: Record<ArchiveCompressionLevel, number> = {
  store: 0,
  fastest: 1,
  fast: 3,
  normal: 5,
  maximum: 7,
  ultra: 9,
};
const REQUEST_FIELDS = new Set(['schemaVersion', 'options', 'entries', 'sensitiveFlowAuthorized']);
const ENTRY_FIELDS = new Set(['path', 'bytes', 'sensitive']);
const ZIP_FIELDS = new Set(['format', 'compressionLevel']);
const SEVEN_ZIP_FIELDS = new Set([
  'format',
  'method',
  'compressionLevel',
  'dictionarySizeMiB',
  'wordSize',
  'solid',
  'solidBlockSizeMiB',
  'threads',
  'splitVolumeSizeMiB',
  'encryption',
]);
const ENCRYPTION_FIELDS = new Set(['enabled', 'encryptHeaders']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertFields(value: Record<string, unknown>, allowed: ReadonlySet<string>, context: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${context} contains unexpected field ${key}`);
  }
}

function assertBoundedInteger(value: unknown, minimum: number, maximum: number, context: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${context} must be an integer from ${minimum} to ${maximum}`);
  }
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/**
 * Archive entry names use a deliberately small portable subset. They are
 * relative POSIX paths, so extraction cannot target a drive, UNC root, ADS,
 * parent directory, or platform-dependent backslash path.
 */
export function validateArchiveEntryPath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('archive entry path must be a non-empty string');
  if (utf8Bytes(value) > ARCHIVE_EXPORT_LIMITS.entryPathBytes) throw new Error('archive entry path exceeds the byte limit');
  if (/^[\/]/u.test(value) || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw new Error('archive entry path must be relative');
  }
  if (value.includes('\\')) throw new Error('archive entry path must use forward slashes');
  if (value.includes(':')) throw new Error('archive entry path must not contain a drive or alternate data stream');
  if (/[\u0000-\u001f\u007f]/u.test(value)) throw new Error('archive entry path must not contain control characters');
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error('archive entry path contains an empty, current, or parent segment');
  }
  return value;
}

function normalizeCompressionLevel(value: unknown): ArchiveCompressionLevel {
  const level = value ?? 'normal';
  if (typeof level !== 'string' || !COMPRESSION_LEVELS.has(level as ArchiveCompressionLevel)) {
    throw new Error('compressionLevel must be store, fastest, fast, normal, maximum, or ultra');
  }
  return level as ArchiveCompressionLevel;
}

function normalizeOptions(input: unknown): NormalizedZipArchiveOptions | NormalizedSevenZipArchiveOptions {
  if (!isRecord(input)) throw new Error('archive options must be an object');
  if (input.format === 'zip') {
    assertFields(input, ZIP_FIELDS, 'ZIP options');
    return { format: 'zip', compressionLevel: normalizeCompressionLevel(input.compressionLevel) };
  }
  if (input.format !== '7z') throw new Error('archive format must be zip or 7z');
  assertFields(input, SEVEN_ZIP_FIELDS, '7z options');

  const method = input.method ?? 'LZMA2';
  if (typeof method !== 'string' || !METHODS.has(method as SevenZipMethod)) {
    throw new Error('7z method must be LZMA2, LZMA, PPMd, BZip2, or Deflate');
  }
  const dictionarySizeMiB = input.dictionarySizeMiB ?? 64;
  const wordSize = input.wordSize ?? 64;
  const solid = input.solid ?? true;
  const solidBlockSizeMiB = input.solidBlockSizeMiB ?? 256;
  const threads = input.threads ?? 4;
  assertBoundedInteger(dictionarySizeMiB, 1, ARCHIVE_EXPORT_LIMITS.dictionarySizeMiB, 'dictionarySizeMiB');
  assertBoundedInteger(wordSize, 5, ARCHIVE_EXPORT_LIMITS.wordSize, 'wordSize');
  if (typeof solid !== 'boolean') throw new Error('solid must be boolean');
  assertBoundedInteger(solidBlockSizeMiB, 1, ARCHIVE_EXPORT_LIMITS.solidBlockSizeMiB, 'solidBlockSizeMiB');
  assertBoundedInteger(threads, 1, ARCHIVE_EXPORT_LIMITS.threads, 'threads');
  if (input.splitVolumeSizeMiB !== undefined) {
    assertBoundedInteger(input.splitVolumeSizeMiB, 1, ARCHIVE_EXPORT_LIMITS.splitVolumeSizeMiB, 'splitVolumeSizeMiB');
  }

  let enabled = false;
  let encryptHeaders = false;
  if (input.encryption !== undefined) {
    if (!isRecord(input.encryption)) throw new Error('encryption must be an object');
    assertFields(input.encryption, ENCRYPTION_FIELDS, 'encryption');
    if (typeof input.encryption.enabled !== 'boolean') throw new Error('encryption.enabled must be boolean');
    if (input.encryption.encryptHeaders !== undefined && typeof input.encryption.encryptHeaders !== 'boolean') {
      throw new Error('encryption.encryptHeaders must be boolean');
    }
    enabled = input.encryption.enabled;
    encryptHeaders = input.encryption.encryptHeaders ?? false;
    if (!enabled && encryptHeaders) throw new Error('encrypted headers require AES-256 content encryption');
  }

  return {
    format: '7z',
    method: method as SevenZipMethod,
    compressionLevel: normalizeCompressionLevel(input.compressionLevel),
    dictionarySizeMiB,
    wordSize,
    solid,
    solidBlockSizeMiB,
    threads,
    ...(input.splitVolumeSizeMiB === undefined ? {} : { splitVolumeSizeMiB: input.splitVolumeSizeMiB }),
    encryption: { algorithm: 'AES-256', enabled, encryptHeaders },
  };
}

export function createArchiveManifest(input: unknown): ArchiveExportManifest {
  const serializedBytes = (() => {
    try {
      const serialized = JSON.stringify(input);
      if (serialized === undefined) throw new Error('not JSON');
      return utf8Bytes(serialized);
    } catch {
      throw new Error('archive export configuration must be serializable JSON');
    }
  })();
  if (serializedBytes > ARCHIVE_EXPORT_LIMITS.configBytes) {
    throw new Error(`archive export configuration exceeds ${ARCHIVE_EXPORT_LIMITS.configBytes} bytes`);
  }
  if (!isRecord(input)) throw new Error('archive export request must be an object');
  assertFields(input, REQUEST_FIELDS, 'archive export request');
  if (input.schemaVersion !== ARCHIVE_EXPORT_SCHEMA_VERSION) throw new Error('unsupported archive export schema version');
  if (input.sensitiveFlowAuthorized !== undefined && typeof input.sensitiveFlowAuthorized !== 'boolean') {
    throw new Error('sensitiveFlowAuthorized must be boolean');
  }
  if (!Array.isArray(input.entries) || input.entries.length === 0 || input.entries.length > ARCHIVE_EXPORT_LIMITS.entries) {
    throw new Error(`archive entries must contain 1 to ${ARCHIVE_EXPORT_LIMITS.entries} items`);
  }

  const options = normalizeOptions(input.options);
  const seen = new Set<string>();
  let totalBytes = 0;
  const entries = input.entries.map((candidate, index) => {
    if (!isRecord(candidate)) throw new Error(`entries[${index}] must be an object`);
    assertFields(candidate, ENTRY_FIELDS, `entries[${index}]`);
    const entryPath = validateArchiveEntryPath(candidate.path);
    if (seen.has(entryPath)) throw new Error(`duplicate archive entry path: ${entryPath}`);
    seen.add(entryPath);
    assertBoundedInteger(candidate.bytes, 0, ARCHIVE_EXPORT_LIMITS.entryBytes, `entries[${index}].bytes`);
    if (candidate.sensitive !== undefined && typeof candidate.sensitive !== 'boolean') {
      throw new Error(`entries[${index}].sensitive must be boolean`);
    }
    const sensitive = candidate.sensitive ?? false;
    if (sensitive && input.sensitiveFlowAuthorized !== true) {
      throw new Error(`sensitive archive entry requires an explicitly authorized sensitive flow: ${entryPath}`);
    }
    totalBytes += candidate.bytes;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > ARCHIVE_EXPORT_LIMITS.totalBytes) {
      throw new Error(`archive entries exceed the ${ARCHIVE_EXPORT_LIMITS.totalBytes}-byte total limit`);
    }
    return { path: entryPath, bytes: candidate.bytes, sensitive };
  });

  const warnings: string[] = [];
  if (options.format === '7z' && options.encryption.enabled && !options.encryption.encryptHeaders) {
    warnings.push('Archive contents use AES-256 encryption, but filenames remain visible because header encryption is off.');
  }
  return {
    schemaVersion: ARCHIVE_EXPORT_SCHEMA_VERSION,
    format: options.format,
    options,
    entries,
    entryCount: entries.length,
    totalBytes,
    warnings,
  };
}

export function parseArchiveExportJson(text: string): ArchiveExportManifest {
  if (typeof text !== 'string') throw new Error('archive export JSON must be a string');
  if (utf8Bytes(text) > ARCHIVE_EXPORT_LIMITS.configBytes) {
    throw new Error(`archive export configuration exceeds ${ARCHIVE_EXPORT_LIMITS.configBytes} bytes`);
  }
  let input: unknown;
  try {
    input = JSON.parse(text) as unknown;
  } catch {
    throw new Error('archive export JSON is malformed');
  }
  return createArchiveManifest(input);
}

export function createArchiveListFile(manifest: ArchiveExportManifest): string {
  const seen = new Set<string>();
  const paths = manifest.entries.map((entry) => {
    const entryPath = validateArchiveEntryPath(entry.path);
    if (seen.has(entryPath)) throw new Error(`duplicate archive entry path: ${entryPath}`);
    seen.add(entryPath);
    return entryPath;
  });
  return `${paths.join('\n')}\n`;
}

function assertTrustedAbsolutePath(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || !path.win32.isAbsolute(value) || value.includes('\u0000')) {
    throw new Error(`${context} must be an absolute Windows path`);
  }
}

export function buildSevenZipCommand(input: {
  manifest: ArchiveExportManifest;
  executable: { path: string; trusted: true };
  sourceDirectory: string;
  outputArchive: string;
  listFile: string;
}): SevenZipCommandDescriptor {
  if (!isRecord(input) || !isRecord(input.executable) || input.executable.trusted !== true) {
    throw new Error('7z executable must be explicitly trusted');
  }
  assertTrustedAbsolutePath(input.executable.path, '7z executable');
  if (path.win32.basename(input.executable.path).toLowerCase() !== '7z.exe') {
    throw new Error('trusted executable must be 7z.exe');
  }
  assertTrustedAbsolutePath(input.sourceDirectory, 'sourceDirectory');
  assertTrustedAbsolutePath(input.outputArchive, 'outputArchive');
  assertTrustedAbsolutePath(input.listFile, 'listFile');
  const expectedExtension = input.manifest.format === '7z' ? '.7z' : '.zip';
  if (path.win32.extname(input.outputArchive).toLowerCase() !== expectedExtension) {
    throw new Error(`outputArchive must use the ${expectedExtension} extension`);
  }

  const options = input.manifest.options;
  const args = [
    'a',
    options.format === '7z' ? '-t7z' : '-tzip',
    input.outputArchive,
    `@${input.listFile}`,
    `-mx=${COMPRESSION_SWITCH[options.compressionLevel]}`,
    '-spf-',
    '-y',
    '-bb0',
    '-scsUTF-8',
  ];
  let stdin: SevenZipCommandDescriptor['stdin'] = { kind: 'none' };
  if (options.format === '7z') {
    args.push(
      `-m0=${options.method}`,
      `-md=${options.dictionarySizeMiB}m`,
      `-mfb=${options.wordSize}`,
      options.solid ? `-ms=${options.solidBlockSizeMiB}m` : '-ms=off',
      `-mmt=${options.threads}`,
    );
    if (options.splitVolumeSizeMiB !== undefined) args.push(`-v${options.splitVolumeSizeMiB}m`);
    if (options.encryption.enabled) {
      args.push('-mem=AES256', '-p', options.encryption.encryptHeaders ? '-mhe=on' : '-mhe=off');
      stdin = { kind: 'secret', purpose: 'archive-password', prompts: 2, encoding: 'utf8', appendNewline: true };
    }
  }
  const redactedArgs = [...args];
  return {
    executable: input.executable.path,
    args,
    cwd: input.sourceDirectory,
    shell: false,
    stdin,
    redactedLog: {
      executable: input.executable.path,
      args: redactedArgs,
      cwd: input.sourceDirectory,
      shell: false,
    },
  };
}
