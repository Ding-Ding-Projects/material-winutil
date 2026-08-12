import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const { LocalHistory, LOCAL_HISTORY_IDENTITY } = await import(new URL('../../dist/main/local-history.js', import.meta.url));

async function git(repository, args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: repository,
    windowsHide: true,
    encoding: 'utf8',
  });
  return stdout.trim();
}

test('redacted snapshots use an isolated repository with stable identity and no remote', async (t) => {
  const appData = await mkdtemp(join(tmpdir(), 'material-winutil-local-history-'));
  t.after(() => rm(appData, { recursive: true, force: true }));
  const history = new LocalHistory({ appDataDirectory: appData });

  const first = await history.recordRedactedSnapshot('created', { settings: { theme: 'light' }, records: [] });
  assert.match(first.commit, /^[0-9a-f]{40}$/);
  assert.deepEqual(await history.currentSnapshot(), { settings: { theme: 'light' }, records: [] });
  assert.equal(await git(history.repositoryDirectory, ['remote']), '');
  assert.equal(await git(history.repositoryDirectory, ['config', 'user.name']), LOCAL_HISTORY_IDENTITY.name);
  assert.equal(await git(history.repositoryDirectory, ['config', 'user.email']), LOCAL_HISTORY_IDENTITY.email);
  assert.equal(await git(history.repositoryDirectory, ['log', '-1', '--format=%s']), 'Local history: created');
  assert.equal((await readdir(history.repositoryDirectory)).some((name) => name.endsWith('.tmp')), false);
});

test('restore appends a commit while preserving every prior revision', async (t) => {
  const appData = await mkdtemp(join(tmpdir(), 'material-winutil-local-history-'));
  t.after(() => rm(appData, { recursive: true, force: true }));
  const history = new LocalHistory({ appDataDirectory: appData });

  const first = await history.recordRedactedSnapshot('created', { settings: { theme: 'light' } });
  const second = await history.recordRedactedSnapshot('settings-changed', { settings: { theme: 'dark' } });
  const beforeRestore = (await git(history.repositoryDirectory, ['log', '--format=%H'])).split(/\r?\n/);
  assert.deepEqual(beforeRestore, [second.commit, first.commit]);

  const restored = await history.restore(first.commit.slice(0, 12));
  assert.notEqual(restored.commit, first.commit);
  assert.equal(restored.restoredFrom, first.commit);
  assert.deepEqual(await history.currentSnapshot(), { settings: { theme: 'light' } });
  assert.deepEqual((await git(history.repositoryDirectory, ['log', '--format=%H'])).split(/\r?\n/), [
    restored.commit,
    second.commit,
    first.commit,
  ]);
  assert.equal(await git(history.repositoryDirectory, ['rev-parse', `${restored.commit}^`]), second.commit);
  await git(history.repositoryDirectory, ['cat-file', '-e', `${first.commit}^{commit}`]);
  await git(history.repositoryDirectory, ['cat-file', '-e', `${second.commit}^{commit}`]);
});

test('date and action search is bounded and returns redacted metadata only', async (t) => {
  const appData = await mkdtemp(join(tmpdir(), 'material-winutil-local-history-'));
  t.after(() => rm(appData, { recursive: true, force: true }));
  const history = new LocalHistory({ appDataDirectory: appData });
  const start = new Date(Date.now() - 1_000).toISOString();

  await history.recordRedactedSnapshot('created', { records: [] });
  const updated = await history.recordRedactedSnapshot('updated', { records: [{ id: 'safe-record' }] });
  const entries = await history.search({ actions: ['updated'], from: start, to: new Date(Date.now() + 1_000), limit: 5 });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].commit, updated.commit);
  assert.equal('snapshot' in entries[0], false);
  await assert.rejects(history.search({ limit: 501 }), /limit must be between/);
});

test('sensitive fields, authentication URIs, and added remotes fail closed', async (t) => {
  const appData = await mkdtemp(join(tmpdir(), 'material-winutil-local-history-'));
  t.after(() => rm(appData, { recursive: true, force: true }));
  const history = new LocalHistory({ appDataDirectory: appData });
  await assert.rejects(history.recordRedactedSnapshot('created', { credentials: { value: 'redacted' } }), /sensitive field/);
  await assert.rejects(history.recordRedactedSnapshot('created', { accessToken: 'redacted' }), /sensitive field/);
  await assert.rejects(history.recordRedactedSnapshot('created', { note: 'otpauth://totp/not-allowed' }), /authentication secrets/);
  await assert.rejects(history.recordRedactedSnapshot('created', { note: undefined }), /only JSON values/);
  await history.recordRedactedSnapshot('created', { settings: {} });
  await git(history.repositoryDirectory, ['remote', 'add', 'origin', 'https://example.invalid/history.git']);
  await assert.rejects(history.recordRedactedSnapshot('updated', { settings: { theme: 'dark' } }), /must not have a remote/);
});
