import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { AuthenticatorService } from '../../dist/main/authenticator-service.js';
import { base32Decode, generateTotp } from '../../dist/shared/totp.js';

const ID = '12345678-1234-4123-8123-123456789abc';
const SECRET = Buffer.from('12345678901234567890', 'ascii');
const NOW = 1_234_567_890_000;

async function fixture(overrides = {}, pendingLifetimeMs = 60_000) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'material-winutil-auth-'));
  const vault = new Map();
  const history = [];
  let uuidIndex = 0;
  let clock = NOW;
  const ids = [ID, '22345678-1234-4123-8123-123456789abc'];
  const dependencies = {
    now: () => clock,
    randomBytes: () => Buffer.from(SECRET),
    randomUUID: () => ids[uuidIndex++] ?? '32345678-1234-4123-8123-123456789abc',
    writeCredential: async (target, account, secret) => { vault.set(`${target}:${account}`, Buffer.from(secret)); },
    readCredential: async (target, account) => {
      const value = vault.get(`${target}:${account}`);
      return value ? Buffer.from(value) : null;
    },
    deleteCredential: async (target, account) => vault.delete(`${target}:${account}`),
    recordHistory: async (action, snapshot) => { history.push({ action, snapshot: structuredClone(snapshot) }); },
    ...overrides,
  };
  const service = new AuthenticatorService({ appDataDirectory: directory, dependencies, pendingLifetimeMs });
  return { directory, vault, history, service, advance(ms) { clock += ms; }, async cleanup() { await rm(directory, { recursive: true, force: true }); } };
}

test('registration reveals the secret once, rejects a wrong code, and confirms a current code', async () => {
  const f = await fixture();
  try {
    const registration = await f.service.begin({ mode: 'generate', issuer: 'Example', account: 'person@example.test' });
    assert.equal(registration.manualSecret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    assert.match(registration.uri, /^otpauth:\/\/totp\//);
    assert.match(registration.qrDataUrl, /^data:image\/png;base64,/);
    const png = PNG.sync.read(Buffer.from(registration.qrDataUrl.split(',')[1], 'base64'));
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    assert.equal(decoded?.data, registration.uri);
    await assert.rejects(f.service.confirm(registration.registrationId, '000000'), /did not match/);
    f.advance(1_000);
    const code = generateTotp(base32Decode(registration.manualSecret), { timestampMs: NOW });
    const entry = await f.service.confirm(registration.registrationId, code);
    assert.equal(entry.id, ID);
    await assert.rejects(f.service.confirm(registration.registrationId, code), /expired or was not found/);
    assert.deepEqual(await f.service.list(), [entry]);

    const metadata = await readFile(path.join(f.directory, 'authenticator-metadata.json'), 'utf8');
    assert.doesNotMatch(metadata, /GEZDGNB|otpauth|manualSecret|qrDataUrl|"secret"/i);
    assert.equal(f.history.length, 1);
    assert.equal(f.history[0].action, 'created');
    assert.doesNotMatch(JSON.stringify(f.history), /GEZDGNB|otpauth|manualSecret|qrDataUrl|"secret"/i);
  } finally { await f.cleanup(); }
});

test('import parses a bounded otpauth URI and records an imported redacted mutation', async () => {
  const f = await fixture();
  try {
    const uri = 'otpauth://totp/Example%3Aperson?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Example&algorithm=SHA1&digits=6&period=30';
    const registration = await f.service.begin({ mode: 'import', uri });
    assert.equal(registration.imported, true);
    const code = generateTotp(SECRET, { timestampMs: NOW });
    await f.service.confirm(registration.registrationId, code);
    assert.equal(f.history[0].action, 'imported');
    assert.doesNotMatch(JSON.stringify(f.history), /GEZDGNB|otpauth|"secret"/i);
  } finally { await f.cleanup(); }
});

test('codes expose current and next values without returning the secret, then remove vault before metadata', async () => {
  const f = await fixture();
  try {
    const registration = await f.service.begin({ mode: 'generate', account: 'person' });
    const code = generateTotp(SECRET, { timestampMs: NOW });
    await f.service.confirm(registration.registrationId, code);
    const codes = await f.service.codes(ID);
    assert.equal(codes.current, code);
    assert.match(codes.next, /^\d{6}$/);
    assert.equal(codes.secondsRemaining, 30 - (Math.floor(NOW / 1000) % 30));
    assert.equal('secret' in codes, false);
    assert.equal(await f.service.remove(ID), true);
    assert.deepEqual(await f.service.list(), []);
    assert.equal(f.vault.size, 0);
    assert.equal(f.history.at(-1).action, 'deleted');
  } finally { await f.cleanup(); }
});

test('confirmation rolls the vault back when metadata persistence cannot complete', async () => {
  const f = await fixture({ recordHistory: async () => { throw new Error('history unavailable'); } });
  try {
    const registration = await f.service.begin({ mode: 'generate', account: 'person' });
    const code = generateTotp(SECRET, { timestampMs: NOW });
    await assert.rejects(f.service.confirm(registration.registrationId, code), /could not be saved safely/);
    assert.equal(f.vault.size, 0);
    assert.deepEqual(await f.service.list(), []);
  } finally { await f.cleanup(); }
});

test('pending secret is expired by a timer even when no later operation occurs', async () => {
  const f = await fixture({}, 40);
  try {
    const registration = await f.service.begin({ mode: 'generate', account: 'person' });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const code = generateTotp(SECRET, { timestampMs: NOW });
    await assert.rejects(f.service.confirm(registration.registrationId, code), /expired or was not found/);
    assert.equal(f.vault.size, 0);
  } finally { await f.cleanup(); }
});

test('malformed imports and unexpected metadata fields fail closed', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.service.begin({ mode: 'import', uri: 'https://example.test/' }), /otpauth URI is invalid/);
    await assert.rejects(f.service.begin({ mode: 'generate', account: '', period: 0 }), /account/);
    await assert.rejects(f.service.begin({ mode: 'generate', account: 'person', unexpected: true }), /unexpected fields/);
  } finally { await f.cleanup(); }
});

test('cancellation invalidates pending registration and too many wrong codes purge it', async () => {
  const f = await fixture();
  try {
    const cancelled = await f.service.begin({ mode: 'generate', account: 'cancelled' });
    assert.equal(await f.service.cancel(cancelled.registrationId), true);
    await assert.rejects(f.service.confirm(cancelled.registrationId, generateTotp(SECRET, { timestampMs: NOW })), /expired or was not found/);

    const limited = await f.service.begin({ mode: 'generate', account: 'limited' });
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await assert.rejects(f.service.confirm(limited.registrationId, '000000'), /did not match/);
      f.advance(5_000);
    }
    await assert.rejects(f.service.confirm(limited.registrationId, '000000'), /Too many confirmation attempts/);
    f.advance(5_000);
    await assert.rejects(f.service.confirm(limited.registrationId, generateTotp(SECRET, { timestampMs: NOW })), /expired or was not found/);
  } finally { await f.cleanup(); }
});

test('rollback failure is surfaced instead of being silently swallowed', async () => {
  const f = await fixture({
    recordHistory: async () => { throw new Error('history unavailable'); },
    deleteCredential: async () => false,
  });
  try {
    const registration = await f.service.begin({ mode: 'generate', account: 'person' });
    const code = generateTotp(SECRET, { timestampMs: NOW });
    await assert.rejects(f.service.confirm(registration.registrationId, code), /could not be saved or rolled back automatically \(credential recovery failed\)/);
  } finally { await f.cleanup(); }
});
