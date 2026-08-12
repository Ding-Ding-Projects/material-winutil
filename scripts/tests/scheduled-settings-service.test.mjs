import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ScheduledSettingsService } from '../../dist/main/scheduled-settings-service.js';

function memoryVault() {
  const values = new Map();
  return {
    async write(target, account, value) { values.set(`${target}:${account}`, Buffer.from(value)); },
    async read(target, account) { const value = values.get(`${target}:${account}`); return value ? Buffer.from(value) : null; },
    async delete(target, account) { return values.delete(`${target}:${account}`); },
    values,
  };
}

function rule(overrides = {}) {
  return {
    id: 'evening', label: 'Evening', enabled: true, priority: 10,
    startTime: '18:00', endTime: '23:00', weekdays: 'every-day', settings: { theme: 'light', displayName: 'Evening Utility' },
    source: { kind: 'local' }, ...overrides,
  };
}

test('persists validated rules, applies active values, and restores unscheduled base values', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'scheduled-service-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let now = new Date(2026, 7, 12, 19, 0);
  const snapshots = [];
  const service = new ScheduledSettingsService({ userDataDirectory: root, vault: memoryVault(), now: () => now, onApply: (state) => snapshots.push(state) });
  t.after(() => service.close());
  await service.initialize({ theme: 'dark', displayName: 'Base Utility' });
  const active = await service.save({ schemaVersion: 1, rules: [rule()] });
  assert.equal(active.effectiveSettings.theme, 'light');
  assert.equal(active.effectiveSettings.displayName, 'Evening Utility');
  assert.deepEqual(active.activeRuleIds, ['evening']);
  now = new Date(2026, 7, 12, 23, 0);
  const ended = await service.refresh(false);
  assert.equal(ended.effectiveSettings.theme, 'dark');
  assert.equal(ended.effectiveSettings.displayName, 'Base Utility');
  assert.deepEqual(ended.activeRuleIds, []);
  assert.ok(snapshots.length >= 3);
  const stored = JSON.parse(await readFile(join(root, 'scheduled-settings.v1.json'), 'utf8'));
  assert.equal(stored.rules[0].source.kind, 'local');
});

test('updates only unscheduled base keys so renderer echoes cannot persist active overrides', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'scheduled-service-base-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const service = new ScheduledSettingsService({ userDataDirectory: root, vault: memoryVault(), now: () => new Date(2026, 7, 12, 19, 0) });
  t.after(() => service.close());
  await service.initialize({ theme: 'dark', density: 'comfortable' });
  await service.save({ schemaVersion: 1, rules: [rule({ settings: { theme: 'light' } })] });
  const updated = await service.setBaseSettings({ theme: 'light', density: 'compact' });
  assert.equal(updated.effectiveSettings.theme, 'light');
  assert.equal(updated.effectiveSettings.density, 'compact');
  const ended = await service.save({ schemaVersion: 1, rules: [] });
  assert.equal(ended.effectiveSettings.theme, 'dark');
  assert.equal(ended.effectiveSettings.density, 'compact');
});

test('Home Assistant credentials use the vault and never enter the persisted schedule document', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'scheduled-service-ha-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const vault = memoryVault();
  const service = new ScheduledSettingsService({ userDataDirectory: root, vault, now: () => new Date(2026, 7, 12, 19, 0) });
  t.after(() => service.close());
  await service.initialize({ theme: 'dark' });
  await service.save({ schemaVersion: 1, rules: [rule({ source: { kind: 'home-assistant', baseUrl: 'https://ha.example.test/', entityId: 'input_boolean.evening', refreshMinutes: 5 } })] });
  const token = new TextEncoder().encode('opaque-token');
  await service.configureHomeAssistantToken('evening', token);
  const stored = await readFile(join(root, 'scheduled-settings.v1.json'), 'utf8');
  assert.doesNotMatch(stored, /opaque-token|token/u);
  assert.ok(vault.values.has('scheduled-settings-ha-evening:local-user'));
  await service.clearHomeAssistantToken('evening');
  assert.equal(vault.values.size, 0);
});

test('source schema rejects unsafe fields before persistence', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'scheduled-service-invalid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const service = new ScheduledSettingsService({ userDataDirectory: root, vault: memoryVault() });
  t.after(() => service.close());
  await service.initialize({ theme: 'dark' });
  await assert.rejects(service.save({ schemaVersion: 1, rules: [rule({ source: { kind: 'json-api', url: 'https://example.test/settings', refreshMinutes: 0, allowLoopbackHttpForDevelopment: false } })] }), /refreshMinutes/u);
  await assert.rejects(service.save({ schemaVersion: 1, rules: [rule({ source: { kind: 'home-assistant', baseUrl: 'https://ha.example.test', entityId: 'switch.unsupported', refreshMinutes: 5 } })] }), /Home Assistant/u);
  await assert.rejects(service.save({ schemaVersion: 1, rules: [rule({ settings: { secretSetting: true } })] }), /unsupported or invalid/u);
  await assert.rejects(service.save({ schemaVersion: 1, rules: [rule({ source: { kind: 'json-api', url: 'https://example.test/settings', refreshMinutes: 5, allowLoopbackHttpForDevelopment: false, entityId: 'input_boolean.smuggled' } })] }), /unexpected field/u);
});

test('explicit display-name edits replace the base even while a schedule owns the visible name', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'scheduled-service-name-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let now = new Date(2026, 7, 12, 19, 0);
  const service = new ScheduledSettingsService({ userDataDirectory: root, vault: memoryVault(), now: () => now });
  t.after(() => service.close());
  await service.initialize({ displayName: 'Original name' });
  await service.save({ schemaVersion: 1, rules: [rule({ settings: { displayName: 'Scheduled name' } })] });
  const active = await service.setBaseSettings({ displayName: 'New base name' }, true);
  assert.equal(active.effectiveSettings.displayName, 'Scheduled name');
  now = new Date(2026, 7, 12, 23, 0);
  const ended = await service.refresh(false);
  assert.equal(ended.effectiveSettings.displayName, 'New base name');
});
