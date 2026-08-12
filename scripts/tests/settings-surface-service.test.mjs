import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const { SettingsSurfaceService } = await import(new URL('../../dist/main/settings-surface-service.js', import.meta.url));

function basePreferences() {
  return { language: 'Bilingual', englishFunnyLevel: 4, cantoneseFunnyLevel: 5, personalVocabularyEnabled: true, dimSumEnabled: true };
}

function vault() {
  const records = new Map();
  return {
    records,
    async write(target, account, secret) { records.set(`${target}:${account}`, Buffer.from(secret)); },
    async read(target, account) { const value = records.get(`${target}:${account}`); return value ? Buffer.from(value) : null; },
    async delete(target, account) { return records.delete(`${target}:${account}`); },
  };
}

test('production service persists display name, emoji choice, password verifier, and live School mode projection', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'material-winutil-settings-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const credentialVault = vault();
  const service = new SettingsSurfaceService({ userDataDirectory: join(root, 'app'), sharedAppDataDirectory: join(root, 'shared'), vault: credentialVault });
  let snapshot = await service.initialize(basePreferences());
  assert.equal(snapshot.displayName.displayName, 'Material System Utility');
  assert.equal(snapshot.schoolMode.status, 'ready');
  assert.equal(snapshot.schoolMode.effective.language, 'Bilingual');

  snapshot = await service.renameDisplayName('My Utility');
  assert.equal(snapshot.displayName.displayName, 'My Utility');
  snapshot = await service.setDialogEmojis(false);
  assert.equal(snapshot.dialogEmoji.showEmojisInDialogsAndMessageBoxes, false);
  assert.deepEqual(Object.values(snapshot.dialogDecorations), Array(6).fill(null));

  snapshot = await service.configureSchoolModePassword('correct horse battery staple');
  assert.equal(snapshot.schoolMode.state.credential.method, 'password');
  const storedCredential = [...credentialVault.records.values()][0].toString('utf8');
  assert.equal(storedCredential.includes('correct horse battery staple'), false);

  const enabled = await service.setSchoolModeEnabled(true);
  assert.equal(enabled.ok, true);
  assert.equal(service.snapshot().schoolMode.effective.language, 'English');
  assert.equal(service.snapshot().schoolMode.effective.personalVocabularyEnabled, false);
  assert.equal((await service.setSchoolModeEnabled(false, 'wrong')).code, 'credential-rejected');
  assert.equal((await service.setSchoolModeEnabled(false, 'correct horse battery staple')).ok, true);
  assert.equal(service.snapshot().schoolMode.effective.language, 'Bilingual');

  const restarted = new SettingsSurfaceService({ userDataDirectory: join(root, 'app'), sharedAppDataDirectory: join(root, 'shared'), vault: credentialVault });
  const restored = await restarted.initialize(basePreferences());
  assert.equal(restored.displayName.displayName, 'My Utility');
  assert.equal(restored.dialogEmoji.showEmojisInDialogsAndMessageBoxes, false);
});

test('corrupt shared state is explicit unavailable and never overwritten as disabled', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'material-winutil-settings-corrupt-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const shared = join(root, 'shared');
  await import('node:fs/promises').then(({ mkdir }) => mkdir(shared, { recursive: true }));
  const file = join(shared, 'school-mode.v1.json');
  await writeFile(file, '{bad json', 'utf8');
  const service = new SettingsSurfaceService({ userDataDirectory: join(root, 'app'), sharedAppDataDirectory: shared, vault: vault() });
  const snapshot = await service.initialize(basePreferences());
  assert.equal(snapshot.schoolMode.status, 'unavailable');
  assert.deepEqual(Object.values(snapshot.dialogDecorations), Array(6).fill(null));
  assert.equal(await readFile(file, 'utf8'), '{bad json');
  assert.equal((await service.setSchoolModeEnabled(true)).code, 'credential-unavailable');
});

test('production IPC, preload, and renderer preserve the bounded settings surface', async () => {
  const [main, preload, renderer] = await Promise.all([
    readFile(new URL('../../src/main/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/main/preload.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/renderer/renderer.ts', import.meta.url), 'utf8'),
  ]);
  for (const channel of ['settings-surface:state', 'display-name:rename', 'display-name:reset', 'dialog-emoji:set', 'school-mode:rename', 'school-mode:configure-password', 'school-mode:reset-credential', 'school-mode:set-enabled']) {
    assert.equal(main.includes(channel), true, `main missing ${channel}`);
    assert.equal(preload.includes(channel), true, `preload missing ${channel}`);
  }
  assert.match(main, /requireTrustedSender\(event\)/u);
  assert.doesNotMatch(preload, /node:fs|readCredential|writeCredential|deleteCredential/u);
  assert.match(renderer, /dialog-emoji-decoration[^\n]*role: 'presentation'[^\n]*'aria-hidden': 'true'/u);
  assert.match(renderer, /function schoolModeRestrictsPersonalization/u);
  assert.match(renderer, /state\.dimSumStartup \|\| schoolModeRestrictsPersonalization\(\)/u);
  assert.match(renderer, /About \$\{displayName\}/u);
});
