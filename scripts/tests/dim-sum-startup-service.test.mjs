import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import { DimSumSurpriseService } from '../../dist/main/dim-sum-surprise-service.js';

function fixtureImage() {
  const png = new PNG({ width: 1, height: 1 });
  png.data.set([245, 178, 83, 255]);
  return PNG.sync.write(png);
}

function fixtureAsset(bytes) {
  const name = 'classic-har-gow.png';
  return {
    repository: 'Ding-Ding-Projects/dim-sum-photos', catalogSchemaVersion: '1.0.0',
    catalogRevision: '0123456789abcdef0123456789abcdef01234567',
    catalogUrl: 'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/0123456789abcdef0123456789abcdef01234567/catalog/index.json',
    dishId: 'hk-dish-0001', names: { English: 'Classic Har Gow', Yue: '蝦餃' },
    imageAlt: { English: 'Classic Har Gow', Yue: '蝦餃' }, imagePath: `images/${name}`,
    releaseTag: 'catalog-v1', releaseDraft: false, releasePrerelease: false, assetName: name,
    assetUrl: `https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/${name}`,
    assetState: 'uploaded', contentType: 'image/png', assetSize: bytes.length,
    sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  };
}

function requestContext() {
  return {
    context: { firstRun: false, errorPath: false, updateFlow: false, activeTask: false, quietHours: false, doNotDisturb: false, schoolMode: false },
    language: 'Bilingual', englishFunnyLevel: 3, yueFunnyLevel: 3, reducedMotion: false,
  };
}

test('cache refresh accepts only bounded allowlisted redirects, validates a decodable PNG, and shows only after first run', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'material-winutil-dimsum-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const image = fixtureImage(); const asset = fixtureAsset(image); const requests = [];
  const fetchAsset = async (url, options) => {
    requests.push({ url, redirect: options.redirect, credentials: options.credentials });
    if (requests.length === 1) return new Response(null, { status: 302, headers: { location: `https://objects.githubusercontent.com/public/${asset.assetName}` } });
    return new Response(image, { status: 200, headers: { 'content-length': String(image.length) } });
  };
  const first = new DimSumSurpriseService({ userDataDirectory: root, publicAsset: asset, randomDraw: () => 0, fetchAsset, now: () => new Date('2026-08-12T16:00:00.000Z') });
  assert.equal(await first.startup(requestContext()), null, 'first run stays quiet even if a cache becomes available later');
  assert.equal(await first.refresh(), true);
  assert.deepEqual(requests.map(({ redirect, credentials }) => ({ redirect, credentials })), [
    { redirect: 'manual', credentials: 'omit' }, { redirect: 'manual', credentials: 'omit' },
  ]);
  const second = new DimSumSurpriseService({ userDataDirectory: root, publicAsset: asset, randomDraw: () => 0 });
  const shown = await second.startup(requestContext());
  assert.ok(shown);
  assert.equal(shown.descriptor.presentation, 'non-blocking');
  assert.equal(shown.descriptor.requestsFocus, false);
  assert.match(shown.imageDataUrl, /^data:image\/png;base64,/u);
  const manifest = await readFile(join(root, 'dim-sum-surprise', 'cache.v1.json'), 'utf8');
  assert.match(manifest, /catalog-v1/u);
  assert.doesNotMatch(manifest, /data:image|base64/u);
});

test('cache refresh fails closed for an untrusted redirect or a corrupt image', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'material-winutil-dimsum-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const image = fixtureImage(); const asset = fixtureAsset(image);
  const redirected = new DimSumSurpriseService({
    userDataDirectory: root, publicAsset: asset, randomDraw: () => 0,
    fetchAsset: async () => new Response(null, { status: 302, headers: { location: 'https://example.test/photo.png' } }),
  });
  assert.equal(await redirected.refresh(), false);
  const corrupt = new DimSumSurpriseService({
    userDataDirectory: root, publicAsset: asset, randomDraw: () => 0,
    fetchAsset: async () => new Response(new Uint8Array(image.length), { status: 200, headers: { 'content-length': String(image.length) } }),
  });
  assert.equal(await corrupt.refresh(), false);
});

test('renderer requests the main-owned decision once and renders an auto-dismissing non-modal card', async () => {
  const renderer = await readFile(new URL('../../src/renderer/renderer.ts', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../../src/renderer/styles.css', import.meta.url), 'utf8');
  const core = await readFile(new URL('../../src/shared/dim-sum-surprise.ts', import.meta.url), 'utf8');
  assert.match(renderer, /const surprise = await bridge\(\)\.dimSumStartup\(\);[\s\S]*showDimSumStartup\(surprise\)/u);
  assert.match(renderer, /window\.setTimeout\(\(\) => dismissDimSumStartup\(\), presentation\.descriptor\.autoDismissMs\)/u);
  assert.match(renderer, /role: 'status'[\s\S]*dismissDimSumStartup/u);
  assert.match(core, /requestsFocus: false/u);
  assert.doesNotMatch(renderer, /maybeDimSum|DIM_SUM|dimSumSeen/u);
  assert.match(styles, /\.dim-sum-startup \{[\s\S]*background: var\(--md-sys-color-surface-container-high\)/u);
  assert.doesNotMatch(styles, /\.dim-sum-startup[^{]*\{[^}]*opacity:/u);
});
