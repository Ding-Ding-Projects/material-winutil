import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { UpdateService, UPDATE_CHECK_INTERVAL_MS, UPDATE_FEED_URL, validateSquirrelReleasesMetadata, validateUpdateFeedUrl } from '../../dist/main/update-service.js';

function adapterFixture() {
  const listeners = new Map();
  const calls = { feed: [], checks: 0, restarts: 0 };
  return {
    calls,
    adapter: {
      setFeedURL(options) { calls.feed.push(options); },
      async checkForUpdates() { calls.checks += 1; },
      quitAndInstall() { calls.restarts += 1; },
      on(event, listener) { listeners.set(event, listener); },
    },
    emit(event, ...args) { listeners.get(event)?.(...args); },
  };
}

async function serviceFixture(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'material-winutil-update-'));
  const fixture = adapterFixture();
  const timers = [];
  const statuses = [];
  const service = new UpdateService({
    adapter: fixture.adapter, packaged: true, platform: 'win32', currentVersion: '1.0.0', userDataDirectory: root,
    fetchMetadata: async () => new TextEncoder().encode('0123456789012345678901234567890123456789 MaterialSystemUtility-1.1.0-full.nupkg 42\n'),
    setTimeout(callback, delay) { timers.push({ kind: 'timeout', callback, delay }); return 1; },
    setInterval(callback, delay) { timers.push({ kind: 'interval', callback, delay }); return 2; },
    onStatus(status) { statuses.push(status); }, ...overrides,
  });
  return { root, service, fixture, timers, statuses, async cleanup() { await rm(root, { recursive: true, force: true }); } };
}

test('validates one fixed credential-free HTTPS feed and bounded Squirrel metadata', () => {
  assert.equal(validateUpdateFeedUrl(UPDATE_FEED_URL).href, UPDATE_FEED_URL);
  assert.throws(() => validateUpdateFeedUrl('https://user:pass@example.test/'), /credential-free/u);
  assert.throws(() => validateUpdateFeedUrl('http://github.com/Ding-Ding-Projects/material-winutil/releases/latest/download/'), /HTTPS/u);
  validateSquirrelReleasesMetadata(new TextEncoder().encode('0123456789012345678901234567890123456789 app-1.0.0-full.nupkg 12\n'));
  assert.throws(() => validateSquirrelReleasesMetadata(new TextEncoder().encode('not releases metadata')), /malformed/u);
  assert.throws(() => validateSquirrelReleasesMetadata(new Uint8Array(256 * 1024 + 1)), /exceeds/u);
});

test('initializes the adapter and bounded startup/background schedule', async (t) => {
  const f = await serviceFixture(); t.after(f.cleanup);
  await f.service.initialize();
  assert.deepEqual(f.fixture.calls.feed, [{ url: UPDATE_FEED_URL }]);
  assert.deepEqual(f.timers.map(({ kind, delay }) => ({ kind, delay })), [{ kind: 'timeout', delay: 15_000 }, { kind: 'interval', delay: UPDATE_CHECK_INTERVAL_MS }]);
});

test('serializes checks, exposes downloading/ready, and preserves staged ready state', async (t) => {
  let resolveMetadata;
  const metadata = new Promise((resolve) => { resolveMetadata = resolve; });
  const f = await serviceFixture({ fetchMetadata: () => metadata }); t.after(f.cleanup);
  await f.service.initialize();
  const first = f.service.check(); const second = f.service.check();
  assert.equal(first, second);
  resolveMetadata(new TextEncoder().encode('0123456789012345678901234567890123456789 app-1.1.0-full.nupkg 42\n'));
  await first;
  assert.equal(f.fixture.calls.checks, 1);
  f.fixture.emit('update-available'); assert.equal(f.service.status().state, 'downloading');
  f.fixture.emit('update-downloaded', {}, 'Release notes', 'v1.1.0'); assert.equal(f.service.status().state, 'ready');
  await f.service.check(); assert.equal(f.fixture.calls.checks, 1); assert.equal(f.service.status().state, 'ready');
});

test('reports offline, malformed metadata, corrupt hash adapter errors, and cancellation', async (t) => {
  const offline = await serviceFixture({ fetchMetadata: async () => { throw new Error('offline'); } }); t.after(offline.cleanup);
  await offline.service.initialize(); await offline.service.check(); assert.match(offline.service.status().message, /offline/u);
  const corrupt = await serviceFixture({ fetchMetadata: async () => new TextEncoder().encode('broken') }); t.after(corrupt.cleanup);
  await corrupt.service.initialize(); await corrupt.service.check(); assert.match(corrupt.service.status().message, /malformed/u);
  corrupt.fixture.emit('error', new Error('package hash mismatch')); assert.match(corrupt.service.status().message, /integrity validation failed.*hash mismatch/u);
  let aborted = false;
  const cancelling = await serviceFixture({ fetchMetadata: (_url, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })); })) }); t.after(cancelling.cleanup);
  await cancelling.service.initialize(); void cancelling.service.check();
  assert.equal(cancelling.service.cancel().state, 'cancelled'); assert.equal(aborted, true); assert.equal(cancelling.fixture.calls.checks, 0);
});

test('persists Later, protects unsaved work, authorizes restart, and detects replacement or rollback on next launch', async (t) => {
  const f = await serviceFixture(); t.after(f.cleanup); await f.service.initialize();
  f.fixture.emit('update-downloaded', {}, 'Ready', 'v1.1.0');
  assert.equal((await f.service.defer()).deferred, true);
  const blocked = await f.service.restart({ unsavedWork: ['Settings draft', 'Settings draft'], confirmDiscard: false });
  assert.deepEqual(blocked, { status: 'unsaved-work', unsavedWork: ['Settings draft'] }); assert.equal(f.fixture.calls.restarts, 0);
  assert.deepEqual(await f.service.restart({ unsavedWork: ['Settings draft'], confirmDiscard: true }), { status: 'restarting' }); assert.equal(f.fixture.calls.restarts, 1);
  const stateText = await readFile(join(f.root, 'application-update-state.v1.json'), 'utf8'); assert.match(stateText, /pendingRestart/); assert.doesNotMatch(stateText, /deferredVersion/);

  const replacementFixture = adapterFixture();
  const replacement = new UpdateService({ adapter: replacementFixture.adapter, packaged: false, platform: 'win32', currentVersion: '1.1.0', userDataDirectory: f.root });
  await replacement.initialize(); assert.equal(replacement.status().state, 'up-to-date'); assert.match(replacement.status().message, /installed successfully/u);

  await f.service.restart({ unsavedWork: [], confirmDiscard: false });
  const rollbackFixture = adapterFixture();
  const rollback = new UpdateService({ adapter: rollbackFixture.adapter, packaged: false, platform: 'win32', currentVersion: '1.0.0', userDataDirectory: f.root });
  await rollback.initialize(); assert.equal(rollback.status().state, 'rolled-back'); assert.match(rollback.status().message, /previous version remains active/u);
});

