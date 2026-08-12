import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [index, renderer, styles, start, finish] = await Promise.all([
  readFile(new URL('../../src/renderer/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../../src/renderer/renderer.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/renderer/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../../src/renderer/appearance-runtime-start.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/renderer/appearance-runtime-finish.ts', import.meta.url), 'utf8'),
]);

test('renderer loads the shared appearance colour runtime before the main surface', () => {
  assert.match(index, /appearance-runtime-start\.js[\s\S]*\.\.\/shared\/appearance\.js[\s\S]*appearance-runtime-finish\.js[\s\S]*renderer\.js/u);
  assert.match(start, /window[\s\S]*exports/u);
  assert.match(finish, /appearanceColor[\s\S]*convertColor[\s\S]*contrastRatio/u);
  assert.match(finish, /Object\.freeze\(appearanceRuntimeExports\)/u);
  assert.doesNotMatch(renderer, /function\s+record\s*\(/u, 'classic scripts share global names, so renderer history must not replace appearance.ts record()');
  assert.match(renderer, /function\s+recordHistory\s*\(/u);
});

test('colour picker uses every shared representation with bounded editable input and copy', () => {
  for (const space of ['hex', 'rgb', 'hsl', 'hsv', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'cmyk']) {
    assert.match(renderer, new RegExp(`['\"]${space}['\"]`, 'u'));
  }
  assert.match(renderer, /COLOR_TRANSLATOR_INPUT_LIMIT = 512/u);
  assert.match(renderer, /maxlength: String\(COLOR_TRANSLATOR_INPUT_LIMIT\)/u);
  assert.match(renderer, /runtime\.convertColor\(parsed, 'hsl'\)/u);
  assert.match(renderer, /navigator\.clipboard\?\.writeText\(value\)/u);
  assert.match(renderer, /Copied the \$\{p\.representation\.toUpperCase\(\)\} value/u);
  assert.match(renderer, /const fallback = '#6750A4';[\s\S]*typeof state\.selectionColor === 'string'[\s\S]*convertColor\(\{ space: 'hex', value: current \}, 'hsl'\)/u);
  assert.doesNotMatch(renderer, /function rgbTo(?:Hsv|Xyz)|function xyzTo(?:Rgb|Lab)|function oklabToRgb/u);
});

test('colour picker reports gamut clipping, alpha, and composited contrast accessibly', () => {
  assert.match(renderer, /clippedChannels\.join/u);
  assert.match(renderer, /Outside sRGB gamut/u);
  assert.match(renderer, /normal text AA[\s\S]*large text AA/u);
  assert.match(renderer, /runtime\.contrastRatio\(foreground/u);
  assert.match(renderer, /role: 'status', 'aria-live': 'polite'/u);
  assert.match(renderer, /role: 'alert'/u);
  assert.match(renderer, /slider\('Alpha'/u);
  assert.match(styles, /\.color-space-tabs[\s\S]*min-height: 44px/u);
  assert.match(styles, /\.color-representation-input[\s\S]*resize: vertical/u);
});
