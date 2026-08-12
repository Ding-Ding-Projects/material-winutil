export const SCHEDULED_SETTINGS_SCHEMA_VERSION = 1 as const;

export const SCHEDULED_SETTINGS_LIMITS = Object.freeze({
  jsonBytes: 64 * 1024,
  rules: 128,
  labelLength: 120,
  idLength: 64,
  settingsPerRule: 64,
  settingKeyLength: 80,
  valueStringLength: 512,
  valueArrayLength: 64,
  valueObjectEntries: 64,
  valueDepth: 4,
});

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type ScheduledSettingValue =
  | null
  | boolean
  | number
  | string
  | ScheduledSettingValue[]
  | { [key: string]: ScheduledSettingValue };

export interface ScheduledSettingRule {
  id: string;
  label: string;
  enabled: boolean;
  priority: number;
  startDate?: string;
  endDate?: string;
  startTime: string;
  endTime: string;
  weekdays: 'every-day' | Weekday[];
  settings: Record<string, ScheduledSettingValue>;
}

export interface ScheduledSettingsDocument {
  schemaVersion: typeof SCHEDULED_SETTINGS_SCHEMA_VERSION;
  rules: ScheduledSettingRule[];
}

export interface ScheduledSettingsEvaluation {
  settings: Record<string, ScheduledSettingValue>;
  activeRuleIds: string[];
  settingRuleIds: Record<string, string>;
}

const DOCUMENT_FIELDS = new Set(['schemaVersion', 'rules']);
const RULE_FIELDS = new Set([
  'id',
  'label',
  'enabled',
  'priority',
  'startDate',
  'endDate',
  'startTime',
  'endTime',
  'weekdays',
  'settings',
]);
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?$/u;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertOnlyFields(value: Record<string, unknown>, allowed: Set<string>, context: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${context} contains unexpected field ${key}`);
  }
}

function assertDate(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string') throw new Error(`${context} must be a YYYY-MM-DD string`);
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new Error(`${context} must be a valid YYYY-MM-DD date`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(year, month - 1, day);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    throw new Error(`${context} must be a valid calendar date`);
  }
}

function assertTime(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) {
    throw new Error(`${context} must be a valid 24-hour HH:mm time`);
  }
}

function validateSettingValue(value: unknown, context: string, depth = 0): ScheduledSettingValue {
  if (depth > SCHEDULED_SETTINGS_LIMITS.valueDepth) {
    throw new Error(`${context} exceeds the maximum nesting depth`);
  }
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${context} must contain only finite numbers`);
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > SCHEDULED_SETTINGS_LIMITS.valueStringLength) {
      throw new Error(`${context} string exceeds the length limit`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > SCHEDULED_SETTINGS_LIMITS.valueArrayLength) {
      throw new Error(`${context} array exceeds the entry limit`);
    }
    return value.map((item, index) => validateSettingValue(item, `${context}[${index}]`, depth + 1));
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length > SCHEDULED_SETTINGS_LIMITS.valueObjectEntries) {
      throw new Error(`${context} object exceeds the entry limit`);
    }
    const result: Record<string, ScheduledSettingValue> = Object.create(null) as Record<string, ScheduledSettingValue>;
    for (const [key, item] of entries) {
      if (!key || key.length > SCHEDULED_SETTINGS_LIMITS.settingKeyLength || UNSAFE_KEYS.has(key)) {
        throw new Error(`${context} contains an unsafe or invalid key`);
      }
      result[key] = validateSettingValue(item, `${context}.${key}`, depth + 1);
    }
    return result;
  }
  throw new Error(`${context} contains a non-JSON value`);
}

function validateRule(input: unknown, index: number): ScheduledSettingRule {
  const context = `rules[${index}]`;
  if (!isRecord(input)) throw new Error(`${context} must be an object`);
  assertOnlyFields(input, RULE_FIELDS, context);
  if (typeof input.id !== 'string' || input.id.length > SCHEDULED_SETTINGS_LIMITS.idLength || !ID_PATTERN.test(input.id)) {
    throw new Error(`${context}.id must be a stable identifier using letters, numbers, dots, underscores, or hyphens`);
  }
  if (typeof input.label !== 'string' || !input.label.trim() || input.label.length > SCHEDULED_SETTINGS_LIMITS.labelLength) {
    throw new Error(`${context}.label must be a non-empty bounded string`);
  }
  if (typeof input.enabled !== 'boolean') throw new Error(`${context}.enabled must be boolean`);
  if (!Number.isSafeInteger(input.priority) || (input.priority as number) < -1000 || (input.priority as number) > 1000) {
    throw new Error(`${context}.priority must be an integer from -1000 to 1000`);
  }
  assertTime(input.startTime, `${context}.startTime`);
  assertTime(input.endTime, `${context}.endTime`);
  if (input.startDate !== undefined) assertDate(input.startDate, `${context}.startDate`);
  if (input.endDate !== undefined) assertDate(input.endDate, `${context}.endDate`);
  if (input.startDate !== undefined && input.endDate !== undefined && input.startDate > input.endDate) {
    throw new Error(`${context} date range starts after it ends`);
  }

  let weekdays: 'every-day' | Weekday[];
  if (input.weekdays === 'every-day') {
    weekdays = 'every-day';
  } else if (Array.isArray(input.weekdays) && input.weekdays.length > 0) {
    if (!input.weekdays.every((day) => Number.isInteger(day) && (day as number) >= 0 && (day as number) <= 6)) {
      throw new Error(`${context}.weekdays must contain weekday numbers from 0 (Sunday) to 6 (Saturday)`);
    }
    weekdays = [...new Set(input.weekdays as Weekday[])].sort((a, b) => a - b);
  } else {
    throw new Error(`${context}.weekdays must be every-day or a non-empty weekday list`);
  }

  if (!isRecord(input.settings)) throw new Error(`${context}.settings must be an object`);
  const entries = Object.entries(input.settings);
  if (entries.length === 0 || entries.length > SCHEDULED_SETTINGS_LIMITS.settingsPerRule) {
    throw new Error(`${context}.settings must contain 1 to ${SCHEDULED_SETTINGS_LIMITS.settingsPerRule} values`);
  }
  const settings: Record<string, ScheduledSettingValue> = Object.create(null) as Record<string, ScheduledSettingValue>;
  for (const [key, value] of entries) {
    if (!key || key.length > SCHEDULED_SETTINGS_LIMITS.settingKeyLength || UNSAFE_KEYS.has(key)) {
      throw new Error(`${context}.settings contains an unsafe or invalid key`);
    }
    settings[key] = validateSettingValue(value, `${context}.settings.${key}`);
  }

  return {
    id: input.id,
    label: input.label,
    enabled: input.enabled,
    priority: input.priority as number,
    ...(input.startDate === undefined ? {} : { startDate: input.startDate }),
    ...(input.endDate === undefined ? {} : { endDate: input.endDate }),
    startTime: input.startTime,
    endTime: input.endTime,
    weekdays,
    settings,
  };
}

export function validateScheduledSettings(input: unknown): ScheduledSettingsDocument {
  if (!isRecord(input)) throw new Error('scheduled settings must be an object');
  assertOnlyFields(input, DOCUMENT_FIELDS, 'scheduled settings');
  if (input.schemaVersion !== SCHEDULED_SETTINGS_SCHEMA_VERSION) {
    throw new Error(`unsupported scheduled settings schema version: ${String(input.schemaVersion)}`);
  }
  if (!Array.isArray(input.rules) || input.rules.length > SCHEDULED_SETTINGS_LIMITS.rules) {
    throw new Error(`scheduled settings rules must be an array with at most ${SCHEDULED_SETTINGS_LIMITS.rules} entries`);
  }
  const rules = input.rules.map(validateRule);
  const ids = new Set<string>();
  for (const rule of rules) {
    if (ids.has(rule.id)) throw new Error(`duplicate scheduled settings rule id: ${rule.id}`);
    ids.add(rule.id);
  }
  return { schemaVersion: SCHEDULED_SETTINGS_SCHEMA_VERSION, rules };
}

export function parseScheduledSettingsJson(text: string): ScheduledSettingsDocument {
  if (new TextEncoder().encode(text).byteLength > SCHEDULED_SETTINGS_LIMITS.jsonBytes) {
    throw new Error(`scheduled settings JSON exceeds ${SCHEDULED_SETTINGS_LIMITS.jsonBytes} bytes`);
  }
  let input: unknown;
  try {
    input = JSON.parse(text) as unknown;
  } catch {
    throw new Error('scheduled settings JSON is malformed');
  }
  return validateScheduledSettings(input);
}

function minutesSinceMidnight(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function localDateKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * A cross-midnight window belongs to the local calendar day on which it starts.
 * An equal start and end time is intentionally inactive, never an implicit full day.
 * Window ends are exclusive; date-range endpoints are inclusive for the start day.
 */
export function isScheduledRuleActive(rule: ScheduledSettingRule, at: Date): boolean {
  if (!rule.enabled || Number.isNaN(at.getTime())) return false;
  const start = minutesSinceMidnight(rule.startTime);
  const end = minutesSinceMidnight(rule.endTime);
  if (start === end) return false;

  const minute = at.getHours() * 60 + at.getMinutes();
  const crossesMidnight = start > end;
  const anchor = new Date(at.getTime());
  let timeMatches: boolean;
  if (!crossesMidnight) {
    timeMatches = minute >= start && minute < end;
  } else if (minute >= start) {
    timeMatches = true;
  } else if (minute < end) {
    timeMatches = true;
    anchor.setDate(anchor.getDate() - 1);
  } else {
    timeMatches = false;
  }
  if (!timeMatches) return false;

  const anchorDate = localDateKey(anchor);
  if (rule.startDate !== undefined && anchorDate < rule.startDate) return false;
  if (rule.endDate !== undefined && anchorDate > rule.endDate) return false;
  return rule.weekdays === 'every-day' || rule.weekdays.includes(anchor.getDay() as Weekday);
}

function cloneSettingValue(value: ScheduledSettingValue): ScheduledSettingValue {
  if (Array.isArray(value)) return value.map(cloneSettingValue);
  if (value !== null && typeof value === 'object') {
    const result: Record<string, ScheduledSettingValue> = Object.create(null) as Record<string, ScheduledSettingValue>;
    for (const [key, item] of Object.entries(value)) result[key] = cloneSettingValue(item);
    return result;
  }
  return value;
}

/**
 * Rules are returned and applied in precedence order: greater priority first,
 * then lexicographically smaller stable IDs. The first matching owner of a key wins.
 */
export function evaluateScheduledSettings(
  document: ScheduledSettingsDocument,
  baseSettings: Readonly<Record<string, ScheduledSettingValue>>,
  at = new Date(),
): ScheduledSettingsEvaluation {
  const activeRules = document.rules
    .filter((rule) => isScheduledRuleActive(rule, at))
    .sort((left, right) => right.priority - left.priority || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

  const settings: Record<string, ScheduledSettingValue> = Object.create(null) as Record<string, ScheduledSettingValue>;
  for (const [key, value] of Object.entries(baseSettings)) settings[key] = cloneSettingValue(value);
  const settingRuleIds: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const rule of activeRules) {
    for (const [key, value] of Object.entries(rule.settings)) {
      if (settingRuleIds[key] !== undefined) continue;
      settings[key] = cloneSettingValue(value);
      settingRuleIds[key] = rule.id;
    }
  }
  return { settings, activeRuleIds: activeRules.map((rule) => rule.id), settingRuleIds };
}
