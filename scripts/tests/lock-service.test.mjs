import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const buildRoot = process.env.LOCK_SERVICE_BUILD_ROOT
  ? path.resolve(process.env.LOCK_SERVICE_BUILD_ROOT)
  : path.resolve(import.meta.dirname, '../../dist');
const { LockService } = await import(new URL(`file:///${path.join(buildRoot, 'main/lock-service.js').replaceAll('\\', '/')}`));
const { LOCK_LIMITS } = await import(new URL(`file:///${path.join(buildRoot, 'shared/locks.js').replaceAll('\\', '/')}`));
const { base32Encode, generateTotp } = await import(new URL(`file:///${path.join(buildRoot, 'shared/totp.js').replaceAll('\\', '/')}`));

async function fixture(overrides = {}) {
  const appDataDirectory = await mkdtemp(path.join(os.tmpdir(), 'material-winutil-locks-'));
  const vault = new Map();
  const history = [];
  const opened = [];
  let identifier = 0;
  let now = 1_800_000_000_000;
  const key = (target, account) => `${target}\0${account}`;
  const dependencies = {
    now: () => now,
    randomUUID: () => `lock-id-${++identifier}`,
    randomBytes: (size) => Buffer.alloc(size, 0x2a),
    writeCredential: async (target, account, secret) => { vault.set(key(target, account), Buffer.from(secret)); },
    readCredential: async (target, account) => {
      const value = vault.get(key(target, account));
      return value ? Buffer.from(value) : null;
    },
    deleteCredential: async (target, account) => vault.delete(key(target, account)),
    recordHistory: async (action, snapshot) => { history.push({ action, snapshot }); },
    openPath: async (folder) => { opened.push(folder); return ''; },
    qrDataUrl: async () => `data:image/png;base64,${Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(24),
    ]).toString('base64')}`,
    ...overrides,
  };
  const service = new LockService({ appDataDirectory, dependencies });
  return {
    appDataDirectory, service, vault, history, opened,
    advance(milliseconds) { now += milliseconds; },
    async cleanup() { await rm(appDataDirectory, { recursive: true, force: true }); },
  };
}

const passwordRequest = (credential = 'correct horse battery staple') => ({
  target: { kind: 'tab', id: 'security' },
  label: 'Security',
  credential: { method: 'password', credential },
  unlockDuration: { kind: 'surface', minutes: null },
});

test('password locks persist metadata only and expose redacted public records', async () => {
  const context = await fixture();
  try {
    const created = await context.service.create(passwordRequest());
    assert.equal(created.credential.method, 'password-hash');
    assert.deepEqual(Object.keys(created.credential).sort(), ['method', 'revision']);
    assert.equal(context.vault.size, 1);
    const storedVerifier = [...context.vault.values()][0].toString('utf8');
    assert.doesNotMatch(storedVerifier, /correct horse battery staple/);
    assert.match(storedVerifier, /password-scrypt/);

    const stateText = await readFile(path.join(context.appDataDirectory, 'locks-state.json'), 'utf8');
    assert.doesNotMatch(stateText, /correct horse battery staple|password-scrypt|digestBase64|saltBase64/);
    assert.match(stateText, /"vaultKey"/);
    const state = await context.service.state('surface-a');
    assert.equal(state.locks[0].locked, true);
    assert.equal('vaultKey' in state.locks[0].record.credential, false);

    assert.equal(context.history.length, 1);
    const historyText = JSON.stringify(context.history[0]);
    assert.doesNotMatch(historyText, /vaultKey|digestBase64|saltBase64|correct horse battery staple/);
    assert.match(historyText, /credential-vault references are omitted/i);
  } finally { await context.cleanup(); }
});

test('surface leases, relock, until-close, and runtime throttling use LockRuntime semantics', async () => {
  const context = await fixture();
  try {
    const lock = await context.service.create(passwordRequest());
    assert.deepEqual(await context.service.unlock(lock.id, 'correct horse battery staple', 'surface-a'), {
      ok: true, code: 'unlocked', retryAtMs: null,
    });
    assert.equal((await context.service.state('surface-a')).locks[0].locked, false);
    assert.equal((await context.service.state('surface-b')).locks[0].locked, true);
    context.service.closeSurface('surface-a');
    assert.equal((await context.service.state('surface-a')).locks[0].locked, true);

    for (let attempt = 0; attempt < LOCK_LIMITS.maxFailedAttempts - 1; attempt += 1) {
      assert.equal((await context.service.unlock(lock.id, 'wrong', 'surface-a')).code, 'credential-rejected');
    }
    const throttled = await context.service.unlock(lock.id, 'wrong', 'surface-a');
    assert.equal(throttled.code, 'rate-limited');
    assert.ok(Number.isSafeInteger(throttled.retryAtMs));
    context.advance(LOCK_LIMITS.throttleMs);
    assert.equal((await context.service.unlock(lock.id, 'correct horse battery staple', 'surface-a')).ok, true);
    await context.service.relock(lock.id);
    assert.equal((await context.service.state('surface-a')).locks[0].locked, true);
  } finally { await context.cleanup(); }
});

test('TOTP setup is generated locally and refuses to arm without a matching confirmation code', async () => {
  const context = await fixture();
  try {
    const prepared = await context.service.prepareTotp('Appearance editor', 'local-user');
    assert.match(prepared.manualSecret, /^[A-Z2-7]+$/);
    assert.match(prepared.uri, /^otpauth:\/\/totp\//);
    assert.match(prepared.qrDataUrl, /^data:image\/png;base64,/);
    assert.equal(context.vault.size, 0);

    const invalid = {
      target: { kind: 'appearance-property', id: 'theme.seed' }, label: 'Seed color',
      credential: { method: 'totp', credential: prepared.manualSecret, confirmationCode: '000000' },
      unlockDuration: { kind: 'until-close', minutes: null },
    };
    await assert.rejects(context.service.create(invalid), /confirmation code did not match/i);
    assert.equal(context.vault.size, 0);

    const secret = Buffer.alloc(20, 0x2a);
    const code = generateTotp(secret, { timestampMs: 1_800_000_000_000, digits: 6, period: 30, algorithm: 'SHA1' });
    const lock = await context.service.create({
      ...invalid,
      credential: { method: 'totp', credential: base32Encode(secret), confirmationCode: code },
    });
    assert.equal(lock.credential.method, 'totp');
    assert.equal((await context.service.unlock(lock.id, code, 'main')).ok, true);
    context.service.closeApp();
    assert.equal((await context.service.state('main')).locks[0].locked, true);
  } finally { await context.cleanup(); }
});

test('search is bounded, plain-first, regex-capable, and rejects unsafe patterns', async () => {
  const context = await fixture();
  try {
    await context.service.create(passwordRequest());
    assert.equal((await context.service.search({ query: 'secur' })).length, 1);
    assert.equal((await context.service.search({ regex: { source: '^Security', flags: 'i' } })).length, 1);
    assert.equal((await context.service.search({ query: 'missing' })).length, 0);
    await assert.rejects(context.service.search({ regex: { source: '(a+)+$', flags: '' } }), /unsafe/);
    await assert.rejects(context.service.search({ query: 'x'.repeat(LOCK_LIMITS.maxLabelCodePoints + 1) }), /invalid/);
  } finally { await context.cleanup(); }
});

test('mutation failures roll credentials and metadata back coherently', async () => {
  let failHistory = false;
  const context = await fixture({
    recordHistory: async () => { if (failHistory) throw new Error('history unavailable'); },
  });
  try {
    const lock = await context.service.create(passwordRequest());
    const before = await readFile(path.join(context.appDataDirectory, 'locks-state.json'), 'utf8');
    const beforeVault = [...context.vault.values()][0].toString('base64');
    failHistory = true;
    await assert.rejects(context.service.update(lock.id, {
      label: 'Changed label',
      credential: { method: 'password', credential: 'new password value' },
    }), /could not be saved safely/);
    assert.equal(await readFile(path.join(context.appDataDirectory, 'locks-state.json'), 'utf8'), before);
    assert.equal([...context.vault.values()][0].toString('base64'), beforeVault);

    await assert.rejects(context.service.remove(lock.id), /could not be saved safely/);
    assert.equal((await context.service.state()).locks.length, 1);
    assert.equal(context.vault.size, 1);
  } finally { await context.cleanup(); }
});

test('recovery is an open-folder-only action and never deletes application data', async () => {
  const context = await fixture();
  try {
    await context.service.create(passwordRequest());
    const descriptor = context.service.recovery();
    assert.equal(descriptor.action, 'open-folder-only');
    assert.equal(descriptor.deletesData, false);
    assert.equal(descriptor.appDataFolder, context.appDataDirectory);
    await context.service.openRecoveryFolder();
    assert.deepEqual(context.opened, [context.appDataDirectory]);
    assert.equal((await context.service.state()).locks.length, 1);
  } finally { await context.cleanup(); }
});
