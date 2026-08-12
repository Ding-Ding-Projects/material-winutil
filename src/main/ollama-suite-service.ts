import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  OLLAMA_DOCUMENTED_ROUTES, OLLAMA_LIMITS, OLLAMA_LOCAL_ORIGIN,
  parseOllamaInstalled, parseOllamaRunning, parseOllamaVersion, redactChatExport,
  validateCatalogPage, validateChatRequest, validateOfficialCatalogUrl, validateOllamaLocalUrl, validateOllamaModelName,
  type OllamaCatalogPage, type OllamaCatalogSnapshot, type OllamaCatalogVariant, type OllamaChatRequest,
  type OllamaHealthSnapshot, type OllamaPullProgress,
} from '../shared/ollama-suite';

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
type CatalogFetcher = (url: string, signal: AbortSignal) => Promise<unknown>;

export interface OllamaSuiteServiceDependencies {
  userDataDirectory: string;
  fetchLocal?: FetchLike;
  fetchCatalogPage?: CatalogFetcher;
  now?: () => Date;
  onPullProgress?: (progress: OllamaPullProgress) => void;
  requestTimeoutMs?: number;
  catalogPageTimeoutMs?: number;
  catalogRefreshTimeoutMs?: number;
  streamIdleTimeoutMs?: number;
  pullTimeoutMs?: number;
  chatTimeoutMs?: number;
}

interface PersistedPullState { schemaVersion: 1; items: OllamaPullProgress[]; }

function errorText(error: unknown): string { return error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500); }

class UserCancelledError extends Error {
  constructor(message: string) { super(message); this.name = 'AbortError'; }
}

const DEFAULT_TIMEOUTS = Object.freeze({
  request: 15_000,
  catalogPage: 20_000,
  catalogRefresh: 120_000,
  streamIdle: 120_000,
  pull: 6 * 60 * 60 * 1000,
  chat: 15 * 60 * 1000,
});
type TimeoutSettings = { request: number; catalogPage: number; catalogRefresh: number; streamIdle: number; pull: number; chat: number };

function timeoutValue(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) >= 10 && Number(value) <= 24 * 60 * 60 * 1000 ? Number(value) : fallback;
}

function linkedController(parent?: AbortSignal): { controller: AbortController; dispose: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort(parent?.reason);
  if (parent?.aborted) abort();
  else parent?.addEventListener('abort', abort, { once: true });
  return { controller, dispose: () => parent?.removeEventListener('abort', abort) };
}

async function withDeadline<T>(operation: Promise<T>, controller: AbortController, milliseconds: number, message: string): Promise<T> {
  if (milliseconds <= 0) {
    const error = new Error(message);
    controller.abort(error);
    throw error;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAborted: ((error: unknown) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAborted = reject; });
  const abort = () => rejectAborted?.(controller.signal.reason instanceof Error ? controller.signal.reason : new Error(message));
  if (controller.signal.aborted) abort();
  else controller.signal.addEventListener('abort', abort, { once: true });
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(message);
      controller.abort(error);
      reject(error);
    }, milliseconds);
  });
  try { return await Promise.race([operation, timeout, aborted]); }
  finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.signal.removeEventListener('abort', abort);
  }
}

function remaining(deadline: number, maximum: number): number { return Math.min(maximum, Math.max(0, deadline - Date.now())); }

async function boundedJson(response: Response): Promise<unknown> {
  const length = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > OLLAMA_LIMITS.responseBytes) throw new Error('Ollama response exceeds 8 MiB.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > OLLAMA_LIMITS.responseBytes) throw new Error('Ollama response exceeds 8 MiB.');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export class OllamaSuiteService {
  private readonly fetchLocal: FetchLike;
  private readonly now: () => Date;
  private readonly catalogFile: string;
  private readonly pullsFile: string;
  private catalog: OllamaCatalogSnapshot | null = null;
  private pulls: OllamaPullProgress[] = [];
  private activePulls = new Map<string, AbortController>();
  private pullWorkers = 0;
  private chatController: AbortController | null = null;
  private catalogRefreshPromise: Promise<OllamaCatalogSnapshot> | null = null;
  private readonly timeouts: Readonly<TimeoutSettings>;

  constructor(private readonly dependencies: OllamaSuiteServiceDependencies) {
    this.fetchLocal = dependencies.fetchLocal ?? ((input, init) => fetch(input, init));
    this.now = dependencies.now ?? (() => new Date());
    this.catalogFile = path.join(dependencies.userDataDirectory, 'ollama-catalog-cache.v1.json');
    this.pullsFile = path.join(dependencies.userDataDirectory, 'ollama-pull-queue.v1.json');
    this.timeouts = Object.freeze({
      request: timeoutValue(dependencies.requestTimeoutMs, DEFAULT_TIMEOUTS.request),
      catalogPage: timeoutValue(dependencies.catalogPageTimeoutMs, DEFAULT_TIMEOUTS.catalogPage),
      catalogRefresh: timeoutValue(dependencies.catalogRefreshTimeoutMs, DEFAULT_TIMEOUTS.catalogRefresh),
      streamIdle: timeoutValue(dependencies.streamIdleTimeoutMs, DEFAULT_TIMEOUTS.streamIdle),
      pull: timeoutValue(dependencies.pullTimeoutMs, DEFAULT_TIMEOUTS.pull),
      chat: timeoutValue(dependencies.chatTimeoutMs, DEFAULT_TIMEOUTS.chat),
    });
  }

  private async local(route: keyof typeof OLLAMA_DOCUMENTED_ROUTES, body: unknown, controller: AbortController, timeoutMs: number): Promise<Response> {
    const descriptor = OLLAMA_DOCUMENTED_ROUTES[route];
    const url = validateOllamaLocalUrl(new URL(descriptor.path, `${OLLAMA_LOCAL_ORIGIN}/`).href, route).href;
    const response = await withDeadline(this.fetchLocal(url, { method: descriptor.method, redirect: 'error', cache: 'no-store', credentials: 'omit', signal: controller.signal,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }), controller, timeoutMs,
    `The local Ollama ${route} request timed out.`);
    if (!response.ok) throw new Error(`Ollama ${route} returned HTTP ${response.status}.`);
    return response;
  }

  private async localJson(route: 'version' | 'installed' | 'running', parent?: AbortSignal): Promise<unknown> {
    const linked = linkedController(parent);
    try {
      const deadline = Date.now() + this.timeouts.request;
      const response = await this.local(route, undefined, linked.controller, remaining(deadline, this.timeouts.request));
      return await withDeadline(boundedJson(response), linked.controller, remaining(deadline, this.timeouts.request), `The local Ollama ${route} response timed out.`);
    } finally { linked.dispose(); }
  }

  async health(signal?: AbortSignal): Promise<OllamaHealthSnapshot> {
    const checkedAt = this.now().toISOString();
    const linked = linkedController(signal);
    try {
      const [version, installed, running] = await Promise.all([
        this.localJson('version', linked.controller.signal).then(parseOllamaVersion),
        this.localJson('installed', linked.controller.signal).then(parseOllamaInstalled),
        this.localJson('running', linked.controller.signal).then(parseOllamaRunning),
      ]);
      return { state: 'healthy', checkedAt, version, installed, running, message: `Ollama ${version} is available on the local loopback API.` };
    } catch (error) {
      linked.controller.abort(error);
      const message = errorText(error);
      const missing = /ECONNREFUSED|fetch failed|not found/iu.test(message);
      return { state: missing ? 'missing' : 'unhealthy', checkedAt, version: null, installed: [], running: [], message };
    } finally { linked.dispose(); }
  }

  private async atomicWrite(file: string, value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const encoded = `${JSON.stringify(value)}\n`;
    const temporary = `${file}.${process.pid}.${createHash('sha256').update(encoded).digest('hex').slice(0, 12)}.tmp`;
    await fs.writeFile(temporary, encoded, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temporary, file);
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.catalogFile, 'utf8');
      if (Buffer.byteLength(raw) > OLLAMA_LIMITS.catalogCacheBytes) throw new Error('catalog cache oversized');
      const parsed = JSON.parse(raw) as OllamaCatalogSnapshot;
      if (parsed.schemaVersion !== 1 || parsed.source !== 'official-ollama-catalog' || !Array.isArray(parsed.variants)) throw new Error('catalog cache invalid');
      parsed.variants = parsed.variants.map((item) => validateCatalogPage({ schemaVersion: 1, source: parsed.source, sourceRevision: parsed.sourceRevision, page: 1, pageUrl: item.sourceUrl, nextPageUrl: null, variants: [item] }).variants[0]);
      parsed.stale = this.now().getTime() - Date.parse(parsed.refreshedAt) > OLLAMA_LIMITS.catalogFreshMs;
      this.catalog = parsed;
    } catch { this.catalog = null; }
    try {
      const raw = await fs.readFile(this.pullsFile, 'utf8');
      if (Buffer.byteLength(raw) > 512 * 1024) throw new Error('pull state oversized');
      const parsed = JSON.parse(raw) as PersistedPullState;
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.items) || parsed.items.length > OLLAMA_LIMITS.pullQueue) throw new Error('pull state invalid');
      this.pulls = parsed.items.map((item) => ({ ...item, model: validateOllamaModelName(item.model), state: item.state === 'pulling' ? 'queued' : item.state }));
    } catch { this.pulls = []; }
    this.schedulePulls();
  }

  catalogSnapshot(): OllamaCatalogSnapshot | null { return this.catalog ? structuredClone(this.catalog) : null; }

  async refreshCatalog(firstPageUrl = 'https://ollama.com/library'): Promise<OllamaCatalogSnapshot> {
    if (this.catalogRefreshPromise) return this.catalogRefreshPromise;
    this.catalogRefreshPromise = this.performCatalogRefresh(firstPageUrl).finally(() => { this.catalogRefreshPromise = null; });
    return this.catalogRefreshPromise;
  }

  private async performCatalogRefresh(firstPageUrl: string): Promise<OllamaCatalogSnapshot> {
    const fetchPage = this.dependencies.fetchCatalogPage;
    if (!fetchPage) return this.offlineCatalog('No official catalog adapter is available; installed models remain visible.');
    let next: string | null = validateOfficialCatalogUrl(firstPageUrl).href;
    let pageCount = 0;
    let revision = '';
    let complete = true;
    const seenPages = new Set<string>();
    const variants = new Map<string, OllamaCatalogVariant>();
    const controller = new AbortController(); const deadline = Date.now() + this.timeouts.catalogRefresh;
    try {
      while (next) {
        if (pageCount >= OLLAMA_LIMITS.catalogPages || variants.size >= OLLAMA_LIMITS.catalogVariants) { complete = false; break; }
        if (seenPages.has(next)) throw new Error('The official catalog pagination contains a cycle.');
        seenPages.add(next);
        const page = validateCatalogPage(await withDeadline(fetchPage(next, controller.signal), controller,
          remaining(deadline, this.timeouts.catalogPage), 'The official Ollama catalog refresh timed out.'));
        if (page.pageUrl !== next || (pageCount && page.sourceRevision !== revision) || page.page !== pageCount + 1) throw new Error('The official catalog pagination is inconsistent.');
        revision ||= page.sourceRevision;
        for (const variant of page.variants) {
          if (variants.has(variant.qualifiedName)) throw new Error('The official catalog returned a duplicate variant.');
          variants.set(variant.qualifiedName, variant);
        }
        pageCount += 1; next = page.nextPageUrl;
      }
      const snapshot: OllamaCatalogSnapshot = { schemaVersion: 1, source: 'official-ollama-catalog', sourceRevision: revision,
        refreshedAt: this.now().toISOString(), pageCount, complete: complete && next === null, stale: !(complete && next === null), variants: [...variants.values()], installedOnly: [],
        message: complete && next === null ? `Verified ${variants.size} official variants across ${pageCount} page(s).` : 'The official catalog reached its safety boundary and is incomplete.' };
      if (!snapshot.complete) {
        if (this.catalog?.complete) return this.offlineCatalog(snapshot.message);
        return snapshot;
      }
      this.catalog = snapshot; await this.atomicWrite(this.catalogFile, snapshot); return structuredClone(snapshot);
    } catch (error) { return this.offlineCatalog(`Official catalog refresh failed: ${errorText(error)}`); }
  }

  private offlineCatalog(message: string): OllamaCatalogSnapshot {
    if (this.catalog) { this.catalog.stale = true; this.catalog.message = message; return structuredClone(this.catalog); }
    return { schemaVersion: 1, source: 'official-ollama-catalog', sourceRevision: '', refreshedAt: this.now().toISOString(), pageCount: 0, complete: false, stale: true, variants: [], installedOnly: [], message };
  }

  catalogWithInstalled(installed: OllamaHealthSnapshot['installed']): OllamaCatalogSnapshot {
    const snapshot = this.catalog ? structuredClone(this.catalog) : this.offlineCatalog('The official catalog has not been verified yet.');
    const official = new Set(snapshot.variants.map(({ qualifiedName }) => qualifiedName));
    snapshot.installedOnly = installed.filter(({ name }) => !official.has(name)).map((item) => structuredClone(item));
    return snapshot;
  }

  pullQueue(): OllamaPullProgress[] { return structuredClone(this.pulls); }

  async enqueuePulls(models: string[]): Promise<OllamaPullProgress[]> {
    if (!Array.isArray(models) || !models.length || models.length > OLLAMA_LIMITS.pullQueue) throw new Error('The pull queue exceeds 128 items.');
    const known = new Set(this.catalog?.variants.map(({ qualifiedName }) => qualifiedName) ?? []);
    const requested = [...new Set(models.map(validateOllamaModelName))];
    const active = this.pulls.filter(({ state }) => ['queued', 'pulling'].includes(state)).length;
    if (requested.length + active > OLLAMA_LIMITS.pullQueue) throw new Error('The pull queue exceeds 128 items.');
    const availableHistory = OLLAMA_LIMITS.pullQueue - requested.length;
    if (this.pulls.length > availableHistory) this.pulls = this.pulls.slice(-availableHistory);
    for (const model of requested) {
      if (!known.has(model)) throw new Error('Batch pulls are limited to verified official catalog variants.');
      if (this.pulls.some((item) => item.model === model && ['queued', 'pulling'].includes(item.state))) continue;
      this.pulls.push({ model, state: 'queued', status: 'Waiting for a bounded pull slot.', completedBytes: null, totalBytes: null, error: null });
    }
    await this.persistPulls(); this.schedulePulls(); return this.pullQueue();
  }

  private schedulePulls(): void {
    while (this.pullWorkers < OLLAMA_LIMITS.pullConcurrency) {
      const item = this.pulls.find(({ state }) => state === 'queued');
      if (!item) return;
      this.pullWorkers += 1; void this.runPull(item).finally(() => { this.pullWorkers -= 1; this.schedulePulls(); });
    }
  }

  private async runPull(item: OllamaPullProgress): Promise<void> {
    const controller = new AbortController(); const deadline = Date.now() + this.timeouts.pull; this.activePulls.set(item.model, controller);
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    Object.assign(item, { state: 'pulling', status: 'Pulling through the documented local API.', error: null }); this.emit(item);
    try {
      const response = await this.local('pull', { model: item.model, stream: true, insecure: false }, controller, remaining(deadline, this.timeouts.request));
      if (!response.body) throw new Error('Ollama pull returned no progress stream.');
      reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let total = 0;
      while (true) {
        const result = await withDeadline(reader.read(), controller, remaining(deadline, this.timeouts.streamIdle), 'The local Ollama pull stream timed out.'); if (result.done) break;
        total += result.value.byteLength; if (total > OLLAMA_LIMITS.responseBytes) throw new Error('Ollama pull progress exceeds 8 MiB.');
        buffer += decoder.decode(result.value, { stream: true });
        const lines = buffer.split(/\r?\n/u); buffer = lines.pop() ?? '';
        for (const line of lines.filter(Boolean)) this.applyPullLine(item, line);
      }
      if (buffer.trim()) this.applyPullLine(item, buffer);
      Object.assign(item, { state: 'completed', status: 'Pull completed.', error: null });
    } catch (error) {
      const cancelled = controller.signal.reason instanceof UserCancelledError;
      Object.assign(item, { state: cancelled ? 'cancelled' : 'failed', status: cancelled ? 'Pull cancelled.' : 'Pull failed.', error: cancelled ? null : errorText(error) });
    } finally {
      if (reader) void reader.cancel().catch(() => undefined);
      this.activePulls.delete(item.model); this.emit(item); await this.persistPulls();
    }
  }

  private applyPullLine(item: OllamaPullProgress, line: string): void {
    if (Buffer.byteLength(line) > 64 * 1024) throw new Error('Ollama pull progress line is oversized.');
    const parsed = JSON.parse(line) as Record<string, unknown>;
    item.status = typeof parsed.status === 'string' ? parsed.status.slice(0, 240) : 'Pulling model data.';
    item.completedBytes = Number.isSafeInteger(parsed.completed) && Number(parsed.completed) >= 0 ? Number(parsed.completed) : null;
    item.totalBytes = Number.isSafeInteger(parsed.total) && Number(parsed.total) >= 0 ? Number(parsed.total) : null;
    this.emit(item);
  }

  cancelPull(model: string): boolean {
    const controller = this.activePulls.get(validateOllamaModelName(model));
    if (!controller) return false;
    controller.abort(new UserCancelledError('Pull cancelled by the user.'));
    return true;
  }
  async retryPull(model: string): Promise<void> {
    const item = this.pulls.find((candidate) => candidate.model === validateOllamaModelName(model));
    if (!item || !['failed', 'cancelled'].includes(item.state)) throw new Error('Only failed or cancelled pulls can be retried.');
    Object.assign(item, { state: 'queued', status: 'Waiting for a bounded pull slot.', error: null }); await this.persistPulls(); this.schedulePulls();
  }
  private emit(item: OllamaPullProgress): void { this.dependencies.onPullProgress?.(structuredClone(item)); }
  private persistPulls(): Promise<void> { return this.atomicWrite(this.pullsFile, { schemaVersion: 1, items: this.pulls } satisfies PersistedPullState); }

  private verifiedVariant(model: unknown): OllamaCatalogVariant {
    const qualifiedName = validateOllamaModelName(model);
    if (!this.catalog?.complete) throw new Error('Chat and export require a complete verified official catalog.');
    const variant = this.catalog.variants.find((candidate) => candidate.qualifiedName === qualifiedName);
    if (!variant) throw new Error('The requested model is not in the current verified official catalog.');
    return structuredClone(variant);
  }

  async chat(request: OllamaChatRequest, onChunk: (content: string) => void): Promise<OllamaChatRequest> {
    if (this.chatController) throw new Error('A chat request is already active.');
    const variant = this.verifiedVariant(request?.model);
    const validated = validateChatRequest(request, variant); const controller = new AbortController(); const deadline = Date.now() + this.timeouts.chat; this.chatController = controller;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    try {
      const response = await this.local('chat', { model: validated.model, messages: validated.messages, options: {
        temperature: validated.options.temperature, top_p: validated.options.topP, top_k: validated.options.topK,
        seed: validated.options.seed, num_ctx: validated.options.numCtx, num_predict: validated.options.numPredict,
      }, stream: true }, controller, remaining(deadline, this.timeouts.request));
      if (!response.body) throw new Error('Ollama chat returned no stream.');
      reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let total = 0;
      while (true) {
        const result = await withDeadline(reader.read(), controller, remaining(deadline, this.timeouts.streamIdle), 'The local Ollama chat stream timed out.'); if (result.done) break;
        total += result.value.byteLength; if (total > OLLAMA_LIMITS.responseBytes) throw new Error('Ollama chat response exceeds 8 MiB.');
        buffer += decoder.decode(result.value, { stream: true });
        const lines = buffer.split(/\r?\n/u); buffer = lines.pop() ?? '';
        for (const line of lines.filter(Boolean)) {
          const parsed = JSON.parse(line) as { message?: { content?: unknown } };
          if (typeof parsed.message?.content === 'string') onChunk(parsed.message.content);
        }
      }
      if (buffer.trim()) {
        const parsed = JSON.parse(buffer) as { message?: { content?: unknown } };
        if (typeof parsed.message?.content === 'string') onChunk(parsed.message.content);
      }
      return validated;
    } catch (error) {
      if (controller.signal.reason instanceof UserCancelledError) throw new Error('The local Ollama chat was cancelled.');
      throw error;
    } finally {
      if (reader) void reader.cancel().catch(() => undefined);
      this.chatController = null;
    }
  }
  cancelChat(): boolean { if (!this.chatController) return false; this.chatController.abort(new UserCancelledError('Chat cancelled by the user.')); return true; }
  exportChat(request: OllamaChatRequest): ReturnType<typeof redactChatExport> {
    return redactChatExport(validateChatRequest(request, this.verifiedVariant(request?.model)).messages);
  }
}
