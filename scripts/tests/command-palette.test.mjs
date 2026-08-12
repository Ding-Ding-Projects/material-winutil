import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const palette = await import(new URL('../../dist/shared/command-palette.js', import.meta.url));

const teleport = Object.freeze({ surfaceId: 'settings', tabId: 'appearance', groupId: 'theme', elementId: 'theme-picker', instructions: ['reveal', 'focus', 'highlight'] });
const entry = (overrides = {}) => ({
  id: 'setting.theme', kind: 'setting', title: 'Theme', description: 'Choose light or dark.', keywords: ['appearance', 'color'], teleport,
  richControl: { settingId: 'preferences.theme', control: 'select', validate: (value) => value === 'light' || value === 'dark' },
  availableInSchoolMode: true, retainsSearchAccess: true, retainsBulkActions: true, ...overrides,
});
const registry = (entries = [entry()]) => palette.validateCommandPaletteRegistry({ entries });
const presentation = (schoolModeEnabled = false) => ({ language: 'Bilingual', englishFunnyLevel: 4, cantoneseFunnyLevel: 5, schoolModeEnabled });

test('uses the fixed Ctrl+Shift+F binding and validates an accessible selection sequence', () => {
  assert.equal(palette.COMMAND_PALETTE_SHORTCUT, 'Ctrl+Shift+F');
  const entries = registry([entry(), entry({ id: 'page.docs', kind: 'page', title: 'Docs', richControl: undefined })]).entries;
  assert.deepEqual(palette.activateCommandPaletteSelection(entries, { activeId: null }, 'ArrowDown'), { activeId: 'setting.theme' });
  assert.deepEqual(palette.activateCommandPaletteSelection(entries, { activeId: 'setting.theme' }, 'ArrowUp'), { activeId: 'page.docs' });
  assert.deepEqual(palette.activateCommandPaletteSelection(entries, { activeId: 'page.docs' }, 'Home'), { activeId: 'setting.theme' });
});

test('handwritten inventory guard fails when a required discoverable item is missing', () => {
  assert.doesNotThrow(() => palette.assertCommandPaletteInventory(registry(), { ids: ['setting.theme'] }));
  assert.throws(() => palette.assertCommandPaletteInventory(registry(), { ids: ['setting.theme', 'article.offline-docs'] }), /missing/i);
});

test('plain and regex search remain independent and search only local registry text', () => {
  const entries = registry([entry(), entry({ id: 'article.docs', kind: 'article', title: 'Offline documentation', description: 'Bundled articles.', keywords: ['help'], richControl: undefined })]);
  assert.deepEqual(palette.searchCommandPalette(entries, { mode: 'plain', query: 'DOC', flags: 'iu' }, presentation()).map(({ id }) => id), ['article.docs']);
  assert.deepEqual(palette.searchCommandPalette(entries, { mode: 'regex', query: '^Theme$', flags: 'iu' }, presentation()).map(({ id }) => id), ['setting.theme']);
  assert.throws(() => palette.validateCommandPaletteSearchState({ mode: 'regex', query: '(', flags: 'u' }), /regex/i);
});

test('teleport retains exact surface tab group element and reveal focus highlight instructions', () => {
  assert.deepEqual(palette.resolveCommandPaletteTeleport(registry().entries[0]), teleport);
});

test('inline rich controls use their real setting id and validation callback', () => {
  const item = registry().entries[0];
  assert.equal(item.richControl.settingId, 'preferences.theme');
  assert.equal(palette.validateCommandPaletteInlineValue(item, 'dark'), true);
  assert.equal(palette.validateCommandPaletteInlineValue(item, 'neon'), false);
  assert.throws(() => registry([entry({ id: 'setting.no-control', richControl: undefined })]), /require a rich control/i);
});

test('School mode excludes unavailable palette records without hiding allowed records', () => {
  const entries = registry([entry(), entry({ id: 'setting.funny', title: 'Funny level', availableInSchoolMode: false })]);
  assert.deepEqual(palette.searchCommandPalette(entries, palette.createCommandPaletteSearchState(), presentation(true)).map(({ id }) => id), ['setting.theme']);
  assert.deepEqual(palette.searchCommandPalette(entries, palette.createCommandPaletteSearchState(), presentation(false)).map(({ id }) => id), ['setting.theme', 'setting.funny']);
});

test('bounded persisted layout supports card and full-window without unsafe shape', () => {
  const initial = palette.createDefaultCommandPaletteLayout();
  const stored = palette.parseCommandPaletteLayout(palette.serializeCommandPaletteLayout({ ...initial, size: 'full-window', cardWidth: 720, cardHeight: 600 }));
  assert.deepEqual(stored, { schemaVersion: 1, size: 'full-window', cardWidth: 720, cardHeight: 600 });
  assert.throws(() => palette.validateCommandPaletteLayout({ schemaVersion: 1, size: 'card', cardWidth: 12, cardHeight: 600 }), /bounds/i);
  assert.throws(() => palette.validateCommandPaletteLayout({ schemaVersion: 1, size: 'card', cardWidth: 680, cardHeight: 560, __proto__: {} }), /invalid/i);
});

test('registry rejects credential-like descriptor fields and the core has no I/O or persistence behavior', async () => {
  assert.throws(() => registry([entry({ token: 'do-not-accept' })]), /credential material/i);
  const source = await readFile(new URL('../../src/shared/command-palette.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|https?:\/\/|XMLHttpRequest|net\.request/);
  assert.doesNotMatch(source, /console\.|writeFile|localStorage|sessionStorage|keytar|clipboard/i);
  assert.doesNotMatch(source, /JSON\.stringify\([^)]*(?:token|password|secret|credential)/i);
});
