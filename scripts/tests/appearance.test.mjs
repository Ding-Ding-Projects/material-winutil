import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appearance = await import(new URL('../../dist/shared/appearance.js', import.meta.url));

const value = (input, capability) => capability
  ? { mode: 'value', value: input, capability }
  : { mode: 'value', value: input };

function withNamedCollections(document) {
  return appearance.validateAppearanceDocument({
    ...JSON.parse(JSON.stringify(document)),
    presets: [{
      id: 'compact-blue', name: 'Compact blue', properties: {
        density: value('compact'), accentColor: value({ space: 'hex', value: '#0061a4' }),
      },
    }],
    userThemes: [{
      id: 'reading', name: 'Reading', properties: {
        fontFamily: value('Atkinson Hyperlegible'), fontSize: value(19), lineHeight: value(1.6),
      },
    }],
  });
}

test('publishes the complete explicit appearance property and pseudo-state inventories', () => {
  assert.deepEqual(appearance.APPEARANCE_PROPERTIES, [
    'theme', 'density', 'seedColor', 'accentColor',
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
    'underlineStyle', 'underlineColor', 'strikethrough', 'overline',
    'capitalization', 'smallCaps', 'verticalAlign', 'textColor', 'highlightColor',
    'outline', 'shadow', 'glow', 'characterSpacing', 'wordSpacing', 'lineHeight',
    'baselineOffset', 'textDirection', 'textAlignment',
    'shape', 'cornerRadius', 'elevation', 'motion', 'icon', 'spacing',
  ]);
  assert.deepEqual(appearance.APPEARANCE_PSEUDO_STATES, [
    'base', 'hover', 'focus', 'focus-visible', 'active', 'disabled', 'selected',
    'checked', 'indeterminate', 'expanded', 'collapsed', 'visited', 'dragged',
    'drop-target', 'pressed', 'loading', 'error',
  ]);
  assert.deepEqual(Object.keys(appearance.DEFAULT_APPEARANCE_VALUES), appearance.APPEARANCE_PROPERTIES);

  let document = appearance.createAppearanceDocument();
  for (const property of appearance.APPEARANCE_PROPERTIES) {
    document = appearance.setAppearanceProperty(
      document, 'app-root', null, 'base', property,
      value(appearance.DEFAULT_APPEARANCE_VALUES[property]),
    );
  }
  assert.deepEqual(Object.keys(appearance.computeAppearance(document, 'app-root').values), appearance.APPEARANCE_PROPERTIES);
});

test('resolves defaults, ancestors, targets, and pseudo-states in deterministic cascade order', () => {
  let document = appearance.createAppearanceDocument();
  document = appearance.setAppearanceProperty(document, 'app-root', null, 'base', 'fontSize', value(15));
  document = appearance.setAppearanceProperty(document, 'panel', 'app-root', 'base', 'fontSize', value(17));
  document = appearance.setAppearanceProperty(document, 'panel', 'app-root', 'hover', 'fontWeight', value(650));
  document = appearance.setAppearanceProperty(document, 'button', 'panel', 'base', 'accentColor', value({ space: 'hex', value: '#123456' }));
  document = appearance.setAppearanceProperty(document, 'button', 'panel', 'hover', 'fontSize', value(21));

  const hover = appearance.computeAppearance(document, 'button', 'hover');
  assert.equal(hover.values.fontSize, 21);
  assert.equal(hover.values.fontWeight, 650);
  assert.deepEqual(hover.values.accentColor, { space: 'hex', value: '#123456' });
  assert.equal(hover.sources.fontSize, 'button:hover');
  assert.equal(hover.sources.fontWeight, 'panel:hover');
  assert.equal(hover.sources.theme, 'default');

  const base = appearance.computeAppearance(document, 'button');
  assert.equal(base.values.fontSize, 17);
  assert.equal(base.values.fontWeight, 400);
  assert.deepEqual(appearance.computeAppearance(document, 'button', 'hover'), hover);
  assert.equal(Object.isFrozen(hover), true);
  assert.equal(Object.isFrozen(hover.values), true);
});

test('inherit and per-property, target, and global resets reveal the correct lower layer', () => {
  let document = appearance.createAppearanceDocument();
  document = appearance.setAppearanceProperty(document, 'app-root', null, 'base', 'fontSize', value(14));
  document = appearance.setAppearanceProperty(document, 'card', 'app-root', 'base', 'fontSize', value(20));
  document = appearance.setAppearanceProperty(document, 'card', 'app-root', 'hover', 'fontSize', { mode: 'inherit' });
  assert.equal(appearance.computeAppearance(document, 'card', 'hover').values.fontSize, 20);

  const propertyReset = appearance.resetAppearanceProperty(document, 'card', 'base', 'fontSize');
  assert.equal(appearance.computeAppearance(propertyReset, 'card').values.fontSize, 14);
  assert.equal(appearance.resetAppearanceProperty(propertyReset, 'card', 'base', 'fontSize'), propertyReset);

  const targetReset = appearance.resetAppearanceTarget(document, 'card');
  assert.deepEqual(targetReset.targets.find((target) => target.id === 'card'), { id: 'card', parentId: 'app-root', states: [] });
  assert.equal(appearance.computeAppearance(targetReset, 'card').values.fontSize, 14);

  const named = withNamedCollections(document);
  const globalReset = appearance.resetAllAppearance(named);
  assert.ok(globalReset.targets.every((target) => target.states.length === 0));
  assert.equal(globalReset.targets.some((target) => target.id === 'card'), true);
  assert.equal(globalReset.presets.length, 1);
  assert.equal(globalReset.userThemes.length, 1);
  assert.deepEqual(globalReset.locks, named.locks);
});

test('named presets and user themes remain importable, exportable, and deterministic', () => {
  let document = withNamedCollections(appearance.createAppearanceDocument());
  document = appearance.applyNamedAppearance(document, 'preset', 'compact-blue', 'app-root');
  document = appearance.applyNamedAppearance(document, 'userTheme', 'reading', 'app-root');
  const computed = appearance.computeAppearance(document, 'app-root');
  assert.equal(computed.values.density, 'compact');
  assert.equal(computed.values.fontFamily, 'Atkinson Hyperlegible');
  assert.equal(computed.values.fontSize, 19);

  const serialized = appearance.exportAppearanceTheme(document);
  const restored = appearance.importAppearanceTheme(serialized);
  assert.deepEqual(restored, document);
  assert.equal(appearance.serializeAppearanceJson(restored), serialized);
});

test('retains unsupported requested values and their capability explanation across edits', () => {
  const capability = { supported: false, explanation: 'Glow is retained, but this renderer cannot draw it.' };
  let document = appearance.createAppearanceDocument();
  document = appearance.setAppearanceProperty(document, 'app-root', null, 'base', 'glow', value({
    radius: 12, color: { space: 'hex', value: '#ff00ffaa' },
  }, capability));
  document = appearance.setAppearanceProperty(document, 'app-root', null, 'base', 'density', value('spacious'));
  const restored = appearance.parseAppearanceJson(appearance.serializeAppearanceJson(document));
  const computed = appearance.computeAppearance(restored, 'app-root');
  assert.deepEqual(computed.values.glow, { radius: 12, color: { space: 'hex', value: '#ff00ffaa' } });
  assert.deepEqual(computed.capabilities.glow, capability);
});

test('enforces version, collection, depth, identifier, unknown-field, and unsafe-key bounds', () => {
  const base = JSON.parse(appearance.serializeAppearanceJson(appearance.createAppearanceDocument()));
  const invalid = [
    { ...base, schemaVersion: 2 },
    { ...base, revision: -1 },
    { ...base, extra: true },
    { ...base, rootTargetId: '../escape' },
    { ...base, rootTargetId: 'x'.repeat(appearance.APPEARANCE_LIMITS.maxIdCodePoints + 1) },
    { ...base, targets: [] },
    { ...base, targets: [{ id: 'app-root', parentId: 'missing', states: [] }] },
    { ...base, targets: [{ id: 'app-root', parentId: null, states: [{ state: 'base', properties: { nope: value('bad') } }] }] },
    { ...base, targets: [{ id: 'app-root', parentId: null, states: [{ state: 'flying', properties: {} }] }] },
    { ...base, locks: [{ id: 'lock', method: 'password', targetId: 'missing', state: null, property: null }] },
  ];
  for (const candidate of invalid) assert.throws(() => appearance.validateAppearanceDocument(candidate));

  const inherited = Object.create({ schemaVersion: 1 });
  Object.assign(inherited, base);
  assert.throws(() => appearance.validateAppearanceDocument(inherited), /plain object/i);
  assert.throws(() => appearance.parseAppearanceJson('{"schemaVersion":1,"__proto__":{},"revision":0}'), /unsafe key/i);
  assert.throws(() => appearance.parseAppearanceJson(' '.repeat(appearance.APPEARANCE_LIMITS.maxJsonBytes + 1)), /byte limit/i);
  assert.throws(() => appearance.parseAppearanceJson(Uint8Array.from([0xc3, 0x28])), /UTF-8/i);

  let nested = '0';
  for (let index = 0; index < appearance.APPEARANCE_LIMITS.maxDepth + 2; index += 1) nested = `{"x":${nested}}`;
  assert.throws(() => appearance.validateAppearanceDocument(JSON.parse(nested)), /nesting depth/i);
});

test('validates property values without accepting NaN, arbitrary CSS, or unexplained unsupported values', () => {
  const document = appearance.createAppearanceDocument();
  assert.throws(() => appearance.setAppearanceProperty(document, 'app-root', null, 'base', 'fontSize', value(Number.NaN)), /out of range/i);
  assert.throws(() => appearance.setAppearanceProperty(document, 'app-root', null, 'base', 'theme', value('url(evil)')), /invalid/i);
  assert.throws(() => appearance.setAppearanceProperty(document, 'app-root', null, 'base', 'accentColor', value({ space: 'rgb', r: 300, g: 0, b: 0 })), /out of range/i);
  assert.throws(() => appearance.setAppearanceProperty(document, 'app-root', null, 'base', 'accentColor', value({ space: 'hex', value: '#1234567' })), /invalid/i);
  assert.throws(() => appearance.setAppearanceProperty(document, 'app-root', null, 'base', 'shadow', value({})), /missing/i);
  assert.throws(() => appearance.setAppearanceProperty(document, 'app-root', null, 'base', 'fontStyle', value('italic', { supported: false })), /needs an explanation/i);
});

test('round-trips every color space through canonical sRGB within documented tolerance', () => {
  const source = { space: 'rgb', r: 51, g: 102, b: 153, alpha: 0.37 };
  for (const space of ['hex', 'rgb', 'hsl', 'hsv', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'cmyk']) {
    const translated = appearance.convertColor(source, space);
    assert.equal(translated.inGamut, true, space);
    const roundTrip = appearance.convertColor(translated.value, 'rgb').canonical;
    const tolerance = space === 'hex' ? 1 / 255 + 1e-9 : 0.00002;
    assert.ok(Math.abs(roundTrip.r - 0.2) <= tolerance, `${space} red`);
    assert.ok(Math.abs(roundTrip.g - 0.4) <= tolerance, `${space} green`);
    assert.ok(Math.abs(roundTrip.b - 0.6) <= tolerance, `${space} blue`);
    assert.ok(Math.abs(roundTrip.alpha - 0.37) <= tolerance, `${space} alpha`);
  }
});

test('normalizes hue, preserves alpha, and reports out-of-gamut clipping explicitly', () => {
  const zero = appearance.convertColor({ space: 'hsl', h: 0, s: 1, l: 0.5, alpha: 0.25 }, 'rgb');
  const wrapped = appearance.convertColor({ space: 'hsl', h: 360, s: 1, l: 0.5, alpha: 0.25 }, 'rgb');
  assert.deepEqual(wrapped, zero);
  assert.equal(zero.canonical.alpha, 0.25);
  const clipped = appearance.convertColor({ space: 'lab', l: 60, a: 180, b: 180, alpha: 0.8 }, 'oklch');
  assert.equal(clipped.inGamut, false);
  assert.equal(clipped.clipped, true);
  assert.ok(clipped.clippedChannels.length > 0);
  assert.equal(clipped.canonical.alpha, 0.8);
});

test('calculates composited WCAG contrast and threshold outcomes', () => {
  const maximum = appearance.contrastRatio({ space: 'hex', value: '#000' }, { space: 'hex', value: '#fff' });
  assert.equal(maximum.ratio, 21);
  assert.deepEqual(maximum, { ratio: 21, normalTextAA: true, normalTextAAA: true, largeTextAA: true, largeTextAAA: true });
  const invisible = appearance.contrastRatio({ space: 'hex', value: '#00000000' }, { space: 'hex', value: '#fff' });
  assert.equal(invisible.ratio, 1);
  assert.equal(invisible.normalTextAA, false);
});

test('locks contain metadata only and reject secret-bearing or unknown fields', async () => {
  const document = appearance.validateAppearanceDocument({
    ...JSON.parse(appearance.serializeAppearanceJson(appearance.createAppearanceDocument())),
    locks: [{ id: 'lock.font', method: 'totp', targetId: 'app-root', state: 'base', property: 'fontFamily' }],
  });
  assert.deepEqual(document.locks[0], { id: 'lock.font', method: 'totp', targetId: 'app-root', state: 'base', property: 'fontFamily' });
  const serialized = appearance.serializeAppearanceJson(document);
  assert.doesNotMatch(serialized, /passwordHash|secret|credential|code|otpauth|qr/iu);
  const invalid = JSON.parse(serialized);
  invalid.locks[0].secret = 'must not enter this model';
  assert.throws(() => appearance.validateAppearanceDocument(invalid), /unknown field secret/i);

  const source = await readFile(new URL('../../src/shared/appearance.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /passwordHash|totpSecret|credentialValue|enteredPassword|otpauth:\/\//u);
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|node:(?:fs|net|http|https)|ipcRenderer|localStorage|console\./u);
});
