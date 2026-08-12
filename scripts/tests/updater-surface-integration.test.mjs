import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const preload = await readFile(new URL('../../src/main/preload.ts', import.meta.url), 'utf8');
const main = await readFile(new URL('../../src/main/main.ts', import.meta.url), 'utf8');
const types = await readFile(new URL('../../src/shared/types.ts', import.meta.url), 'utf8');
const renderer = await readFile(new URL('../../src/renderer/renderer.ts', import.meta.url), 'utf8');

const routes = [
  ['updateStatus', 'update:status'], ['checkForUpdates', 'update:check'], ['cancelUpdateCheck', 'update:cancel'],
  ['deferUpdate', 'update:defer'], ['restartToUpdate', 'update:restart'],
];

test('shared bridge, preload, trusted main handlers, and renderer calls agree on every updater route', () => {
  for (const [method, channel] of routes) {
    assert.match(types, new RegExp(`${method}\\(`), `shared bridge misses ${method}`);
    assert.match(preload, new RegExp(`${method}:.*['\"]${channel.replace(':', '\\:')}['\"]`), `preload misses ${method}/${channel}`);
    assert.match(main, new RegExp(`ipcMain\\.handle\\(['\"]${channel.replace(':', '\\:')}['\"]`), `main misses trusted handler ${channel}`);
    assert.match(renderer, new RegExp(`bridge\\(\\)\\.${method}\\(`), `renderer misses ${method}`);
  }
  assert.doesNotMatch(main, /ipcMain\.on\('update:restart'/u);
  assert.match(main, /requireTrustedSender\(event\); return updateService!\.restart\(request\)/u);
});

test('renderer surfaces cancellation, persisted Later, and unsaved-work confirmation without injected success', () => {
  assert.match(renderer, /Cancel check/u);
  assert.match(renderer, /Later selected/u);
  assert.match(renderer, /function collectUnsavedWork\(\): string\[\]/u);
  assert.match(renderer, /state\.tabs\.filter\(\(tab\) => tab\.unsaved\)/u);
  assert.match(renderer, /Display-name edit/u);
  assert.match(renderer, /Scheduled-settings rule/u);
  assert.match(renderer, /Authenticator registration/u);
  assert.match(renderer, /Restart cancelled\. The update remains ready and no work was discarded/u);
  assert.match(renderer, /confirmDiscard: false/u);
  assert.match(renderer, /confirmDiscard: true/u);
});

test('capture manifest labels injected updater proof states truthfully', async () => {
  const manifest = JSON.parse(await readFile(new URL('../smoke/app-manifest.json', import.meta.url), 'utf8'));
  for (const id of ['updates-checking', 'updates-error', 'updates-ready']) {
    assert.equal(manifest.captures.find((capture) => capture.id === id)?.proof, 'controlled-renderer-fixture-only');
  }
});
