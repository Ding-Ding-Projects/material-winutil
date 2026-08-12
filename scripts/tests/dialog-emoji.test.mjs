import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_DIALOG_EMOJI_PREFERENCES,
  DIALOG_EMOJI_LIMITS,
  DialogEmojiPreferenceError,
  createDefaultDialogEmojiPreferences,
  createDialogEmojiPresentation,
  parseDialogEmojiPreferences,
  resolveDialogEmojiDecoration,
  serializeDialogEmojiPreferences,
  validateDialogEmojiPreferences,
} from '../../dist/shared/dialog-emoji.js';

const FACTS = Object.freeze({
  title: 'Remove selected package?',
  message: 'This removes the package from this computer.',
  actionLabels: Object.freeze(['Remove', 'Cancel']),
  accessibleName: 'Remove selected package confirmation',
});

const preference = (enabled = true) => ({
  schemaVersion: 1,
  showEmojisInDialogsAndMessageBoxes: enabled,
});

const presentation = (overrides = {}) => createDialogEmojiPresentation({
  preferences: preference(true),
  category: 'destructive',
  schoolMode: false,
  languageMode: 'bilingual',
  englishFunnyLevel: 5,
  cantoneseFunnyLevel: 5,
  factualText: FACTS,
  ...overrides,
});

test('versioned default and serialized preferences round-trip for persisted restart state', () => {
  assert.deepEqual(DEFAULT_DIALOG_EMOJI_PREFERENCES, preference(true));
  assert.deepEqual(createDefaultDialogEmojiPreferences(), preference(true));
  const persisted = serializeDialogEmojiPreferences(preference(false));
  assert.equal(persisted, '{"schemaVersion":1,"showEmojisInDialogsAndMessageBoxes":false}');
  assert.deepEqual(parseDialogEmojiPreferences(persisted), preference(false));
  assert.deepEqual(parseDialogEmojiPreferences(new TextEncoder().encode(persisted)), preference(false));
  assert(Object.isFrozen(parseDialogEmojiPreferences(persisted)));
});

test('every bounded category has a fixed deterministic presentation-only decoration', () => {
  const expected = {
    information: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
    destructive: '🗑️',
    security: '🔒',
  };
  for (const [category, glyph] of Object.entries(expected)) {
    const first = resolveDialogEmojiDecoration(preference(true), category, false);
    const second = resolveDialogEmojiDecoration(preference(true), category, false);
    assert.deepEqual(first, second);
    assert.deepEqual(first, {
      category,
      glyph,
      role: 'presentation',
      ariaHidden: true,
      includedInAccessibleName: false,
      includedInControlText: false,
    });
  }
});

test('the persisted off state omits decoration without changing any factual dialog text', () => {
  const on = presentation();
  const off = presentation({ preferences: preference(false) });
  assert.notEqual(on.decoration, null);
  assert.equal(off.decoration, null);
  assert.deepEqual(on.factualText, FACTS);
  assert.deepEqual(off.factualText, FACTS);
  assert.equal(on.factualText.title, off.factualText.title);
  assert.equal(on.factualText.message, off.factualText.message);
  assert.deepEqual(on.factualText.actionLabels, off.factualText.actionLabels);
  assert.equal(on.factualText.accessibleName, off.factualText.accessibleName);
});

test('School mode suppresses only the optional decoration and restores it when left', () => {
  const ordinary = presentation({ schoolMode: false });
  const school = presentation({ schoolMode: true });
  const restored = presentation({ schoolMode: false });
  assert.notEqual(ordinary.decoration, null);
  assert.equal(school.decoration, null);
  assert.deepEqual(restored.decoration, ordinary.decoration);
  assert.deepEqual(school.factualText, ordinary.factualText);
});

test('language and funny levels are presentation-independent and never contaminate controls or accessible names', () => {
  const seriousEnglish = presentation({
    languageMode: 'english', englishFunnyLevel: 1, cantoneseFunnyLevel: 1,
  });
  const playfulBilingual = presentation({
    languageMode: 'bilingual', englishFunnyLevel: 5, cantoneseFunnyLevel: 5,
  });
  assert.deepEqual(playfulBilingual.factualText, seriousEnglish.factualText);
  assert.equal(playfulBilingual.factualText.accessibleName, FACTS.accessibleName);
  assert.deepEqual(playfulBilingual.factualText.actionLabels, FACTS.actionLabels);
  assert.equal(playfulBilingual.decoration.includedInAccessibleName, false);
  assert.equal(playfulBilingual.decoration.includedInControlText, false);
  assert.equal(playfulBilingual.decoration.ariaHidden, true);
});

test('parser rejects malformed, unknown, unsafe, unsupported, and unbounded preferences', () => {
  const rejects = (payload, code) => assert.throws(
    () => parseDialogEmojiPreferences(payload),
    (error) => error instanceof DialogEmojiPreferenceError && error.code === code,
  );
  rejects('{', 'invalid-json');
  rejects('{"schemaVersion":2,"showEmojisInDialogsAndMessageBoxes":true}', 'unsupported-version');
  rejects('{"schemaVersion":1,"showEmojisInDialogsAndMessageBoxes":true,"extra":false}', 'unexpected-field');
  rejects('{"schemaVersion":1,"showEmojisInDialogsAndMessageBoxes":true,"__proto__":{}}', 'unsafe-field');
  rejects('{"schemaVersion":1,"showEmojisInDialogsAndMessageBoxes":"true"}', 'invalid-preference');
  rejects('x'.repeat(DIALOG_EMOJI_LIMITS.maxPayloadBytes + 1), 'payload-too-large');
  assert.throws(() => validateDialogEmojiPreferences(Object.create(null)), DialogEmojiPreferenceError);
});

test('presentation rejects unsupported categories and bounds without producing alternate text', () => {
  assert.throws(() => resolveDialogEmojiDecoration(preference(true), 'celebration', false), /category/);
  assert.throws(() => presentation({ englishFunnyLevel: 0 }), /Funny levels/);
  assert.throws(() => presentation({ factualText: { ...FACTS, actionLabels: Array(17).fill('Continue') } }), /actions/);
  assert.throws(() => presentation({ factualText: { ...FACTS, title: 'x'.repeat(16_385) } }), /bounded/);
});

test('the core remains pure and excludes network, logging, history, storage, and export behavior', async () => {
  const source = await (await import('node:fs/promises')).readFile(
    new URL('../../src/shared/dialog-emoji.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /\bfetch\s*\(|https?:\/\/|XMLHttpRequest|net\.request/i);
  assert.doesNotMatch(source, /console\.|process\.stdout|process\.stderr/i);
  assert.doesNotMatch(source, /writeFile|localStorage|sessionStorage|keytar|credential/i);
  assert.doesNotMatch(source, /exportTo|download|clipboard/i);
});
