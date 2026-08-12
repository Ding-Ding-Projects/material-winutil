import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [main, preload, renderer, docs] = await Promise.all([
  readFile(new URL('../../src/main/main.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/main/preload.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/renderer/renderer.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../docs/features/exports-and-selection-profiles.md', import.meta.url), 'utf8'),
]);

test('structured export crosses a validated IPC boundary instead of renderer-authored file text', () => {
  assert.match(main, /exportStructuredRecords\(\{/u);
  assert.match(main, /ipcMain\.handle\('view:export'/u);
  assert.doesNotMatch(main, /payload\.body/u);
  assert.match(preload, /ipcRenderer\.invoke\('view:export'/u);
  assert.match(renderer, /records,\s*scope:/u);
  assert.match(renderer, /private vocabulary and TOTP\/authenticator secrets are always omitted/u);
});

test('archive controls expose every requested 7z tuning family and honest header warning', () => {
  for (const label of ['Compression level', 'Dictionary MiB', 'Word size', 'Solid block MiB', 'Threads', 'Split volume MiB', 'AES-256 content encryption', 'Encrypt headers']) {
    assert.match(renderer, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
  assert.match(renderer, /filenames remain visible because header encryption is off/u);
  assert.match(main, /child\.stdin\?\.end/u);
  assert.doesNotMatch(main, /args\.push\([^\n]*password/u);
});

test('saved exports offer direct VS Code opening through the detector', () => {
  assert.match(main, /detectExternalEditors/u);
  assert.match(main, /openExportInVSCode/u);
  assert.match(preload, /view:export-open-vscode/u);
  assert.match(renderer, /'Open in VS Code'/u);
});

test('history surface uses local Git browse, diff, restore, label, retention, and redacted export', () => {
  for (const channel of ['history:browse', 'history:diff', 'history:restore', 'history:label', 'history:prune', 'history:export']) {
    assert.match(main, new RegExp(channel, 'u'));
    assert.match(preload, new RegExp(channel, 'u'));
  }
  assert.match(renderer, /Local Git-backed history is append-only/u);
  assert.match(main, /history:configure-credential/u);
  assert.match(main, /writeCredential\(HISTORY_CREDENTIAL_TARGET/u);
  assert.match(renderer, /Unlock Git-backed history/u);
  assert.doesNotMatch(renderer, /Snapshot, diff, and restore are unavailable/u);
  assert.match(docs, /structured records/u);
});
