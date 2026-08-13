import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { AppearanceThemeDocument, AppearanceThemeRecord, AppearanceThemeValues } from '../shared/types';

const SCHEMA_VERSION = 1 as const;
const MAX_DOCUMENT_BYTES = 512 * 1024;
const MAX_THEMES = 64;
const MAX_NAME_LENGTH = 80;
const MAX_FONT_LENGTH = 120;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const THEME_KEYS = ['theme', 'density', 'accent', 'font', 'scale', 'weight', 'radius', 'reducedMotion', 'tabDock'] as const;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: UnknownRecord, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function validateName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Appearance theme name must be text.');
  const name = value.trim();
  if (!name || name.length > MAX_NAME_LENGTH || /[\u0000-\u001F\u007F]/u.test(name)) {
    throw new Error(`Appearance theme names must contain 1 to ${MAX_NAME_LENGTH} printable characters.`);
  }
  return name;
}

function nameKey(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US');
}

export function validateAppearanceThemeValues(value: unknown): AppearanceThemeValues {
  if (!isRecord(value) || !hasOnlyKeys(value, THEME_KEYS)) throw new Error('Appearance theme values contain unsupported fields.');
  if (!['light', 'dark'].includes(String(value.theme))
    || !['comfortable', 'compact'].includes(String(value.density))
    || typeof value.accent !== 'string' || !/^#[0-9A-Fa-f]{6}$/u.test(value.accent)
    || typeof value.font !== 'string' || !value.font.trim() || value.font.length > MAX_FONT_LENGTH || /[\u0000-\u001F\u007F]/u.test(value.font)
    || typeof value.scale !== 'number' || !Number.isFinite(value.scale) || value.scale < 0.5 || value.scale > 3
    || typeof value.weight !== 'number' || !Number.isInteger(value.weight) || value.weight < 100 || value.weight > 1000
    || typeof value.radius !== 'number' || !Number.isFinite(value.radius) || value.radius < 0 || value.radius > 64
    || typeof value.reducedMotion !== 'boolean'
    || !['left', 'right', 'top', 'bottom'].includes(String(value.tabDock))) {
    throw new Error('Appearance theme values did not pass validation.');
  }
  return {
    theme: value.theme as AppearanceThemeValues['theme'],
    density: value.density as AppearanceThemeValues['density'],
    accent: value.accent.toUpperCase(),
    font: value.font.trim(),
    scale: value.scale,
    weight: value.weight,
    radius: value.radius,
    reducedMotion: value.reducedMotion,
    tabDock: value.tabDock as AppearanceThemeValues['tabDock'],
  };
}

function validateRecord(value: unknown): AppearanceThemeRecord {
  if (!isRecord(value) || !hasOnlyKeys(value, ['id', 'name', 'theme'])) throw new Error('Appearance theme record contains unsupported fields.');
  if (typeof value.id !== 'string' || !UUID_PATTERN.test(value.id)) throw new Error('Appearance theme identifier is invalid.');
  return { id: value.id.toLowerCase(), name: validateName(value.name), theme: validateAppearanceThemeValues(value.theme) };
}

export function validateAppearanceThemeDocument(value: unknown): AppearanceThemeDocument {
  if (!isRecord(value) || !hasOnlyKeys(value, ['schemaVersion', 'themes']) || value.schemaVersion !== SCHEMA_VERSION || !Array.isArray(value.themes)) {
    throw new Error('Appearance theme document does not use schema version 1.');
  }
  if (value.themes.length > MAX_THEMES) throw new Error(`Appearance theme document exceeds the ${MAX_THEMES} theme limit.`);
  const themes = value.themes.map(validateRecord);
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const theme of themes) {
    const key = nameKey(theme.name);
    if (ids.has(theme.id) || names.has(key)) throw new Error('Appearance theme document contains duplicate identifiers or names.');
    ids.add(theme.id);
    names.add(key);
  }
  return { schemaVersion: SCHEMA_VERSION, themes };
}

function cloneDocument(document: AppearanceThemeDocument): AppearanceThemeDocument {
  return { schemaVersion: SCHEMA_VERSION, themes: document.themes.map((entry) => ({ ...entry, theme: { ...entry.theme } })) };
}

export class AppearanceThemeService {
  private readonly file: string;
  private writeQueue: Promise<void> = Promise.resolve();

  public constructor(appDataDirectory: string) {
    this.file = path.join(appDataDirectory, 'appearance-themes.v1.json');
  }

  public async list(): Promise<AppearanceThemeDocument> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      if (Buffer.byteLength(raw, 'utf8') > MAX_DOCUMENT_BYTES) throw new Error('Appearance theme store exceeds its size limit.');
      return cloneDocument(validateAppearanceThemeDocument(JSON.parse(raw) as unknown));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schemaVersion: SCHEMA_VERSION, themes: [] };
      throw error;
    }
  }

  public async create(name: unknown, theme: unknown): Promise<AppearanceThemeDocument> {
    const recordName = validateName(name);
    const values = validateAppearanceThemeValues(theme);
    return this.change(async (document) => {
      if (document.themes.length >= MAX_THEMES) throw new Error(`Only ${MAX_THEMES} named appearance themes may be stored.`);
      if (document.themes.some((entry) => nameKey(entry.name) === nameKey(recordName))) throw new Error('A named appearance theme already uses that name.');
      document.themes.push({ id: randomUUID(), name: recordName, theme: values });
      return document;
    });
  }

  public async apply(id: unknown): Promise<AppearanceThemeValues> {
    const record = await this.find(id);
    return { ...record.theme };
  }

  public async remove(id: unknown): Promise<AppearanceThemeDocument> {
    const identifier = this.validateId(id);
    return this.change(async (document) => {
      const index = document.themes.findIndex((entry) => entry.id === identifier);
      if (index < 0) throw new Error('The named appearance theme no longer exists.');
      document.themes.splice(index, 1);
      return document;
    });
  }

  public async importDocument(value: unknown): Promise<{ document: AppearanceThemeDocument; imported: number }> {
    const incoming = validateAppearanceThemeDocument(value);
    return this.change(async (document) => {
      if (incoming.themes.length === 0) return { document, imported: 0 };
      if (document.themes.length + incoming.themes.length > MAX_THEMES) throw new Error(`Import would exceed the ${MAX_THEMES} named theme limit.`);
      const ids = new Set(document.themes.map((entry) => entry.id));
      const names = new Set(document.themes.map((entry) => nameKey(entry.name)));
      for (const entry of incoming.themes) {
        if (ids.has(entry.id) || names.has(nameKey(entry.name))) throw new Error('Import would overwrite an existing named appearance theme.');
        ids.add(entry.id);
        names.add(nameKey(entry.name));
      }
      document.themes.push(...incoming.themes.map((entry) => ({ ...entry, theme: { ...entry.theme } })));
      return { document, imported: incoming.themes.length };
    });
  }

  public async exportDocument(id: unknown): Promise<AppearanceThemeDocument> {
    const record = await this.find(id);
    return { schemaVersion: SCHEMA_VERSION, themes: [{ ...record, theme: { ...record.theme } }] };
  }

  private validateId(value: unknown): string {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new Error('Appearance theme identifier is invalid.');
    return value.toLowerCase();
  }

  private async find(id: unknown): Promise<AppearanceThemeRecord> {
    const identifier = this.validateId(id);
    const document = await this.list();
    const record = document.themes.find((entry) => entry.id === identifier);
    if (!record) throw new Error('The named appearance theme no longer exists.');
    return { ...record, theme: { ...record.theme } };
  }

  private async change<T>(mutate: (document: AppearanceThemeDocument) => Promise<T> | T): Promise<T> {
    let result!: T;
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      const document = await this.list();
      result = await mutate(document);
      const candidate: unknown = result;
      const persisted: unknown = isRecord(candidate) && 'document' in candidate
        ? (candidate as { document: unknown }).document
        : candidate;
      if (!isRecord(persisted) || !('schemaVersion' in persisted) || !('themes' in persisted)) {
        throw new Error('Appearance theme mutation did not return a theme document.');
      }
      await this.write(validateAppearanceThemeDocument(persisted));
    });
    await this.writeQueue;
    return result;
  }

  private async write(document: AppearanceThemeDocument): Promise<void> {
    const valid = validateAppearanceThemeDocument(document);
    const body = JSON.stringify(valid, null, 2);
    if (Buffer.byteLength(body, 'utf8') > MAX_DOCUMENT_BYTES) throw new Error('Appearance theme store exceeds its size limit.');
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, body, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    try { await fs.rename(temporary, this.file); }
    catch (error) { await fs.rm(temporary, { force: true }); throw error; }
  }
}
