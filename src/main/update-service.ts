import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { UpdateRestartRequest, UpdateRestartResult, UpdateStatus } from '../shared/types';

export const UPDATE_FEED_URL = 'https://github.com/Ding-Ding-Projects/material-winutil/releases/latest/download/';
export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
export const UPDATE_METADATA_LIMIT = 256 * 1024;

type UpdateEvent = 'checking-for-update' | 'update-available' | 'update-not-available' | 'error' | 'update-downloaded';

export interface UpdateAdapter {
  setFeedURL(options: { url: string }): void;
  checkForUpdates(): Promise<unknown> | void;
  quitAndInstall(): void;
  on(event: UpdateEvent, listener: (...args: unknown[]) => void): void;
}

export interface UpdateServiceDependencies {
  adapter: UpdateAdapter;
  packaged: boolean;
  platform: NodeJS.Platform;
  currentVersion: string;
  userDataDirectory: string;
  fetchMetadata?: (url: string, signal: AbortSignal) => Promise<Uint8Array>;
  setTimeout?: (callback: () => void, delay: number) => unknown;
  setInterval?: (callback: () => void, delay: number) => unknown;
  onStatus?: (status: UpdateStatus) => void;
}

interface PersistedUpdateState {
  schemaVersion: 1;
  deferredVersion?: string;
  pendingRestart?: { fromVersion: string; targetVersion: string; requestedAt: string };
}

function initialStatus(packaged: boolean, currentVersion: string): UpdateStatus {
  return {
    state: packaged ? 'idle' : 'disabled', currentVersion, updateVersion: '', progressPercent: null,
    message: packaged ? 'Automatic update checks are enabled.' : 'Update checks run only in an installed build.',
    releaseUrl: 'https://github.com/Ding-Ding-Projects/material-winutil/releases/latest',
    canCancel: false, deferred: false,
  };
}

export function validateUpdateFeedUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('The update feed must be a credential-free HTTPS URL.');
  if (url.href !== UPDATE_FEED_URL) throw new Error('The update feed does not match the fixed application feed.');
  return url;
}

export function validateSquirrelReleasesMetadata(bytes: Uint8Array): void {
  if (!bytes.byteLength || bytes.byteLength > UPDATE_METADATA_LIMIT) throw new Error('The Squirrel RELEASES metadata is empty or exceeds 256 KiB.');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const lines = text.split(/\r?\n/u).filter(Boolean);
  if (!lines.length || lines.length > 512) throw new Error('The Squirrel RELEASES metadata has an invalid entry count.');
  for (const line of lines) {
    const match = /^([0-9a-f]{40})\s+([^\s]+\.nupkg)\s+([1-9][0-9]{0,11})$/iu.exec(line);
    if (!match || match[2].includes('/') || match[2].includes('\\') || match[2].includes('..')) throw new Error('The Squirrel RELEASES metadata is malformed.');
  }
}

async function defaultFetchMetadata(url: string, signal: AbortSignal): Promise<Uint8Array> {
  let target = new URL('RELEASES', url);
  let response: Response | null = null;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    response = await fetch(target, { signal, redirect: 'manual', cache: 'no-store', credentials: 'omit' });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    if (redirect === 3) throw new Error('The update feed exceeded its redirect boundary.');
    const location = response.headers.get('location');
    if (!location) throw new Error('The update feed returned a redirect without a location.');
    const next = new URL(location, target);
    if (next.protocol !== 'https:' || next.username || next.password
      || !['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'].includes(next.hostname)) {
      throw new Error('The update feed redirected outside its allowlisted HTTPS hosts.');
    }
    target = next;
  }
  if (!response) throw new Error('The update feed did not return a response.');
  if (!response.ok) throw new Error(`The update feed returned HTTP ${response.status}.`);
  const length = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > UPDATE_METADATA_LIMIT) throw new Error('The update metadata exceeds 256 KiB.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > UPDATE_METADATA_LIMIT) throw new Error('The update metadata exceeds 256 KiB.');
  return bytes;
}

export class UpdateService {
  private statusValue: UpdateStatus;
  private readonly stateFile: string;
  private checking: Promise<UpdateStatus> | null = null;
  private controller: AbortController | null = null;
  private generation = 0;
  private persisted: PersistedUpdateState = { schemaVersion: 1 };

  constructor(private readonly dependencies: UpdateServiceDependencies) {
    this.statusValue = initialStatus(dependencies.packaged, dependencies.currentVersion);
    this.stateFile = path.join(dependencies.userDataDirectory, 'application-update-state.v1.json');
  }

  status(): UpdateStatus { return Object.freeze({ ...this.statusValue }); }

  private setStatus(patch: Partial<UpdateStatus>): UpdateStatus {
    this.statusValue = { ...this.statusValue, ...patch };
    this.dependencies.onStatus?.(this.status());
    return this.status();
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.stateFile), { recursive: true });
    const temporary = `${this.stateFile}.${process.pid}.${Date.now()}.${createHash('sha256').update(JSON.stringify(this.persisted)).digest('hex').slice(0, 12)}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(this.persisted)}\n`, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temporary, this.stateFile);
  }

  private async loadPersisted(): Promise<void> {
    try {
      const raw = await fs.readFile(this.stateFile, 'utf8');
      if (Buffer.byteLength(raw, 'utf8') > 16 * 1024) throw new Error('oversized update state');
      const parsed = JSON.parse(raw) as PersistedUpdateState;
      if (parsed.schemaVersion !== 1) throw new Error('unsupported update state');
      this.persisted = parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.persisted = { schemaVersion: 1 };
    }
  }

  async initialize(): Promise<UpdateStatus> {
    await this.loadPersisted();
    const pending = this.persisted.pendingRestart;
    if (pending) {
      delete this.persisted.pendingRestart;
      await this.persist();
      if (this.dependencies.currentVersion === pending.targetVersion) {
        this.setStatus({ state: 'up-to-date', updateVersion: '', deferred: false, message: `Version ${pending.targetVersion} was installed successfully.` });
      } else {
        this.setStatus({ state: 'rolled-back', updateVersion: pending.targetVersion, deferred: false, message: `The attempted update to ${pending.targetVersion} did not replace ${this.dependencies.currentVersion}; the previous version remains active.` });
      }
    }
    if (!this.dependencies.packaged || this.dependencies.platform !== 'win32') return this.status();
    validateUpdateFeedUrl(UPDATE_FEED_URL);
    this.dependencies.adapter.setFeedURL({ url: UPDATE_FEED_URL });
    this.bindAdapter();
    const timeout = this.dependencies.setTimeout ?? globalThis.setTimeout;
    const interval = this.dependencies.setInterval ?? globalThis.setInterval;
    timeout(() => { void this.check(); }, 15_000);
    interval(() => { void this.check(); }, UPDATE_CHECK_INTERVAL_MS);
    return this.status();
  }

  private bindAdapter(): void {
    this.dependencies.adapter.on('checking-for-update', () => {
      if (this.statusValue.state !== 'ready') this.setStatus({ state: 'checking', canCancel: true, message: 'Checking the unsigned HTTPS update feed…' });
    });
    this.dependencies.adapter.on('update-available', () => this.setStatus({ state: 'downloading', canCancel: false, progressPercent: null, message: 'The validated update is downloading in the background.' }));
    this.dependencies.adapter.on('update-not-available', () => this.setStatus({ state: 'up-to-date', updateVersion: '', progressPercent: null, canCancel: false, deferred: false, message: 'This is the latest published version.' }));
    this.dependencies.adapter.on('error', (error) => this.fail(error));
    this.dependencies.adapter.on('update-downloaded', (_event, releaseNotes, releaseName) => {
      const version = String(releaseName ?? '').replace(/^v/u, '').slice(0, 64);
      this.setStatus({ state: 'ready', updateVersion: version, progressPercent: 100, canCancel: false,
        deferred: this.persisted.deferredVersion === version,
        message: typeof releaseNotes === 'string' ? releaseNotes.slice(0, 240) : 'The update is ready to install.' });
    });
  }

  private fail(error: unknown): UpdateStatus {
    const raw = error instanceof Error ? error.message : String(error);
    const message = /hash|checksum|corrupt/iu.test(raw) ? `Update package integrity validation failed: ${raw}` : raw;
    return this.setStatus({ state: 'error', canCancel: false, progressPercent: null, message });
  }

  check(): Promise<UpdateStatus> {
    if (!this.dependencies.packaged || this.dependencies.platform !== 'win32') return Promise.resolve(this.status());
    if (this.statusValue.state === 'ready') return Promise.resolve(this.status());
    if (this.checking) return this.checking;
    const generation = ++this.generation;
    this.controller = new AbortController();
    this.setStatus({ state: 'checking', canCancel: true, deferred: false, progressPercent: null, message: 'Validating the unsigned HTTPS update feed…' });
    this.checking = (async () => {
      try {
        const bytes = await (this.dependencies.fetchMetadata ?? defaultFetchMetadata)(UPDATE_FEED_URL, this.controller!.signal);
        validateSquirrelReleasesMetadata(bytes);
        if (generation !== this.generation || this.controller?.signal.aborted) return this.status();
        await this.dependencies.adapter.checkForUpdates();
      } catch (error) {
        if (generation === this.generation) {
          if ((error as Error).name === 'AbortError') this.setStatus({ state: 'cancelled', canCancel: false, message: 'The update check was cancelled before download began.' });
          else this.fail(error);
        }
      } finally {
        if (generation === this.generation) { this.checking = null; this.controller = null; }
      }
      return this.status();
    })();
    return this.checking;
  }

  cancel(): UpdateStatus {
    if (!this.controller || this.statusValue.state !== 'checking') return this.status();
    this.generation += 1;
    this.controller.abort();
    this.controller = null;
    this.checking = null;
    return this.setStatus({ state: 'cancelled', canCancel: false, message: 'The update check was cancelled before download began.' });
  }

  async defer(): Promise<UpdateStatus> {
    if (this.statusValue.state !== 'ready') return this.status();
    this.persisted.deferredVersion = this.statusValue.updateVersion;
    await this.persist();
    return this.setStatus({ deferred: true, message: 'The update remains ready. Restart when your work is saved.' });
  }

  async restart(request: UpdateRestartRequest): Promise<UpdateRestartResult> {
    if (this.statusValue.state !== 'ready') return { status: 'not-ready' };
    const unsaved = [...new Set((request.unsavedWork ?? []).filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim().slice(0, 120)))].slice(0, 32);
    if (unsaved.length && !request.confirmDiscard) return { status: 'unsaved-work', unsavedWork: unsaved };
    this.persisted.pendingRestart = { fromVersion: this.dependencies.currentVersion, targetVersion: this.statusValue.updateVersion, requestedAt: new Date().toISOString() };
    delete this.persisted.deferredVersion;
    await this.persist();
    this.dependencies.adapter.quitAndInstall();
    return { status: 'restarting' };
  }
}
