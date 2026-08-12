import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [main, preload, renderer, types, docs] = await Promise.all([
  readFile(new URL('../../src/main/main.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/main/preload.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/renderer/renderer.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/shared/types.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../docs/features/locks-and-authenticator.md', import.meta.url), 'utf8'),
]);

const channels = [
  ['state', 'locks:state'],
  ['create', 'locks:create'],
  ['update', 'locks:update'],
  ['remove', 'locks:remove'],
  ['search', 'locks:search'],
  ['unlock', 'locks:unlock'],
  ['relock', 'locks:relock'],
  ['recovery', 'locks:recovery'],
  ['open recovery folder', 'locks:open-recovery-folder'],
];

test('main registers every lock IPC channel with trusted sender checks', () => {
  for (const [label, channel] of channels) {
    assert.equal(main.includes(`ipcMain.handle('${channel}'`), true, `main missing ${label} channel`);
  }
  assert.match(main, /function locks\(\): LockService[\s\S]*?if \(!lockService\) throw/u);
  assert.match(main, /lockService = new LockService\(\{ appDataDirectory: USER_DIR\(\) \}\)/u);
  assert.match(main, /await lockService\.initialize\(\)/u);
  for (const channel of channels.map(([, value]) => value)) {
    const handler = main.slice(main.indexOf(`ipcMain.handle('${channel}'`), main.indexOf(`ipcMain.handle('${channel}'`) + 420);
    assert.match(handler, /requireTrustedSender\(event\)/u, `${channel} must validate its sender`);
  }
});

test('shared Bridge and preload expose matching lock operations', () => {
  const methods = [
    'lockState', 'lockCreate', 'lockUpdate', 'lockRemove', 'lockSearch',
    'lockUnlock', 'lockRelock', 'lockRecovery', 'lockOpenRecoveryFolder',
  ];
  for (const method of methods) assert.match(types, new RegExp(`\\b${method}\\s*\\(`), `Bridge missing ${method}`);
  const preloadCalls = {
    lockState: "ipcRenderer.invoke('locks:state'",
    lockCreate: "ipcRenderer.invoke('locks:create'",
    lockUpdate: "ipcRenderer.invoke('locks:update'",
    lockRemove: "ipcRenderer.invoke('locks:remove'",
    lockSearch: "ipcRenderer.invoke('locks:search'",
    lockUnlock: "ipcRenderer.invoke('locks:unlock'",
    lockRelock: "ipcRenderer.invoke('locks:relock'",
    lockRecovery: "ipcRenderer.invoke('locks:recovery'",
    lockOpenRecoveryFolder: "ipcRenderer.invoke('locks:open-recovery-folder'",
  };
  for (const [method, call] of Object.entries(preloadCalls)) {
    const line = preload.split(/\r?\n/u).find((candidate) => candidate.includes(`${method}:`));
    assert.ok(line, `preload mapping missing ${method}`);
    assert.equal(line.includes(call), true, `preload channel mismatch for ${method}`);
  }
});

test('renderer lock manager is functional and search owns an anchored regex builder', () => {
  assert.match(renderer, /function lockDialog\(\)/u);
  assert.match(renderer, /const query = sq\('locks'\)[\s\S]*?searchLine\('locks',/u);
  assert.match(renderer, /state\.regexDraft\.target = key;[\s\S]*?openDialog\('regex'\)/u);
  for (const operation of ['lockCreate', 'lockUnlock', 'lockRelock', 'lockRemove', 'lockRecovery', 'lockOpenRecoveryFolder']) {
    assert.match(renderer, new RegExp(`bridge\\(\\)\\.${operation}\\(`), `renderer missing ${operation}`);
  }
  assert.match(renderer, /function supportTicketSurface\(\)/u);
  assert.match(renderer, /Support Tickets/u);
  assert.match(renderer, /Nothing is sent anywhere\. No ticket exists outside this machine, no network request is made, no data is collected, and nobody is reading it\./u);
  assert.doesNotMatch(renderer, /Lock commands can still be discovered[\s\S]{0,160}unavailable dialog/u);
});

test('workspace tab lock state is projected from LockSurfaceState rather than a local toggle', () => {
  const sync = renderer.slice(renderer.indexOf('function syncWorkspaceLockState'), renderer.indexOf('async function refreshLocks'));
  assert.match(sync, /state\.locks\.data\.locks/u);
  assert.match(sync, /entry\.locked && entry\.record\.target\.kind === 'tab'/u);
  assert.match(sync, /tab\.locked !== next/u);
  assert.match(sync, /tab\.locked = next/u);
  assert.match(renderer, /state\.locks\.data = await bridge\(\)\.lockState\('main'\)/u);
});

test('recovery disclosure and folder action are explicitly open-only and never delete', () => {
  assert.match(renderer, /This is a user-experience lock, not a security boundary\./u);
  assert.match(renderer, /The app only opens this folder\. It never deletes anything for you\./u);
  const recoveryActions = renderer.match(/lockOpenRecoveryFolder\(\)/gu) ?? [];
  assert.ok(recoveryActions.length >= 2, 'recovery and support surfaces must expose the folder action');
  for (const line of renderer.split(/\r?\n/u).filter((candidate) => candidate.includes('lockOpenRecoveryFolder()'))) {
    assert.doesNotMatch(line, /(?:deleteCredential|unlink|rm\s+-rf|fs\.(?:rm|unlink))\s*\(/iu);
  }
  assert.doesNotMatch(main.slice(main.indexOf("ipcMain.handle('locks:open-recovery-folder'"), main.indexOf("ipcMain.handle('locks:open-recovery-folder'") + 500), /delete|unlink|rm\s+-rf/iu);
});

test('lock feature documentation no longer claims lock routes are unavailable', () => {
  assert.doesNotMatch(docs, /Password and OTP locks[\s\S]{0,100}remain unavailable/iu);
  assert.doesNotMatch(docs, /Locks remain a separate unimplemented feature/iu);
  assert.doesNotMatch(docs, /production lock dialog does not set a credential-backed lock/iu);
});
