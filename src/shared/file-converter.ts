/**
 * Local-only file-conversion contracts.  This module deliberately contains no
 * process spawning, PATH lookup, or networking.  The privileged host may only
 * execute an adapter after it has supplied a bundled-artifact proof.
 */

export const FILE_CONVERTER_SCHEMA_VERSION = 1 as const;

export const FILE_CONVERTER_LIMITS = Object.freeze({
  signatureBytes: 4 * 1024,
  itemPathBytes: 4 * 1024,
  pageItems: 64,
  pageMetadataBytes: 128 * 1024,
  maxConcurrency: 4,
  maxInFlightBytes: 512 * 1024 * 1024,
  maxItemBytes: 256 * 1024 * 1024 * 1024,
  maxRetryCount: 3,
  csvInputBytes: 64 * 1024 * 1024,
  csvRows: 250_000,
  csvColumns: 4_096,
  csvCellBytes: 1 * 1024 * 1024,
});

export const FILE_CONVERTER_CATEGORIES = [
  'Documents/PDF', 'Images', 'Audio', 'Video', 'Archives',
  'Structured Data/Spreadsheets', 'Code/Text', 'Binary Encodings',
] as const;

export type FileConverterCategory = (typeof FILE_CONVERTER_CATEGORIES)[number];
export type AdapterAvailability = 'available' | 'unavailable';
export type QueueState = 'active' | 'paused' | 'cancelled';
export type QueueItemState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type FileKind =
  | 'pdf' | 'png' | 'jpeg' | 'gif' | 'webp' | 'zip' | 'seven-zip'
  | 'wav' | 'mp3' | 'ogg' | 'mp4' | 'text' | 'unknown';

export interface BundledAdapterProof {
  bundled: true;
  artifactPath: string;
  artifactSha256: string;
  verifier: string;
}

export interface ConverterAdapter {
  id: string;
  category: FileConverterCategory;
  sourceKinds: readonly FileKind[];
  targetFormat: string;
  metadataBehavior: string;
  lossiness: 'lossless' | 'lossy' | 'opaque';
  sandbox: 'isolated-local';
  limits: { inputBytes: number; outputBytes: number; memoryBytes: number; cpuMs: number; tempBytes: number };
  outputValidator: string;
  availability: AdapterAvailability;
  bundledProof?: BundledAdapterProof;
  unavailableReason?: string;
}

const UNBUNDLED = 'Unavailable: this adapter is not bundled and verified in the packaged artifact.';
const TEXT_JSON_ADAPTER_PROOF: BundledAdapterProof = Object.freeze({
  bundled: true,
  artifactPath: 'electron-main:built-in-text-json-normalizer-v1',
  artifactSha256: '4d4f61376d7fd895105062fbf4b3eb9b4ef2d9932dc7dc8f13eeefb2f1560a68',
  verifier: 'Electron main-process built-in adapter; output is reopened and byte-validated before completion.',
});
const CSV_JSON_ADAPTER_PROOF: BundledAdapterProof = Object.freeze({
  bundled: true,
  artifactPath: 'electron-main:built-in-csv-json-converter-v1',
  artifactSha256: '6bc785ed41db7d755d47d1a9af9557749f6e4fd8c898850b1d1e2de88aed4c03',
  verifier: 'Electron main-process built-in adapter; it parses fatal UTF-8 CSV under fixed bounds and reopens byte-validated JSON output before completion.',
});

/** Known formats are shown even when the installed artifact has no safe adapter. */
export const FILE_CONVERTER_ADAPTERS: readonly ConverterAdapter[] = Object.freeze([
  adapter('pdf-inspect', 'Documents/PDF', ['pdf'], 'PDF inspection and page operations', 'Preserves source bytes; output operations require reopen validation.', 'opaque'),
  adapter('image-raster', 'Images', ['png', 'jpeg', 'gif', 'webp'], 'PNG/JPEG/WebP', 'Metadata preservation depends on the selected codec.', 'lossy'),
  adapter('audio-transcode', 'Audio', ['wav', 'mp3', 'ogg'], 'WAV/MP3/Ogg', 'Tags and cover art must be explicitly reported.', 'lossy'),
  adapter('video-transcode', 'Video', ['mp4'], 'MP4/WebM', 'Container and stream metadata can change.', 'lossy'),
  adapter('archive-repack', 'Archives', ['zip', 'seven-zip'], 'ZIP/7z', 'Entry order, timestamps, and encryption are disclosed before conversion.', 'opaque'),
  {
    id: 'csv-to-json', category: 'Structured Data/Spreadsheets', sourceKinds: ['text'], targetFormat: 'CSV to canonical JSON',
    metadataBehavior: 'A UTF-8 CSV table becomes a JSON array of text-cell rows. Column names, formulas, types, and source bytes are not inferred or changed.',
    lossiness: 'lossless', sandbox: 'isolated-local',
    limits: { inputBytes: 16 * 1024 * 1024, outputBytes: 64 * 1024 * 1024, memoryBytes: 256 * 1024 * 1024, cpuMs: 30 * 1000, tempBytes: 64 * 1024 * 1024 },
    outputValidator: 'Parses fatal UTF-8 RFC4180 CSV within fixed row, column, and cell bounds, then reopens and byte-validates deterministic JSON.',
    availability: 'available', bundledProof: CSV_JSON_ADAPTER_PROOF,
  },
  adapter('tabular-convert', 'Structured Data/Spreadsheets', ['text'], 'TSV/XLSX/ODS', 'Encoding, formulas, and cell types require a declared adapter policy.', 'opaque'),
  {
    id: 'text-json-normalize', category: 'Code/Text', sourceKinds: ['text'], targetFormat: 'UTF-8 plain text',
    metadataBehavior: 'Valid UTF-8 text is normalized to LF line endings; JSON is parsed and serialized with sorted object keys. Source bytes are unchanged.',
    lossiness: 'lossless', sandbox: 'isolated-local',
    limits: { inputBytes: 64 * 1024 * 1024, outputBytes: 64 * 1024 * 1024, memoryBytes: 256 * 1024 * 1024, cpuMs: 30 * 1000, tempBytes: 64 * 1024 * 1024 },
    outputValidator: 'Reopens the atomically written UTF-8 output and compares the exact deterministic bytes before completion.',
    availability: 'available', bundledProof: TEXT_JSON_ADAPTER_PROOF,
  },
  adapter('text-convert', 'Code/Text', ['text'], 'TXT/Markdown/JSON/YAML/XML', 'Encoding and newline changes are disclosed.', 'lossless'),
  adapter('binary-encode', 'Binary Encodings', ['unknown'], 'Base64/hex', 'Binary bytes are represented as text; source bytes are unchanged.', 'lossless'),
]);

function adapter(
  id: string, category: FileConverterCategory, sourceKinds: readonly FileKind[], targetFormat: string,
  metadataBehavior: string, lossiness: ConverterAdapter['lossiness'],
): ConverterAdapter {
  return {
    id, category, sourceKinds, targetFormat, metadataBehavior, lossiness,
    sandbox: 'isolated-local',
    limits: { inputBytes: FILE_CONVERTER_LIMITS.maxItemBytes, outputBytes: FILE_CONVERTER_LIMITS.maxItemBytes, memoryBytes: 256 * 1024 * 1024, cpuMs: 10 * 60 * 1000, tempBytes: FILE_CONVERTER_LIMITS.maxItemBytes },
    outputValidator: 'Unavailable until a bundled adapter can reopen and validate its output.',
    availability: 'unavailable', unavailableReason: UNBUNDLED,
  };
}

export function validateAdapterRegistry(adapters: readonly ConverterAdapter[] = FILE_CONVERTER_ADAPTERS): void {
  const ids = new Set<string>();
  for (const entry of adapters) {
    if (!FILE_CONVERTER_CATEGORIES.includes(entry.category)) throw new Error(`Unknown converter category: ${entry.category}`);
    if (!/^[a-z0-9-]{3,80}$/u.test(entry.id) || ids.has(entry.id)) throw new Error(`Invalid or duplicate adapter id: ${entry.id}`);
    ids.add(entry.id);
    if (entry.availability === 'available') {
      if (entry.bundledProof?.bundled !== true || !/^[a-f0-9]{64}$/iu.test(entry.bundledProof.artifactSha256) || entry.bundledProof.artifactPath.length === 0) {
        throw new Error(`Available adapter ${entry.id} requires bundled artifact proof`);
      }
      if (entry.unavailableReason !== undefined) throw new Error(`Available adapter ${entry.id} cannot have an unavailable reason`);
    } else if (!entry.unavailableReason || entry.bundledProof !== undefined) {
      throw new Error(`Unavailable adapter ${entry.id} requires an exact unavailable reason and no bundled proof`);
    }
  }
}

export function catalogByCategory(adapters: readonly ConverterAdapter[] = FILE_CONVERTER_ADAPTERS): ReadonlyMap<FileConverterCategory, readonly ConverterAdapter[]> {
  validateAdapterRegistry(adapters);
  const catalog = new Map<FileConverterCategory, ConverterAdapter[]>();
  for (const category of FILE_CONVERTER_CATEGORIES) catalog.set(category, []);
  for (const entry of adapters) catalog.get(entry.category)?.push(entry);
  return catalog;
}

function starts(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return offset >= 0 && bytes.length >= offset + signature.length && signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, Math.min(end, bytes.length)));
}

const EXTENSIONS: Readonly<Record<string, FileKind>> = Object.freeze({
  pdf: 'pdf', png: 'png', jpg: 'jpeg', jpeg: 'jpeg', gif: 'gif', webp: 'webp', zip: 'zip', '7z': 'seven-zip',
  wav: 'wav', mp3: 'mp3', ogg: 'ogg', mp4: 'mp4', txt: 'text', md: 'text', json: 'text', yaml: 'text', yml: 'text', xml: 'text', csv: 'text', tsv: 'text',
});

export interface TypeDetection {
  kind: FileKind;
  confidence: 'magic' | 'extension' | 'unknown';
  declaredKind?: FileKind;
  conflict: boolean;
  inspectedBytes: number;
  reason: string;
}

export function detectFileType(sample: Uint8Array, fileName?: string): TypeDetection {
  if (!(sample instanceof Uint8Array)) throw new Error('File signature sample must be Uint8Array');
  if (sample.byteLength > FILE_CONVERTER_LIMITS.signatureBytes) throw new Error(`File signature sample exceeds ${FILE_CONVERTER_LIMITS.signatureBytes} bytes`);
  const extension = fileName?.split('.').pop()?.toLocaleLowerCase('en-US');
  const declaredKind = extension ? EXTENSIONS[extension] : undefined;
  const matches: FileKind[] = [];
  if (starts(sample, [0x25, 0x50, 0x44, 0x46, 0x2d])) matches.push('pdf');
  if (starts(sample, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) matches.push('png');
  if (starts(sample, [0xff, 0xd8, 0xff])) matches.push('jpeg');
  if (ascii(sample, 0, 6) === 'GIF87a' || ascii(sample, 0, 6) === 'GIF89a') matches.push('gif');
  if (ascii(sample, 0, 4) === 'RIFF' && ascii(sample, 8, 12) === 'WEBP') matches.push('webp');
  if (ascii(sample, 0, 4) === 'RIFF' && ascii(sample, 8, 12) === 'WAVE') matches.push('wav');
  if (starts(sample, [0x50, 0x4b, 0x03, 0x04]) || starts(sample, [0x50, 0x4b, 0x05, 0x06]) || starts(sample, [0x50, 0x4b, 0x07, 0x08])) matches.push('zip');
  if (starts(sample, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) matches.push('seven-zip');
  if (ascii(sample, 0, 4) === 'OggS') matches.push('ogg');
  if (ascii(sample, 0, 3) === 'ID3' || (sample[0] === 0xff && (((sample[1] ?? 0) & 0xe0) === 0xe0))) matches.push('mp3');
  if (ascii(sample, 4, 8) === 'ftyp') matches.push('mp4');
  if (matches.length > 1) throw new Error('Ambiguous or polyglot file signature is refused');
  const kind = matches[0] ?? (isUtf8Text(sample) ? 'text' : 'unknown');
  const conflict = declaredKind !== undefined && kind !== 'unknown' && declaredKind !== kind && !(declaredKind === 'text' && kind === 'text');
  return {
    kind, declaredKind, conflict, inspectedBytes: sample.byteLength,
    confidence: matches.length ? 'magic' : declaredKind ? 'extension' : 'unknown',
    reason: conflict ? `Declared extension suggests ${declaredKind}, but bounded content signature is ${kind}.` : matches.length ? `Detected ${kind} from bounded content signature.` : declaredKind ? `No trusted content signature; extension suggests ${declaredKind}.` : 'No known bounded signature or declared extension.',
  };
}

function isUtf8Text(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return true;
  let controls = 0;
  for (const byte of bytes) {
    if (byte === 0) return false;
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) controls += 1;
  }
  return controls / bytes.length < 0.02;
}

/**
 * Bounded CSV primitives for a future local structured-data adapter.  They do
 * not inspect paths, invoke tools, or write files.  Parsing accepts RFC4180
 * CRLF records and common LF records, while serialization always emits the
 * canonical RFC4180 CRLF form.
 */
export interface CsvLimits {
  inputBytes: number;
  rows: number;
  columns: number;
  cellBytes: number;
}

export const CSV_LIMITS: Readonly<CsvLimits> = Object.freeze({
  inputBytes: FILE_CONVERTER_LIMITS.csvInputBytes,
  rows: FILE_CONVERTER_LIMITS.csvRows,
  columns: FILE_CONVERTER_LIMITS.csvColumns,
  cellBytes: FILE_CONVERTER_LIMITS.csvCellBytes,
});

export type CsvRows = readonly (readonly string[])[];

function normalizedCsvLimits(overrides: Partial<CsvLimits>): CsvLimits {
  const limits = { ...CSV_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1 || value > Number.MAX_SAFE_INTEGER) {
      throw new Error(`CSV ${name} limit must be a positive safe integer.`);
    }
  }
  return limits;
}

function utf8ScalarBytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function assertCsvCell(value: string, bytes: number, limits: CsvLimits): void {
  if (value.includes('\0')) throw new Error('CSV cells cannot contain NUL characters.');
  if (bytes > limits.cellBytes) throw new Error(`CSV cell exceeds the ${limits.cellBytes}-byte limit.`);
}

/** Parse fatal UTF-8 CSV without accepting malformed quotes or unlimited rows. */
export function parseCsvUtf8(bytes: Uint8Array, overrides: Partial<CsvLimits> = {}): string[][] {
  if (!(bytes instanceof Uint8Array)) throw new Error('CSV input must be UTF-8 bytes.');
  const limits = normalizedCsvLimits(overrides);
  if (bytes.byteLength > limits.inputBytes) throw new Error(`CSV input exceeds the ${limits.inputBytes}-byte limit.`);

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new Error('CSV input is not valid UTF-8.');
  }
  if (text.codePointAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes('\0')) throw new Error('CSV input cannot contain NUL characters.');

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let cellBytes = 0;
  let quoted = false;
  let afterQuote = false;

  const append = (scalar: string): void => {
    cell += scalar;
    cellBytes += utf8ScalarBytes(scalar);
    assertCsvCell(cell, cellBytes, limits);
  };
  const finishCell = (): void => {
    assertCsvCell(cell, cellBytes, limits);
    row.push(cell);
    if (row.length > limits.columns) throw new Error(`CSV row exceeds the ${limits.columns}-column limit.`);
    cell = '';
    cellBytes = 0;
  };
  const finishRow = (): void => {
    finishCell();
    rows.push(row);
    if (rows.length > limits.rows) throw new Error(`CSV input exceeds the ${limits.rows}-row limit.`);
    row = [];
  };
  const consumeRecordEnding = (index: number): number => {
    if (text[index] === '\r') {
      if (text[index + 1] !== '\n') throw new Error('CSV uses a bare carriage return; use CRLF or LF record endings.');
      return index + 1;
    }
    return index;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          append('"');
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else if (character === '\r' || character === '\n') {
        const end = consumeRecordEnding(index);
        append(character === '\r' ? '\r\n' : '\n');
        index = end;
      } else {
        const point = text.codePointAt(index)!;
        const scalar = String.fromCodePoint(point);
        append(scalar);
        if (point > 0xffff) index += 1;
      }
      continue;
    }

    if (afterQuote) {
      if (character === ',') {
        finishCell();
        afterQuote = false;
      } else if (character === '\r' || character === '\n') {
        index = consumeRecordEnding(index);
        finishRow();
        afterQuote = false;
      } else {
        throw new Error('CSV has non-delimiter data after a closing quote.');
      }
      continue;
    }

    if (character === '"') {
      if (cell.length !== 0) throw new Error('CSV quotes may only begin at the start of a cell.');
      quoted = true;
    } else if (character === ',') {
      finishCell();
    } else if (character === '\r' || character === '\n') {
      index = consumeRecordEnding(index);
      finishRow();
    } else {
      const point = text.codePointAt(index)!;
      const scalar = String.fromCodePoint(point);
      append(scalar);
      if (point > 0xffff) index += 1;
    }
  }

  if (quoted) throw new Error('CSV ended inside a quoted cell.');
  if (cell.length !== 0 || cellBytes !== 0 || row.length !== 0 || afterQuote) finishRow();
  return rows;
}

/** Serialize rows as canonical RFC4180 CSV with CRLF record endings. */
export function serializeCsvRows(rows: CsvRows, overrides: Partial<CsvLimits> = {}): string {
  if (!Array.isArray(rows)) throw new Error('CSV rows must be an array.');
  const limits = normalizedCsvLimits(overrides);
  if (rows.length > limits.rows) throw new Error(`CSV output exceeds the ${limits.rows}-row limit.`);
  const encodedRows = rows.map((row) => {
    if (!Array.isArray(row) || row.length > limits.columns) throw new Error(`CSV rows must have at most ${limits.columns} cells.`);
    return row.map((cell) => {
      if (typeof cell !== 'string') throw new Error('CSV cells must be strings.');
      const bytes = new TextEncoder().encode(cell).byteLength;
      assertCsvCell(cell, bytes, limits);
      return /[",\r\n]/u.test(cell) ? `"${cell.replace(/"/gu, '""')}"` : cell;
    }).join(',');
  }).join('\r\n');
  const output = encodedRows.length === 0 ? '' : `${encodedRows}\r\n`;
  const outputBytes = new TextEncoder().encode(output).byteLength;
  if (outputBytes > limits.inputBytes) throw new Error(`CSV output exceeds the ${limits.inputBytes}-byte limit.`);
  return output;
}

/** Deterministic UTF-8 JSON for a CSV table, retaining every cell as text. */
export function serializeCsvRowsAsJson(rows: CsvRows, overrides: Partial<CsvLimits> = {}): string {
  const limits = normalizedCsvLimits(overrides);
  const normalized = rows.map((row) => {
    if (!Array.isArray(row) || row.length > limits.columns) throw new Error(`CSV rows must have at most ${limits.columns} cells.`);
    return row.map((cell) => {
      if (typeof cell !== 'string') throw new Error('CSV cells must be strings.');
      assertCsvCell(cell, new TextEncoder().encode(cell).byteLength, limits);
      return cell;
    });
  });
  if (normalized.length > limits.rows) throw new Error(`CSV JSON output exceeds the ${limits.rows}-row limit.`);
  const output = `${JSON.stringify(normalized)}\n`;
  if (new TextEncoder().encode(output).byteLength > limits.inputBytes) throw new Error(`CSV JSON output exceeds the ${limits.inputBytes}-byte limit.`);
  return output;
}

export interface StoragePreflight { availableBytes: number; requiredBytes: number; reserveBytes?: number }
export function assertStoragePreflight(preflight: StoragePreflight): void {
  for (const [name, value] of Object.entries(preflight)) if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw new Error(`${name} must be a non-negative safe integer`);
  const required = preflight.requiredBytes + (preflight.reserveBytes ?? 0);
  if (preflight.availableBytes < required) throw new Error(`Insufficient storage: ${required} bytes required, ${preflight.availableBytes} bytes available before queueing.`);
}

export interface ConversionQueueItem {
  id: string;
  sourcePath: string;
  sourceBytes: number;
  estimatedOutputBytes: number;
  adapterId: string;
  state: QueueItemState;
  retryCount: number;
  outcome?: string;
}
export interface ConversionQueuePage { id: string; items: ConversionQueueItem[] }
export interface ConversionQueueIndex {
  schemaVersion: typeof FILE_CONVERTER_SCHEMA_VERSION;
  state: QueueState;
  pageIds: string[];
  inFlightBytes: number;
}
export interface ConversionQueueStore {
  readIndex(): Promise<ConversionQueueIndex | undefined>;
  writeIndex(index: ConversionQueueIndex): Promise<void>;
  readPage(id: string): Promise<ConversionQueuePage | undefined>;
  writePage(page: ConversionQueuePage): Promise<void>;
}
export interface QueueBackpressure { concurrency: number; maxInFlightBytes: number }

/**
 * The queue stores pages of bounded metadata; it never accepts file bytes and
 * only reads one page when claiming work. A store may keep unlimited pages
 * while the active process remains bounded by page size and backpressure.
 */
export class PersistentConversionQueue {
  private readonly index: ConversionQueueIndex;
  private readonly settings: QueueBackpressure;

  private constructor(private readonly store: ConversionQueueStore, index: ConversionQueueIndex, settings: QueueBackpressure) {
    this.index = index;
    this.settings = settings;
  }

  static async open(store: ConversionQueueStore, settings: Partial<QueueBackpressure> = {}): Promise<PersistentConversionQueue> {
    const normalized = normalizeBackpressure(settings);
    const existing = await store.readIndex();
    const index = existing ?? { schemaVersion: FILE_CONVERTER_SCHEMA_VERSION, state: 'active' as const, pageIds: [], inFlightBytes: 0 };
    if (index.schemaVersion !== FILE_CONVERTER_SCHEMA_VERSION) throw new Error('Unsupported conversion queue schema version');
    if (!['active', 'paused', 'cancelled'].includes(index.state)) throw new Error('Invalid conversion queue state');
    const queue = new PersistentConversionQueue(store, { ...index, pageIds: [...index.pageIds], inFlightBytes: 0 }, normalized);
    await queue.recoverRunningItems();
    return queue;
  }

  async enqueuePage(page: ConversionQueuePage, preflight: StoragePreflight): Promise<void> {
    if (this.index.state === 'cancelled') throw new Error('Cancelled queues cannot accept more work');
    assertStoragePreflight(preflight);
    validateQueuePage(page);
    if (this.index.pageIds.includes(page.id)) throw new Error(`Duplicate queue page id: ${page.id}`);
    const metadataBytes = utf8Bytes(JSON.stringify(page));
    if (metadataBytes > FILE_CONVERTER_LIMITS.pageMetadataBytes) throw new Error('Queue page metadata exceeds its bounded size');
    await this.store.writePage({ id: page.id, items: page.items.map((item) => ({ ...item, state: 'queued', retryCount: 0, outcome: undefined })) });
    this.index.pageIds.push(page.id);
    await this.persistIndex();
  }

  async claimNext(): Promise<ConversionQueueItem[]> {
    if (this.index.state !== 'active') return [];
    const claimed: ConversionQueueItem[] = [];
    for (const id of this.index.pageIds) {
      if (claimed.length >= this.settings.concurrency) break;
      const page = await this.requiredPage(id);
      let changed = false;
      for (const item of page.items) {
        if (item.state !== 'queued' || claimed.length >= this.settings.concurrency) continue;
        if (this.index.inFlightBytes + item.sourceBytes > this.settings.maxInFlightBytes) continue;
        item.state = 'running';
        this.index.inFlightBytes += item.sourceBytes;
        claimed.push({ ...item });
        changed = true;
      }
      if (changed) await this.store.writePage(page);
    }
    if (claimed.length) await this.persistIndex();
    return claimed;
  }

  async complete(itemId: string, outcome = 'validated output'): Promise<void> { await this.settle(itemId, 'succeeded', outcome); }
  /**
   * Return a claimed item to the durable queue without consuming a retry.
   * This is used when a user pauses the queue after a worker has claimed an
   * item but before it begins touching the source file.
   */
  async defer(itemId: string, outcome = 'Deferred while the queue is paused'): Promise<void> {
    const found = await this.findItem(itemId);
    if (!found) throw new Error(`Unknown queue item: ${itemId}`);
    const { page, item } = found;
    if (item.state !== 'running') throw new Error(`Queue item ${itemId} is not running`);
    this.index.inFlightBytes = Math.max(0, this.index.inFlightBytes - item.sourceBytes);
    item.state = 'queued';
    item.outcome = boundedOutcome(outcome);
    await this.store.writePage(page);
    await this.persistIndex();
  }
  async fail(itemId: string, outcome: string, retryable = false): Promise<void> {
    const found = await this.findItem(itemId);
    if (!found) throw new Error(`Unknown queue item: ${itemId}`);
    const { page, item } = found;
    if (item.state !== 'running') throw new Error(`Queue item ${itemId} is not running`);
    this.index.inFlightBytes = Math.max(0, this.index.inFlightBytes - item.sourceBytes);
    if (retryable && item.retryCount < FILE_CONVERTER_LIMITS.maxRetryCount && this.index.state === 'active') { item.retryCount += 1; item.state = 'queued'; }
    else item.state = 'failed';
    item.outcome = boundedOutcome(outcome);
    await this.store.writePage(page);
    await this.persistIndex();
  }
  async cancel(itemId: string, outcome = 'Cancelled by user'): Promise<void> { await this.settle(itemId, 'cancelled', outcome); }
  async pause(): Promise<void> { if (this.index.state === 'active') { this.index.state = 'paused'; await this.persistIndex(); } }
  async resume(): Promise<void> { if (this.index.state === 'paused') { this.index.state = 'active'; await this.persistIndex(); } }
  async cancelAll(): Promise<void> { this.index.state = 'cancelled'; this.index.inFlightBytes = 0; await this.persistIndex(); }
  summary(): Readonly<ConversionQueueIndex> { return Object.freeze({ ...this.index, pageIds: [...this.index.pageIds] }); }

  private async settle(itemId: string, state: 'succeeded' | 'cancelled', outcome: string): Promise<void> {
    const found = await this.findItem(itemId);
    if (!found) throw new Error(`Unknown queue item: ${itemId}`);
    const { page, item } = found;
    if (item.state !== 'running' && item.state !== 'queued') throw new Error(`Queue item ${itemId} cannot transition from ${item.state}`);
    if (item.state === 'running') this.index.inFlightBytes = Math.max(0, this.index.inFlightBytes - item.sourceBytes);
    item.state = state; item.outcome = boundedOutcome(outcome);
    await this.store.writePage(page); await this.persistIndex();
  }
  private async findItem(itemId: string): Promise<{ page: ConversionQueuePage; item: ConversionQueueItem } | undefined> {
    for (const id of this.index.pageIds) { const page = await this.requiredPage(id); const item = page.items.find((candidate) => candidate.id === itemId); if (item) return { page, item }; }
    return undefined;
  }
  private async requiredPage(id: string): Promise<ConversionQueuePage> { const page = await this.store.readPage(id); if (!page) throw new Error(`Missing queue page: ${id}`); validateQueuePage(page); return page; }
  private async recoverRunningItems(): Promise<void> {
    let changed = false;
    for (const id of this.index.pageIds) {
      const page = await this.requiredPage(id); let pageChanged = false;
      for (const item of page.items) if (item.state === 'running') { item.state = this.index.state === 'cancelled' ? 'cancelled' : 'queued'; item.outcome = this.index.state === 'cancelled' ? 'Cancelled before restart recovery' : 'Recovered after interruption'; pageChanged = changed = true; }
      if (pageChanged) await this.store.writePage(page);
    }
    if (changed || this.index.inFlightBytes !== 0) { this.index.inFlightBytes = 0; await this.persistIndex(); }
  }
  private async persistIndex(): Promise<void> { await this.store.writeIndex({ ...this.index, pageIds: [...this.index.pageIds] }); }
}

function normalizeBackpressure(settings: Partial<QueueBackpressure>): QueueBackpressure {
  const concurrency = settings.concurrency ?? 2;
  const maxInFlightBytes = settings.maxInFlightBytes ?? 128 * 1024 * 1024;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > FILE_CONVERTER_LIMITS.maxConcurrency) throw new Error(`Queue concurrency must be 1 to ${FILE_CONVERTER_LIMITS.maxConcurrency}`);
  if (!Number.isSafeInteger(maxInFlightBytes) || maxInFlightBytes < 1 || maxInFlightBytes > FILE_CONVERTER_LIMITS.maxInFlightBytes) throw new Error('Queue maxInFlightBytes is outside the bounded range');
  return { concurrency, maxInFlightBytes };
}
function validateQueuePage(page: ConversionQueuePage): void {
  if (!/^[a-zA-Z0-9_-]{1,120}$/u.test(page.id) || !Array.isArray(page.items) || page.items.length < 1 || page.items.length > FILE_CONVERTER_LIMITS.pageItems) throw new Error(`Queue page must have 1 to ${FILE_CONVERTER_LIMITS.pageItems} items and a bounded id`);
  const ids = new Set<string>();
  for (const item of page.items) {
    if (!/^[a-zA-Z0-9_-]{1,120}$/u.test(item.id) || ids.has(item.id)) throw new Error('Queue item ids must be bounded and unique per page');
    ids.add(item.id);
    if (typeof item.sourcePath !== 'string' || utf8Bytes(item.sourcePath) === 0 || utf8Bytes(item.sourcePath) > FILE_CONVERTER_LIMITS.itemPathBytes || item.sourcePath.includes('\0')) throw new Error('Queue source path is invalid or exceeds its metadata bound');
    for (const value of [item.sourceBytes, item.estimatedOutputBytes]) if (!Number.isSafeInteger(value) || value < 0 || value > FILE_CONVERTER_LIMITS.maxItemBytes) throw new Error('Queue item byte estimate exceeds its bound');
    if (!/^[a-z0-9-]{3,80}$/u.test(item.adapterId) || !['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(item.state)) throw new Error('Queue item adapter or state is invalid');
    if (!Number.isSafeInteger(item.retryCount) || item.retryCount < 0 || item.retryCount > FILE_CONVERTER_LIMITS.maxRetryCount) throw new Error('Queue item retry count is invalid');
  }
}
function boundedOutcome(value: string): string { if (typeof value !== 'string') throw new Error('Queue outcome must be a string'); return value.slice(0, 1024); }
function utf8Bytes(value: string): number { return new TextEncoder().encode(value).byteLength; }
