import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const [main, preload, renderer, styles, packageManifest] = await Promise.all([
  readFile(new URL('../../src/main/main.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/main/preload.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/renderer/renderer.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/renderer/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../../package.json', import.meta.url), 'utf8'),
]);

test('build emits the exact verified offline documentation bundle into packaged dist', async () => {
  assert.match(packageManifest, /scripts\/build-offline-docs-bundle\.mjs/u);
  await access(new URL('../../dist/offline-docs/bundle.json', import.meta.url));
  const bundle = JSON.parse(await readFile(new URL('../../dist/offline-docs/bundle.json', import.meta.url), 'utf8'));
  assert.equal(bundle.schemaVersion, 1);
  assert.equal(bundle.articles.length, bundle.manifest.length);
  assert.ok(bundle.articles.length > 1);
  assert.deepEqual(bundle.articles.map(({ path }) => path), bundle.manifest.map(({ path }) => path));
});

test('trusted IPC verifies the bundle and independently revalidates explicit external links', () => {
  assert.match(main, /ipcMain\.handle\('docs:bundle',[\s\S]*?requireTrustedSender\(event\)[\s\S]*?loadOfflineDocs/u);
  assert.match(main, /verifyOfflineDocsBundle\(bundle\)/u);
  assert.match(main, /Buffer\.byteLength\(raw, 'utf8'\) > 4 \* 1024 \* 1024/u);
  assert.match(main, /ipcMain\.handle\('docs:open-external',[\s\S]*?\['https:', 'http:', 'mailto:'\][\s\S]*?parsed\.username \|\| parsed\.password[\s\S]*?shell\.openExternal/u);
  assert.match(preload, /loadOfflineDocs: \(\) => ipcRenderer\.invoke\('docs:bundle'\)/u);
  assert.match(preload, /openExternal: \(url\) => ipcRenderer\.invoke\('docs:open-external', url\)/u);
});

test('renderer uses distinct title and body searches with their own anchored regex builders', () => {
  assert.match(renderer, /searchLine\('docs-title', 'Search documentation titles'\)/u);
  assert.match(renderer, /searchLine\('docs-body', 'Search documentation article bodies'\)/u);
  assert.match(renderer, /titleSearch\.valid && bodySearch\.valid/u);
  assert.match(renderer, /state\.regexDraft\.target = key;[\s\S]*?openDialog\('regex'\)/u);
  assert.match(renderer, /Potentially unsafe backreferences or nested repeated quantifiers are not supported/u);
  assert.match(renderer, /Title search:[\s\S]*?Body search:/u);
});

test('safe AST renderer creates nodes without HTML injection and routes link kinds explicitly', () => {
  const astSurface = renderer.slice(renderer.indexOf('function offlineInlineNodes'), renderer.indexOf('function card'));
  assert.match(astSurface, /node\.type === 'text'\) return document\.createTextNode\(node\.value\)/u);
  assert.match(astSurface, /link\.kind === 'internal'/u);
  assert.match(astSurface, /link\.kind === 'external'/u);
  assert.match(astSurface, /link\.kind === 'unsafe'/u);
  assert.doesNotMatch(astSurface, /innerHTML|outerHTML|insertAdjacentHTML|\{\s*html:/u);
  assert.match(styles, /\.offline-doc-reader/u);
  assert.match(styles, /\.doc-link\.external/u);
});
