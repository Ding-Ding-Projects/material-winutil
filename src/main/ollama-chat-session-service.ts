import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  OLLAMA_LIMITS,
  validateOllamaChatSessionCreate,
  validateOllamaChatSessionDelete,
  validateOllamaChatSessionGet,
  validateOllamaChatSessionList,
  validateOllamaChatSessionRename,
  validateOllamaChatSessionUpdate,
  validateOllamaModelName,
  type OllamaChatSessionCreateRequest,
  type OllamaChatSessionDetail,
  type OllamaChatSessionSummary,
  type OllamaChatSessionUpdateRequest,
  type OllamaPersistedChatMessage,
} from '../shared/ollama-suite';

const SCHEMA_VERSION = 1 as const;
const FILE_NAME = 'ollama-chat-sessions.v1.json';
const SECRET_PATTERN = /(?:bearer\s+|api[_-]?key\s*[:=]\s*|token\s*[:=]\s*|password\s*[:=]\s*)[^\s,;]+/giu;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

interface PersistedSession {
  id: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messages: OllamaPersistedChatMessage[];
}

interface PersistedStore {
  schemaVersion: 1;
  sessions: PersistedSession[];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Stored chat-session state is invalid.');
  const record = value as Record<string, unknown>;
  const prototype = Object.getPrototypeOf(record);
  if (prototype !== Object.prototype && prototype !== null) throw new Error('Stored chat-session state is invalid.');
  return record;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new Error('Stored chat-session state has unexpected fields.');
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && ISO_TIME.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function cleanContent(content: string): string {
  return content.replace(SECRET_PATTERN, '[redacted]');
}

function cleanTitle(title: string): string {
  const cleaned = cleanContent(title).trim();
  if (!cleaned || Buffer.byteLength(cleaned, 'utf8') > OLLAMA_LIMITS.chatSessionTitleBytes) throw new Error('Chat session title is invalid.');
  return cleaned;
}

function summary(session: PersistedSession): OllamaChatSessionSummary {
  return {
    id: session.id,
    title: session.title,
    model: session.model,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
  };
}

function detail(session: PersistedSession): OllamaChatSessionDetail {
  return {
    ...summary(session),
    // System prompts are intentionally ephemeral: they can carry credentials.
    systemPrompt: '',
    messages: session.messages.map(({ role, content }) => ({ role, content })),
  };
}

function titleFor(model: string, id: string): string {
  const base = `Chat · ${model}`;
  return Buffer.byteLength(base, 'utf8') <= OLLAMA_LIMITS.chatSessionTitleBytes
    ? base
    : `Chat · ${id.slice(0, 8)}`;
}

function decodeStore(value: unknown): PersistedStore {
  const store = asRecord(value);
  exactKeys(store, ['schemaVersion', 'sessions']);
  if (store.schemaVersion !== SCHEMA_VERSION || !Array.isArray(store.sessions) || store.sessions.length > OLLAMA_LIMITS.chatSessions) {
    throw new Error('Stored chat-session state is invalid.');
  }
  const sessions = store.sessions.map((entry): PersistedSession => {
    const item = asRecord(entry);
    exactKeys(item, ['id', 'title', 'model', 'createdAt', 'updatedAt', 'messages']);
    if (typeof item.id !== 'string' || !SESSION_ID.test(item.id) || typeof item.title !== 'string' || !item.title
      || Buffer.byteLength(item.title, 'utf8') > OLLAMA_LIMITS.chatSessionTitleBytes || !validTimestamp(item.createdAt) || !validTimestamp(item.updatedAt)) {
      throw new Error('Stored chat-session state is invalid.');
    }
    const update = validateOllamaChatSessionUpdate({ id: item.id, model: item.model, messages: item.messages });
    return {
      id: update.id,
      title: cleanTitle(item.title),
      model: update.model ?? validateOllamaModelName(item.model),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      messages: (update.messages ?? []).map(({ role, content }) => ({ role, content: cleanContent(content) })),
    };
  });
  if (new Set(sessions.map(({ id }) => id)).size !== sessions.length) throw new Error('Stored chat-session state has duplicate identifiers.');
  return { schemaVersion: SCHEMA_VERSION, sessions };
}

async function atomicWrite(file: string, value: PersistedStore): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const body = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(body, 'utf8') > OLLAMA_LIMITS.chatSessionStoreBytes) throw new Error('Chat-session storage exceeds its safety limit.');
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, body, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try { await fs.rename(temporary, file); }
  catch (error) { await fs.rm(temporary, { force: true }); throw error; }
}

export class OllamaChatSessionService {
  private readonly file: string;
  private store: PersistedStore = { schemaVersion: SCHEMA_VERSION, sessions: [] };
  private writeQueue: Promise<void> = Promise.resolve();
  private operation: Promise<void> = Promise.resolve();

  constructor(options: { userDataDirectory: string; now?: () => Date }) {
    this.file = path.join(options.userDataDirectory, FILE_NAME);
    this.now = options.now ?? (() => new Date());
  }

  private readonly now: () => Date;

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      if (Buffer.byteLength(raw, 'utf8') > OLLAMA_LIMITS.chatSessionStoreBytes) throw new Error('Stored chat-session state is oversized.');
      this.store = decodeStore(JSON.parse(raw) as unknown);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      this.store = { schemaVersion: SCHEMA_VERSION, sessions: [] };
    }
  }

  list(value: unknown = {}): OllamaChatSessionSummary[] {
    const request = validateOllamaChatSessionList(value);
    const sorted = [...this.store.sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return sorted.slice(0, request.limit ?? OLLAMA_LIMITS.chatSessions).map(summary);
  }

  get(value: unknown): OllamaChatSessionDetail {
    const { id } = validateOllamaChatSessionGet(value);
    const session = this.store.sessions.find((candidate) => candidate.id === id);
    if (!session) throw new Error('The requested local chat session no longer exists.');
    return detail(session);
  }

  async create(value: unknown): Promise<OllamaChatSessionDetail> {
    const request = validateOllamaChatSessionCreate(value) as OllamaChatSessionCreateRequest;
    return this.enqueue(async () => {
      if (this.store.sessions.length >= OLLAMA_LIMITS.chatSessions) throw new Error(`Local chat storage holds its maximum of ${OLLAMA_LIMITS.chatSessions} sessions. Remove a session before creating another.`);
      const id = randomUUID();
      const now = this.now().toISOString();
      // A system prompt is accepted only to validate the caller boundary. It
      // is never retained because it can contain credentials or private text.
      void request.systemPrompt;
      const session: PersistedSession = { id, title: titleFor(request.model, id), model: request.model, createdAt: now, updatedAt: now, messages: [] };
      const next = this.copyStore(); next.sessions.push(session);
      await this.commit(next);
      return detail(session);
    });
  }

  async update(value: unknown): Promise<OllamaChatSessionDetail> {
    const request = validateOllamaChatSessionUpdate(value) as OllamaChatSessionUpdateRequest;
    return this.enqueue(async () => {
      const next = this.copyStore();
      const session = next.sessions.find((candidate) => candidate.id === request.id);
      if (!session) throw new Error('The requested local chat session no longer exists.');
      if (request.model !== undefined) session.model = request.model;
      if (request.messages !== undefined) session.messages = request.messages.map(({ role, content }) => ({ role, content: cleanContent(content) }));
      // System prompts and attachment payloads are deliberately not accepted for persistence.
      void request.systemPrompt;
      session.updatedAt = this.now().toISOString();
      await this.commit(next);
      return detail(session);
    });
  }

  async rename(value: unknown): Promise<OllamaChatSessionSummary> {
    const request = validateOllamaChatSessionRename(value);
    return this.enqueue(async () => {
      const next = this.copyStore();
      const session = next.sessions.find((candidate) => candidate.id === request.id);
      if (!session) throw new Error('The requested local chat session no longer exists.');
      session.title = cleanTitle(request.title);
      session.updatedAt = this.now().toISOString();
      await this.commit(next);
      return summary(session);
    });
  }

  async delete(value: unknown): Promise<boolean> {
    const { id } = validateOllamaChatSessionDelete(value);
    return this.enqueue(async () => {
      const next = this.copyStore();
      const index = next.sessions.findIndex((candidate) => candidate.id === id);
      if (index < 0) return false;
      next.sessions.splice(index, 1);
      await this.commit(next);
      return true;
    });
  }

  private copyStore(): PersistedStore {
    return { schemaVersion: SCHEMA_VERSION, sessions: this.store.sessions.map((session) => ({ ...session, messages: session.messages.map((message) => ({ ...message })) })) };
  }

  private async commit(snapshot: PersistedStore): Promise<void> {
    this.writeQueue = this.writeQueue.catch(() => undefined).then(() => atomicWrite(this.file, snapshot));
    await this.writeQueue;
    this.store = snapshot;
  }

  private async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operation.then(operation, operation);
    this.operation = result.then(() => undefined, () => undefined);
    return result;
  }
}
