import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const displayNames = await import(new URL('../../dist/shared/display-name.js', import.meta.url));
const NOW = '2026-08-12T12:34:56.000Z';

test('round-trips bounded versioned state across restart parsing', () => {
  const renamed = displayNames.renameDisplayName(
    displayNames.createDefaultDisplayNameState(),
    '  工具箱 Cafe\u0301  ',
    NOW,
  );
  assert.equal(renamed.state.displayName, '工具箱 Café');
  const serialized = displayNames.serializeDisplayNameState(renamed.state);
  assert.equal(serialized, '{"schemaVersion":1,"displayName":"工具箱 Café"}');
  assert.deepEqual(displayNames.parseDisplayNameState(serialized), renamed.state);
  assert.deepEqual(displayNames.parseDisplayNameState(new TextEncoder().encode(serialized)), renamed.state);
});

test('rename and reset produce redacted records while deterministic no-ops produce none', () => {
  const initial = displayNames.createDefaultDisplayNameState();
  const renamed = displayNames.renameDisplayName(initial, 'Utility Deck', NOW);
  assert.equal(renamed.state.displayName, 'Utility Deck');
  assert.equal(renamed.mutation.action, 'display-name-renamed');

  const noOp = displayNames.renameDisplayName(renamed.state, '  Utility Deck  ', 'not-a-timestamp');
  assert.deepEqual(noOp.state, renamed.state);
  assert.equal(noOp.mutation, null);

  const reset = displayNames.resetDisplayName(renamed.state, NOW);
  assert.equal(reset.state.displayName, displayNames.SHIPPED_PRODUCT_IDENTITY.displayName);
  assert.equal(reset.mutation.action, 'display-name-reset');
  assert.equal(displayNames.resetDisplayName(reset.state, 'not-a-timestamp').mutation, null);
});

test('stable product identifiers never derive from the chosen display name', () => {
  const identityBefore = { ...displayNames.SHIPPED_PRODUCT_IDENTITY };
  const renamed = displayNames.renameDisplayName(displayNames.createDefaultDisplayNameState(), 'Completely Different', NOW);
  const identityAfter = displayNames.getPublicDiagnosticIdentity();
  assert.deepEqual(identityAfter, identityBefore);
  assert.notEqual(renamed.state.displayName, identityAfter.displayName);
  assert.equal(identityAfter.applicationId, 'org.dingdingprojects.materialsystemutility');
  assert.equal(identityAfter.packageId, 'MaterialSystemUtility');
  assert.equal(identityAfter.appDataDirectoryName, 'material-system-utility');
  assert.equal(identityAfter.updateFeedId, 'material-system-utility');
  assert.equal(identityAfter.historyRepositoryId, 'material-system-utility-history');
  assert.equal(Object.isFrozen(displayNames.SHIPPED_PRODUCT_IDENTITY), true);
});

test('rejects empty, control, directional, malformed Unicode, and oversized names', () => {
  const limits = displayNames.DISPLAY_NAME_LIMITS;
  for (const invalid of [undefined, null, 7, '', '   ', '.', '..', 'line\nbreak', 'tab\tname', 'hidden\u200bname', 'bidi\u202ename', '\ud800']) {
    assert.throws(() => displayNames.normalizeDisplayName(invalid), { name: 'DisplayNameContractError' });
  }
  assert.throws(() => displayNames.normalizeDisplayName('x'.repeat(limits.maxCodePoints + 1)), /invalid/i);
  assert.throws(() => displayNames.normalizeDisplayName('界'.repeat(Math.floor(limits.maxUtf8Bytes / 3) + 1)), /invalid/i);
  assert.equal(displayNames.normalizeDisplayName('x'.repeat(limits.maxCodePoints)).length, limits.maxCodePoints);
  const astralBoundary = Math.min(limits.maxCodePoints, Math.floor(limits.maxUtf8Bytes / 4));
  assert.equal(Array.from(displayNames.normalizeDisplayName('😀'.repeat(astralBoundary))).length, astralBoundary);
  assert.equal(displayNames.normalizeDisplayName('  Valid 名稱  '), 'Valid 名稱');
  assert.equal(displayNames.normalizeDisplayName('Cafe\u0301'), 'Café');
});

test('rejects oversized persistence, unknown fields, unsafe keys, and unsupported versions', () => {
  const limits = displayNames.DISPLAY_NAME_LIMITS;
  assert.throws(() => displayNames.parseDisplayNameState(' '.repeat(limits.maxPayloadBytes + 1)), /invalid/i);
  assert.throws(() => displayNames.parseDisplayNameState('{'), /invalid/i);
  assert.throws(() => displayNames.parseDisplayNameState('{"schemaVersion":2,"displayName":"Name"}'), /invalid/i);
  assert.throws(() => displayNames.parseDisplayNameState('{"schemaVersion":1,"displayName":"Name","extra":true}'), /invalid/i);
  assert.throws(() => displayNames.parseDisplayNameState('{"schemaVersion":1,"displayName":"Name","__proto__":{}}'), /invalid/i);
  assert.throws(() => displayNames.parseDisplayNameState('{"schemaVersion":1,"displayName":"One","display\u004eame":"Two"}'), /invalid/i);
  assert.throws(() => displayNames.parseDisplayNameState('{"schemaVersion":1,"displayName":" Name "}'), /invalid/i);
  assert.throws(() => displayNames.parseDisplayNameState(Uint8Array.from([0xc3, 0x28])), /invalid/i);
  assert.throws(() => displayNames.renameDisplayName(displayNames.createDefaultDisplayNameState(), 'Name', '2026-02-30T12:00:00.000Z'), /invalid/i);
});

test('uses the chosen name for UI surfaces and shipped identity for public diagnostics', () => {
  const state = displayNames.renameDisplayName(displayNames.createDefaultDisplayNameState(), 'My Utility', NOW).state;
  const presentation = displayNames.resolveDisplayNameForUi(state, {
    languageMode: 'bilingual',
    englishFunnyLevel: 5,
    cantoneseFunnyLevel: 1,
  });
  assert.deepEqual(presentation, {
    displayName: 'My Utility',
    languageMode: 'bilingual',
    englishFunnyLevel: 5,
    cantoneseFunnyLevel: 1,
  });
  assert.equal(displayNames.getPublicDiagnosticIdentity().displayName, 'Material System Utility');
  assert.equal(state.displayName, 'My Utility');
  assert.throws(() => displayNames.resolveDisplayNameForUi(state, {
    languageMode: 'pirate', englishFunnyLevel: 1, cantoneseFunnyLevel: 1,
  }), /invalid/i);
  assert.throws(() => displayNames.resolveDisplayNameForUi(state, {
    languageMode: 'english', englishFunnyLevel: 1, cantoneseFunnyLevel: 1, privatePayload: 'must not pass',
  }), /invalid/i);
});

test('mutation records contain audit facts but no names, credentials, vocabulary, or private payloads', () => {
  const privateName = 'My Private Utility Name';
  const renamed = displayNames.renameDisplayName(displayNames.createDefaultDisplayNameState(), privateName, NOW);
  const reset = displayNames.resetDisplayName(renamed.state, NOW);
  for (const record of [renamed.mutation, reset.mutation]) {
    const serialized = JSON.stringify(record);
    assert.equal(record.redacted, true);
    assert.equal(record.field, 'display-name');
    assert.equal(record.occurredAt, NOW);
    assert.doesNotMatch(serialized, /My Private Utility Name|Material System Utility/);
    assert.doesNotMatch(serialized, /credential|password|token|vocabulary|private/i);
    assert.deepEqual(Object.keys(record).sort(), [
      'action', 'field', 'nextState', 'occurredAt', 'previousState', 'redacted', 'schemaVersion', 'summary',
    ]);
  }
});

test('core has no network, logging, export, storage, or credential behavior', async () => {
  const source = await readFile(new URL('../../src/shared/display-name.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|https?:\/\/|XMLHttpRequest|net\.request/);
  assert.doesNotMatch(source, /console\.|process\.stdout|process\.stderr/);
  assert.doesNotMatch(source, /writeFile|localStorage|sessionStorage|keytar|credential/i);
  assert.doesNotMatch(source, /exportTo|download|clipboard/i);
});
