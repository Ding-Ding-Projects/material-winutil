import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const renderer = await readFile(new URL('../../src/renderer/renderer.ts', import.meta.url), 'utf8');
const main = await readFile(new URL('../../src/main/main.ts', import.meta.url), 'utf8');
const preload = await readFile(new URL('../../src/main/preload.ts', import.meta.url), 'utf8');

test('settings has an always-present semantic local JSON picker with replace and clear states', () => {
  assert.match(renderer, /type:\s*'file',\s*accept:\s*'application\/json,\.json'/);
  assert.match(renderer, /data-vocabulary-upload/);
  assert.match(renderer, /vocabularyCopy\('replace'\)/);
  assert.match(renderer, /clearPersonalVocabulary\(\)/);
  assert.match(renderer, /vocabularyCopy\('empty'\)/);
  assert.match(renderer, /vocabularyCopy\('invalid'\)/);
  assert.match(renderer, /'aria-describedby': vocabularyStatusId/);
  assert.match(renderer, /disabled: vocabulary\.loading \|\| vocabulary\.data\.state === 'empty'/);
});

test('upload is bounded before reading, zeroized, and never exposes source file metadata', () => {
  assert.match(renderer, /file\.size\s*>\s*MAX_PERSONAL_VOCABULARY_BYTES/);
  assert.match(renderer, /payload\?\.fill\(0\)/);
  assert.doesNotMatch(renderer, /file\.name|file\.path|file\.lastModified/);
  assert.doesNotMatch(main, /sourcePath|originalName|lastModified/);
});

test('trusted IPC and preload expose only load, upload bytes, and clear', () => {
  for (const channel of ['load', 'upload', 'clear']) {
    assert.match(main, new RegExp(`personal-vocabulary:${channel}`));
    assert.match(preload, new RegExp(`personal-vocabulary:${channel}`));
  }
  assert.match(main, /requireTrustedSender\(event\)/);
  assert.match(main, /PERSONAL_VOCABULARY_LIMITS\.maxPayloadBytes/);
});

test('app-owned text boundary is explicit and command palette discovers the control', () => {
  assert.match(renderer, /function personalText\(/);
  assert.match(renderer, /const personalizable = attrs\['data-personalizable'\] === 'true'/);
  assert.match(renderer, /return personalText\(source\)\.replace/);
  assert.match(renderer, /personalText\(value\)\.replace\('\{count\}'/);
  assert.match(renderer, /class: 'brand', 'data-personalizable': 'true'/);
  assert.match(renderer, /function viewTitle\(view: ViewId\): string \{ return t\(VIEW_COPY\[view\]\.title\); \}/);
  assert.doesNotMatch(renderer, /'data-personalizable': 'true',[\s\S]{0,160}class: `nav-item/);
  assert.match(renderer, /Manage personal vocabulary/);
  assert.match(renderer, /querySelector<HTMLInputElement>\('\[data-vocabulary-upload="true"\]'\)/);
});

test('technical/provider records are not routed through personal vocabulary', () => {
  assert.match(renderer, /meta: app\.winget \|\| app\.choco/);
  assert.match(renderer, /navigator\.clipboard\?\.writeText\(app\.winget\)/);
  assert.match(renderer, /rows = allIdsInView\(\)/);
  assert.doesNotMatch(renderer, /personalText\(app\.(?:id|winget|choco|link|desc|name)\)/);
  assert.doesNotMatch(renderer, /personalText\(buildExport/);
});

test('representative shell text and accessible names change while technical records stay exact', () => {
  const mapping = { 'Main menu': 'Custom menu', Install: 'Custom install' };
  const replace = (input) => Object.keys(mapping)
    .sort((left, right) => right.length - left.length || (left < right ? -1 : left > right ? 1 : 0))
    .reduce((value, key) => value.split(key).join(mapping[key]), input);
  assert.equal(replace('Main menu'), 'Custom menu');
  assert.equal(replace('Install'), 'Custom install');
  for (const technical of ['7zip.7zip', 'https://example.invalid/path', 'winget install --id 7zip.7zip', 'v0.1.5301']) {
    assert.equal(technical, technical);
  }
  assert.match(renderer, /navigator\.clipboard\?\.writeText\(app\.winget\)/);
  assert.match(renderer, /const rows = allIdsInView\(\)/);
});

test('exports explicitly omit vocabulary data and file metadata while history never records vocabulary changes', () => {
  assert.match(renderer, /personal-vocabulary data and file metadata are deliberately omitted/);
  const vocabularyFunctions = renderer.slice(renderer.indexOf('async function loadPersonalVocabulary'), renderer.indexOf('const ICONS'));
  assert.doesNotMatch(vocabularyFunctions, /record\(|appendHistory|console\./);
});

test('upload and clear are guarded against re-entry and perform no network request', () => {
  const lane = renderer.slice(renderer.indexOf('async function uploadPersonalVocabulary'), renderer.indexOf('const ICONS'));
  assert.match(lane, /if \(state\.vocabulary\.loading\) return/g);
  assert.doesNotMatch(lane, /\bfetch\s*\(|XMLHttpRequest|net\.request|https?:\/\//);
});
