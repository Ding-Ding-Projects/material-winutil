import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { OllamaHardwareService, parseOllamaGpuProbe, runBoundedOllamaGpuCommand } from '../../dist/main/ollama-hardware-service.js';

const gib = 1024 ** 3;

test('parses a bounded local GPU inventory without claiming available VRAM or Ollama support', () => {
  const parsed = parseOllamaGpuProbe(JSON.stringify([
    { Name: 'Example GPU', AdapterRAM: 8 * gib, DriverVersion: '31.0.1' },
    { Name: 'Integrated GPU', AdapterRAM: 2 * gib, DriverVersion: '30.0.2' },
  ]));
  assert.equal(parsed.gpuName, 'Example GPU · Integrated GPU');
  assert.equal(parsed.vramTotalBytes, 8 * gib);
  assert.equal(parsed.gpuDriver, '31.0.1 · 30.0.2');
  assert.equal(parsed.gpuSupported, null);
});

test('rejects malformed, oversized, unknown-field, control-character, and unsafe-number GPU output', () => {
  for (const value of [
    '', '{broken', JSON.stringify({ Name: 'GPU', Unexpected: true }),
    JSON.stringify({ Name: 'GPU\u0000', AdapterRAM: 1, DriverVersion: '1' }),
    JSON.stringify({ Name: 'GPU', AdapterRAM: -1, DriverVersion: '1' }),
    JSON.stringify(Array.from({ length: 17 }, () => ({ Name: 'GPU', AdapterRAM: 1, DriverVersion: '1' }))),
    'x'.repeat(256 * 1024 + 1),
  ]) assert.throws(() => parseOllamaGpuProbe(value));
});

test('collects RAM and disk independently while keeping GPU unknown on failure', async () => {
  const service = new OllamaHardwareService({
    platform: 'win32', now: () => new Date('2026-08-12T00:00:00Z'),
    totalMemory: () => 32 * gib, freeMemory: () => 24 * gib, homeDirectory: () => process.cwd(),
    statfs: async () => ({ bavail: 1000n, bsize: 4096n }), systemRoot: 'C:\\Windows',
    runGpuCommand: async (executable, args) => {
      assert.equal(executable, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
      assert.deepEqual(args.slice(0, 7), ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', "$ErrorActionPreference='Stop'; @(Get-CimInstance -ClassName Win32_VideoController | Select-Object -Property Name,AdapterRAM,DriverVersion) | ConvertTo-Json -Compress"]);
      return { stdout: '{broken', stderr: '', exitCode: 0 };
    },
  });
  const evidence = await service.detect();
  assert.equal(evidence.ramTotalBytes, 32 * gib);
  assert.equal(evidence.ramAvailableBytes, 24 * gib);
  assert.equal(evidence.diskFreeBytes, 4_096_000);
  assert.equal(evidence.gpuName, null);
  assert.equal(evidence.vramAvailableBytes, null);
  assert.equal(evidence.gpuSupported, null);
  assert.equal(evidence.probes.ram.state, 'available');
  assert.equal(evidence.probes.disk.state, 'available');
  assert.equal(evidence.probes.gpu.state, 'error');
});

test('reports unavailable GPU evidence on non-Windows and never runs a command', async () => {
  let called = false;
  const service = new OllamaHardwareService({
    platform: 'linux', totalMemory: () => 16 * gib, freeMemory: () => 8 * gib, homeDirectory: () => process.cwd(),
    statfs: async () => ({ bavail: 1n, bsize: 4096n }),
    runGpuCommand: async () => { called = true; throw new Error('must not run'); },
  });
  const evidence = await service.detect();
  assert.equal(called, false);
  assert.equal(evidence.probes.gpu.state, 'unavailable');
  assert.equal(evidence.gpuName, null);
});

test('invalid memory and disk counters fail closed without false zeroes', async () => {
  const service = new OllamaHardwareService({
    platform: 'linux', totalMemory: () => 1, freeMemory: () => 2, homeDirectory: () => process.cwd(),
    statfs: async () => ({ bavail: BigInt(Number.MAX_SAFE_INTEGER), bsize: 4096n }),
  });
  const evidence = await service.detect();
  assert.equal(evidence.ramTotalBytes, null);
  assert.equal(evidence.ramAvailableBytes, null);
  assert.equal(evidence.diskFreeBytes, null);
  assert.equal(evidence.probes.ram.state, 'error');
  assert.equal(evidence.probes.disk.state, 'error');
});

test('the command adapter kills a hung child at its fixed deadline', { timeout: 8_000 }, async () => {
  const started = Date.now();
  await assert.rejects(
    () => runBoundedOllamaGpuCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)']),
    /timed out after 5 seconds/u,
  );
  assert.ok(Date.now() - started >= 4_500);
  assert.ok(Date.now() - started < 7_500);
});

test('renderer wiring presents localized hardware facts and unknown states', async () => {
  const [renderer, main, preload, types] = await Promise.all([
    readFile(new URL('../../src/renderer/renderer.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/main/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/main/preload.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/shared/types.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(main, /ipcMain\.handle\('ollama:hardware'/u);
  assert.match(preload, /ipcRenderer\.invoke\('ollama:hardware'/u);
  assert.match(types, /ollamaHardware\(\): Promise<OllamaHardwareEvidence>/u);
  assert.match(renderer, /Local hardware evidence/u);
  assert.match(renderer, /本機硬件證據/u);
  assert.match(renderer, /Available VRAM/u);
  assert.match(renderer, /Unknown values remain unknown/u);
  assert.match(renderer, /bridge\(\)\.ollamaHardware\(\)/u);
});

test('smoke manifest has a controlled hardware-evidence state with no command execution', async () => {
  const manifest = JSON.parse(await readFile(new URL('../smoke/app-manifest.json', import.meta.url), 'utf8'));
  const capture = manifest.captures.find(({ id }) => id === 'ollama-hardware-evidence');
  assert.ok(capture);
  assert.match(capture.prepare, /vramAvailableBytes:null/u);
  assert.match(capture.prepare, /gpuSupported:null/u);
  assert.doesNotMatch(capture.prepare, /invoke|spawn|exec|fetch/u);
});
