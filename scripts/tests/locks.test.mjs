import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const locks = await import(new URL('../../dist/shared/locks.js', import.meta.url));

const APP_DATA = String.raw`C:\Users\Example\AppData\Roaming\MaterialSystemUtility`;

function record(overrides = {}) {
  return locks.validateLockRecord({
    id: 'lock.tabs.settings',
    target: { kind: 'tab', id: 'settings' },
    label: 'Settings tab',
    credential: { method: 'password-hash', vaultKey: 'locks/tab/settings', revision: 1 },
    unlockDuration: { kind: 'surface', minutes: null },
    lockedOnLaunch: true,
    ...overrides,
  });
}

function accepted(matchedTotpStep = null) { return { status: 'accepted', matchedTotpStep }; }
function rejected() { return { status: 'rejected', matchedTotpStep: null }; }

test('creates, changes, removes, enumerates, and searches independent target locks', () => {
  let state = locks.createEmptyLocksState(APP_DATA);
  const tab = record();
  const group = record({
    id: 'lock.group.primary', target: { kind: 'group', id: 'primary' }, label: 'Primary group',
    credential: { method: 'totp', vaultKey: 'locks/group/primary', revision: 4 },
    unlockDuration: { kind: 'until-close', minutes: null },
  });
  const property = record({
    id: 'lock.appearance.font', target: { kind: 'appearance-property', id: 'tab.settings.font-family' },
    label: 'Settings tab font', credential: { method: 'password-hash', vaultKey: 'locks/appearance/font', revision: 2 },
    unlockDuration: { kind: 'minutes', minutes: 10 },
  });
  const created = locks.createLock(state, tab, 1_000);
  assert.equal(created.history.action, 'lock-created');
  state = locks.createLock(created.state, group, 1_001).state;
  state = locks.createLock(state, property, 1_002).state;
  assert.deepEqual(locks.listLocks(state).map((item) => item.target.kind), ['tab', 'group', 'appearance-property']);

  const runtime = new locks.LockRuntime(() => 2_000);
  assert.deepEqual(locks.searchLocks(state, runtime, 'font').map((item) => item.paletteLabel), ['Settings tab font — Locked']);
  const changed = locks.changeLock(state, 'lock.appearance.font', record({
    ...property, label: 'Font family', credential: { ...property.credential, revision: 3 },
  }), 1_003);
  assert.equal(changed.changed, true);
  assert.equal(changed.history.before.credentialReference, 'redacted');
  assert.equal(changed.history.after.credentialReference, 'redacted');
  assert.equal(JSON.stringify(changed.history).includes('locks/appearance/font'), false);
  const removed = locks.removeLock(changed.state, group.id, 1_004);
  assert.equal(removed.history.action, 'lock-removed');
  assert.equal(locks.listLocks(removed.state).length, 2);

  assert.throws(() => locks.createLock(state, record({ id: 'another-lock' })), /unique/i);
  assert.throws(() => locks.createLock(state, record({ id: 'lock.tabs.settings' })), /unique/i);
  assert.throws(() => locks.createLock(state, record({
    id: 'lock.independence', target: { kind: 'tab', id: 'independence' },
    credential: { method: 'password-hash', vaultKey: group.credential.vaultKey, revision: 9 },
  })), /independent credential-vault key/i);
});

test('passes constant metadata-only verifier shapes and accepts password hash or bounded TOTP skew', async () => {
  let now = 10_000;
  const runtime = new locks.LockRuntime(() => now);
  const passwordLock = record({ unlockDuration: { kind: 'minutes', minutes: 2 } });
  let passwordRequest;
  assert.deepEqual(await runtime.unlock(passwordLock, (request) => {
    passwordRequest = request;
    return accepted();
  }), { ok: true, code: 'unlocked', retryAtMs: null });
  assert.deepEqual(Object.keys(passwordRequest).sort(), [
    'allowedTotpSkewSteps', 'credentialMethod', 'credentialRevision', 'lockId', 'purpose', 'targetId', 'targetKind', 'vaultKey',
  ]);
  assert.deepEqual(passwordRequest, {
    lockId: 'lock.tabs.settings', targetKind: 'tab', targetId: 'settings', credentialMethod: 'password-hash',
    vaultKey: 'locks/tab/settings', credentialRevision: 1, purpose: 'unlock', allowedTotpSkewSteps: 0,
  });
  assert.equal(runtime.isUnlocked(passwordLock), true);
  now += 120_000;
  assert.equal(runtime.isUnlocked(passwordLock), false);

  for (const matchedTotpStep of [-1, 0, 1]) {
    const totp = record({
      id: `lock.totp.${matchedTotpStep + 1}`, target: { kind: 'group', id: `group-${matchedTotpStep + 1}` },
      credential: { method: 'totp', vaultKey: `locks/totp/${matchedTotpStep + 1}`, revision: 1 },
      unlockDuration: { kind: 'until-close', minutes: null },
    });
    assert.equal((await runtime.unlock(totp, () => accepted(matchedTotpStep))).ok, true);
  }
  const outsideSkew = record({
    id: 'lock.totp.outside', target: { kind: 'group', id: 'outside' },
    credential: { method: 'totp', vaultKey: 'locks/totp/outside', revision: 1 },
    unlockDuration: { kind: 'until-close', minutes: null },
  });
  assert.deepEqual(await runtime.unlock(outsideSkew, () => accepted(2)), {
    ok: false, code: 'credential-unavailable', retryAtMs: null,
  });
  assert.deepEqual(await runtime.unlock(passwordLock, () => ({ ...accepted(), extra: true })), {
    ok: false, code: 'credential-unavailable', retryAtMs: null,
  });
  assert.deepEqual(await runtime.unlock(passwordLock, () => ({ status: 'unavailable', matchedTotpStep: null })), {
    ok: false, code: 'credential-unavailable', retryAtMs: null,
  });
  assert.deepEqual(await runtime.unlock(passwordLock, () => { throw new Error('vault unavailable'); }), {
    ok: false, code: 'credential-unavailable', retryAtMs: null,
  });
});

test('supports surface, minute, until-close, explicit relock, and locked-on-launch runtime semantics', async () => {
  let now = 1_000;
  const runtime = new locks.LockRuntime(() => now);
  const surface = record();
  assert.equal(surface.lockedOnLaunch, true);
  assert.equal(runtime.isUnlocked(surface, 'settings-window'), false);
  assert.equal((await runtime.unlock(surface, () => accepted(), 'settings-window')).ok, true);
  assert.equal(runtime.isUnlocked(surface, 'settings-window'), true);
  assert.equal(runtime.isUnlocked(surface, 'other-window'), false);
  assert.deepEqual(runtime.closeSurface('settings-window'), [surface.id]);
  assert.equal(runtime.isUnlocked(surface, 'settings-window'), false);

  const untilClose = record({
    id: 'lock.until-close', target: { kind: 'group', id: 'until-close' },
    unlockDuration: { kind: 'until-close', minutes: null },
  });
  await runtime.unlock(untilClose, () => accepted());
  assert.equal(runtime.isUnlocked(untilClose), true);
  assert.equal(runtime.lockAgain(untilClose.id), true);
  assert.equal(runtime.isUnlocked(untilClose), false);
  await runtime.unlock(untilClose, () => accepted());
  assert.deepEqual(runtime.closeApplication(), [untilClose.id]);
  assert.equal(runtime.isUnlocked(untilClose), false);

  const minute = record({
    id: 'lock.minute', target: { kind: 'appearance-property', id: 'font-size' },
    unlockDuration: { kind: 'minutes', minutes: 1 },
  });
  await runtime.unlock(minute, () => accepted());
  now += 59_999;
  assert.equal(runtime.isUnlocked(minute), true);
  now += 1;
  assert.equal(runtime.isUnlocked(minute), false);
});

test('rate limits repeated rejection per independent lock without deleting anything', async () => {
  let now = 50_000;
  let calls = 0;
  const runtime = new locks.LockRuntime(() => now);
  const first = record();
  const second = record({ id: 'lock.second', target: { kind: 'tab', id: 'second' } });
  const verifier = () => { calls += 1; return rejected(); };
  assert.equal((await runtime.unlock(first, verifier, 'main')).code, 'credential-rejected');
  assert.equal((await runtime.unlock(first, verifier, 'main')).code, 'credential-rejected');
  const throttled = await runtime.unlock(first, verifier, 'main');
  assert.deepEqual(throttled, { ok: false, code: 'rate-limited', retryAtMs: now + locks.LOCK_LIMITS.throttleMs });
  assert.equal((await runtime.unlock(first, verifier, 'main')).code, 'rate-limited');
  assert.equal(calls, 3);
  assert.equal((await runtime.unlock(second, () => accepted(), 'main')).ok, true);
  now += locks.LOCK_LIMITS.throttleMs;
  assert.equal((await runtime.unlock(first, () => accepted(), 'main')).ok, true);
});

test('labels locked results and excludes locked tabs from bulk close unless explicitly included', async () => {
  let state = locks.createLock(locks.createEmptyLocksState(APP_DATA), record()).state;
  state = locks.createLock(state, record({
    id: 'lock.tabs.about', target: { kind: 'tab', id: 'about' }, label: 'About tab',
    credential: { method: 'password-hash', vaultKey: 'locks/tab/about', revision: 1 },
  })).state;
  const runtime = new locks.LockRuntime(() => 1_000);
  await runtime.unlock(state.locks[1], () => accepted(), 'main');
  assert.deepEqual(locks.searchLocks(state, runtime, 'tab', 'main').map((result) => result.statusLabel), ['Locked', 'Unlocked']);
  assert.deepEqual(locks.previewBulkClose(state, runtime, ['settings', 'about', 'home'], { surfaceId: 'main' }), {
    requested: 3, closeable: ['about', 'home'], excludedLocked: ['settings'], includeLocked: false,
  });
  assert.deepEqual(locks.previewBulkClose(state, runtime, ['settings', 'about'], { includeLocked: true, surfaceId: 'main' }), {
    requested: 2, closeable: ['settings', 'about'], excludedLocked: [], includeLocked: true,
  });
});

test('history stays redacted and restore refuses missing vault references', async () => {
  const saved = record();
  const empty = locks.createEmptyLocksState(APP_DATA);
  let received;
  const missing = await locks.restoreLock(empty, saved, (reference) => {
    received = reference;
    return false;
  }, 3_000);
  assert.deepEqual(received, saved.credential);
  assert.deepEqual(missing, { ok: false, code: 'credential-unavailable', state: empty, history: null });
  assert.equal(missing.state.locks.length, 0);

  const restored = await locks.restoreLock(empty, saved, () => true, 3_001);
  assert.equal(restored.ok, true);
  assert.equal(restored.history.action, 'lock-restored');
  const serialized = JSON.stringify(restored.history);
  assert.equal(serialized.includes(saved.credential.vaultKey), false);
  assert.equal(serialized.includes('credentialReference":"redacted'), true);
});

test('provides exact recovery disclosure and School mode leaves locks enforced in forced English', () => {
  const recovery = locks.createLockRecoveryDescriptor(APP_DATA);
  assert.deepEqual(recovery, {
    appDataFolder: APP_DATA,
    disclosure: 'This is a user-experience lock, not a security boundary.',
    resetInstruction: `To reset every lock, close the app and delete this application-data folder yourself: ${APP_DATA}`,
    copyText: `This is a user-experience lock, not a security boundary.\nTo reset every lock, close the app and delete this application-data folder yourself: ${APP_DATA}\nThe app opens the folder only and never deletes it for you.`,
    action: 'open-folder-only', deletesData: false,
  });
  assert.deepEqual(locks.deriveSchoolModeLockPresentation(true, 'Study time'), {
    schoolModeEnabled: true, schoolModeLabel: 'Study time', language: 'English', locksRemainEnforced: true,
    lockControlsDiscoverable: true, disclosure: 'This is a user-experience lock, not a security boundary.',
  });
  assert.equal(locks.deriveSchoolModeLockPresentation(false, 'Study time').language, 'configured');
});

test('bounded versioned parser rejects duplicate, unknown, unsafe, inconsistent, and unbounded data', () => {
  const state = locks.createLock(locks.createEmptyLocksState(APP_DATA), record()).state;
  assert.deepEqual(locks.parseLocksStateJson(JSON.stringify(state)), state);
  const plain = JSON.parse(JSON.stringify(state));
  const invalid = [
    { ...plain, schemaVersion: 2 },
    { ...plain, unexpected: true },
    { ...plain, generation: -1 },
    { ...plain, locks: [{ ...plain.locks[0], extra: true }] },
    { ...plain, locks: [{ ...plain.locks[0], lockedOnLaunch: false }] },
    { ...plain, locks: [{ ...plain.locks[0], credential: { ...plain.locks[0].credential, method: 'plaintext' } }] },
    { ...plain, locks: [{ ...plain.locks[0], credential: { ...plain.locks[0].credential, value: 'forbidden' } }] },
    { ...plain, locks: [{ ...plain.locks[0], unlockDuration: { kind: 'minutes', minutes: 0 } }] },
  ];
  for (const candidate of invalid) assert.throws(() => locks.validateLocksState(candidate));
  assert.throws(() => locks.parseLocksStateJson(JSON.stringify(plain).replace('"generation":1', '"generation":1,"generation":1')), /duplicate/i);
  assert.throws(() => locks.parseLocksStateJson(JSON.stringify(plain).replace('"generation":1', '"__proto__":{},"generation":1')), /unsafe/i);
  assert.throws(() => locks.parseLocksStateJson('{nope'), /malformed/i);
  assert.throws(() => locks.parseLocksStateJson(`{"x":${'['.repeat(11)}0${']'.repeat(11)}}`), /nesting limit/i);
  assert.throws(() => locks.parseLocksStateJson(`{"schemaVersion":1,"generation":0,"appDataFolder":"x","locks":[${Array(locks.LOCK_LIMITS.maxLocks + 1).fill('null').join(',')}]}`), /too many records/i);
  assert.throws(() => locks.parseLocksStateJson(' '.repeat(locks.LOCK_LIMITS.jsonBytes + 1)), /byte limit/i);
  assert.throws(() => locks.parseLocksStateJson(Uint8Array.from([0xc3, 0x28])), /UTF-8/i);
});

test('source has no credential values, persistence, logging, network, or secret characterization', async () => {
  const source = await readFile(new URL('../../src/shared/locks.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /entered(?:Password|Pin|Code)|plain(?:text)?(?:Password|Credential)|credentialValue|secret(?:Value|Length|Bytes)/i);
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|https?:\/\/|node:(?:fs|net|http|https)|ipcRenderer|localStorage|console\./);
  assert.doesNotMatch(source, /writeFile|appendFile|credentialVault\.(?:get|set)|keytar/);
  assert.equal(source.includes('LockVerificationRequest'), true);
  assert.equal(source.includes("credentialReference: 'redacted'"), true);
});
