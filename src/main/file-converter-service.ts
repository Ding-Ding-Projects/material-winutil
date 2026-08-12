import { createReadStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  FILE_CONVERTER_ADAPTERS,
  FILE_CONVERTER_LIMITS,
  PersistentConversionQueue,
  detectFileType,
  validateAdapterRegistry,
  type ConversionQueueIndex,
  type ConversionQueuePage,
  type ConversionQueueStore,
} from '../shared/file-converter';
import type {
  FileConverterQueueItemView, FileConverterSelectedSource, FileConverterSurfaceState,
} from '../shared/types';

const QUEUE_DIRECTORY = 'file-converter-queue-v1';
const INDEX_FILE = 'index.json';
const SOURCE_LIMIT = 512;
const RESERVE_BYTES = 256 * 1024 * 1024;

async function atomicJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await fs.rename(temporary, filePath);
}

class JsonQueueStore implements ConversionQueueStore {
  constructor(readonly directory: string) {}
  private indexPath(): string { return path.join(this.directory, INDEX_FILE); }
  private pagePath(id: string): string { return path.join(this.directory, `page-${id}.json`); }

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
  async pageViews(pageIds: readonly string[]): Promise<FileConverterQueueItemView[]> {
    const output: FileConverterQueueItemView[] = [];
    for (const pageId of pageIds) {
      const page = await this.readPage(pageId);
      if (!page) continue;
      for (const item of page.items) output.push({
        id: item.id, sourceName: path.basename(item.sourcePath), sourceBytes: item.sourceBytes,
        estimatedOutputBytes: item.estimatedOutputBytes, adapterId: item.adapterId,
        state: item.state, retryCount: item.retryCount, outcome: item.outcome,
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
  private lastMessage = 'No source files selected. The source stays unchanged.';

  private constructor(private readonly appDataDirectory: string) {
    this.store = new JsonQueueStore(path.join(appDataDirectory, QUEUE_DIRECTORY));
  }

  static async open(appDataDirectory: string): Promise<FileConverterService> {
    validateAdapterRegistry();
    const service = new FileConverterService(appDataDirectory);
    await fs.mkdir(service.store.directory, { recursive: true });
    service.queue = await PersistentConversionQueue.open(service.store);
    await service.store.writeIndex(service.queue.summary() as ConversionQueueIndex);
    return service;
  }

  async pickLocalFiles(filePaths: readonly string[]): Promise<FileConverterSurfaceState> {
    if (filePaths.length > SOURCE_LIMIT) throw new Error(`Choose at most ${SOURCE_LIMIT} files at once.`);
    const selected: FileConverterSelectedSource[] = [];
    const paths = new Map<string, string>();
    for (const candidate of filePaths) {
      if (typeof candidate !== 'string' || candidate.length === 0 || candidate.includes('\0') || !path.isAbsolute(candidate)) {
        throw new Error('The native file picker returned an invalid local path.');
      }
      const info = await fs.stat(candidate);
      if (!info.isFile() || !Number.isSafeInteger(info.size) || info.size < 0 || info.size > FILE_CONVERTER_LIMITS.maxItemBytes) {
        throw new Error('The selected source is not a bounded regular file.');
      }
      const id = randomUUID();
      const detection = detectFileType(await boundedPrefix(candidate), path.basename(candidate));
      selected.push({
        id, name: path.basename(candidate), bytes: info.size, kind: detection.kind,
        confidence: detection.confidence, conflict: detection.conflict, reason: detection.reason,
      });
      paths.set(id, candidate);
    }
    this.selected = selected;
    this.selectedPaths = paths;
    this.lastMessage = selected.length
      ? `${selected.length} local source file(s) inspected from at most ${FILE_CONVERTER_LIMITS.signatureBytes} bytes each.`
      : 'No source files selected. The source stays unchanged.';
    return this.snapshot();
  }

  clearSelection(): Promise<FileConverterSurfaceState> {
    this.selected = []; this.selectedPaths.clear(); this.lastMessage = 'Source selection cleared; no file was changed.';
    return this.snapshot();
  }

  async pause(): Promise<FileConverterSurfaceState> { await this.queue.pause(); this.lastMessage = 'The persistent conversion queue is paused.'; return this.snapshot(); }
  async resume(): Promise<FileConverterSurfaceState> { await this.queue.resume(); this.lastMessage = 'The persistent conversion queue is active.'; return this.snapshot(); }
  async cancelAll(): Promise<FileConverterSurfaceState> {
    const items = await this.store.pageViews(this.queue.summary().pageIds);
    for (const item of items) {
      if (item.state === 'queued' || item.state === 'running') await this.queue.cancel(item.id, 'Cancelled by user; source file unchanged');
    }
    await this.queue.cancelAll();
    this.lastMessage = 'Queued work was cancelled; source files were not changed.';
    return this.snapshot();
  }
  async resetQueue(): Promise<FileConverterSurfaceState> {
    await this.store.reset();
    this.queue = await PersistentConversionQueue.open(this.store);
    await this.store.writeIndex(this.queue.summary() as ConversionQueueIndex);
    this.lastMessage = 'A new empty persistent queue is ready.';
    return this.snapshot();
  }

  async enqueue(adapterId: string): Promise<FileConverterSurfaceState> {
    const adapter = FILE_CONVERTER_ADAPTERS.find((entry) => entry.id === adapterId);
    if (!adapter) throw new Error('The requested converter adapter is unknown.');
    if (adapter.availability !== 'available' || adapter.bundledProof?.bundled !== true) {
      throw new Error(adapter.unavailableReason ?? 'The converter adapter has no packaged bundled proof.');
    }
    if (!this.selected.length) throw new Error('Choose at least one local source file before queueing.');
    throw new Error('No executable converter adapter is bundled in this build.');
  }

  async snapshot(): Promise<FileConverterSurfaceState> {
    const index = this.queue.summary();
    const items = await this.store.pageViews(index.pageIds);
    const counts = { queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0 };
    for (const item of items) counts[item.state] = (counts[item.state] ?? 0) + 1;
    const requiredBytes = this.selected.reduce((total, item) => total + item.bytes, 0);
    let availableBytes = 0;
    try {
      const disk = await fs.statfs(this.appDataDirectory);
      availableBytes = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, disk.bavail * disk.bsize));
    } catch { /* a visible unavailable preflight is safer than a guessed capacity */ }
    const preflight = availableBytes > 0 && availableBytes >= requiredBytes + RESERVE_BYTES ? 'ready' : availableBytes > 0 ? 'insufficient' : 'unavailable';
    return {
      schemaVersion: 1,
      catalog: FILE_CONVERTER_ADAPTERS.map((entry) => ({ ...entry, sourceKinds: [...entry.sourceKinds], limits: { ...entry.limits }, bundledProof: entry.bundledProof ? { ...entry.bundledProof } : undefined })),
      selected: this.selected.map((entry) => ({ ...entry })),
      queue: { state: index.state, pageCount: index.pageIds.length, inFlightBytes: index.inFlightBytes, counts, items },
      storage: { availableBytes, requiredBytes, reserveBytes: RESERVE_BYTES, status: preflight },
      limits: { signatureBytes: FILE_CONVERTER_LIMITS.signatureBytes, pageItems: FILE_CONVERTER_LIMITS.pageItems, maxConcurrency: FILE_CONVERTER_LIMITS.maxConcurrency },
      lastMessage: this.lastMessage,
    };
  }
}
