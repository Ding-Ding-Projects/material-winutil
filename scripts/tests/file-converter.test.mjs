import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  FILE_CONVERTER_ADAPTERS,
  FILE_CONVERTER_CATEGORIES,
  FILE_CONVERTER_LIMITS,
  PersistentConversionQueue,
  assertStoragePreflight,
  catalogByCategory,
  detectFileType,
  validateAdapterRegistry,
} from '../../dist/shared/file-converter.js';
import { FileConverterService } from '../../dist/main/file-converter-service.js';

class MemoryQueueStore {
  index;
  pages = new Map();
  async readIndex() { return this.index && structuredClone(this.index); }
  async writeIndex(index) { this.index = structuredClone(index); }
  async readPage(id) { return this.pages.has(id) ? structuredClone(this.pages.get(id)) : undefined; }
  async writePage(page) { this.pages.set(page.id, structuredClone(page)); }
}

function item(id, bytes = 10) {
  return { id, sourcePath: `C:/input/${id}.txt`, sourceBytes: bytes, estimatedOutputBytes: bytes, adapterId: 'text-convert', state: 'queued', retryCount: 0 };
}

test('catalog contains every required category and exposes truthful disabled adapters', () => {
  validateAdapterRegistry();
  const catalog = catalogByCategory();
  assert.deepEqual([...catalog.keys()], [...FILE_CONVERTER_CATEGORIES]);
  for (const entry of FILE_CONVERTER_ADAPTERS) {
    assert.equal(entry.availability, 'unavailable');
    assert.match(entry.unavailableReason, /not bundled/i);
    assert.equal(entry.bundledProof, undefined);
  }
  assert.throws(() => validateAdapterRegistry([{ ...FILE_CONVERTER_ADAPTERS[0], availability: 'available', unavailableReason: undefined }]), /bundled artifact proof/i);
});

test('detects bounded magic bytes without PATH or network discovery and reports spoofed extensions', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.deepEqual(detectFileType(png, 'photo.pdf'), {
    kind: 'png', declaredKind: 'pdf', conflict: true, inspectedBytes: 8, confidence: 'magic',
    reason: 'Declared extension suggests pdf, but bounded content signature is png.',
  });
  assert.equal(detectFileType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), 'report.pdf').kind, 'pdf');
  assert.equal(detectFileType(new TextEncoder().encode('plain text'), 'readme.md').kind, 'text');
  assert.throws(() => detectFileType(new Uint8Array(FILE_CONVERTER_LIMITS.signatureBytes + 1)), /exceeds/i);
});

test('storage preflight refuses insufficient capacity before any page is written', () => {
  assert.throws(() => assertStoragePreflight({ availableBytes: 9, requiredBytes: 10 }), /Insufficient storage/i);
  assert.doesNotThrow(() => assertStoragePreflight({ availableBytes: 10, requiredBytes: 8, reserveBytes: 2 }));
});

test('paged queue uses bounded pages, pause/resume, bounded concurrency, backpressure, and resumable recovery', async () => {
  const store = new MemoryQueueStore();
  const queue = await PersistentConversionQueue.open(store, { concurrency: 2, maxInFlightBytes: 15 });
  await queue.enqueuePage({ id: 'page-1', items: [item('one', 10), item('two', 10)] }, { availableBytes: 1000, requiredBytes: 40, reserveBytes: 10 });
  assert.equal((await queue.claimNext()).length, 1, 'second item is held by byte backpressure');
  await queue.pause();
  assert.deepEqual(await queue.claimNext(), []);
  await queue.resume();
  await queue.complete('one');
  assert.deepEqual((await queue.claimNext()).map((entry) => entry.id), ['two']);
  const recovered = await PersistentConversionQueue.open(store, { concurrency: 2, maxInFlightBytes: 15 });
  assert.equal((await recovered.claimNext())[0]?.id, 'two', 'running item is recovered as queued after restart');
  await recovered.fail('two', 'temporary conversion failure', true);
  assert.equal((await recovered.claimNext())[0]?.retryCount, 1);
});

test('queue rejects unbounded pages and records cancellation without loading file bytes', async () => {
  const store = new MemoryQueueStore();
  const queue = await PersistentConversionQueue.open(store);
  await assert.rejects(
    queue.enqueuePage({ id: 'huge', items: Array.from({ length: FILE_CONVERTER_LIMITS.pageItems + 1 }, (_, index) => item(`item-${index}`)) }, { availableBytes: 999999, requiredBytes: 1 }),
    /Queue page must have/i,
  );
  await queue.enqueuePage({ id: 'page-2', items: [item('cancel-me')] }, { availableBytes: 1000, requiredBytes: 20 });
  await queue.cancelAll();
  assert.deepEqual(await queue.claimNext(), []);
  assert.equal(queue.summary().state, 'cancelled');
});

test('desktop service inspects local picker paths without exposing full paths to the renderer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'material-winutil-converter-'));
  try {
    const source = join(root, 'statement.pdf');
    await writeFile(source, Buffer.from('%PDF-1.7\ncontrolled local fixture'));
    const service = await FileConverterService.open(join(root, 'app-data'));
    const state = await service.pickLocalFiles([source]);
    assert.equal(state.selected.length, 1);
    assert.equal(state.selected[0].name, 'statement.pdf');
    assert.equal(state.selected[0].kind, 'pdf');
    assert.equal(state.selected[0].confidence, 'magic');
    assert.equal(state.limits.signatureBytes, FILE_CONVERTER_LIMITS.signatureBytes);
    assert.doesNotMatch(JSON.stringify(state), /material-winutil-converter-|[A-Z]:\\/i);
    assert.equal(state.catalog.every((adapter) => adapter.availability === 'unavailable'), true);
    await assert.rejects(service.enqueue('pdf-inspect'), /not bundled and verified/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('desktop service persists queue controls without inventing an executable adapter', async () => {
  const root = await mkdtemp(join(tmpdir(), 'material-winutil-converter-state-'));
  try {
    const service = await FileConverterService.open(root);
    assert.equal((await service.pause()).queue.state, 'paused');
    assert.equal((await service.resume()).queue.state, 'active');
    assert.equal((await service.cancelAll()).queue.state, 'cancelled');
    const reset = await service.resetQueue();
    assert.equal(reset.queue.state, 'active');
    assert.equal(reset.queue.pageCount, 0);
    const index = JSON.parse(await readFile(join(root, 'file-converter-queue-v1', 'index.json'), 'utf8'));
    assert.equal(index.schemaVersion, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('renderer exposes categorized converter search and real queue controls', async () => {
  const renderer = await readFile(new URL('../../src/renderer/renderer.ts', import.meta.url), 'utf8');
  assert.match(renderer, /\{ id: 'converter', label: 'File converter', icon: 'flip_to_front' \}/);
  assert.match(renderer, /searchLine\(`converter:\$\{category\}`/);
  assert.match(renderer, /fileConverterPickSources\(\)/);
  assert.match(renderer, /fileConverterPause\(\)/);
  assert.match(renderer, /fileConverterResume\(\)/);
  assert.match(renderer, /fileConverterCancelAll\(\)/);
  assert.match(renderer, /PATH tools and network services never count/);
});
