import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import { AppLogoService } from '../../dist/main/app-logo-service.js';

function fixture() {
  const png = new PNG({ width: 18, height: 10 });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const pixel = (y * png.width + x) * 4;
      png.data[pixel] = x * 11;
      png.data[pixel + 1] = y * 21;
      png.data[pixel + 2] = 140;
      png.data[pixel + 3] = 255;
    }
  }
  return PNG.sync.write(png, { colorType: 6, inputColorType: 6 });
}

const transform = Object.freeze({ crop: 'square', fit: 'cover', focalPoint: { x: 0.7, y: 0.3 }, background: '#123456' });

test('app-logo service persists a default preset and reconstructs every runtime size', async () => {
  const root = await mkdtemp(join(tmpdir(), 'material-winutil-logo-default-'));
  try {
    const service = new AppLogoService({ userDataDirectory: root });
    const state = await service.initialize();
    assert.equal(state.persisted.selection.kind, 'preset');
    assert.equal(state.assets.length, 6);
    assert.equal(state.identityBoundary, 'presentation-only');
    assert.equal(state.sourceRetention, 'derived-raster-only');
    assert.doesNotMatch(await readFile(join(root, 'app-logo.v1.json'), 'utf8'), /path|fileName|sourceHash|sourceBytes/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('custom PNG selection stores only the final derived raster and survives restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'material-winutil-logo-custom-'));
  try {
    const bytes = fixture();
    const service = new AppLogoService({ userDataDirectory: root });
    await service.initialize();
    const custom = await service.selectCustomPng(bytes, transform);
    assert.equal(custom.persisted.selection.kind, 'custom');
    assert.equal(custom.assets.length, 6);
    const stored = await readFile(join(root, 'app-logo.v1.json'), 'utf8');
    assert.doesNotMatch(stored, /selected-logo|sourceHash|sourceBytes|original/u);
    assert.ok(stored.length < 2 * 1024 * 1024);

    const transformed = await service.updateTransform({ ...transform, crop: 'original', fit: 'contain', focalPoint: { x: 0.1, y: 0.9 }, background: 'transparent' });
    assert.equal(transformed.persisted.selection.kind, 'custom');
    assert.equal(transformed.persisted.transform.fit, 'contain');
    assert.equal(transformed.persisted.selection.derivedAsset.sha256, custom.persisted.selection.derivedAsset.sha256,
      'changing presentation must retain the normalized derived raster rather than rebaking it');

    const restored = await new AppLogoService({ userDataDirectory: root }).initialize();
    assert.equal(restored.persisted.selection.kind, 'custom');
    assert.equal(restored.assets.find((asset) => asset.id === 'titlebar-20')?.width, 20);
    assert.deepEqual(restored.exportMetadata.omitted, ['custom-logo-derived-raster']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('preset, transform, reset, and corrupt-state recovery preserve a prior valid state on rejected input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'material-winutil-logo-controls-'));
  try {
    const service = new AppLogoService({ userDataDirectory: root });
    await service.initialize();
    await service.selectPreset('material-teal', transform);
    const before = service.snapshot();
    await assert.rejects(service.selectCustomPng(Uint8Array.from([1, 2, 3]), transform), /PNG signature/u);
    assert.deepEqual(service.snapshot().persisted, before.persisted);
    assert.equal((await service.updateTransform({ ...transform, fit: 'contain' })).persisted.transform.fit, 'contain');
    assert.equal((await service.reset()).persisted.selection.kind, 'preset');

    await writeFile(join(root, 'app-logo.v1.json'), '{"schemaVersion":1,"sourcePath":"private.png"}', 'utf8');
    const recovered = await new AppLogoService({ userDataDirectory: root }).initialize();
    assert.equal(recovered.persisted.selection.kind, 'preset');
    assert.doesNotMatch(await readFile(join(root, 'app-logo.v1.json'), 'utf8'), /sourcePath|private\.png/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});
