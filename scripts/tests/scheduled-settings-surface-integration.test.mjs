import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [main, preload, types, renderer, styles, docs] = await Promise.all([
  readFile(new URL('../../src/main/main.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/main/preload.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/shared/types.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/renderer/renderer.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/renderer/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../../docs/features/scheduled-settings.md', import.meta.url), 'utf8'),
]);

test('trusted IPC and preload expose matching bounded scheduled-settings operations', () => {
  for (const channel of ['state', 'save', 'refresh', 'set-ha-token', 'clear-ha-token']) {
    assert.match(main, new RegExp(`scheduled-settings:${channel}`));
    assert.match(preload, new RegExp(`scheduled-settings:${channel}`));
  }
  for (const method of ['scheduledSettingsState', 'saveScheduledSettings', 'refreshScheduledSettings', 'setScheduledHomeAssistantToken', 'clearScheduledHomeAssistantToken', 'onScheduledSettingsState']) {
    assert.match(types, new RegExp(`\\b${method}\\s*\\(`));
    assert.match(renderer, new RegExp(`\\b${method}\\(`));
  }
  assert.match(main, /requireTrustedSender\(event\)/u);
  assert.doesNotMatch(preload, /node:fs|credential-vault|readCredential|writeCredential/u);
});

test('renderer ships an accessible tabbed schedule editor and local search contract', () => {
  assert.match(renderer, /role: 'tablist'.*Scheduled settings sections/su);
  assert.match(renderer, /role: 'tab'.*'aria-selected'/su);
  assert.match(renderer, /role: 'tabpanel'/u);
  assert.match(renderer, /type: 'date'/u);
  assert.match(renderer, /type: 'time'/u);
  assert.match(renderer, /fieldset.*legend.*Weekdays/su);
  assert.match(renderer, /Times use .*Daylight-saving.*Cross-midnight.*equal start and end/su);
  assert.match(renderer, /searchLine\('settings', 'Search settings, descriptions and current values'\)/u);
  assert.match(renderer, /selectField\('Activation source'/u);
  assert.match(renderer, /Every dropdown carries its own search field and its\s+\*\s+own anchored regex builder/u);
  assert.match(styles, /\.settings-subtabs/u);
  assert.match(styles, /\.schedule-rule-row/u);
});

test('scheduled-state events render once without writing effective preferences back as a base setting', () => {
  assert.match(renderer, /function applyPrefs\(persist = false\)/u);
  assert.match(renderer, /function savePrefs\(\): void \{ applyPrefs\(true\); \}/u);
  assert.match(renderer, /function acceptScheduledSettings[\s\S]*?applyPrefs\(false\);/u);
  assert.match(renderer, /function render\(\): void \{\s+applyPrefs\(false\);/u);
  assert.equal((renderer.match(/bridge\(\)\.writePrefs\(/gu) ?? []).length, 1, 'only explicit savePrefs may write renderer preferences');
  assert.match(renderer, /onScheduledSettingsState\(\(next\) => \{ acceptScheduledSettings\(next\); render\(\); \}\)/u);
});

test('docs state persistence, precedence, fallback, timezone, and security boundaries', () => {
  for (const phrase of ['local timezone', 'daylight-saving', 'cross-midnight', 'Higher priority', 'last valid', 'Credential Manager', 'private-network']) {
    assert.match(docs, new RegExp(phrase, 'iu'));
  }
});
