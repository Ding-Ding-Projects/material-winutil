import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  evaluateScheduledSettings, isScheduledRuleActive, parseScheduledSettingsJson,
  SCHEDULED_SETTINGS_SCHEMA_VERSION, validateScheduledSettings,
  type ScheduledSettingRule, type ScheduledSettingsDocument, type ScheduledSettingValue,
} from '../shared/scheduled-settings';
import { ExternalSettingsSourceError, loadHomeAssistantBooleanSource, loadJsonSettingsSource } from './external-settings-source';

const EMPTY_DOCUMENT: ScheduledSettingsDocument = Object.freeze({ schemaVersion: SCHEDULED_SETTINGS_SCHEMA_VERSION, rules: [] });
const HA_TARGET_PREFIX = 'scheduled-settings-ha-';
const HA_ACCOUNT = 'local-user';
const TICK_MS = 60_000;

export interface ScheduledSourceStatus {
  readonly ruleId: string;
  readonly state: 'local' | 'ready' | 'off' | 'missing-token' | 'error' | 'pending';
  readonly checkedAt: string | null;
  readonly nextRefreshAt: string | null;
  readonly code: string | null;
}

export interface ScheduledSettingsSnapshot {
  readonly document: ScheduledSettingsDocument;
  readonly effectiveSettings: Readonly<Record<string, ScheduledSettingValue>>;
  readonly activeRuleIds: readonly string[];
  readonly settingRuleIds: Readonly<Record<string, string>>;
  readonly sourceStatuses: readonly ScheduledSourceStatus[];
  readonly timezone: string;
  readonly evaluatedAt: string;
}

export interface ScheduledSettingsVault {
  write(target: string, account: string, secret: Uint8Array): Promise<void>;
  read(target: string, account: string): Promise<Buffer | null>;
  delete(target: string, account: string): Promise<boolean>;
}

interface ServiceOptions {
  readonly userDataDirectory: string;
  readonly vault: ScheduledSettingsVault;
  readonly now?: () => Date;
  readonly onApply?: (snapshot: ScheduledSettingsSnapshot) => void;
}

interface CachedSource {
  settings?: Readonly<Record<string, ScheduledSettingValue>>;
  active?: boolean;
  checkedAt: number;
  nextRefreshAt: number;
  status: ScheduledSourceStatus['state'];
  code: string | null;
}

function cloneSettings(settings: Readonly<Record<string, ScheduledSettingValue>>): Record<string, ScheduledSettingValue> {
  return JSON.parse(JSON.stringify(settings)) as Record<string, ScheduledSettingValue>;
}

function atomicWrite(file: string, body: string): Promise<void> {
  return fs.mkdir(path.dirname(file), { recursive: true }).then(async () => {
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, body, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    try { await fs.rename(temporary, file); }
    catch (error) { await fs.rm(temporary, { force: true }); throw error; }
  });
}

function productionSettings(settings: Readonly<Record<string, ScheduledSettingValue>>): Record<string, ScheduledSettingValue> {
  const projected: Record<string, ScheduledSettingValue> = Object.create(null) as Record<string, ScheduledSettingValue>;
  const hexColour = /^#[0-9a-f]{6}$/iu;
  const formats = new Set(['md', 'json', 'jsonl', 'yaml', 'toml', 'xml', 'csv', 'tsv', 'html', 'sql', 'ts', 'js', 'py', 'go', 'rs', 'proto', 'schema.json']);
  for (const [key, value] of Object.entries(settings)) {
    let valid = false;
    switch (key) {
      case 'theme': valid = value === 'light' || value === 'dark'; break;
      case 'density': valid = value === 'comfortable' || value === 'compact'; break;
      case 'language': valid = value === 'English' || value === 'Yue' || value === 'Bilingual'; break;
      case 'narrator': valid = value === 'English' || value === 'Yue' || value === 'Both'; break;
      case 'narratorEnabled':
      case 'reducedMotion': valid = typeof value === 'boolean'; break;
      case 'enFunny':
      case 'yueFunny': valid = Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5; break;
      case 'accent': valid = typeof value === 'string' && hexColour.test(value); break;
      case 'font': valid = typeof value === 'string' && value.length > 0 && value.length <= 120 && !/[\u0000-\u001f\u007f]/u.test(value); break;
      case 'displayName': valid = typeof value === 'string' && value.trim().length > 0 && value.length <= 80 && !/[\u0000-\u001f\u007f]/u.test(value); break;
      case 'scale': valid = typeof value === 'number' && Number.isFinite(value) && value >= .5 && value <= 3; break;
      case 'weight': valid = Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 1000; break;
      case 'radius': valid = typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 64; break;
      case 'exportFormat': valid = typeof value === 'string' && formats.has(value); break;
    }
    if (!valid) throw new Error(`Scheduled setting ${key} is unsupported or invalid.`);
    projected[key] = value;
  }
  return projected;
}

function productionDocument(input: unknown): ScheduledSettingsDocument {
  const document = validateScheduledSettings(input);
  return {
    schemaVersion: SCHEDULED_SETTINGS_SCHEMA_VERSION,
    rules: document.rules.map((rule) => ({ ...rule, settings: productionSettings(rule.settings) })),
  };
}

function sourceErrorCode(error: unknown): string {
  return error instanceof ExternalSettingsSourceError ? error.code : 'source-unavailable';
}

export class ScheduledSettingsService {
  private readonly file: string;
  private document: ScheduledSettingsDocument = EMPTY_DOCUMENT;
  private baseSettings: Record<string, ScheduledSettingValue> = Object.create(null) as Record<string, ScheduledSettingValue>;
  private snapshotValue: ScheduledSettingsSnapshot | null = null;
  private readonly cache = new Map<string, CachedSource>();
  private generation = 0;
  private timer: NodeJS.Timeout | null = null;
  private evaluation: Promise<ScheduledSettingsSnapshot> = Promise.resolve({
    document: EMPTY_DOCUMENT, effectiveSettings: {}, activeRuleIds: [], settingRuleIds: {}, sourceStatuses: [],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local system time', evaluatedAt: new Date(0).toISOString(),
  });

  constructor(private readonly options: ServiceOptions) {
    this.file = path.join(options.userDataDirectory, 'scheduled-settings.v1.json');
  }

  async initialize(baseSettings: Readonly<Record<string, ScheduledSettingValue>>): Promise<ScheduledSettingsSnapshot> {
    this.baseSettings = cloneSettings(baseSettings);
    try { this.document = productionDocument(parseScheduledSettingsJson(await fs.readFile(this.file, 'utf8'))); }
    catch { this.document = EMPTY_DOCUMENT; }
    await atomicWrite(this.file, JSON.stringify(this.document, null, 2));
    const snapshot = await this.refresh(true);
    this.timer = setInterval(() => { void this.refresh(false); }, TICK_MS);
    this.timer.unref();
    return snapshot;
  }

  snapshot(): ScheduledSettingsSnapshot {
    if (!this.snapshotValue) throw new Error('Scheduled settings are unavailable.');
    return this.snapshotValue;
  }

  async save(input: unknown): Promise<ScheduledSettingsSnapshot> {
    const document = productionDocument(input);
    this.document = document;
    this.generation += 1;
    const ids = new Set(document.rules.map(({ id }) => id));
    for (const id of this.cache.keys()) if (!ids.has(id)) this.cache.delete(id);
    await atomicWrite(this.file, JSON.stringify(document, null, 2));
    return this.refresh(true);
  }

  async setBaseSettings(settings: Readonly<Record<string, ScheduledSettingValue>>, replaceOwned = false): Promise<ScheduledSettingsSnapshot> {
    const owned = this.snapshotValue?.settingRuleIds ?? {};
    for (const [key, value] of Object.entries(settings)) {
      if (replaceOwned || owned[key] === undefined) this.baseSettings[key] = cloneSettings({ value }).value;
    }
    return this.refresh(false);
  }

  async configureHomeAssistantToken(ruleId: string, token: Uint8Array): Promise<ScheduledSettingsSnapshot> {
    const rule = this.document.rules.find(({ id }) => id === ruleId);
    if (rule?.source?.kind !== 'home-assistant') throw new Error('The selected rule does not use Home Assistant.');
    if (!(token instanceof Uint8Array) || token.byteLength < 1 || token.byteLength > 4096) throw new Error('The Home Assistant token is invalid.');
    await this.options.vault.write(`${HA_TARGET_PREFIX}${ruleId}`, HA_ACCOUNT, token);
    this.cache.delete(ruleId);
    return this.refresh(true);
  }

  async clearHomeAssistantToken(ruleId: string): Promise<ScheduledSettingsSnapshot> {
    if (!this.document.rules.some(({ id, source }) => id === ruleId && source?.kind === 'home-assistant')) {
      throw new Error('The selected rule does not use Home Assistant.');
    }
    await this.options.vault.delete(`${HA_TARGET_PREFIX}${ruleId}`, HA_ACCOUNT);
    this.cache.delete(ruleId);
    return this.refresh(true);
  }

  refresh(force: boolean): Promise<ScheduledSettingsSnapshot> {
    const generation = ++this.generation;
    this.evaluation = this.evaluation.catch(() => this.snapshot()).then(() => this.evaluate(generation, force));
    return this.evaluation;
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.generation += 1;
  }

  private async evaluate(generation: number, force: boolean): Promise<ScheduledSettingsSnapshot> {
    const at = this.options.now?.() ?? new Date();
    const rules: ScheduledSettingRule[] = [];
    const statuses: ScheduledSourceStatus[] = [];
    for (const rule of this.document.rules) {
      const source = rule.source ?? { kind: 'local' as const };
      if (source.kind === 'local') {
        rules.push(rule);
        statuses.push({ ruleId: rule.id, state: 'local', checkedAt: null, nextRefreshAt: null, code: null });
        continue;
      }
      if (!isScheduledRuleActive(rule, at)) {
        rules.push({ ...rule, enabled: false });
        const cached = this.cache.get(rule.id);
        statuses.push(this.status(rule.id, cached ?? { checkedAt: 0, nextRefreshAt: 0, status: 'pending', code: null }));
        continue;
      }
      let cached = this.cache.get(rule.id);
      if (force || !cached || cached.nextRefreshAt <= at.getTime()) cached = await this.loadSource(rule, generation, at);
      if (source.kind === 'json-api' && cached.settings) rules.push({ ...rule, settings: { ...rule.settings, ...cached.settings } });
      else if (source.kind === 'home-assistant' && cached.active === true) rules.push(rule);
      else rules.push({ ...rule, enabled: false });
      statuses.push(this.status(rule.id, cached));
    }
    if (generation !== this.generation) return this.snapshot();
    const result = evaluateScheduledSettings({ schemaVersion: SCHEDULED_SETTINGS_SCHEMA_VERSION, rules }, this.baseSettings, at);
    const snapshot: ScheduledSettingsSnapshot = Object.freeze({
      document: this.document,
      effectiveSettings: Object.freeze(result.settings), activeRuleIds: Object.freeze(result.activeRuleIds),
      settingRuleIds: Object.freeze(result.settingRuleIds), sourceStatuses: Object.freeze(statuses),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local system time', evaluatedAt: at.toISOString(),
    });
    this.snapshotValue = snapshot;
    this.options.onApply?.(snapshot);
    return snapshot;
  }

  private async loadSource(rule: ScheduledSettingRule, generation: number, at: Date): Promise<CachedSource> {
    const source = rule.source;
    if (!source || source.kind === 'local') throw new Error('A local rule has no external source.');
    const previous = this.cache.get(rule.id);
    const nextRefreshAt = at.getTime() + source.refreshMinutes * 60_000;
    try {
      let cache: CachedSource;
      if (source.kind === 'json-api') {
        const settings = await loadJsonSettingsSource({ kind: 'json-api', url: source.url }, {
          allowLoopbackHttpForDevelopment: source.allowLoopbackHttpForDevelopment,
          generation, isGenerationCurrent: (candidate) => candidate === this.generation,
        });
        cache = { settings, checkedAt: at.getTime(), nextRefreshAt, status: 'ready', code: null };
      } else {
        const encoded = await this.options.vault.read(`${HA_TARGET_PREFIX}${rule.id}`, HA_ACCOUNT);
        if (!encoded) {
          cache = { checkedAt: at.getTime(), nextRefreshAt, status: 'missing-token', code: 'missing-token' };
        } else {
          try {
            const token = encoded.toString('utf8');
            const active = await loadHomeAssistantBooleanSource({
              kind: 'home-assistant', baseUrl: source.baseUrl, entityId: source.entityId, token,
            }, { generation, isGenerationCurrent: (candidate) => candidate === this.generation });
            cache = { active, checkedAt: at.getTime(), nextRefreshAt, status: active ? 'ready' : 'off', code: null };
          } finally { encoded.fill(0); }
        }
      }
      this.cache.set(rule.id, cache);
      return cache;
    } catch (error) {
      if (generation !== this.generation) return previous ?? { checkedAt: at.getTime(), nextRefreshAt, status: 'pending', code: 'superseded' };
      const cache: CachedSource = previous
        ? { ...previous, checkedAt: at.getTime(), nextRefreshAt, status: 'error', code: sourceErrorCode(error) }
        : { checkedAt: at.getTime(), nextRefreshAt, status: 'error', code: sourceErrorCode(error) };
      this.cache.set(rule.id, cache);
      return cache;
    }
  }

  private status(ruleId: string, cache: CachedSource): ScheduledSourceStatus {
    return {
      ruleId, state: cache.status,
      checkedAt: cache.checkedAt > 0 ? new Date(cache.checkedAt).toISOString() : null,
      nextRefreshAt: cache.nextRefreshAt > 0 ? new Date(cache.nextRefreshAt).toISOString() : null,
      code: cache.code,
    };
  }
}
