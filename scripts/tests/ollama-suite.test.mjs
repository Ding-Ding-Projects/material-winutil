import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  OLLAMA_DOCUMENTED_ROUTES, OLLAMA_HARNESS_PROFILES, OLLAMA_LIMITS,
  assessOllamaFit, createHarnessPlan, redactChatExport, restoreHarnessSnapshot, validateCatalogPage,
  validateChatRequest, validateOfficialCatalogUrl, validateOllamaLocalUrl, validateOllamaModelName,
} from '../../dist/shared/ollama-suite.js';
import { OllamaSuiteService } from '../../dist/main/ollama-suite-service.js';

const digest = 'a'.repeat(64);
const details = { format: 'gguf', family: 'family', families: ['family'], parameter_size: '3B', quantization_level: 'Q4_K_M' };
const variant = {
  model: 'verified-model', tag: '3b-q4', qualifiedName: 'verified-model:3b-q4', digest,
  blobSizeBytes: 2_000_000_000, parameterCount: 3_000_000_000, quantization: 'Q4_K_M', contextLength: 8_192,
  capabilities: ['text'], publishedAt: '2026-08-12T00:00:00Z', sourceUrl: 'https://ollama.com/library/verified-model',
};
const page = (number, nextPageUrl = null, variants = [variant]) => ({
  schemaVersion: 1, source: 'official-ollama-catalog', sourceRevision: 'catalog-revision-1', page: number,
  pageUrl: number === 1 ? 'https://ollama.com/library' : `https://ollama.com/library?page=${number}`,
  nextPageUrl, variants,
});

function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }

async function fixture(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'material-winutil-ollama-'));
  const calls = [];
  const service = new OllamaSuiteService({
    userDataDirectory: root,
    now: () => new Date('2026-08-12T12:00:00Z'),
    fetchLocal: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/api/version')) return json({ version: '0.12.6' });
      if (url.endsWith('/api/tags')) return json({ models: [{ name: variant.qualifiedName, model: variant.qualifiedName, modified_at: '2026-08-12T00:00:00Z', size: variant.blobSizeBytes, digest, details }] });
      if (url.endsWith('/api/ps')) return json({ models: [{ name: variant.qualifiedName, model: variant.qualifiedName, size: variant.blobSizeBytes, digest, details, expires_at: '2026-08-12T12:05:00Z', size_vram: 1_000_000_000, context_length: 8_192 }] });
      if (url.endsWith('/api/pull')) return new Response(`${JSON.stringify({ status: 'pulling manifest' })}\n${JSON.stringify({ status: 'success', completed: 2_000_000_000, total: 2_000_000_000 })}\n`);
      if (url.endsWith('/api/chat')) return new Response(`${JSON.stringify({ message: { content: 'hello' }, done: false })}\n${JSON.stringify({ message: { content: '!' }, done: true })}\n`);
      throw new Error('unexpected route');
    },
    fetchCatalogPage: async (url) => page(Number(new URL(url).searchParams.get('page') ?? 1)),
    ...overrides,
  });
  return { root, service, calls, async cleanup() { await rm(root, { recursive: true, force: true }); } };
}

test('allows only the fixed loopback origin and documented local routes', () => {
  assert.equal(validateOllamaLocalUrl('http://127.0.0.1:11434/api/version', 'version').href, 'http://127.0.0.1:11434/api/version');
  for (const unsafe of ['http://localhost:11434/api/version', 'http://[::1]:11434/api/version', 'https://ollama.com/api/version', 'http://127.0.0.1:11434/api/version?next=x', 'http://127.0.0.1:11434/api/generate']) {
    assert.throws(() => validateOllamaLocalUrl(unsafe, 'version'), /fixed loopback origin/u);
  }
  assert.deepEqual(Object.fromEntries(Object.entries(OLLAMA_DOCUMENTED_ROUTES).map(([key, value]) => [key, value.path])), { version: '/api/version', installed: '/api/tags', running: '/api/ps', pull: '/api/pull', chat: '/api/chat' });
});

test('rejects arbitrary model references and non-official catalog URLs', () => {
  for (const name of ['https://ollama.com/model', 'file:///model', '../escape', 'model//tag', 'model with space']) assert.throws(() => validateOllamaModelName(name));
  assert.equal(validateOllamaModelName('model-family:3b-q4'), 'model-family:3b-q4');
  for (const url of ['http://ollama.com/library', 'https://user:pass@ollama.com/library', 'https://example.com/library', 'https://ollama.com/api', 'https://ollama.com/library?page=0', 'https://ollama.com/library?redirect=x']) assert.throws(() => validateOfficialCatalogUrl(url));
});

test('validates exact catalog identity, capability, and pagination metadata', () => {
  assert.equal(validateCatalogPage(page(1)).variants[0].qualifiedName, variant.qualifiedName);
  assert.throws(() => validateCatalogPage(page(1, null, [{ ...variant, qualifiedName: 'other:tag' }])), /inconsistent/u);
  assert.throws(() => validateCatalogPage(page(1, null, [{ ...variant, capabilities: ['cloud'] }])), /capabilities/u);
  assert.throws(() => validateCatalogPage(page(1, null, [{ ...variant, digest: 'not-a-digest' }])), /digest/u);
  assert.throws(() => validateCatalogPage({ ...page(1), unexpected: true }), /unknown fields/u);
  assert.throws(() => validateCatalogPage(page(1, null, [{ ...variant, shell: 'powershell.exe' }])), /unknown fields/u);
  assert.throws(() => validateCatalogPage({ ...page(1), pageUrl: 'https://example.com/library' }), /official/u);
});

test('computes conservative fit from evidence rather than model names', () => {
  const probes = { ram: { state: 'available', message: 'fixture' }, disk: { state: 'available', message: 'fixture' }, gpu: { state: 'unavailable', message: 'fixture' } };
  const common = { detectedAt: '2026-08-12T00:00:00Z', gpuName: null, vramTotalBytes: null, vramAvailableBytes: null, gpuDriver: null, gpuSupported: null, probes };
  assert.equal(assessOllamaFit({ ...variant, model: 'tiny-sounds-easy' }, { ...common, ramTotalBytes: 1_000_000_000, ramAvailableBytes: 500_000_000, diskFreeBytes: 500_000_000 }).verdict, 'unlikely');
  assert.equal(assessOllamaFit(variant, { ...common, ramTotalBytes: 16_000_000_000, ramAvailableBytes: 12_000_000_000, diskFreeBytes: 50_000_000_000 }).verdict, 'runs-with-limits');
  assert.equal(assessOllamaFit(variant, { ...common, ramTotalBytes: 16_000_000_000, ramAvailableBytes: 12_000_000_000, gpuSupported: true, vramAvailableBytes: null, diskFreeBytes: 50_000_000_000 }).verdict, 'runs-with-limits');
  assert.equal(assessOllamaFit(variant, { ...common, ramTotalBytes: 16_000_000_000, ramAvailableBytes: 12_000_000_000, gpuSupported: true, vramAvailableBytes: 12_000_000_000, diskFreeBytes: 50_000_000_000 }).verdict, 'runs-well');
  assert.equal(assessOllamaFit({ ...variant, blobSizeBytes: null }, { ...common, ramTotalBytes: null, ramAvailableBytes: null, diskFreeBytes: null }).verdict, 'unknown');
});

test('health validates version plus installed and running inventories on loopback', async (t) => {
  const f = await fixture(); t.after(f.cleanup);
  const health = await f.service.health();
  assert.equal(health.state, 'healthy'); assert.equal(health.version, '0.12.6'); assert.equal(health.installed.length, 1); assert.equal(health.running.length, 1);
  assert.deepEqual(f.calls.map(({ url }) => new URL(url).pathname).sort(), ['/api/ps', '/api/tags', '/api/version']);
  assert.ok(f.calls.every(({ init }) => init.redirect === 'error' && init.credentials === 'omit'));
});

test('health aborts hung local requests within a bounded deadline', async (t) => {
  let aborts = 0;
  const f = await fixture({
    requestTimeoutMs: 15,
    fetchLocal: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => { aborts += 1; reject(init.signal.reason); }, { once: true });
    }),
  });
  t.after(f.cleanup);
  const health = await f.service.health();
  assert.equal(health.state, 'unhealthy');
  assert.match(health.message, /timed out/u);
  assert.equal(aborts, 3);
  assert.deepEqual(health.installed, []);
  assert.deepEqual(health.running, []);
});

test('main, preload, and shared bridge expose bounded Ollama service seams', async () => {
  const [main, preload, types] = await Promise.all([
    readFile(new URL('../../src/main/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/main/preload.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/shared/types.ts', import.meta.url), 'utf8'),
  ]);
  for (const channel of ['ollama:health', 'ollama:hardware', 'ollama:catalog', 'ollama:refresh-catalog', 'ollama:pull-queue', 'ollama:enqueue-pulls', 'ollama:cancel-pull', 'ollama:retry-pull', 'ollama:chat', 'ollama:cancel-chat', 'ollama:export-chat']) {
    assert.match(main, new RegExp(`ipcMain\\.handle\\('${channel.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}'`, 'u'));
    assert.match(preload, new RegExp(`ipcRenderer\\.invoke\\('${channel.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}'`, 'u'));
  }
  for (const method of ['ollamaHealth()', 'ollamaHardware()', 'ollamaCatalog()', 'ollamaRefreshCatalog()', 'ollamaPullQueue()', 'ollamaEnqueuePulls(', 'ollamaChat(', 'ollamaExportChat(']) assert.ok(types.includes(method), method);
  assert.ok(main.includes('new OllamaSuiteService('));
});

test('renderer ships a truthful localized accessible Ollama suite surface', async () => {
  const [renderer, styles, manifest] = await Promise.all([
    readFile(new URL('../../src/renderer/renderer.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/renderer/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../smoke/app-manifest.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  assert.match(renderer, /\{ id: 'ollama', label: 'Ollama suite', icon: 'memory' \}/u);
  assert.match(renderer, /case 'ollama': return ollamaPane\(\)/u);
  assert.match(renderer, /Ollama 套件管理器/u);
  assert.match(renderer, /searchLine\('ollama:model-store'/u);
  assert.match(renderer, /No verified official variants are available/u);
  assert.match(renderer, /no reviewed official catalog adapter/u);
  assert.match(renderer, /No fit is guessed from the model name/u);
  assert.match(renderer, /Pull cart — never payment/u);
  assert.match(renderer, /does not report vision capability/u);
  assert.match(renderer, /This is not an arbitrary command launcher/u);
  assert.match(renderer, /Launch unavailable/u);
  assert.match(renderer, /rollbackRequiredOnFailure: true/u);
  assert.match(renderer, /role: 'log', 'aria-live': 'polite'/u);
  assert.match(styles, /\.ollama-pane/u);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.ollama-grid/u);
  for (const id of ['ollama-status-missing', 'ollama-store-unavailable', 'ollama-cart-empty', 'ollama-chat-unavailable', 'ollama-harness-preflight']) assert.ok(manifest.captures.some((capture) => capture.id === id), id);
  assert.doesNotMatch(renderer, /https:\/\/ollama\.com\/api/u);
  assert.doesNotMatch(renderer, /shellCommand|powershell\.exe|cmd\.exe/u);
});

test('catalog follows all pages, rejects cycles/duplicates, and retains a stale verified cache offline', async (t) => {
  const pages = [page(1, 'https://ollama.com/library?page=2'), page(2, null, [{ ...variant, model: 'second', qualifiedName: 'second:3b-q4' }])];
  const f = await fixture({ fetchCatalogPage: async (url) => pages[Number(new URL(url).searchParams.get('page') ?? 1) - 1] }); t.after(f.cleanup);
  const fresh = await f.service.refreshCatalog(); assert.equal(fresh.complete, true); assert.equal(fresh.pageCount, 2); assert.equal(fresh.variants.length, 2);
  const cached = JSON.parse(await readFile(join(f.root, 'ollama-catalog-cache.v1.json'), 'utf8')); assert.equal(cached.source, 'official-ollama-catalog');
  const offline = new OllamaSuiteService({ userDataDirectory: f.root, now: () => new Date('2026-08-14T12:00:00Z'), fetchCatalogPage: async () => { throw new Error('offline'); } });
  await offline.load(); const stale = await offline.refreshCatalog(); assert.equal(stale.stale, true); assert.equal(stale.variants.length, 2); assert.match(stale.message, /offline/u);
  const cycle = await fixture({ fetchCatalogPage: async () => page(1, 'https://ollama.com/library') }); t.after(cycle.cleanup);
  const failed = await cycle.service.refreshCatalog(); assert.equal(failed.complete, false); assert.match(failed.message, /cycle/u);
  const incomplete = await fixture({ fetchCatalogPage: async (url) => {
    const number = Number(new URL(url).searchParams.get('page') ?? 1);
    return { ...page(number), nextPageUrl: `https://ollama.com/library?page=${number + 1}`, variants: [{ ...variant, model: `bounded-${number}`, qualifiedName: `bounded-${number}:3b-q4`, sourceUrl: `https://ollama.com/library/bounded-${number}` }] };
  } }); t.after(incomplete.cleanup);
  const bounded = await incomplete.service.refreshCatalog(); assert.equal(bounded.complete, false); assert.equal(bounded.stale, true); assert.equal(bounded.pageCount, OLLAMA_LIMITS.catalogPages);
});

test('catalog refresh is single-flight and times out a hung official adapter without replacing cache', async (t) => {
  let calls = 0;
  const f = await fixture({
    catalogPageTimeoutMs: 15,
    catalogRefreshTimeoutMs: 30,
    fetchCatalogPage: async (_url, signal) => new Promise((_resolve, reject) => {
      calls += 1;
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
  });
  t.after(f.cleanup);
  const first = f.service.refreshCatalog();
  const second = f.service.refreshCatalog();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(a.complete, false);
  assert.equal(a.stale, true);
  assert.match(a.message, /timed out/u);
  assert.deepEqual(b, a);
  assert.equal(f.service.catalogSnapshot(), null);
});

test('bounded pull queue uses the API, streams progress, and persists only outcomes', async (t) => {
  const progress = [];
  const f = await fixture({ onPullProgress(item) { progress.push(item); } }); t.after(f.cleanup);
  await f.service.refreshCatalog(); await f.service.enqueuePulls([variant.qualifiedName]);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(f.service.pullQueue()[0].state, 'completed');
  const call = f.calls.find(({ url }) => url.endsWith('/api/pull')); assert.ok(call); assert.deepEqual(JSON.parse(call.init.body), { model: variant.qualifiedName, stream: true, insecure: false });
  assert.ok(progress.some(({ state }) => state === 'pulling')); assert.ok(progress.some(({ state }) => state === 'completed'));
  await assert.rejects(() => f.service.enqueuePulls(['not-in-catalog:latest']), /verified official/u);
  await assert.rejects(() => f.service.enqueuePulls(Array(OLLAMA_LIMITS.pullQueue + 1).fill(variant.qualifiedName)), /128/u);
  const installedOnly = f.service.catalogWithInstalled([{ name: 'private-local:latest', model: 'private-local:latest', modifiedAt: '2026-08-12T00:00:00Z', sizeBytes: 1, digest, details: { format: 'gguf', family: 'local', families: ['local'], parameterSize: '1B', quantization: 'Q4' } }]);
  assert.deepEqual(installedOnly.installedOnly.map(({ name }) => name), ['private-local:latest']);
});

test('partial pull stream fails closed after its idle deadline and cannot later report completion', async (t) => {
  let cancelled = false;
  const partial = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(`${JSON.stringify({ status: 'partial', completed: 1, total: 10 })}\n`)); },
    cancel() { cancelled = true; },
  });
  const f = await fixture({
    streamIdleTimeoutMs: 15,
    pullTimeoutMs: 50,
    fetchLocal: async (url) => {
      if (url.endsWith('/api/pull')) return new Response(partial);
      if (url.endsWith('/api/version')) return json({ version: '0.12.6' });
      if (url.endsWith('/api/tags')) return json({ models: [] });
      if (url.endsWith('/api/ps')) return json({ models: [] });
      throw new Error('unexpected route');
    },
  });
  t.after(f.cleanup);
  await f.service.refreshCatalog();
  await f.service.enqueuePulls([variant.qualifiedName]);
  await new Promise((resolve) => setTimeout(resolve, 60));
  const item = f.service.pullQueue()[0];
  assert.equal(item.state, 'failed');
  assert.match(item.error, /timed out/u);
  assert.equal(item.completedBytes, 1);
  assert.equal(cancelled, true);
});

test('chat validates bounded parameters, unsupported attachments, streaming, cancellation, and redaction', async (t) => {
  const f = await fixture(); t.after(f.cleanup); const chunks = []; await f.service.refreshCatalog();
  const request = { model: variant.qualifiedName, messages: [{ role: 'system', content: 'Private setup' }, { role: 'user', content: 'token=secret-value hello' }], options: { temperature: 0.4, numCtx: 4096 } };
  await f.service.chat(request, (chunk) => chunks.push(chunk)); assert.deepEqual(chunks, ['hello', '!']);
  assert.throws(() => validateChatRequest({ ...request, options: { temperature: 999 } }, variant), /outside/u);
  assert.throws(() => validateChatRequest({ ...request, cloudUrl: 'https://ollama.com/api' }, variant), /unknown fields/u);
  assert.throws(() => validateChatRequest({ ...request, options: { temperature: 0.4, command: 'ollama run' } }, variant), /unknown fields/u);
  assert.throws(() => validateChatRequest({ ...request, messages: [{ role: 'user', content: 'hi', images: ['AAAA'] }] }, variant), /does not support/u);
  assert.throws(() => validateChatRequest({ ...request, messages: [{ role: 'user', content: 'hi', images: ['not base64!!!'] }] }, { ...variant, capabilities: ['text', 'vision'] }), /attachments/u);
  assert.equal(validateChatRequest({ ...request, messages: [{ role: 'user', content: 'line one\nline two' }] }, variant).messages[0].content, 'line one\nline two');
  const exported = redactChatExport(request.messages); assert.equal(exported.messages[0].content, '[system prompt omitted]'); assert.doesNotMatch(exported.messages[1].content, /secret-value/u);
  let rejectChat;
  const cancelFixture = await fixture({ fetchLocal: async () => new Promise((_resolve, reject) => { rejectChat = reject; }) }); t.after(cancelFixture.cleanup); await cancelFixture.service.refreshCatalog();
  const running = cancelFixture.service.chat(request, () => {}).catch((error) => error);
  assert.equal(cancelFixture.service.cancelChat(), true); rejectChat(Object.assign(new Error('cancelled'), { name: 'AbortError' })); assert.match((await running).message, /cancelled/u);
  const forged = { ...request, model: 'forged:latest' };
  await assert.rejects(() => f.service.chat(forged, () => {}), /current verified official catalog/u);
  assert.throws(() => f.service.exportChat(forged), /current verified official catalog/u);
});

test('partial chat stream times out, cleans up, and permits a later request without stale chunks', async (t) => {
  let attempts = 0;
  let cancelled = false;
  const f = await fixture({
    streamIdleTimeoutMs: 15,
    chatTimeoutMs: 50,
    fetchLocal: async (url) => {
      if (!url.endsWith('/api/chat')) throw new Error('unexpected route');
      attempts += 1;
      if (attempts === 1) return new Response(new ReadableStream({
        start(controller) { controller.enqueue(new TextEncoder().encode(`${JSON.stringify({ message: { content: 'partial' }, done: false })}\n`)); },
        cancel() { cancelled = true; },
      }));
      return new Response(`${JSON.stringify({ message: { content: 'fresh' }, done: true })}\n`);
    },
  });
  t.after(f.cleanup);
  await f.service.refreshCatalog();
  const request = { model: variant.qualifiedName, messages: [{ role: 'user', content: 'hello' }], options: { temperature: 0.4, numCtx: 4096 } };
  const partialChunks = [];
  await assert.rejects(() => f.service.chat(request, (chunk) => partialChunks.push(chunk)), /timed out/u);
  assert.deepEqual(partialChunks, ['partial']);
  assert.equal(cancelled, true);
  const freshChunks = [];
  await f.service.chat(request, (chunk) => freshChunks.push(chunk));
  assert.deepEqual(freshChunks, ['fresh']);
});

test('harness profiles are prebuilt typed plans with immutable rollback and no arbitrary command fields', () => {
  assert.deepEqual(OLLAMA_HARNESS_PROFILES.map(({ id }) => id), ['vscode-continue', 'opencode-local', 'open-webui-local']);
  const plan = createHarnessPlan('vscode-continue', variant, { model: variant.qualifiedName, contextLength: 8192, workspaceFolder: 'C:\\workspace' }, new Date('2026-08-12T00:00:00Z'));
  assert.equal(plan.executableId, 'vscode'); assert.equal(plan.rollbackRequiredOnFailure, true); assert.equal(plan.snapshot.schemaVersion, 1); assert.equal(plan.environment.OLLAMA_HOST, 'http://127.0.0.1:11434');
  assert.deepEqual(restoreHarnessSnapshot(plan), { model: variant.qualifiedName, contextLength: 8192, workspaceFolder: 'C:\\workspace' });
  assert.throws(() => restoreHarnessSnapshot({ ...plan, executableId: 'powershell' }), /allowlisted/u);
  assert.throws(() => createHarnessPlan('vscode-continue', variant, { model: variant.qualifiedName, shell: 'powershell.exe' }), /unsupported field/u);
  assert.throws(() => createHarnessPlan('custom-shell', variant, { model: variant.qualifiedName }), /allowlisted/u);
});
