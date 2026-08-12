import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const renderer = await readFile(new URL('../../src/renderer/renderer.ts', import.meta.url), 'utf8');
const styles = await readFile(new URL('../../src/renderer/styles.css', import.meta.url), 'utf8');

function iconNames(source) {
  const values = new Set();
  for (const pattern of [/icon\('([^']+)'/gu, /icon:\s*'([^']+)'/gu]) {
    for (const match of source.matchAll(pattern)) values.add(match[1]);
  }
  for (const match of source.matchAll(/const CAT_ICONS:[\s\S]*?=\s*\{([\s\S]*?)\};/gu)) {
    for (const icon of match[1].matchAll(/:\s*'([^']+)'/gu)) values.add(icon[1]);
  }
  return [...values].sort();
}

test('every visible action icon has an explicit non-dot glyph', () => {
  const mapBody = renderer.match(/const ICONS:[\s\S]*?=\s*\{([\s\S]*?)\};/u)?.[1] ?? '';
  const mapped = new Map([...mapBody.matchAll(/\b([a-z0-9_]+):\s*'([^']+)'/gu)].map((match) => [match[1], match[2]]));
  const missing = iconNames(renderer).filter((name) => !mapped.has(name));
  assert.deepEqual(missing, [], `unmapped visible icons: ${missing.join(', ')}`);
  for (const [name, glyph] of mapped) assert.notEqual(glyph, '•', `${name} must not use a dot fallback`);
  assert.doesNotMatch(renderer, /ICONS\[name\]\s*\?\?\s*'•'/u);
});

test('dropdowns keep independent filtered regex builders and keyboard listbox semantics', () => {
  assert.match(renderer, /const key = `select:\$\{state\.dialog \?\? state\.view\}:\$\{label\}`/u);
  assert.match(renderer, /class: `regex-btn\$\{s\.regex \? ' on' : ''\}`[\s\S]*?state\.regexDraft\.target = key/su);
  assert.match(renderer, /'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': listboxId/u);
  assert.match(renderer, /role: 'listbox'/u);
  assert.match(renderer, /role: 'option', 'aria-selected'/u);
  assert.match(renderer, /\['ArrowDown', 'ArrowUp', 'Home', 'End'\]/u);
  assert.match(renderer, /current < 0 \? buttons\.length - 1/u);
  assert.match(renderer, /if \(s\.text\) \{ s\.text = ''; input\.value = ''; paint\(\); input\.focus\(\); \}/u);
});

test('dialogs and menus paint opaque, elevated, bounded Material surfaces', () => {
  assert.match(styles, /\.dialog\s*\{[^}]*background-color:\s*var\(--md-sys-color-surface-container-high\)[^}]*opacity:\s*1[^}]*isolation:\s*isolate/su);
  assert.match(styles, /\.menu\s*\{[^}]*background-color:\s*var\(--md-sys-color-surface-container-high\)[^}]*background-image:\s*none[^}]*opacity:\s*1[^}]*isolation:\s*isolate/su);
  assert.match(styles, /\.menu\s*\{[^}]*box-shadow:/su);
  assert.match(styles, /\.dialog\s*\{[^}]*max-height:\s*calc\(100dvh - clamp\(/su);
  assert.match(styles, /\.menu\s*\{\s*min-width:\s*0 !important;[^}]*max-height:\s*calc\(100dvh - 16px\);[^}]*overflow:\s*auto/su);
});

test('interactive targets and compact rows remain at least 44px with visible focus', () => {
  assert.match(styles, /:root\[data-density="compact"\]\s*\{\s*--row-height:\s*44px/u);
  assert.match(styles, /\.icon-btn\.small\s*\{\s*width:\s*44px;\s*height:\s*44px/u);
  assert.match(styles, /\.regex-btn\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px/su);
  assert.match(styles, /\.chip\s*\{[^}]*min-height:\s*44px/su);
  assert.match(styles, /\.seg\s*\{[^}]*min-height:\s*44px/su);
  assert.match(styles, /button:focus-visible,[\s\S]*outline:\s*3px solid var\(--md-sys-color-primary\)/u);
  assert.match(styles, /\.searchline:has\(input:focus-visible\)\s*\{\s*outline:\s*3px solid var\(--md-sys-color-primary\)/u);
  assert.match(styles, /\.field > input:focus-visible,[\s\S]*\.lock-input:focus-visible\s*\{\s*outline:\s*3px solid var\(--md-sys-color-primary\)/u);
  assert.match(styles, /\.row:hover \.row-actions, \.row:focus-within \.row-actions\s*\{\s*opacity:\s*1/u);
});

test('narrow and high-scale layouts keep overlays and controls inside the viewport', () => {
  assert.match(styles, /@media \(max-width: 480px\), \(max-height: 520px\)/u);
  assert.match(styles, /\.content\.tab-dock-left\s*\{\s*grid-template-columns:\s*64px minmax\(0, 1fr\)/u);
  assert.match(styles, /\.dialog-actions > \.btn\s*\{\s*flex:\s*1 1 132px/u);
  assert.match(styles, /\.toolbar-left, \.toolbar-right\s*\{[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden/su);
});
