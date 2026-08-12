import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { OllamaHardwareEvidence, OllamaHardwareProbeState } from '../shared/ollama-suite';

const GPU_OUTPUT_LIMIT = 256 * 1024;
const GPU_TIMEOUT_MS = 5_000;
const MAX_GPU_RECORDS = 16;
const MAX_TEXT_LENGTH = 240;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;

interface GpuRecord {
  Name?: unknown;
  AdapterRAM?: unknown;
  DriverVersion?: unknown;
}

export interface OllamaGpuCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface OllamaHardwareServiceDependencies {
  platform?: NodeJS.Platform;
  now?: () => Date;
  totalMemory?: () => number;
  freeMemory?: () => number;
  homeDirectory?: () => string;
  systemRoot?: string;
  statfs?: (target: string) => Promise<{ bavail: number | bigint; bsize: number | bigint }>;
  runGpuCommand?: (executable: string, args: readonly string[]) => Promise<OllamaGpuCommandResult>;
}

function safeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= MAX_TEXT_LENGTH && !CONTROL.test(trimmed) ? trimmed : null;
}

function safeBytes(value: unknown): number | null {
  const numeric = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
  return typeof numeric === 'number' && Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : null;
}

export function parseOllamaGpuProbe(output: string): {
  gpuName: string | null;
  vramTotalBytes: number | null;
  gpuDriver: string | null;
  gpuSupported: boolean | null;
  recordCount: number;
} {
  if (!output || Buffer.byteLength(output, 'utf8') > GPU_OUTPUT_LIMIT || CONTROL.test(output.replace(/[\r\n\t]/gu, ''))) {
    throw new Error('The local GPU inventory output is empty, oversized, or contains control characters.');
  }
  let decoded: unknown;
  try { decoded = JSON.parse(output); }
  catch { throw new Error('The local GPU inventory returned malformed JSON.'); }
  const records: unknown[] = Array.isArray(decoded) ? decoded : [decoded];
  if (!records.length || records.length > MAX_GPU_RECORDS) throw new Error('The local GPU inventory count is outside the supported boundary.');
  const parsed = records.map((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('The local GPU inventory record is invalid.');
    const item = record as GpuRecord;
    const keys = Object.keys(item);
    if (keys.some((key) => !['Name', 'AdapterRAM', 'DriverVersion'].includes(key))) throw new Error('The local GPU inventory record contains an unknown field.');
    const name = safeText(item.Name);
    if (!name) throw new Error('The local GPU inventory record has no valid name.');
    const vram = item.AdapterRAM === null || item.AdapterRAM === undefined ? null : safeBytes(item.AdapterRAM);
    if (item.AdapterRAM !== null && item.AdapterRAM !== undefined && vram === null) throw new Error('The local GPU inventory record has invalid adapter memory.');
    return { name, driver: safeText(item.DriverVersion), vram };
  });
  const named = [...new Set(parsed.map(({ name }) => name))];
  const drivers = [...new Set(parsed.map(({ driver }) => driver).filter((item): item is string => item !== null))];
  const vram = parsed.map(({ vram }) => vram).filter((item): item is number => item !== null && item > 0);
  // Win32_VideoController reports adapter identity, driver and a best-effort
  // total-memory value. It does not prove available VRAM or an Ollama backend,
  // so accelerator support deliberately remains unknown.
  return {
    gpuName: named.join(' · ').slice(0, MAX_TEXT_LENGTH),
    vramTotalBytes: vram.length ? Math.max(...vram) : null,
    gpuDriver: drivers.length ? drivers.join(' · ').slice(0, MAX_TEXT_LENGTH) : null,
    gpuSupported: null,
    recordCount: parsed.length,
  };
}

export async function runBoundedOllamaGpuCommand(executable: string, args: readonly string[]): Promise<OllamaGpuCommandResult> {
  return new Promise((resolve, reject) => {
    const safeEnvironment: NodeJS.ProcessEnv = {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
    };
    const child = spawn(executable, [...args], { windowsHide: true, shell: false, env: safeEnvironment, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (error?: Error, result?: OllamaGpuCommandResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error); else resolve(result!);
    };
    const collect = (target: 'stdout' | 'stderr', chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > GPU_OUTPUT_LIMIT) {
        child.kill();
        finish(new Error('The local GPU inventory exceeded 256 KiB.'));
        return;
      }
      if (target === 'stdout') stdout += chunk.toString('utf8'); else stderr += chunk.toString('utf8');
    };
    child.stdout.on('data', (chunk: Buffer) => collect('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => collect('stderr', chunk));
    child.once('error', (error) => finish(error));
    child.once('close', (exitCode) => finish(undefined, { stdout, stderr, exitCode: exitCode ?? -1 }));
    timer = setTimeout(() => {
      child.kill();
      finish(new Error('The local GPU inventory timed out after 5 seconds.'));
    }, GPU_TIMEOUT_MS);
  });
}

function state(state: OllamaHardwareProbeState['state'], message: string): OllamaHardwareProbeState {
  return { state, message: message.slice(0, 500) };
}

export class OllamaHardwareService {
  private readonly platform: NodeJS.Platform;
  private readonly now: () => Date;
  private readonly totalMemory: () => number;
  private readonly freeMemory: () => number;
  private readonly homeDirectory: () => string;
  private readonly statfs: NonNullable<OllamaHardwareServiceDependencies['statfs']>;
  private readonly runGpuCommand: NonNullable<OllamaHardwareServiceDependencies['runGpuCommand']>;
  private readonly systemRoot: string;

  constructor(dependencies: OllamaHardwareServiceDependencies = {}) {
    this.platform = dependencies.platform ?? process.platform;
    this.now = dependencies.now ?? (() => new Date());
    this.totalMemory = dependencies.totalMemory ?? os.totalmem;
    this.freeMemory = dependencies.freeMemory ?? os.freemem;
    this.homeDirectory = dependencies.homeDirectory ?? os.homedir;
    this.statfs = dependencies.statfs ?? ((target) => fs.statfs(target, { bigint: true }));
    this.runGpuCommand = dependencies.runGpuCommand ?? runBoundedOllamaGpuCommand;
    this.systemRoot = dependencies.systemRoot ?? process.env.SystemRoot ?? 'C:\\Windows';
  }

  async detect(): Promise<OllamaHardwareEvidence> {
    let ramTotalBytes: number | null = null;
    let ramAvailableBytes: number | null = null;
    let ram = state('error', 'Memory evidence could not be read.');
    try {
      const total = safeBytes(this.totalMemory());
      const available = safeBytes(this.freeMemory());
      if (total === null || total <= 0 || available === null || available > total) throw new Error('invalid memory counters');
      ramTotalBytes = total;
      ramAvailableBytes = available;
      ram = state('available', 'Physical memory totals came from the local Node operating-system API.');
    } catch { ram = state('error', 'Physical memory counters were unavailable or invalid; no memory figure was guessed.'); }

    let diskFreeBytes: number | null = null;
    let disk = state('error', 'Model-storage disk evidence could not be read.');
    try {
      const target = await this.existingAncestor(path.resolve(this.homeDirectory(), '.ollama', 'models'));
      const result = await this.statfs(target);
      const free = BigInt(result.bavail) * BigInt(result.bsize);
      if (free < 0n || free > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('invalid free-space counter');
      diskFreeBytes = Number(free);
      disk = state('available', 'Free space came from the local file system containing the default Ollama model directory.');
    } catch { disk = state('error', 'Free space for the default Ollama model directory was unavailable; no disk figure was guessed.'); }

    let gpuName: string | null = null;
    let vramTotalBytes: number | null = null;
    const vramAvailableBytes: number | null = null;
    let gpuDriver: string | null = null;
    let gpuSupported: boolean | null = null;
    let gpu = state('unavailable', 'GPU evidence is available only on Windows.');
    if (this.platform === 'win32') {
      try {
        const executable = path.resolve(this.systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
        const script = "$ErrorActionPreference='Stop'; @(Get-CimInstance -ClassName Win32_VideoController | Select-Object -Property Name,AdapterRAM,DriverVersion) | ConvertTo-Json -Compress";
        const result = await this.runGpuCommand(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);
        if (result.exitCode !== 0) throw new Error(`inventory exited ${result.exitCode}: ${result.stderr.slice(0, 240)}`);
        const parsed = parseOllamaGpuProbe(result.stdout);
        ({ gpuName, vramTotalBytes, gpuDriver, gpuSupported } = parsed);
        gpu = state('available', 'GPU identity, driver, and reported total adapter memory came from Win32_VideoController. Available VRAM and Ollama backend support remain unknown.');
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'unknown GPU inventory failure';
        gpu = state('error', `GPU evidence was unavailable: ${detail.slice(0, 300)} No GPU figure was guessed.`);
      }
    }

    return {
      detectedAt: this.now().toISOString(), ramTotalBytes, ramAvailableBytes, gpuName, vramTotalBytes,
      vramAvailableBytes, gpuDriver, gpuSupported, diskFreeBytes, probes: { ram, disk, gpu },
    };
  }

  private async existingAncestor(target: string): Promise<string> {
    let candidate = target;
    while (true) {
      try { await fs.stat(candidate); return candidate; }
      catch {
        const parent = path.dirname(candidate);
        if (parent === candidate) throw new Error('No existing model-storage ancestor was found.');
        candidate = parent;
      }
    }
  }
}
