import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const LOCAL_HISTORY_IDENTITY = Object.freeze({
  name: 'Material System Utility Local History',
  email: 'local-history@invalid',
});

export const LOCAL_HISTORY_ACTIONS = [
  'created',
  'updated',
  'deleted',
  'restored',
  'imported',
  'settings-changed',
] as const;

export type LocalHistoryAction = (typeof LOCAL_HISTORY_ACTIONS)[number];
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface SnapshotDocument {
  schemaVersion: 1;
  metadata: {
    action: LocalHistoryAction;
    recordedAt: string;
    revisionId: string;
    restoredFrom?: string;
    label?: string;
  };
  snapshot: JsonValue;
}

export interface LocalHistoryEntry {
  commit: string;
  action: LocalHistoryAction;
  recordedAt: string;
  revisionId: string;
  restoredFrom?: string;
  label?: string;
}

export interface LocalHistorySearch {
  actions?: readonly LocalHistoryAction[];
  from?: Date | string;
  to?: Date | string;
  limit?: number;
  query?: string;
  regex?: { source: string; flags: string };
}

export interface LocalHistoryOptions {
  appDataDirectory: string;
  repositoryDirectoryName?: string;
}

const SNAPSHOT_FILE = 'snapshot.json';
const MAX_HISTORY_RESULTS = 500;
const MAX_JSON_DEPTH = 32;
const MAX_JSON_NODES = 50_000;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const SENSITIVE_KEYS = new Set([
  'accesstoken', 'apikey', 'auth', 'authorization', 'bearer', 'credential', 'credentials',
  'password', 'passcode', 'pin', 'privatekey', 'refreshtoken', 'secret', 'sessiontoken',
  'token', 'totp', 'otp',
]);
const SECRET_VALUE = /^(?:otpauth:\/\/|-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|bearer\s+)/i;

function parseDate(value: Date | string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error(`${name} must be a valid date`);
  return milliseconds;
}

function assertRedactedJson(value: JsonValue): void {
  let nodes = 0;

  const visit = (candidate: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > MAX_JSON_NODES) throw new Error('Redacted snapshot exceeds the node limit');
    if (depth > MAX_JSON_DEPTH) throw new Error('Redacted snapshot exceeds the nesting limit');
    if (typeof candidate === 'number' && !Number.isFinite(candidate)) {
      throw new Error('Redacted snapshots may contain only finite numbers');
    }
    if (candidate === undefined || typeof candidate === 'bigint' || typeof candidate === 'function' || typeof candidate === 'symbol') {
      throw new Error('Redacted snapshots may contain only JSON values');
    }
    if (typeof candidate === 'string' && SECRET_VALUE.test(candidate)) {
      throw new Error('Redacted snapshots must not contain authentication secrets');
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item, depth + 1);
      return;
    }
    if (candidate !== null && typeof candidate === 'object') {
      for (const [key, item] of Object.entries(candidate)) {
        const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
        if (SENSITIVE_KEYS.has(normalizedKey)) {
          throw new Error(`Redacted snapshots must not contain the sensitive field "${key}"`);
        }
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          throw new Error(`Redacted snapshots must not contain the unsafe field "${key}"`);
        }
        visit(item, depth + 1);
      }
    }
  };

  visit(value, 0);
  const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (bytes > MAX_JSON_BYTES) throw new Error('Redacted snapshot exceeds the byte limit');
}

function parseSnapshotDocument(text: string): SnapshotDocument {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid local history snapshot');
  const document = value as Partial<SnapshotDocument>;
  if (document.schemaVersion !== 1 || !document.metadata || !('snapshot' in document)) {
    throw new Error('Unsupported local history snapshot');
  }
  const { action, recordedAt, revisionId, restoredFrom } = document.metadata;
  if (!LOCAL_HISTORY_ACTIONS.includes(action) || !Number.isFinite(Date.parse(recordedAt)) ||
      !/^[0-9a-f-]{36}$/i.test(revisionId) || (restoredFrom !== undefined && !/^[0-9a-f]{40}$/i.test(restoredFrom))) {
    throw new Error('Invalid local history metadata');
  }
  assertRedactedJson(document.snapshot as JsonValue);
  return document as SnapshotDocument;
}

export class LocalHistory {
  readonly repositoryDirectory: string;
  private operation: Promise<unknown> = Promise.resolve();

  constructor(options: LocalHistoryOptions) {
    if (!path.isAbsolute(options.appDataDirectory)) {
      throw new Error('appDataDirectory must be an absolute path');
    }
    const directoryName = options.repositoryDirectoryName ?? 'local-history';
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(directoryName)) {
      throw new Error('repositoryDirectoryName is invalid');
    }
    this.repositoryDirectory = path.join(options.appDataDirectory, directoryName);
  }

  async initialize(): Promise<void> {
    await this.enqueue(async () => this.initializeUnlocked());
  }

  async recordRedactedSnapshot(action: Exclude<LocalHistoryAction, 'restored'>, snapshot: JsonValue): Promise<LocalHistoryEntry> {
    return this.enqueue(async () => {
      await this.initializeUnlocked();
      assertRedactedJson(snapshot);
      return this.commitSnapshot(action, snapshot);
    });
  }

  async restore(revision: string): Promise<LocalHistoryEntry> {
    return this.enqueue(async () => {
      await this.initializeUnlocked();
      if (!/^[0-9a-f]{7,40}$/i.test(revision)) throw new Error('Revision must be a Git commit identifier');
      const fullRevision = (await this.git(['rev-parse', '--verify', `${revision}^{commit}`])).trim();
      const isAncestor = await this.gitExitCode(['merge-base', '--is-ancestor', fullRevision, 'HEAD']);
      if (isAncestor !== 0) throw new Error('Revision is not part of local history');
      const document = parseSnapshotDocument(await this.git(['show', `${fullRevision}:${SNAPSHOT_FILE}`]));
      return this.commitSnapshot('restored', document.snapshot, fullRevision);
    });
  }

  async currentSnapshot(): Promise<JsonValue | undefined> {
    return this.enqueue(async () => {
      await this.initializeUnlocked();
      if (!(await this.hasCommits())) return undefined;
      return parseSnapshotDocument(await readFile(path.join(this.repositoryDirectory, SNAPSHOT_FILE), 'utf8')).snapshot;
    });
  }

  async search(search: LocalHistorySearch = {}): Promise<LocalHistoryEntry[]> {
    return this.enqueue(async () => {
      await this.initializeUnlocked();
      if (!(await this.hasCommits())) return [];
      const limit = search.limit ?? 100;
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_HISTORY_RESULTS) {
        throw new Error(`limit must be between 1 and ${MAX_HISTORY_RESULTS}`);
      }
      const from = parseDate(search.from, 'from');
      const to = parseDate(search.to, 'to');
      if (from !== undefined && to !== undefined && from > to) throw new Error('from must not be later than to');
      const actions = search.actions === undefined ? undefined : new Set(search.actions);
      if (actions && [...actions].some((action) => !LOCAL_HISTORY_ACTIONS.includes(action))) {
        throw new Error('actions contains an unsupported action');
      }
      const query = search.query?.trim().toLocaleLowerCase('en-US') ?? '';
      if (query.length > 1_024) throw new Error('query exceeds 1024 characters');
      let regex: RegExp | undefined;
      if (search.regex !== undefined) {
        if (search.regex.source.length > 512 || /\([^)]*[+*][^)]*\)[+*{]/u.test(search.regex.source)) throw new Error('regex pattern is too large or unsafe');
        if (!/^(?:[dgimsuvy]{0,8})$/u.test(search.regex.flags) || new Set(search.regex.flags).size !== search.regex.flags.length) throw new Error('regex flags are invalid');
        regex = new RegExp(search.regex.source, search.regex.flags);
      }

      const commits = (await this.git(['log', '--format=%H', `--max-count=${MAX_HISTORY_RESULTS}`]))
        .split(/\r?\n/).filter(Boolean);
      const entries: LocalHistoryEntry[] = [];
      for (const commit of commits) {
        const document = parseSnapshotDocument(await this.git(['show', `${commit}:${SNAPSHOT_FILE}`]));
        const recordedAt = Date.parse(document.metadata.recordedAt);
        if (actions && !actions.has(document.metadata.action)) continue;
        if (from !== undefined && recordedAt < from) continue;
        if (to !== undefined && recordedAt > to) continue;
        const entry = { commit, ...document.metadata };
        const searchable = `${entry.action} ${entry.recordedAt} ${entry.revisionId} ${entry.restoredFrom ?? ''} ${entry.label ?? ''}`;
        if (query && !searchable.toLocaleLowerCase('en-US').includes(query)) continue;
        if (regex && !regex.test(searchable)) continue;
        entries.push(entry);
        if (entries.length === limit) break;
      }
      return entries;
    });
  }

  async snapshot(revision: string): Promise<JsonValue> {
    return this.enqueue(async () => {
      await this.initializeUnlocked();
      const fullRevision = await this.resolveRevision(revision);
      return parseSnapshotDocument(await this.git(['show', `${fullRevision}:${SNAPSHOT_FILE}`])).snapshot;
    });
  }

  async label(revision: string, label: string): Promise<LocalHistoryEntry> {
    return this.enqueue(async () => {
      await this.initializeUnlocked();
      const fullRevision = await this.resolveRevision(revision);
      const cleanLabel = label.trim();
      if (!cleanLabel || cleanLabel.length > 120 || /[\x00-\x1f\x7f]/u.test(cleanLabel)) throw new Error('Label must be a bounded single-line value');
      const document = parseSnapshotDocument(await this.git(['show', `${fullRevision}:${SNAPSHOT_FILE}`]));
      return this.commitSnapshot('updated', document.snapshot, undefined, cleanLabel);
    });
  }

  async prune(keep: number): Promise<LocalHistoryEntry> {
    return this.enqueue(async () => {
      await this.initializeUnlocked();
      if (!Number.isInteger(keep) || keep < 10 || keep > MAX_HISTORY_RESULTS) throw new Error('keep must be between 10 and 500');
      const snapshot = await this.hasCommits()
        ? parseSnapshotDocument(await readFile(path.join(this.repositoryDirectory, SNAPSHOT_FILE), 'utf8')).snapshot
        : {};
      return this.commitSnapshot('settings-changed', snapshot, undefined, `Retention: keep ${keep}`);
    });
  }

  private async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operation.then(operation, operation);
    this.operation = result.then(() => undefined, () => undefined);
    return result;
  }

  private async initializeUnlocked(): Promise<void> {
    await mkdir(this.repositoryDirectory, { recursive: true });
    if (await this.gitExitCode(['rev-parse', '--git-dir']) !== 0) {
      await this.git(['init', '--initial-branch=main']);
    }
    await this.git(['config', '--local', 'user.name', LOCAL_HISTORY_IDENTITY.name]);
    await this.git(['config', '--local', 'user.email', LOCAL_HISTORY_IDENTITY.email]);
    await this.git(['config', '--local', 'commit.gpgSign', 'false']);
    await mkdir(path.join(this.repositoryDirectory, '.disabled-hooks'), { recursive: true });
    await this.git(['config', '--local', 'core.hooksPath', '.disabled-hooks']);
    await this.assertNoRemote();
  }

  private async commitSnapshot(action: LocalHistoryAction, snapshot: JsonValue, restoredFrom?: string, label?: string): Promise<LocalHistoryEntry> {
    await this.assertNoRemote();
    const metadata: SnapshotDocument['metadata'] = {
      action,
      recordedAt: new Date().toISOString(),
      revisionId: randomUUID(),
      ...(restoredFrom ? { restoredFrom } : {}),
      ...(label ? { label } : {}),
    };
    const document: SnapshotDocument = { schemaVersion: 1, metadata, snapshot };
    await this.atomicWrite(JSON.stringify(document, null, 2) + '\n');
    await this.git(['add', '--', SNAPSHOT_FILE]);
    const staged = await this.gitExitCode(['diff', '--cached', '--quiet', '--', SNAPSHOT_FILE]);
    if (staged === 0) throw new Error('Snapshot did not change local history');
    await this.git(['-c', 'commit.gpgSign=false', '-c', 'core.hooksPath=.disabled-hooks', 'commit', '--quiet', '-m', `Local history: ${action}`]);
    const commit = (await this.git(['rev-parse', 'HEAD'])).trim();
    return { commit, ...metadata };
  }

  private async resolveRevision(revision: string): Promise<string> {
    if (!/^[0-9a-f]{7,40}$/i.test(revision)) throw new Error('Revision must be a Git commit identifier');
    const fullRevision = (await this.git(['rev-parse', '--verify', `${revision}^{commit}`])).trim();
    if (await this.gitExitCode(['merge-base', '--is-ancestor', fullRevision, 'HEAD']) !== 0) throw new Error('Revision is not part of local history');
    return fullRevision;
  }

  private async atomicWrite(contents: string): Promise<void> {
    const target = path.join(this.repositoryDirectory, SNAPSHOT_FILE);
    const temporary = path.join(this.repositoryDirectory, `.${SNAPSHOT_FILE}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private async hasCommits(): Promise<boolean> {
    return (await this.gitExitCode(['rev-parse', '--verify', 'HEAD'])) === 0;
  }

  private async assertNoRemote(): Promise<void> {
    if ((await this.git(['remote'])).trim()) throw new Error('Local history repository must not have a remote');
  }

  private async git(args: readonly string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', [...args], {
      cwd: this.repositoryDirectory,
      windowsHide: true,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      timeout: 30_000,
    });
    return stdout;
  }

  private async gitExitCode(args: readonly string[]): Promise<number> {
    try {
      await this.git(args);
      return 0;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException & { code?: number | string }).code;
      return typeof code === 'number' ? code : 1;
    }
  }
}
