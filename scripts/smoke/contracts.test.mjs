import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { assertBuiltArtifactFresh, assertGitClean, parseArgs, selectCaptureManifests } from './lib/contracts.mjs';
import { assertSingleTarget } from './lib/cdp.mjs';
import { assertUniquePngs, inspectPng } from './lib/png.mjs';
import { commandLine } from './lib/lowlevel.mjs';

const repo = new URL('../..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (value) => value.slice(1));

test('manifests have unique ids and filenames and only in-memory preparation', async () => {
  for (const name of ['app', 'site']) {
    const manifest = JSON.parse(await readFile(join(repo, 'scripts', 'smoke', `${name}-manifest.json`), 'utf8'));
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(new Set(manifest.captures.map((item) => item.id)).size, manifest.captures.length);
    assert.equal(new Set(manifest.captures.map((item) => item.file)).size, manifest.captures.length);
    for (const item of manifest.captures) {
      assert.match(item.file, /^[a-z0-9-]+\.png$/u);
      assert.doesNotMatch(item.prepare ?? '', /\.click\(\).*?(Authorize|install|uninstall|upgrade)|bridge\(\)\.run|restartToUpdate|exportView/iu);
    }
  }
});

test('single-target isolation rejects extra or unexpected targets', () => {
  const page = { type: 'page', url: 'https://example.test/', webSocketDebuggerUrl: 'ws://127.0.0.1/one' };
  assert.equal(assertSingleTarget([page], (target) => target.url === page.url, 'fixture'), page);
  assert.throws(() => assertSingleTarget([page, page], () => true, 'fixture'), /exactly one/u);
  assert.throws(() => assertSingleTarget([page], () => false, 'fixture'), /not the expected/u);
});

test('command line quotes paths without changing argument boundaries', () => {
  assert.equal(commandLine('C:\\Program Files\\App\\app.exe', ['--flag', 'value with spaces']), '"C:\\Program Files\\App\\app.exe" --flag "value with spaces"');
});

test('argument parser supports verify-only and capture selection', () => {
  assert.deepEqual(parseArgs(['--verify-only', '--mode', 'app', '--id', 'install-dark-en']), {
    mode: 'app', verifyOnly: true, allowPartial: false, ids: ['install-dark-en'], captureRoot: '', siteUrl: 'https://ding-ding-projects.github.io/material-winutil/',
  });
  assert.throws(() => parseArgs(['--mode', 'banana']), /invalid --mode/u);
});

test('capture ids are selected across only the active mode manifests', () => {
  const app = ['app', { captures: [{ id: 'app-only' }, { id: 'shared' }] }];
  const site = ['site', { captures: [{ id: 'site-only' }, { id: 'shared' }] }];
  assert.deepEqual(selectCaptureManifests([app, site], ['app-only']).map(([kind, manifest]) => [kind, manifest.captures.map((item) => item.id)]), [
    ['app', ['app-only']], ['site', []],
  ]);
  assert.deepEqual(selectCaptureManifests([site], ['site-only'])[0][1].captures.map((item) => item.id), ['site-only']);
  assert.throws(() => selectCaptureManifests([app], ['site-only']), /unknown capture id.*selected mode/iu);
  assert.throws(() => selectCaptureManifests([app, site], ['definitely-unknown']), /definitely-unknown/iu);
});

test('capture cleanliness check fails closed on tracked and untracked changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'material-winutil-clean-'));
  try {
    const run = async (...args) => new Promise((resolveRun, reject) => {
      const child = spawn('git', args, { cwd: root, windowsHide: true, stdio: 'ignore' });
      child.once('error', reject); child.once('close', (code) => code === 0 ? resolveRun() : reject(new Error(`git ${args[0]} exited ${code}`)));
    });
    await run('init'); await run('config', 'user.name', 'Smoke Fixture'); await run('config', 'user.email', 'smoke@example.invalid');
    await writeFile(join(root, 'tracked.txt'), 'one\n'); await run('add', 'tracked.txt'); await run('commit', '-m', 'fixture');
    assert.deepEqual((await assertGitClean(root)).clean, true);
    await writeFile(join(root, 'untracked.txt'), 'two\n');
    await assert.rejects(() => assertGitClean(root), /clean working tree.*untracked\.txt/iu);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('PNG inspector decodes a real capture and duplicate check fails closed', async () => {
  const file = join(repo, 'docs', 'screenshots', 'safe-package-catalogue-dark.png');
  const png = await inspectPng(file);
  assert.ok(png.width > 100 && png.height > 100 && png.sampledColors > 1);
  assert.throws(() => assertUniquePngs([{ file: 'a', png }, { file: 'b', png }]), /duplicate captures/u);
});

test('freshness preflight rejects a source newer than its built output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'material-winutil-freshness-'));
  try {
    const paths = [
      'src/main/main.ts', 'src/shared/types.ts', 'src/renderer/renderer.ts', 'src/renderer/index.html', 'src/renderer/styles.css', 'config/winutil.json',
      'dist/main/main.js', 'dist/main/preload.js', 'dist/shared/types.js', 'dist/renderer/renderer.js', 'dist/renderer/index.html', 'dist/renderer/styles.css', 'dist/config/winutil.json',
    ];
    for (const relative of paths) { const file = join(root, relative); await mkdir(join(file, '..'), { recursive: true }); await writeFile(file, relative); }
    const old = new Date('2020-01-01T00:00:00Z');
    const recent = new Date('2021-01-01T00:00:00Z');
    for (const relative of paths) await utimes(join(root, relative), old, old);
    await utimes(join(root, 'src/renderer/renderer.ts'), recent, recent);
    await assert.rejects(() => assertBuiltArtifactFresh(root), /built artifact is stale/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});
