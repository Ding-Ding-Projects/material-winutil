import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const core = await import(new URL('../../dist/shared/dim-sum-surprise.js', import.meta.url));

const NAMES = Object.freeze({ English: 'Classic Har Gow', Yue: '蝦餃' });
const PROVENANCE = Object.freeze({
  repository: 'Ding-Ding-Projects/dim-sum-photos',
  catalogSchemaVersion: '1.0.0',
  catalogRevision: '0123456789abcdef0123456789abcdef01234567',
  catalogUrl: 'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/0123456789abcdef0123456789abcdef01234567/catalog/index.json',
  dishId: 'hk-dish-1',
  names: NAMES,
  imageAlt: { English: 'Classic Har Gow on a plate', Yue: '碟上嘅蝦餃' },
  imagePath: 'catalog/images/classic-har-gow.png',
  releaseTag: 'catalog-v1.2.3',
  releaseDraft: false,
  releasePrerelease: false,
  assetName: 'classic-har-gow.png',
  assetUrl: 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1.2.3/classic-har-gow.png',
  assetState: 'uploaded',
  contentType: 'image/png',
  assetSize: 12_345,
  sha256: `sha256:${'a'.repeat(64)}`,
});
const CLEAR_CONTEXT = Object.freeze({
  firstRun: false,
  errorPath: false,
  updateFlow: false,
  activeTask: false,
  quietHours: false,
  doNotDisturb: false,
  schoolMode: false,
});

function input(overrides = {}) {
  return {
    context: CLEAR_CONTEXT,
    language: 'English',
    englishFunnyLevel: 1,
    yueFunnyLevel: 1,
    dish: { names: NAMES },
    publicAsset: PROVENANCE,
    reducedMotion: false,
    ...overrides,
  };
}

function launchAt(draw) {
  let calls = 0;
  const launch = new core.DimSumStartupSurpriseLaunch(() => {
    calls += 1;
    return draw;
  });
  assert.equal(calls, 1, 'each launch consumes exactly one injected random draw');
  return { launch, calls: () => calls };
}

test('uses an exact lower-inclusive, upper-exclusive ten-percent boundary', () => {
  for (const draw of [0, Number.MIN_VALUE, 0.09999999999999999]) {
    const { launch } = launchAt(draw);
    assert.equal(launch.decide(input()).status, 'shown', `${draw} must be inside the ten-percent interval`);
  }
  for (const draw of [0.1, 0.10000000000000002, 0.9999999999999999]) {
    const { launch } = launchAt(draw);
    assert.deepEqual(launch.decide(input()), { status: 'missed' });
  }
  assert.equal(core.DIM_SUM_SURPRISE_LIMITS.probability, 0.1);
});

test('draws once per launch and can never show twice', () => {
  const { launch, calls } = launchAt(0);
  assert.equal(launch.decide(input()).status, 'shown');
  assert.deepEqual(launch.decide(input()), { status: 'already-evaluated' });
  assert.deepEqual(launch.decide(input()), { status: 'already-evaluated' });
  assert.equal(calls(), 1);

  const nextLaunch = launchAt(0);
  assert.equal(nextLaunch.launch.decide(input()).status, 'shown');

  const missed = launchAt(0.1);
  assert.equal(missed.launch.decide(input()).status, 'missed');
  assert.equal(missed.launch.decide(input()).status, 'already-evaluated');

  const suppressed = launchAt(0);
  assert.equal(suppressed.launch.decide(input({ context: { ...CLEAR_CONTEXT, quietHours: true } })).status, 'suppressed');
  assert.equal(suppressed.launch.decide(input()).status, 'already-evaluated');
});

test('suppresses every protected startup state before presentation', () => {
  const states = [
    ['firstRun', 'first-run'],
    ['errorPath', 'error-path'],
    ['updateFlow', 'update-flow'],
    ['activeTask', 'active-task'],
    ['quietHours', 'quiet-hours'],
    ['doNotDisturb', 'do-not-disturb'],
    ['schoolMode', 'school-mode'],
  ];
  for (const [field, reason] of states) {
    const { launch } = launchAt(0);
    const context = { ...CLEAR_CONTEXT, [field]: true };
    assert.deepEqual(launch.decide(input({ context })), { status: 'suppressed', reason });
  }
  assert.deepEqual(
    launchAt(0).launch.decide(input({ context: {
      ...CLEAR_CONTEXT,
      firstRun: true,
      errorPath: true,
      schoolMode: true,
    } })),
    { status: 'suppressed', reason: 'first-run' },
    'suppression precedence is deterministic',
  );
});

test('School mode suppression does not become a hidden opt-out after restoration', () => {
  const schoolLaunch = launchAt(0);
  assert.deepEqual(
    schoolLaunch.launch.decide(input({ context: { ...CLEAR_CONTEXT, schoolMode: true } })),
    { status: 'suppressed', reason: 'school-mode' },
  );
  assert.deepEqual(schoolLaunch.launch.decide(input()), { status: 'already-evaluated' });

  const restoredLaunch = launchAt(0);
  assert.equal(restoredLaunch.launch.decide(input()).status, 'shown');
});

test('shown descriptor is non-blocking, auto-dismissing, focus-safe, and reduced-motion aware', () => {
  const standard = launchAt(0).launch.decide(input());
  assert.equal(standard.status, 'shown');
  assert.equal(standard.descriptor.presentation, 'non-blocking');
  assert.equal(standard.descriptor.blocksStartup, false);
  assert.equal(standard.descriptor.requestsFocus, false);
  assert.equal(standard.descriptor.autoDismissMs, 6_500);
  assert.equal(standard.descriptor.motion, 'standard');

  const reduced = launchAt(0).launch.decide(input({ reducedMotion: true }));
  assert.equal(reduced.status, 'shown');
  assert.equal(reduced.descriptor.motion, 'reduced');
});

test('caller-supplied names and meaningful alt text remain factual at every language and funny level', () => {
  const observedCopy = new Set();
  const observedAlt = new Set();
  for (const language of ['English', 'Yue', 'Bilingual']) {
    for (let englishFunnyLevel = 1; englishFunnyLevel <= 5; englishFunnyLevel += 1) {
      for (let yueFunnyLevel = 1; yueFunnyLevel <= 5; yueFunnyLevel += 1) {
        const decision = launchAt(0).launch.decide(input({ language, englishFunnyLevel, yueFunnyLevel }));
        assert.equal(decision.status, 'shown');
        assert.deepEqual(decision.descriptor.dish.names, NAMES);
        assert.equal(decision.descriptor.image.alt, 'Photo of Classic Har Gow · 蝦餃');
        assert.ok(decision.descriptor.image.alt.includes(NAMES.English));
        assert.ok(decision.descriptor.image.alt.includes(NAMES.Yue));
        assert.equal(decision.descriptor.autoDismissMs, 6_500);
        assert.equal(decision.descriptor.requestsFocus, false);
        assert.deepEqual(decision.descriptor.provenance, PROVENANCE);
        observedCopy.add(`${decision.descriptor.copy.title}\n${decision.descriptor.copy.message}`);
        observedAlt.add(decision.descriptor.image.alt);
      }
    }
  }
  assert.ok(observedCopy.size > 5, 'language and funny levels style surrounding copy');
  assert.equal(observedAlt.size, 1, 'alt text is factual and not funny-level styled');
});

test('accepts only exact public catalog and catalog-v1 release provenance', () => {
  assert.deepEqual(core.validateDimSumPublicAsset(PROVENANCE), PROVENANCE);
  const invalidVariants = [
    undefined,
    null,
    { ...PROVENANCE, repository: 'someone/dim-sum-photos' },
    { ...PROVENANCE, catalogSchemaVersion: '2.0.0' },
    { ...PROVENANCE, catalogRevision: 'main', catalogUrl: 'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json' },
    { ...PROVENANCE, catalogUrl: 'https://example.com/catalog/index.json' },
    { ...PROVENANCE, catalogUrl: `${PROVENANCE.catalogUrl}?download=1` },
    { ...PROVENANCE, releaseTag: 'v1.2.3' },
    { ...PROVENANCE, releaseTag: 'catalog-v1evil' },
    { ...PROVENANCE, releaseDraft: true },
    { ...PROVENANCE, releasePrerelease: true },
    { ...PROVENANCE, contentType: 'image/jpeg' },
    { ...PROVENANCE, assetState: 'new' },
    { ...PROVENANCE, assetSize: 0 },
    { ...PROVENANCE, sha256: 'sha256:nope' },
    { ...PROVENANCE, assetUrl: 'https://example.com/classic-har-gow.png' },
    { ...PROVENANCE, assetUrl: `${PROVENANCE.assetUrl}#photo` },
    { ...PROVENANCE, assetName: '../classic-har-gow.png' },
    { ...PROVENANCE, assetName: 'classic-har-gow.exe' },
    { ...PROVENANCE, extra: true },
  ];
  for (const provenance of invalidVariants) {
    assert.equal(core.validateDimSumPublicAsset(provenance), null);
    const decision = launchAt(0).launch.decide(input({ publicAsset: provenance }));
    assert.deepEqual(decision, provenance === undefined
      ? { status: 'suppressed', reason: 'missing-public-asset' }
      : { status: 'suppressed', reason: 'invalid-public-asset' });
  }
  assert.deepEqual(
    launchAt(0).launch.decide(input({ publicAsset: undefined })),
    { status: 'suppressed', reason: 'missing-public-asset' },
  );
  assert.deepEqual(
    launchAt(0).launch.decide(input({
      publicAsset: { ...PROVENANCE, names: { English: 'Different catalog name', Yue: NAMES.Yue } },
    })),
    { status: 'suppressed', reason: 'invalid-public-asset' },
  );
  const absent = input();
  delete absent.publicAsset;
  assert.deepEqual(
    launchAt(0).launch.decide(absent),
    { status: 'suppressed', reason: 'missing-public-asset' },
  );
});

test('invalid random draws and invalid inputs fail closed without throwing', () => {
  for (const draw of [-1, 1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(
      launchAt(draw).launch.decide(input()),
      { status: 'suppressed', reason: 'invalid-random-draw' },
    );
  }
  const throwing = new core.DimSumStartupSurpriseLaunch(() => { throw new Error('controlled draw failure'); });
  assert.deepEqual(throwing.decide(input()), { status: 'suppressed', reason: 'invalid-random-draw' });

  for (const invalid of [
    input({ language: 'French' }),
    input({ englishFunnyLevel: 0 }),
    input({ yueFunnyLevel: 6 }),
    input({ dish: { names: { English: '', Yue: '蝦餃' } } }),
    input({ dish: { names: { English: 'Har Gow', Yue: '蝦餃', invented: 'no' } } }),
    input({ context: { ...CLEAR_CONTEXT, extra: false } }),
    { ...input(), optOut: false },
  ]) {
    assert.deepEqual(
      launchAt(0).launch.decide(invalid),
      { status: 'suppressed', reason: 'invalid-input' },
    );
  }
});

test('cache persistence is versioned, bounded metadata only and fully revalidated', () => {
  const metadata = core.createDimSumSurpriseCacheMetadata(PROVENANCE, '2026-08-12T12:34:56.000Z');
  assert.ok(metadata);
  assert.deepEqual(Object.keys(metadata).sort(), [
    'assetName', 'assetUrl', 'cachedAt', 'catalogRevision', 'catalogSchemaVersion', 'catalogUrl', 'releaseTag', 'repository', 'schemaVersion',
  ]);
  const serialized = core.serializeDimSumSurpriseCacheMetadata(metadata);
  assert.equal(typeof serialized, 'string');
  assert.deepEqual(core.parseDimSumSurpriseCacheMetadata(serialized), metadata);
  assert.deepEqual(core.parseDimSumSurpriseCacheMetadata(new TextEncoder().encode(serialized)), metadata);
  assert.doesNotMatch(serialized, /Classic Har Gow|蝦餃|imageBytes|base64|disabled|opt.?out/i);

  assert.equal(core.parseDimSumSurpriseCacheMetadata('{'), null);
  assert.equal(core.parseDimSumSurpriseCacheMetadata(' '.repeat(core.DIM_SUM_SURPRISE_LIMITS.maxCachePayloadBytes + 1)), null);
  assert.equal(core.parseDimSumSurpriseCacheMetadata(JSON.stringify({ ...metadata, schemaVersion: 2 })), null);
  assert.equal(core.parseDimSumSurpriseCacheMetadata(JSON.stringify({ ...metadata, extra: true })), null);
  assert.equal(core.parseDimSumSurpriseCacheMetadata(JSON.stringify({ ...metadata, assetUrl: 'https://example.com/no.png' })), null);
  assert.equal(core.parseDimSumSurpriseCacheMetadata(JSON.stringify({ ...metadata, cachedAt: 'tomorrow-ish' })), null);
  assert.equal(core.parseDimSumSurpriseCacheMetadata(Uint8Array.from([0xc3, 0x28])), null);
});

test('core contains no I/O, network fetch, random fallback, generated image, or opt-out behavior', async () => {
  const source = await readFile(new URL('../../src/shared/dim-sum-surprise.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|net\.request|https\.get|http\.get/);
  assert.doesNotMatch(source, /Math\.random|randomBytes|randomInt|randomUUID/);
  assert.doesNotMatch(source, /readFile|writeFile|localStorage|sessionStorage|indexedDB|console\./);
  assert.doesNotMatch(source, /canvas|imagegen|base64|data:image/i);
  assert.doesNotMatch(source, /opt.?out|disable(?:d)?Surprise|surpriseEnabled/i);
});
