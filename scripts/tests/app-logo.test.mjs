import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PNG } from 'pngjs';
import {
  APP_LOGO_CONTROL_CATALOG,
  APP_LOGO_IDENTITY_BOUNDARY,
  APP_LOGO_LIMITS,
  APP_LOGO_OUTPUT_SPECS,
  APP_LOGO_PRESETS,
  createAppLogoExportMetadata,
  createCustomAppLogoState,
  createPresetAppLogoState,
  defaultAppLogoTransform,
  parseAppLogoPersistedState,
  renderAppLogoPreset,
  renderCustomAppLogo,
  resetAppLogoState,
  serializeAppLogoPersistedState,
  validateAppLogoPersistedState,
  validateAppLogoTransform,
  validateAppLogoUpload,
} from '../../dist/shared/app-logo.js';

function pngFixture(width = 12, height = 8) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      png.data[index] = x < width / 2 ? 220 : 20;
      png.data[index + 1] = y < height / 2 ? 30 : 180;
      png.data[index + 2] = 90;
      png.data[index + 3] = 255;
    }
  }
  return PNG.sync.write(png, { colorType: 6, inputColorType: 6 });
}

function input(bytes = pngFixture()) {
  return { bytes: new Uint8Array(bytes), fileName: 'my-logo.png', mediaType: 'image/png' };
}

function appendChunk(bytes, type, data = Buffer.alloc(0)) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  // The structural preflight rejects this unsupported chunk before CRC decode.
  return Buffer.concat([bytes.subarray(0, -12), chunk, bytes.subarray(-12)]);
}

test('shipped presets, searchable controls, stable identity boundary, and output specs are declared', () => {
  assert.ok(APP_LOGO_PRESETS.length >= 3);
  assert.ok(APP_LOGO_CONTROL_CATALOG.some((control) => control.id === 'logo-reset'));
  assert.ok(APP_LOGO_CONTROL_CATALOG.every((control) => control.labels.English && control.labels.Yue && control.searchTerms.length));
  assert.equal(APP_LOGO_IDENTITY_BOUNDARY.changesPackageIdentity, false);
  assert.equal(APP_LOGO_IDENTITY_BOUNDARY.changesExecutableName, false);
  assert.ok(APP_LOGO_OUTPUT_SPECS.every((spec) => spec.format === 'png' && spec.width === spec.height));
  assert.equal(APP_LOGO_OUTPUT_SPECS.at(-1)?.id, 'app-256');
});

test('a valid local PNG is structurally inspected, CRC-decoded, bounded, and copied', () => {
  const original = pngFixture();
  const upload = validateAppLogoUpload(input(original));
  assert.equal(upload.kind, 'validated-local-png');
  assert.equal(upload.width, 12);
  assert.equal(upload.height, 8);
  assert.match(upload.sourceHash, /^sha256:[0-9a-f]{64}$/);
  original[0] = 0;
  assert.equal(upload.bytes[0], 137);
});

test('upload rejects spoofed type/name/signature, animated PNG, trailing bytes, and malformed chunks', () => {
  assert.throws(() => validateAppLogoUpload({ ...input(), mediaType: 'image/jpeg' }), /media type/);
  assert.throws(() => validateAppLogoUpload({ ...input(), fileName: '../logo.png' }), /file name/);
  assert.throws(() => validateAppLogoUpload(input(Buffer.from('not a PNG'))), /signature/);
  assert.throws(() => validateAppLogoUpload(input(appendChunk(pngFixture(), 'acTL', Buffer.from([0, 0, 0, 1, 0, 0, 0, 0])))), /animated/);
  assert.throws(() => validateAppLogoUpload(input(Buffer.concat([pngFixture(), Buffer.from([0])]))), /trailing/);
  const malformed = Buffer.from(pngFixture());
  malformed.writeUInt32BE(APP_LOGO_LIMITS.maxChunkBytes + 1, 8);
  assert.throws(() => validateAppLogoUpload(input(malformed)), /resource limit/);
});

test('dimension and upload-size bombs fail before the PNG decoder can allocate their declared payload', () => {
  const bomb = Buffer.from(pngFixture());
  bomb.writeUInt32BE(APP_LOGO_LIMITS.maxWidth + 1, 16);
  assert.throws(() => validateAppLogoUpload(input(bomb)), /dimensions/);
  assert.throws(() => validateAppLogoUpload(input(Buffer.alloc(APP_LOGO_LIMITS.maxUploadBytes + 1))), /upload limit/);
});

test('crop, fit, focal point, background, and every consumer size produce decoded local PNG assets', () => {
  const upload = validateAppLogoUpload(input());
  const transform = { crop: 'square', fit: 'cover', focalPoint: { x: 0.9, y: 0.1 }, background: '#123456' };
  const assets = renderCustomAppLogo(upload, transform);
  assert.equal(assets.length, APP_LOGO_OUTPUT_SPECS.length);
  for (const asset of assets) {
    const expected = APP_LOGO_OUTPUT_SPECS.find((spec) => spec.id === asset.id);
    assert.ok(expected);
    assert.match(asset.dataUrl, /^data:image\/png;base64,/);
    const decoded = PNG.sync.read(Buffer.from(asset.dataUrl.split(',')[1], 'base64'));
    assert.equal(decoded.width, expected.width);
    assert.equal(decoded.height, expected.height);
    assert.match(asset.sha256, /^sha256:/);
  }
  assert.equal(validateAppLogoTransform(transform)?.fit, 'cover');
  assert.equal(validateAppLogoTransform({ ...transform, focalPoint: { x: 2, y: 0 } }), null);
  assert.equal(validateAppLogoTransform({ ...transform, background: '#invalid' }), null);
});

test('transparent contain and stretch modes remain usable, while shipped preset artwork renders every preview', () => {
  const upload = validateAppLogoUpload(input());
  assert.equal(renderCustomAppLogo(upload, { ...defaultAppLogoTransform(), fit: 'contain' }).length, APP_LOGO_OUTPUT_SPECS.length);
  assert.equal(renderCustomAppLogo(upload, { ...defaultAppLogoTransform(), fit: 'stretch', background: '#ffffffff' }).length, APP_LOGO_OUTPUT_SPECS.length);
  for (const preset of APP_LOGO_PRESETS) assert.equal(renderAppLogoPreset(preset.id).length, APP_LOGO_OUTPUT_SPECS.length);
});

test('custom persistence stores only a converted app-256 PNG, rejects tampering, and export omits personal raster data', () => {
  const upload = validateAppLogoUpload(input());
  const transform = defaultAppLogoTransform();
  const assets = renderCustomAppLogo(upload, transform);
  const state = createCustomAppLogoState(transform, assets);
  const serialized = serializeAppLogoPersistedState(state);
  assert.ok(serialized);
  assert.doesNotMatch(serialized, /sourceHash|sourceBytes|my-logo\.png|validated-local-png/);
  const restored = parseAppLogoPersistedState(serialized);
  assert.equal(restored?.selection.kind, 'custom');
  const exported = createAppLogoExportMetadata(state);
  assert.deepEqual(exported?.omitted, ['custom-logo-derived-raster']);
  assert.equal('derivedAsset' in (exported ?? {}), false);
  const tampered = structuredClone(state);
  tampered.selection.derivedAsset.sha256 = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
  assert.equal(validateAppLogoPersistedState(tampered), null);
});

test('preset persistence and reset are compact, local-only, and cannot carry arbitrary identity fields', () => {
  const state = createPresetAppLogoState('material-teal', { ...defaultAppLogoTransform(), crop: 'square' });
  assert.equal(state.storage, 'local-only');
  assert.equal(state.selection.kind, 'preset');
  const serialized = serializeAppLogoPersistedState(state);
  assert.ok(serialized);
  assert.equal(validateAppLogoPersistedState({ ...state, packageName: 'nope' }), null);
  assert.equal(resetAppLogoState().selection.kind, 'preset');
  assert.equal(resetAppLogoState().selection.presetId, 'material-blue');
});

test('the core contains no network, filesystem persistence, or installed-identity mutation route', async () => {
  const source = await readFile(new URL('../../src/shared/app-logo.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|https?:\/\/|node:fs|writeFile|appId|productName|updateFeed|executableName/u);
});
