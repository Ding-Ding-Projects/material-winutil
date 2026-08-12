import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { assertBuiltArtifactFresh, assertGitClean, extractSquirrelApplication, gitChangedPaths, parseArgs, selectCaptureManifests } from './lib/contracts.mjs';
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
      if ((item.prepare ?? '').includes('state.tabs=[')) {
        const active = /state\.activeTab='([^']+)'/u.exec(item.prepare)?.[1];
        assert.ok(active, `${item.id} must select an active tab after replacing the tab list`);
        assert.match(item.prepare, new RegExp(`id:'${active}'`, 'u'), `${item.id} active tab must exist in its replacement list`);
      }
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

test('Squirrel application extraction receives paths without PowerShell argument loss', async () => {
  const root = await mkdtemp(join(tmpdir(), 'material-winutil-package-'));
  const source = join(root, 'source');
  const destination = join(root, 'destination with spaces');
  try {
    await mkdir(join(source, 'lib', 'net45'), { recursive: true });
    await writeFile(join(source, 'lib', 'net45', 'Smoke Product.exe'), 'fixture');
    const archive = join(root, 'package with spaces.nupkg');
    const command = `$ErrorActionPreference='Stop'; Compress-Archive -Path '${join(source, '*').replaceAll("'", "''")}' -DestinationPath '${archive.replaceAll("'", "''")}'`;
    await new Promise((resolveRun, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, stdio: 'ignore' });
      child.once('error', reject); child.once('close', (code) => code === 0 ? resolveRun() : reject(new Error(`fixture archive exited ${code}`)));
    });
    await extractSquirrelApplication(root, { packagePath: archive }, destination);
    assert.equal(await readFile(join(destination, 'Smoke Product.exe'), 'utf8'), 'fixture');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('capture ancestry path inspection identifies product changes after evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'material-winutil-capture-history-'));
  try {
    const run = async (...args) => new Promise((resolveRun, reject) => {
      const child = spawn('git', args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = ''; child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => { output += chunk; });
      child.once('error', reject); child.once('close', (code) => code === 0 ? resolveRun(output.trim()) : reject(new Error(`git ${args[0]} exited ${code}`)));
    });
    await run('init'); await run('config', 'user.name', 'Smoke Fixture'); await run('config', 'user.email', 'smoke@example.invalid');
    await writeFile(join(root, 'source.ts'), 'one\n'); await run('add', '.'); await run('commit', '-m', 'source');
    const sourceCommit = await run('rev-parse', 'HEAD');
    await mkdir(join(root, 'docs', 'screenshots', 'smoke'), { recursive: true });
    await writeFile(join(root, 'docs', 'screenshots', 'smoke', 'capture.png'), 'fixture'); await run('add', '.'); await run('commit', '-m', 'capture');
    assert.deepEqual(await gitChangedPaths(root, sourceCommit), ['docs/screenshots/smoke/capture.png']);
    await writeFile(join(root, 'source.ts'), 'two\n'); await run('add', '.'); await run('commit', '-m', 'product');
    assert.deepEqual(await gitChangedPaths(root, sourceCommit), ['docs/screenshots/smoke/capture.png', 'source.ts']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('capture verifier requires unsigned exact-set Squirrel provenance', async () => {
  const valid = {
    kind: 'validated-squirrel-full-package', developmentFallback: false,
    signatureStatus: 'NotSigned', setup: 'MaterialSystemUtility-Setup.exe',
    releases: 'RELEASES', fullPackage: 'MaterialSystemUtility-0.1.0-full.nupkg',
    packagePath: 'MaterialSystemUtility-0.1.0-full.nupkg', packageCount: 1,
  };
  assert.equal(valid.signatureStatus, 'NotSigned');
  assert.equal(valid.setup, 'MaterialSystemUtility-Setup.exe');
  assert.equal(valid.releases, 'RELEASES');
  assert.equal(valid.fullPackage, valid.packagePath);
  assert.equal(valid.packageCount, 1);
});

test('site reload preparation waits for a new document instead of trusting the destroyed context', async () => {
  const source = await readFile(join(repo, 'scripts', 'smoke', 'capture.mjs'), 'utf8');
  const siteSource = await readFile(join(repo, 'docs', 'site', 'app.js'), 'utf8');
  const storageKey = /const STORAGE_KEY = '([^']+)'/u.exec(siteSource)?.[1];
  assert.ok(storageKey, 'site source must declare its preference storage key');
  assert.match(source, new RegExp(`localStorage\\.setItem\\('${storageKey}'`, 'u'), 'capture must seed the exact site preference key');
  assert.match(source, /Runtime\\\.evaluate failed: \(\?:Uncaught\|Execution context\)/u);
  assert.match(source, /if \(!ready\) throw new Error\(`\$\{capture\.id\} did not finish navigation/u);
  assert.match(source, /document\.querySelector\('\[data-panel=\$\{literal\(capture\.page \?\? 'home'\)\}\]'\)!==null/u);
  assert.doesNotMatch(source, /ready = await client\.evaluate\(`[^`]*data-panel[^`]*:not\(\[hidden\]\)/u);
  assert.match(source, /document\.querySelector\('\[data-page=\$\{literal\(requestedPage\)\}\]'\)\?\.click\(\)/u);
  assert.match(source, /if \(!activated\) throw new Error\(`\$\{capture\.id\} could not activate/u);
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
