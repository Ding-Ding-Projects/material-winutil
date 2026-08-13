import { createReadStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  FILE_CONVERTER_ADAPTERS,
  FILE_CONVERTER_LIMITS,
  PersistentConversionQueue,
  detectFileType,
  parseCsvUtf8,
  serializeCsvRowsAsJson,
  validateAdapterRegistry,
  type FileKind,
  type ConversionQueueIndex,
  type ConversionQueuePage,
  type ConversionQueueStore,
} from '../shared/file-converter';
import type {
  FileConverterQueueItemView, FileConverterSelectedSource, FileConverterSurfaceState,
} from '../shared/types';

const QUEUE_DIRECTORY = 'file-converter-queue-v1';
const OUTPUT_DIRECTORY = 'file-converter-output-v1';
const INDEX_FILE = 'index.json';
const SELECTED_SOURCES_FILE = 'selected-sources.json';
const OUTPUT_DESTINATION_FILE = 'output-destination.json';
const SOURCE_LIMIT = 512;
const RESERVE_BYTES = 256 * 1024 * 1024;

interface PersistedSelectedSource {
  id: string;
  name: string;
  sourcePath: string;
  bytes: number;
  kind: FileKind;
  confidence: FileConverterSelectedSource['confidence'];
  conflict: boolean;
  reason: string;
}

interface PersistedOutputDestination {
  schemaVersion: 1;
  directory: string;
}

async function atomicJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await fs.rename(temporary, filePath);
}

function validatePersistedSelectedSource(value: unknown): PersistedSelectedSource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Persisted source selection entry is invalid.');
  const entry = value as Record<string, unknown>;
  const expectedKeys = ['id', 'name', 'sourcePath', 'bytes', 'kind', 'confidence', 'conflict', 'reason'];
  if (Object.keys(entry).length !== expectedKeys.length || expectedKeys.some((key) => !(key in entry))) throw new Error('Persisted source selection entry has unexpected fields.');
  if (typeof entry.id !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/u.test(entry.id)) throw new Error('Persisted source id is invalid.');
  if (typeof entry.sourcePath !== 'string' || entry.sourcePath.length === 0 || entry.sourcePath.includes('\0') || !path.isAbsolute(entry.sourcePath) || Buffer.byteLength(entry.sourcePath, 'utf8') > FILE_CONVERTER_LIMITS.itemPathBytes) throw new Error('Persisted source path is invalid.');
  if (typeof entry.name !== 'string' || entry.name.length === 0 || entry.name.includes('\0') || entry.name !== path.basename(entry.name) || Buffer.byteLength(entry.name, 'utf8') > 512) throw new Error('Persisted source name is invalid.');
  const bytes = entry.bytes;
  if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 0 || bytes > FILE_CONVERTER_LIMITS.maxItemBytes) throw new Error('Persisted source size is invalid.');
  const fileKinds: readonly FileKind[] = ['pdf', 'png', 'jpeg', 'gif', 'webp', 'zip', 'seven-zip', 'wav', 'mp3', 'ogg', 'mp4', 'text', 'unknown'];
  if (typeof entry.kind !== 'string' || !fileKinds.includes(entry.kind as FileKind)) throw new Error('Persisted source type is invalid.');
  if (entry.confidence !== 'magic' && entry.confidence !== 'extension' && entry.confidence !== 'unknown') throw new Error('Persisted source confidence is invalid.');
  if (typeof entry.conflict !== 'boolean') throw new Error('Persisted source conflict state is invalid.');
  if (typeof entry.reason !== 'string' || Buffer.byteLength(entry.reason, 'utf8') > 2048) throw new Error('Persisted source reason is invalid.');
  return {
    id: entry.id, name: entry.name, sourcePath: entry.sourcePath, bytes,
    kind: entry.kind as FileKind, confidence: entry.confidence, conflict: entry.conflict, reason: entry.reason,
  };
}

function validatePersistedOutputDestination(value: unknown): PersistedOutputDestination {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Persisted output destination is invalid.');
  const entry = value as Record<string, unknown>;
  const expectedKeys = ['schemaVersion', 'directory'];
  if (Object.keys(entry).length !== expectedKeys.length || expectedKeys.some((key) => !(key in entry))) throw new Error('Persisted output destination has unexpected fields.');
  if (entry.schemaVersion !== 1) throw new Error('Persisted output destination schema is unsupported.');
  if (typeof entry.directory !== 'string' || entry.directory.length === 0 || entry.directory.includes('\0') || !path.isAbsolute(entry.directory) || Buffer.byteLength(entry.directory, 'utf8') > FILE_CONVERTER_LIMITS.itemPathBytes) {
    throw new Error('Persisted output directory is invalid.');
  }
  return { schemaVersion: 1, directory: entry.directory };
}

/** Write a completed temporary file, then publish it with a same-volume hard link.
 * The final path is never opened for writing and is refused if it already exists.
 */
async function atomicUtf8Output(filePath: string, contents: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, contents, { encoding: 'utf8', flag: 'wx' });
    await fs.link(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

function deterministicUtf8PlainText(bytes: Uint8Array): string {
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new Error('Source is not valid UTF-8 text. No output was written.');
  }
  if (source.codePointAt(0) === 0xfeff) source = source.slice(1);
  const normalized = source.replace(/\r\n?/gu, '\n');
  try {
    const parsed = JSON.parse(normalized) as unknown;
    return `${JSON.stringify(sortJsonValue(parsed), null, 2)}\n`;
  } catch (error) {
    if (error instanceof SyntaxError) return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
    throw error;
  }
}

/**
 * Canonical binary representation for the one bundled Binary Encodings
 * adapter.  Buffer's hex encoder is deterministic lowercase ASCII: exactly
 * two characters per source byte, with no MIME wrapping or guessed metadata.
 */
function canonicalLowercaseHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function isCanonicalLowercaseHex(bytes: Uint8Array, expectedBytes: number): boolean {
  if (bytes.byteLength !== expectedBytes * 2) return false;
  for (const byte of bytes) {
    const decimal = byte >= 0x30 && byte <= 0x39;
    const lowercase = byte >= 0x61 && byte <= 0x66;
    if (!decimal && !lowercase) return false;
  }
  return true;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort((left, right) => left < right ? -1 : left > right ? 1 : 0).map((key) => [key, sortJsonValue((value as Record<string, unknown>)[key])]));
}

function outputName(sourcePath: string, suffix = '.txt'): string {
  const sourceName = path.basename(sourcePath);
  if (!sourceName || sourceName === '.' || sourceName === '..' || sourceName.includes('\0')) throw new Error('Source filename cannot produce a safe output filename.');
  return `${sourceName}${suffix}`;
}

class JsonQueueStore implements ConversionQueueStore {
  constructor(readonly directory: string) {}
  private indexPath(): string { return path.join(this.directory, INDEX_FILE); }
  private pagePath(id: string): string { return path.join(this.directory, `page-${id}.json`); }
  private selectedSourcesPath(): string { return path.join(this.directory, SELECTED_SOURCES_FILE); }
  private outputDestinationPath(): string { return path.join(this.directory, OUTPUT_DESTINATION_FILE); }

  async readIndex(): Promise<ConversionQueueIndex | undefined> {
    try { return JSON.parse(await fs.readFile(this.indexPath(), 'utf8')) as ConversionQueueIndex; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  }
  async writeIndex(index: ConversionQueueIndex): Promise<void> { await atomicJson(this.indexPath(), index); }
  async readPage(id: string): Promise<ConversionQueuePage | undefined> {
    try { return JSON.parse(await fs.readFile(this.pagePath(id), 'utf8')) as ConversionQueuePage; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  }
  async writePage(page: ConversionQueuePage): Promise<void> { await atomicJson(this.pagePath(page.id), page); }
  async readSelectedSources(): Promise<PersistedSelectedSource[] | undefined> {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(this.selectedSourcesPath(), 'utf8'));
      if (!Array.isArray(parsed) || parsed.length > SOURCE_LIMIT) throw new Error('Persisted source selection is invalid.');
      return parsed.map((entry) => validatePersistedSelectedSource(entry));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
  async writeSelectedSources(sources: readonly PersistedSelectedSource[]): Promise<void> {
    if (sources.length > SOURCE_LIMIT) throw new Error('Persisted source selection exceeds its bounded item limit.');
    const normalized = sources.map((entry) => validatePersistedSelectedSource(entry));
    await atomicJson(this.selectedSourcesPath(), normalized);
  }
  async clearSelectedSources(): Promise<void> { await fs.rm(this.selectedSourcesPath(), { force: true }); }
  async readOutputDestination(): Promise<PersistedOutputDestination | undefined> {
    try { return validatePersistedOutputDestination(JSON.parse(await fs.readFile(this.outputDestinationPath(), 'utf8')) as unknown); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  }
  async writeOutputDestination(destination: PersistedOutputDestination): Promise<void> {
    await atomicJson(this.outputDestinationPath(), validatePersistedOutputDestination(destination));
  }
  async clearOutputDestination(): Promise<void> { await fs.rm(this.outputDestinationPath(), { force: true }); }
  async pageViews(pageIds: readonly string[]): Promise<FileConverterQueueItemView[]> {
    const output: FileConverterQueueItemView[] = [];
    for (const pageId of pageIds) {
      const page = await this.readPage(pageId);
      if (!page) continue;
      for (const item of page.items) output.push({
        id: item.id, sourceName: path.basename(item.sourcePath), sourceBytes: item.sourceBytes,
        estimatedOutputBytes: item.estimatedOutputBytes, adapterId: item.adapterId,
        state: item.state, retryCount: item.retryCount, outcome: item.outcome,
        outputPath: item.state === 'succeeded' ? item.outputPath : undefined,
      });
    }
    return output;
  }
  async reset(): Promise<void> {
    await fs.rm(this.directory, { recursive: true, force: true });
    await fs.mkdir(this.directory, { recursive: true });
  }
}

async function boundedPrefix(filePath: string): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let total = 0;
  const stream = createReadStream(filePath, { start: 0, end: FILE_CONVERTER_LIMITS.signatureBytes - 1 });
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk as Uint8Array);
    chunks.push(bytes); total += bytes.byteLength;
    if (total >= FILE_CONVERTER_LIMITS.signatureBytes) break;
  }
  return new Uint8Array(Buffer.concat(chunks, Math.min(total, FILE_CONVERTER_LIMITS.signatureBytes)));
}

export class FileConverterService {
  private readonly store: JsonQueueStore;
  private queue!: PersistentConversionQueue;
  private selected: FileConverterSelectedSource[] = [];
  private selectedPaths = new Map<string, string>();
  private outputDestination?: string;
  private lastMessage = 'No source files selected. The source stays unchanged.';
  private queueRun?: Promise<void>;

  private constructor(private readonly appDataDirectory: string) {
    this.store = new JsonQueueStore(path.join(appDataDirectory, QUEUE_DIRECTORY));
  }

  private fallbackOutputDirectory(): string { return path.join(this.appDataDirectory, OUTPUT_DIRECTORY); }

  private async rejectLinkedPathComponents(resolved: string): Promise<void> {
    const parsed = path.parse(resolved);
    let current = parsed.root;
    for (const segment of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      const component = await fs.lstat(current);
      if (component.isSymbolicLink()) throw new Error('The output folder cannot be inside a symbolic link or reparse point.');
    }
  }

  private async validateOutputDirectory(candidate: string): Promise<string> {
    if (typeof candidate !== 'string' || candidate.length === 0 || candidate.includes('\0') || !path.isAbsolute(candidate) || Buffer.byteLength(candidate, 'utf8') > FILE_CONVERTER_LIMITS.itemPathBytes) {
      throw new Error('The output folder is invalid or not absolute.');
    }
    const resolved = path.resolve(candidate);
    await this.rejectLinkedPathComponents(resolved);
    const directory = await fs.lstat(resolved);
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('The output folder must be an existing non-link local directory.');
    return resolved;
  }

  private async activeOutputDirectory(): Promise<{ directory: string; mode: 'user-selected' | 'application-data-fallback' }> {
    if (this.outputDestination) return { directory: await this.validateOutputDirectory(this.outputDestination), mode: 'user-selected' };
    const fallback = this.fallbackOutputDirectory();
    await fs.mkdir(fallback, { recursive: true });
    return { directory: await this.validateOutputDirectory(fallback), mode: 'application-data-fallback' };
  }

  static async open(appDataDirectory: string): Promise<FileConverterService> {
    validateAdapterRegistry();
    const service = new FileConverterService(appDataDirectory);
    await fs.mkdir(service.store.directory, { recursive: true });
    service.queue = await PersistentConversionQueue.open(service.store);
    await service.store.writeIndex(service.queue.summary() as ConversionQueueIndex);
    await service.restoreSelectedSources();
    await service.restoreOutputDestination();
    await service.recoverPersistedQueueState();
    return service;
  }

  async pickLocalFiles(filePaths: readonly string[]): Promise<FileConverterSurfaceState> {
    if (filePaths.length > SOURCE_LIMIT) throw new Error(`Choose at most ${SOURCE_LIMIT} files at once.`);
    const selected: FileConverterSelectedSource[] = [];
    const paths = new Map<string, string>();
    for (const candidate of filePaths) {
      const id = randomUUID();
      const inspected = await this.inspectSource(candidate, id);
      selected.push(inspected.selected);
      paths.set(id, inspected.sourcePath);
    }
    this.selected = selected;
    this.selectedPaths = paths;
    await this.persistSelectedSources();
    this.lastMessage = selected.length
      ? `${selected.length} local source file(s) inspected from at most ${FILE_CONVERTER_LIMITS.signatureBytes} bytes each.`
      : 'No source files selected. The source stays unchanged.';
    return this.snapshot();
  }

  async clearSelection(): Promise<FileConverterSurfaceState> {
    this.selected = []; this.selectedPaths.clear();
    await this.store.clearSelectedSources();
    this.lastMessage = 'Source selection cleared from local recovery storage; no file was changed.';
    return this.snapshot();
  }

  async setOutputDestination(directory: string): Promise<FileConverterSurfaceState> {
    const validated = await this.validateOutputDirectory(directory);
    this.outputDestination = validated;
    await this.store.writeOutputDestination({ schemaVersion: 1, directory: validated });
    this.lastMessage = 'The selected output folder was validated and will be rechecked before every output is written.';
    return this.snapshot();
  }

  async clearOutputDestination(): Promise<FileConverterSurfaceState> {
    this.outputDestination = undefined;
    await this.store.clearOutputDestination();
    this.lastMessage = 'The selected output folder was cleared. Future outputs use the explicit application-data fallback until another folder is chosen.';
    return this.snapshot();
  }

  async pause(): Promise<FileConverterSurfaceState> { await this.queue.pause(); this.lastMessage = 'The persistent conversion queue is paused.'; return this.snapshot(); }
  async resume(): Promise<FileConverterSurfaceState> {
    await this.queue.resume();
    await this.runQueue();
    this.lastMessage = 'The persistent conversion queue resumed its saved local work.';
    return this.snapshot();
  }
  async cancelAll(): Promise<FileConverterSurfaceState> {
    const items = await this.store.pageViews(this.queue.summary().pageIds);
    for (const item of items) {
      if (item.state === 'queued' || item.state === 'running') await this.queue.cancel(item.id, 'Cancelled by user; source file unchanged');
    }
    await this.queue.cancelAll();
    this.lastMessage = 'Queued work was cancelled; source files were not changed.';
    return this.snapshot();
  }
  async retryFailed(): Promise<FileConverterSurfaceState> {
    const retried = await this.queue.retryFailed();
    if (!retried) {
      this.lastMessage = 'No retryable persisted failures are available; terminal outcomes remain unchanged.';
      return this.snapshot();
    }
    this.lastMessage = `${retried} persisted failed conversion(s) were queued for one bounded retry; source files remain unchanged until each validated write completes.`;
    await this.runQueue();
    return this.snapshot();
  }
  async resetQueue(): Promise<FileConverterSurfaceState> {
    await this.store.reset();
    this.queue = await PersistentConversionQueue.open(this.store);
    await this.store.writeIndex(this.queue.summary() as ConversionQueueIndex);
    this.selected = [];
    this.selectedPaths.clear();
    if (this.outputDestination) await this.store.writeOutputDestination({ schemaVersion: 1, directory: this.outputDestination });
    this.lastMessage = 'A new empty persistent queue is ready; saved source selection metadata was cleared.';
    return this.snapshot();
  }

  async enqueue(adapterId: string): Promise<FileConverterSurfaceState> {
    const adapter = this.executableAdapter(adapterId);
    await this.revalidateSelectedSources();
    if (!this.selected.length) throw new Error('Choose at least one local source file before queueing.');
    const incompatible = this.selected.find((source) => !this.isSelectedSourceCompatible(adapter.id, source.kind, source.conflict, source.bytes, source.name));
    if (incompatible) throw new Error(this.compatibilityFailure(adapter.id));
    const estimatedOutputBytes = (source: FileConverterSelectedSource): number => adapter.id === 'csv-to-json'
      ? Math.min(adapter.limits.outputBytes, source.bytes * 6 + 2)
      : adapter.id === 'binary-to-lowercase-hex'
        ? source.bytes * 2
      : source.bytes;
    const requiredBytes = this.selected.reduce((total, source) => total + estimatedOutputBytes(source), 0);
    const output = await this.activeOutputDirectory();
    const disk = await fs.statfs(output.directory);
    const availableBytes = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, disk.bavail * disk.bsize));
    if (availableBytes < requiredBytes + RESERVE_BYTES) throw new Error('The controlled local output location does not have enough free storage for this batch and its safety reserve.');

    for (let offset = 0; offset < this.selected.length; offset += FILE_CONVERTER_LIMITS.pageItems) {
      const entries = this.selected.slice(offset, offset + FILE_CONVERTER_LIMITS.pageItems);
      await this.queue.enqueuePage({
        id: randomUUID(),
        items: entries.map((source) => ({
          id: source.id, sourcePath: this.requiredSelectedPath(source.id), sourceBytes: source.bytes,
          estimatedOutputBytes: estimatedOutputBytes(source), adapterId, state: 'queued' as const, retryCount: 0,
        })),
      }, { availableBytes, requiredBytes, reserveBytes: RESERVE_BYTES });
    }
    if (this.queue.summary().state !== 'active') {
      this.lastMessage = 'The local conversion work was queued but remains paused until the queue is resumed; source files were unchanged.';
      return this.snapshot();
    }
    await this.runQueue();
    this.lastMessage = adapter.id === 'csv-to-json'
      ? 'The local CSV-to-JSON queue completed with validated atomic outputs; source files were unchanged.'
      : adapter.id === 'binary-to-lowercase-hex'
        ? 'The local binary-to-lowercase-hex queue completed with validated atomic outputs; source files were unchanged.'
        : 'The local text/JSON queue completed with validated atomic outputs; source files were unchanged.';
    return this.snapshot();
  }

  private requiredSelectedPath(id: string): string {
    const sourcePath = this.selectedPaths.get(id);
    if (!sourcePath) throw new Error('Selected source metadata no longer has a local path.');
    return sourcePath;
  }

  private async inspectSource(candidate: string, id: string): Promise<{ selected: FileConverterSelectedSource; sourcePath: string }> {
    if (typeof candidate !== 'string' || candidate.length === 0 || candidate.includes('\0') || !path.isAbsolute(candidate)) {
      throw new Error('The local source path is invalid or not absolute.');
    }
    const resolved = path.resolve(candidate);
    const linkInfo = await fs.lstat(resolved);
    if (!linkInfo.isFile() || linkInfo.isSymbolicLink() || !Number.isSafeInteger(linkInfo.size) || linkInfo.size < 0 || linkInfo.size > FILE_CONVERTER_LIMITS.maxItemBytes) {
      throw new Error('The selected source is not a bounded non-link regular file.');
    }
    const detection = detectFileType(await boundedPrefix(resolved), path.basename(resolved));
    return {
      sourcePath: resolved,
      selected: {
        id, name: path.basename(resolved), bytes: linkInfo.size, kind: detection.kind,
        confidence: detection.confidence, conflict: detection.conflict, reason: detection.reason,
      },
    };
  }

  private async persistSelectedSources(): Promise<void> {
    await this.store.writeSelectedSources(this.selected.map((selected) => ({
      ...selected,
      sourcePath: this.requiredSelectedPath(selected.id),
    })));
  }

  private async restoreSelectedSources(): Promise<void> {
    let persisted: PersistedSelectedSource[] | undefined;
    try { persisted = await this.store.readSelectedSources(); }
    catch {
      await this.store.clearSelectedSources();
      this.lastMessage = 'Saved source selection metadata was invalid and was cleared safely; choose local files again.';
      return;
    }
    if (!persisted?.length) return;
    const selected: FileConverterSelectedSource[] = [];
    const paths = new Map<string, string>();
    let unavailable = 0;
    for (const source of persisted) {
      try {
        const inspected = await this.inspectSource(source.sourcePath, source.id);
        if (inspected.selected.name !== source.name || inspected.selected.bytes !== source.bytes || inspected.selected.kind !== source.kind || inspected.selected.conflict !== source.conflict) {
          unavailable += 1;
          continue;
        }
        selected.push(inspected.selected);
        paths.set(source.id, inspected.sourcePath);
      } catch { unavailable += 1; }
    }
    this.selected = selected;
    this.selectedPaths = paths;
    await this.persistSelectedSources();
    this.lastMessage = unavailable
      ? `Recovered ${selected.length} local source file(s); ${unavailable} saved source file(s) are missing or changed and require selection again.`
      : `Recovered ${selected.length} validated local source file(s) for resumable conversion.`;
  }

  private async restoreOutputDestination(): Promise<void> {
    let persisted: PersistedOutputDestination | undefined;
    try { persisted = await this.store.readOutputDestination(); }
    catch {
      await this.store.clearOutputDestination();
      this.lastMessage = 'Saved output destination metadata was invalid and was cleared safely; choose an existing local folder again.';
      return;
    }
    if (!persisted) return;
    try {
      this.outputDestination = await this.validateOutputDirectory(persisted.directory);
    } catch {
      await this.store.clearOutputDestination();
      this.outputDestination = undefined;
      this.lastMessage = 'Saved output folder is unavailable or unsafe and was cleared; the explicit application-data fallback remains available.';
    }
  }

  private async revalidateSelectedSources(): Promise<void> {
    if (!this.selected.length) return;
    const selected: FileConverterSelectedSource[] = [];
    const paths = new Map<string, string>();
    let unavailable = 0;
    for (const source of this.selected) {
      const selectedPath = this.selectedPaths.get(source.id);
      if (!selectedPath) { unavailable += 1; continue; }
      try {
        const inspected = await this.inspectSource(selectedPath, source.id);
        if (inspected.selected.name !== source.name || inspected.selected.bytes !== source.bytes || inspected.selected.kind !== source.kind || inspected.selected.conflict !== source.conflict) {
          unavailable += 1;
          continue;
        }
        selected.push(inspected.selected);
        paths.set(source.id, inspected.sourcePath);
      } catch { unavailable += 1; }
    }
    this.selected = selected;
    this.selectedPaths = paths;
    await this.persistSelectedSources();
    if (unavailable) this.lastMessage = `${unavailable} selected source file(s) are missing or changed and were removed before queueing; no fabricated conversion was created.`;
  }

  private executableAdapter(adapterId: string): (typeof FILE_CONVERTER_ADAPTERS)[number] {
    const adapter = FILE_CONVERTER_ADAPTERS.find((entry) => entry.id === adapterId);
    if (!adapter) throw new Error('The requested converter adapter is unknown.');
    if (adapter.availability !== 'available' || adapter.bundledProof?.bundled !== true) {
      throw new Error(adapter.unavailableReason ?? 'The converter adapter has no packaged bundled proof.');
    }
    if (adapter.id !== 'text-json-normalize' && adapter.id !== 'csv-to-json' && adapter.id !== 'binary-to-lowercase-hex') {
      throw new Error('This bundled adapter has no executable implementation in this build.');
    }
    return adapter;
  }

  private async runQueue(): Promise<void> {
    if (this.queueRun) return this.queueRun;
    const running = this.runQueuedItems();
    this.queueRun = running;
    try { await running; }
    finally { if (this.queueRun === running) this.queueRun = undefined; }
  }

  private async runQueuedItems(): Promise<void> {
    let claimed: Awaited<ReturnType<PersistentConversionQueue['claimNext']>>;
    while ((claimed = await this.queue.claimNext()).length > 0) {
      for (const item of claimed) {
        const queueState = this.queue.summary().state;
        if (queueState === 'paused') {
          await this.queue.defer(item.id, 'Deferred while the queue is paused; source file unchanged.');
          continue;
        }
        if (queueState === 'cancelled') {
          await this.queue.cancel(item.id, 'Cancelled before conversion began; source file unchanged.');
          continue;
        }
        await this.processQueueItem(item);
      }
    }
  }

  private async processQueueItem(item: Awaited<ReturnType<PersistentConversionQueue['claimNext']>>[number]): Promise<void> {
    try {
      const adapter = this.executableAdapter(item.adapterId);
      if (!path.isAbsolute(item.sourcePath) || item.sourcePath.includes('\0')) {
        throw new Error('Persisted conversion source path is not an absolute local path.');
      }
      const sourceInfo = await fs.lstat(item.sourcePath);
      if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink() || !Number.isSafeInteger(sourceInfo.size) || sourceInfo.size !== item.sourceBytes || sourceInfo.size > adapter.limits.inputBytes) {
        throw new Error('Source changed after preflight or exceeds the adapter limit.');
      }
      const detection = detectFileType(await boundedPrefix(item.sourcePath), path.basename(item.sourcePath));
      if (!this.isSelectedSourceCompatible(adapter.id, detection.kind, detection.conflict, item.sourceBytes, path.basename(item.sourcePath))) {
        throw new Error('Persisted source is not compatible with its original bundled adapter.');
      }
      const beforeRead = await fs.lstat(item.sourcePath);
      if (!beforeRead.isFile() || beforeRead.isSymbolicLink() || beforeRead.size !== item.sourceBytes) {
        throw new Error('Source changed before read; no output was written.');
      }
      const sourceBytes = await fs.readFile(item.sourcePath);
      if (sourceBytes.byteLength !== item.sourceBytes || sourceBytes.byteLength > adapter.limits.inputBytes) {
        throw new Error('Source changed while it was being read; no output was written.');
      }
      const content = adapter.id === 'csv-to-json'
        ? serializeCsvRowsAsJson(parseCsvUtf8(sourceBytes, { inputBytes: adapter.limits.inputBytes }))
        : adapter.id === 'binary-to-lowercase-hex'
          ? canonicalLowercaseHex(sourceBytes)
          : deterministicUtf8PlainText(sourceBytes);
      const outputBytes = Buffer.byteLength(content, adapter.id === 'binary-to-lowercase-hex' ? 'ascii' : 'utf8');
      if (outputBytes > adapter.limits.outputBytes) throw new Error('Deterministic output exceeds the adapter limit.');
      const output = await this.activeOutputDirectory();
      const outputRoot = output.directory;
      const destination = path.resolve(outputRoot, outputName(item.sourcePath, adapter.id === 'csv-to-json' ? '.json' : adapter.id === 'binary-to-lowercase-hex' ? '.hex' : '.txt'));
      if (path.relative(outputRoot, destination).startsWith('..') || path.isAbsolute(path.relative(outputRoot, destination))) {
        throw new Error('Controlled output path escaped its application-data directory.');
      }
      await this.validateOutputDirectory(outputRoot);
      await atomicUtf8Output(destination, content);
      const reopenedBytes = await fs.readFile(destination);
      if (!Buffer.from(reopenedBytes).equals(Buffer.from(content, adapter.id === 'binary-to-lowercase-hex' ? 'ascii' : 'utf8'))) throw new Error('Output validation failed after atomic publication.');
      if (adapter.id === 'csv-to-json') {
        const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(reopenedBytes));
        if (!Array.isArray(parsed)) throw new Error('CSV JSON output is not a JSON table after reopening.');
      }
      if (adapter.id === 'binary-to-lowercase-hex' && !isCanonicalLowercaseHex(reopenedBytes, sourceBytes.byteLength)) {
        throw new Error('Binary hexadecimal output failed canonical lowercase reopen validation.');
      }
      if (adapter.id === 'binary-to-lowercase-hex' && !Buffer.from(reopenedBytes.toString('ascii'), 'hex').equals(sourceBytes)) {
        throw new Error('Binary hexadecimal output failed decoded-byte reopen validation.');
      }
      const destinationLabel = output.mode === 'user-selected' ? 'the selected local output folder' : 'the explicit application-data fallback output folder';
      await this.queue.complete(item.id, adapter.id === 'csv-to-json'
        ? `Converted CSV to validated deterministic JSON in ${destinationLabel}.`
        : adapter.id === 'binary-to-lowercase-hex'
          ? `Converted binary bytes to validated canonical lowercase hexadecimal in ${destinationLabel}.`
          : `Converted to validated UTF-8 plain text in ${destinationLabel}.`, destination);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Local conversion failed safely.';
      await this.queue.fail(item.id, message);
    }
  }

  private isSelectedSourceCompatible(adapterId: string, kind: FileKind, conflict: boolean, bytes: number, sourceName: string): boolean {
    const adapter = this.executableAdapter(adapterId);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > adapter.limits.inputBytes || !adapter.sourceKinds.includes(kind)) return false;
    if (adapterId === 'binary-to-lowercase-hex') return true;
    if (conflict || kind !== 'text') return false;
    return adapterId !== 'csv-to-json' || path.extname(sourceName).toLocaleLowerCase('en-US') === '.csv';
  }

  private compatibilityFailure(adapterId: string): string {
    if (adapterId === 'csv-to-json') return 'CSV-to-JSON accepts only bounded, conflict-free local .csv UTF-8 sources; malformed CSV is refused during full parsing.';
    if (adapterId === 'binary-to-lowercase-hex') return 'Binary-to-lowercase-hex accepts any bounded regular local file within its explicit byte limit; ambiguous polyglot signatures are refused during inspection.';
    return 'The selected batch contains a source that is not a bounded, conflict-free text file for this adapter.';
  }

  /** Reconcile persisted terminal records with the local filesystem at open.
   * A missing or unsafe completed output never becomes a success merely
   * because its old metadata says it once completed.
   */
  private async recoverPersistedQueueState(): Promise<void> {
    const index = this.queue.summary();
    const items = await this.store.pageViews(index.pageIds);
    let missingOutputs = 0;
    for (const item of items) {
      if (item.state !== 'succeeded' || !item.outputPath) continue;
      try {
        await this.validateOutputDirectory(path.dirname(item.outputPath));
        const outputInfo = await fs.lstat(item.outputPath);
        if (!outputInfo.isFile() || outputInfo.isSymbolicLink() || outputInfo.size > item.estimatedOutputBytes) throw new Error('output path is unavailable');
      } catch {
        missingOutputs += 1;
        await this.queue.invalidateCompleted(item.id, 'Previously completed output is no longer available at its validated local path; no completion is claimed after recovery.');
      }
    }
    if (missingOutputs) {
      this.lastMessage = `${missingOutputs} persisted completed output record(s) no longer resolve to safe local files and were changed to failed recovery results; no completion is claimed.`;
    }
  }

  async snapshot(): Promise<FileConverterSurfaceState> {
    const index = this.queue.summary();
    const items = await this.store.pageViews(index.pageIds);
    for (const item of items) {
      if (item.state !== 'succeeded' || !item.outputPath) continue;
      try {
        await this.validateOutputDirectory(path.dirname(item.outputPath));
        const outputInfo = await fs.lstat(item.outputPath);
        if (!outputInfo.isFile() || outputInfo.isSymbolicLink() || outputInfo.size < 0) item.outputPath = undefined;
      } catch {
        item.outputPath = undefined;
      }
    }
    const counts = { queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0 };
    for (const item of items) counts[item.state] = (counts[item.state] ?? 0) + 1;
    const requiredBytes = this.selected.reduce((total, item) => total + item.bytes, 0);
    let availableBytes = 0;
    let outputDestination: FileConverterSurfaceState['outputDestination'];
    try {
      const output = await this.activeOutputDirectory();
      const disk = await fs.statfs(output.directory);
      availableBytes = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, disk.bavail * disk.bsize));
      outputDestination = { mode: output.mode, directory: output.directory, validation: 'ready' };
    } catch {
      outputDestination = { mode: this.outputDestination ? 'user-selected' : 'application-data-fallback', directory: this.outputDestination ?? this.fallbackOutputDirectory(), validation: 'unavailable' };
    }
    const preflight = availableBytes > 0 && availableBytes >= requiredBytes + RESERVE_BYTES ? 'ready' : availableBytes > 0 ? 'insufficient' : 'unavailable';
    return {
      schemaVersion: 1,
      catalog: FILE_CONVERTER_ADAPTERS.map((entry) => ({ ...entry, sourceKinds: [...entry.sourceKinds], limits: { ...entry.limits }, bundledProof: entry.bundledProof ? { ...entry.bundledProof } : undefined })),
      selected: this.selected.map((entry) => ({ ...entry })),
      queue: { state: index.state, pageCount: index.pageIds.length, inFlightBytes: index.inFlightBytes, counts, items },
      storage: { availableBytes, requiredBytes, reserveBytes: RESERVE_BYTES, status: preflight },
      outputDestination,
      limits: { signatureBytes: FILE_CONVERTER_LIMITS.signatureBytes, pageItems: FILE_CONVERTER_LIMITS.pageItems, maxConcurrency: FILE_CONVERTER_LIMITS.maxConcurrency },
      lastMessage: this.lastMessage,
    };
  }
}
