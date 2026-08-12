import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateScheduledSettings,
  isScheduledRuleActive,
  parseScheduledSettingsJson,
  validateScheduledSettings,
} from '../../dist/shared/scheduled-settings.js';

function local(year, month, day, hour, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function rule(overrides = {}) {
  return {
    id: 'office-hours',
    label: 'Office hours',
    enabled: true,
    priority: 10,
    startTime: '09:00',
    endTime: '17:00',
    weekdays: 'every-day',
    settings: { theme: 'light' },
    ...overrides,
  };
}

function document(rules) {
  return validateScheduledSettings({ schemaVersion: 1, rules });
}

test('validates and normalizes a bounded version 1 document', () => {
  const parsed = parseScheduledSettingsJson(JSON.stringify({
    schemaVersion: 1,
    rules: [rule({ weekdays: [5, 1, 1, 3], settings: { density: 2, nested: { motion: false } } })],
  }));
  assert.deepEqual(parsed.rules[0].weekdays, [1, 3, 5]);
  assert.equal(parsed.rules[0].settings.nested.motion, false);
  assert.throws(() => validateScheduledSettings({ schemaVersion: 2, rules: [] }), /unsupported.*version/i);
  assert.throws(() => validateScheduledSettings({ schemaVersion: 1, rules: [], surprise: true }), /unexpected field/i);
  assert.throws(() => parseScheduledSettingsJson('{nope'), /malformed/i);
});

test('rejects duplicate IDs, invalid bounds, dates, times, weekdays, and unsafe values', () => {
  assert.throws(() => document([rule(), rule()]), /duplicate.*id/i);
  assert.throws(() => document([rule({ id: 'spaces are unstable' })]), /stable identifier/i);
  assert.throws(() => document([rule({ priority: 1001 })]), /priority/i);
  assert.throws(() => document([rule({ startDate: '2026-02-30' })]), /calendar date/i);
  assert.throws(() => document([rule({ startDate: '2026-08-02', endDate: '2026-08-01' })]), /starts after/i);
  assert.throws(() => document([rule({ startTime: '24:00' })]), /HH:mm/i);
  assert.throws(() => document([rule({ weekdays: [] })]), /non-empty weekday/i);
  assert.throws(() => document([rule({ weekdays: [7] })]), /weekday numbers/i);
  const unsafe = Object.create(null);
  Object.defineProperty(unsafe, '__proto__', { value: 'bad', enumerable: true });
  assert.throws(() => document([rule({ settings: unsafe })]), /unsafe/i);
  assert.throws(() => document([rule({ settings: { scale: Number.POSITIVE_INFINITY } })]), /finite/i);
});

test('uses local inclusive start and exclusive end times', () => {
  const candidate = document([rule()]).rules[0];
  assert.equal(isScheduledRuleActive(candidate, local(2026, 8, 12, 8, 59)), false);
  assert.equal(isScheduledRuleActive(candidate, local(2026, 8, 12, 9, 0)), true);
  assert.equal(isScheduledRuleActive(candidate, local(2026, 8, 12, 16, 59)), true);
  assert.equal(isScheduledRuleActive(candidate, local(2026, 8, 12, 17, 0)), false);
});

test('anchors cross-midnight windows to their starting weekday and date', () => {
  const overnight = document([rule({
    id: 'monday-night',
    startDate: '2026-08-10',
    endDate: '2026-08-10',
    startTime: '22:00',
    endTime: '02:00',
    weekdays: [1],
  })]).rules[0];
  assert.equal(isScheduledRuleActive(overnight, local(2026, 8, 10, 22, 0)), true);
  assert.equal(isScheduledRuleActive(overnight, local(2026, 8, 11, 1, 59)), true);
  assert.equal(isScheduledRuleActive(overnight, local(2026, 8, 11, 2, 0)), false);
  assert.equal(isScheduledRuleActive(overnight, local(2026, 8, 12, 1, 0)), false);
});

test('treats equal start and end times as intentionally inactive', () => {
  const inactive = document([rule({ startTime: '00:00', endTime: '00:00' })]).rules[0];
  assert.equal(isScheduledRuleActive(inactive, local(2026, 8, 12, 0, 0)), false);
  assert.equal(isScheduledRuleActive(inactive, local(2026, 8, 12, 12, 0)), false);
});

test('uses priority then stable rule ID as deterministic per-setting precedence', () => {
  const rules = [
    rule({ id: 'z-low', priority: 1, settings: { theme: 'dark', density: 1 } }),
    rule({ id: 'z-peer', priority: 5, settings: { theme: 'purple', motion: 'full' } }),
    rule({ id: 'a-peer', priority: 5, settings: { theme: 'light', density: 3 } }),
  ];
  const result = evaluateScheduledSettings(document(rules), { theme: 'base', density: 2, font: 'system' }, local(2026, 8, 12, 12));
  assert.deepEqual(result.activeRuleIds, ['a-peer', 'z-peer', 'z-low']);
  assert.equal(result.settings.theme, 'light');
  assert.equal(result.settings.density, 3);
  assert.equal(result.settings.motion, 'full');
  assert.equal(result.settings.font, 'system');
  assert.deepEqual({ ...result.settingRuleIds }, { theme: 'a-peer', density: 'a-peer', motion: 'z-peer' });
});

test('recovers untouched base settings when overrides end and never mutates inputs', () => {
  const doc = document([rule()]);
  const base = { theme: 'dark', nested: { scale: 1 } };
  const active = evaluateScheduledSettings(doc, base, local(2026, 8, 12, 12));
  const ended = evaluateScheduledSettings(doc, base, local(2026, 8, 12, 18));
  assert.equal(active.settings.theme, 'light');
  assert.equal(ended.settings.theme, 'dark');
  assert.deepEqual(ended.activeRuleIds, []);
  assert.notEqual(ended.settings.nested, base.nested);
  ended.settings.nested.scale = 9;
  assert.equal(base.nested.scale, 1);
});

test('disabled rules never override the base', () => {
  const result = evaluateScheduledSettings(document([rule({ enabled: false })]), { theme: 'dark' }, local(2026, 8, 12, 12));
  assert.deepEqual({ ...result.settings }, { theme: 'dark' });
  assert.deepEqual(result.activeRuleIds, []);
});
