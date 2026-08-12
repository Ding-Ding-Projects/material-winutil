import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const school = await import(new URL('../../dist/shared/school-mode.js', import.meta.url));

function preferences(overrides = {}) {
  return {
    language: 'Bilingual',
    englishFunnyLevel: 4,
    cantoneseFunnyLevel: 5,
    personalVocabularyEnabled: true,
    dimSumEnabled: true,
    ...overrides,
  };
}

function state(overrides = {}) {
  return school.validateSchoolModeState({
    schemaVersion: 1,
    recordId: school.SCHOOL_MODE_SHARED_RECORD_ID,
    generation: 7,
    enabled: false,
    displayLabel: 'Study time',
    preferences: preferences(),
    credential: { method: 'none', credentialId: null, revision: 0 },
    ...overrides,
  });
}

test('uses a stable versioned shared-record identity independent of the user label', () => {
  const initial = school.createDefaultSchoolModeState(preferences());
  const renamed = school.renameSchoolMode(initial, 'Focus zone');
  assert.equal(initial.schemaVersion, 1);
  assert.equal(initial.recordId, 'org.dingdingprojects.shared.school-mode');
  assert.equal(renamed.recordId, initial.recordId);
  assert.equal(renamed.displayLabel, 'Focus zone');
  assert.equal(renamed.generation, initial.generation + 1);
  assert.deepEqual(school.renameSchoolMode(renamed, 'Focus zone'), renamed);
  assert.equal(school.renameSchoolMode(renamed, 'Focus zone').generation, renamed.generation);
  assert.equal(Object.isFrozen(renamed), true);
  assert.equal(Object.isFrozen(renamed.preferences), true);
});

test('enabling forces effective English and hides every associated setting without erasing preferences', async () => {
  const before = state();
  const enabledResult = await school.changeSchoolModeEnabled(before, true);
  assert.equal(enabledResult.ok, true);
  assert.equal(enabledResult.changed, true);
  assert.deepEqual(enabledResult.state.preferences, before.preferences);

  const effective = school.deriveEffectiveSchoolMode(enabledResult.state);
  assert.equal(effective.language, 'English');
  assert.equal(effective.englishFunnyLevel, null);
  assert.equal(effective.cantoneseFunnyLevel, null);
  assert.equal(effective.personalVocabularyEnabled, false);
  assert.equal(effective.dimSumEnabled, false);
  assert.deepEqual(effective.discoverability.languageModes, ['English']);
  assert.equal(effective.discoverability.funnyLevels, false);
  assert.equal(effective.discoverability.personalVocabulary, false);
  assert.equal(effective.discoverability.dimSum, false);
  assert.deepEqual(effective.suppressed, {
    cantonese: true,
    bilingual: true,
    funnyLevels: true,
    personalVocabulary: true,
    dimSum: true,
  });
  assert.match(effective.disclosure, /user-experience lock, not a security boundary/i);

  const disabledResult = await school.changeSchoolModeEnabled(
    enabledResult.state,
    false,
    () => ({ status: 'accepted' }),
  );
  assert.equal(disabledResult.ok, true);
  const restored = school.deriveEffectiveSchoolMode(disabledResult.state);
  assert.equal(restored.language, 'Bilingual');
  assert.equal(restored.englishFunnyLevel, 4);
  assert.equal(restored.cantoneseFunnyLevel, 5);
  assert.equal(restored.personalVocabularyEnabled, true);
  assert.equal(restored.dimSumEnabled, true);
  assert.deepEqual(restored.discoverability.languageModes, ['English', 'Yue', 'Bilingual']);
});

test('preference edits made while enabled remain suppressed and restore after disabling', async () => {
  const enabled = (await school.changeSchoolModeEnabled(state(), true)).state;
  const updated = school.updateSchoolModePreferences(enabled, preferences({
    language: 'Yue',
    englishFunnyLevel: 2,
    cantoneseFunnyLevel: 3,
    personalVocabularyEnabled: false,
    dimSumEnabled: true,
  }));
  assert.equal(school.deriveEffectiveSchoolMode(updated).language, 'English');
  assert.equal(school.deriveEffectiveSchoolMode(updated).cantoneseFunnyLevel, null);
  const disabled = await school.changeSchoolModeEnabled(updated, false, () => ({ status: 'accepted' }));
  assert.equal(disabled.ok, true);
  assert.equal(school.deriveEffectiveSchoolMode(disabled.state).language, 'Yue');
  assert.equal(school.deriveEffectiveSchoolMode(disabled.state).cantoneseFunnyLevel, 3);
});

test('credential metadata is resettable and validation receives one constant metadata-only shape', async () => {
  const configured = school.setSchoolModeCredentialMetadata(state({ enabled: true }), {
    method: 'password', credentialId: 'vault/school-mode/unlock', revision: 2,
  });
  let request;
  const rejected = await school.changeSchoolModeEnabled(configured, false, (value) => {
    request = value;
    return { status: 'rejected' };
  });
  assert.deepEqual(Object.keys(request).sort(), [
    'credentialId', 'credentialMethod', 'credentialRevision', 'purpose', 'recordId',
  ]);
  assert.deepEqual(request, {
    recordId: school.SCHOOL_MODE_SHARED_RECORD_ID,
    credentialMethod: 'password',
    credentialId: 'vault/school-mode/unlock',
    credentialRevision: 2,
    purpose: 'disable-school-mode',
  });
  assert.equal(JSON.stringify(request).includes('entered'), false);
  assert.deepEqual(rejected, { ok: false, code: 'credential-rejected', state: configured });

  const accepted = await school.changeSchoolModeEnabled(configured, false, () => ({ status: 'accepted' }));
  assert.equal(accepted.ok, true);
  assert.equal(accepted.state.enabled, false);
  const reset = school.resetSchoolModeCredentialMetadata(accepted.state);
  assert.deepEqual(reset.credential, { method: 'none', credentialId: null, revision: 0 });
});

test('credential validation fails closed with a stable result and never surfaces validator details', async () => {
  const configured = school.setSchoolModeCredentialMetadata(state({ enabled: true }), {
    method: 'totp', credentialId: 'vault.school-mode.totp', revision: 1,
  });
  assert.deepEqual(await school.changeSchoolModeEnabled(configured, false), {
    ok: false, code: 'credential-unavailable', state: configured,
  });
  assert.deepEqual(await school.changeSchoolModeEnabled(configured, false, () => ({ status: 'accepted', extra: 'nope' })), {
    ok: false, code: 'credential-unavailable', state: configured,
  });
  const thrown = await school.changeSchoolModeEnabled(configured, false, () => {
    throw new Error('private validator detail must stay inside the host');
  });
  assert.deepEqual(thrown, { ok: false, code: 'credential-unavailable', state: configured });
});

test('disabling always requires the injected validator, even after credential metadata is reset', async () => {
  const enabled = state({ enabled: true });
  assert.deepEqual(await school.changeSchoolModeEnabled(enabled, false), {
    ok: false, code: 'credential-unavailable', state: enabled,
  });
  let calls = 0;
  const result = await school.changeSchoolModeEnabled(enabled, false, (request) => {
    calls += 1;
    assert.equal(request.credentialMethod, 'none');
    assert.equal(request.credentialId, null);
    assert.equal(request.credentialRevision, 0);
    return { status: 'accepted' };
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.state.enabled, false);
});

test('subscriptions emit current state, monotonic events, and reject stale or conflicting generations', () => {
  const stream = new school.SchoolModeSubscription();
  const events = [];
  const unsubscribe = stream.subscribe((snapshot) => events.push(snapshot));
  assert.deepEqual(events[0], {
    status: 'unavailable', eventGeneration: 0, recordGeneration: null,
    code: 'shared-store-unavailable', cause: 'read-failed',
  });

  const generation7 = state();
  assert.equal(stream.ingest(generation7).reason, 'accepted');
  assert.equal(stream.snapshot().status, 'ready');
  assert.equal(stream.snapshot().eventGeneration, 1);
  assert.equal(stream.ingest(generation7).reason, 'duplicate');
  assert.equal(events.length, 2);

  const generation8 = school.renameSchoolMode(generation7, 'Quiet mode');
  assert.equal(stream.ingest(generation8).reason, 'accepted');
  assert.equal(stream.ingest(generation7).reason, 'stale');
  assert.equal(stream.ingest(state({ generation: 8, displayLabel: 'Conflicting replay' })).reason, 'stale');
  assert.equal(stream.snapshot().state.displayLabel, 'Quiet mode');
  assert.deepEqual(events.map((event) => event.eventGeneration), [0, 1, 2]);

  unsubscribe();
  stream.ingest(school.renameSchoolMode(generation8, 'No listener'));
  assert.equal(events.length, 3);
});

test('watch failures are explicit and an exact same-generation replay recovers safely', () => {
  const stream = new school.SchoolModeSubscription();
  const accepted = state({ generation: 11, enabled: true });
  stream.ingest(accepted);
  const unavailable = stream.markUnavailable('watch-failed');
  assert.deepEqual(unavailable, {
    status: 'unavailable', eventGeneration: 2, recordGeneration: 11,
    code: 'shared-store-unavailable', cause: 'watch-failed',
  });
  const recovery = stream.ingest(accepted);
  assert.equal(recovery.accepted, true);
  assert.equal(recovery.reason, 'recovered');
  assert.equal(recovery.snapshot.status, 'ready');
  assert.equal(recovery.snapshot.eventGeneration, 3);
  assert.equal(recovery.snapshot.effective.language, 'English');
  assert.throws(() => stream.markUnavailable('offline'), /cause is invalid/i);
});

test('rejects invalid schemas, unbounded data, unsafe objects, and inconsistent metadata', () => {
  const base = JSON.parse(JSON.stringify(state()));
  const invalid = [
    { ...base, schemaVersion: 2 },
    { ...base, recordId: 'display-name-derived-record' },
    { ...base, generation: -1 },
    { ...base, generation: school.SCHOOL_MODE_LIMITS.maxGeneration + 1 },
    { ...base, enabled: 'yes' },
    { ...base, displayLabel: '' },
    { ...base, displayLabel: 'x'.repeat(school.SCHOOL_MODE_LIMITS.displayLabelCodePoints + 1) },
    { ...base, displayLabel: 'unsafe\nlabel' },
    { ...base, extra: true },
    { ...base, preferences: { ...base.preferences, language: 'French' } },
    { ...base, preferences: { ...base.preferences, englishFunnyLevel: 6 } },
    { ...base, preferences: { ...base.preferences, constructor: 'bad' } },
    { ...base, credential: { method: 'none', credentialId: 'not-null', revision: 0 } },
    { ...base, credential: { method: 'password', credentialId: null, revision: 1 } },
    { ...base, credential: { method: 'totp', credentialId: 'bad id', revision: 1 } },
    { ...base, credential: { method: 'totp', credentialId: 'valid.id', revision: 0 } },
  ];
  for (const candidate of invalid) assert.throws(() => school.validateSchoolModeState(candidate));

  const inherited = Object.create({ enabled: false });
  Object.assign(inherited, base);
  assert.throws(() => school.validateSchoolModeState(inherited), /plain object/i);

  const unsafeJson = JSON.stringify(base).replace('"enabled":false', '"__proto__":{},"enabled":false');
  assert.throws(() => school.parseSchoolModeStateJson(unsafeJson), /unsafe key/i);
  assert.throws(() => school.parseSchoolModeStateJson('{nope'), /malformed JSON/i);
  assert.throws(() => school.parseSchoolModeStateJson(' '.repeat(school.SCHOOL_MODE_LIMITS.jsonBytes + 1)), /byte limit/i);
  assert.throws(() => school.parseSchoolModeStateJson(Uint8Array.from([0xc3, 0x28])), /UTF-8/i);
});

test('generation exhaustion fails closed and no-op changes do not manufacture generations', async () => {
  const maximum = state({ generation: school.SCHOOL_MODE_LIMITS.maxGeneration });
  assert.deepEqual(school.renameSchoolMode(maximum, maximum.displayLabel), maximum);
  assert.equal(school.renameSchoolMode(maximum, maximum.displayLabel).generation, maximum.generation);
  assert.equal((await school.changeSchoolModeEnabled(maximum, false)).changed, false);
  assert.throws(() => school.renameSchoolMode(maximum, 'Another label'), /generation limit/i);
});

test('core source contains no persistence, history, export, logging, network, or credential-value behavior', async () => {
  const source = await readFile(new URL('../../src/shared/school-mode.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|https?:\/\/|node:(?:fs|net|http|https)|ipcRenderer|localStorage/);
  assert.doesNotMatch(source, /console\.|\bwriteFile\b|\bappendFile\b|\bhistory\.(?:push|record)|exportSchoolMode/i);
  assert.doesNotMatch(source, /entered(?:Password|Pin|Code)|plain(?:text)?Credential|credentialValue/i);
  assert.equal(source.includes('SchoolModeCredentialValidationRequest'), true);
});
