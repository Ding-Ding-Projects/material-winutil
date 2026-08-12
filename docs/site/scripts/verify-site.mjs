import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docs = resolve(root, '..');
const [html, css, js, coverageText] = await Promise.all([
  readFile(resolve(root, 'index.html'), 'utf8'),
  readFile(resolve(root, 'styles.css'), 'utf8'),
  readFile(resolve(root, 'app.js'), 'utf8'),
  readFile(resolve(root, 'coverage.json'), 'utf8')
]);
const coverage = JSON.parse(coverageText);

await access(resolve(docs, 'screenshots', 'safe-package-catalogue-dark.png'));
for (const required of ['home', 'capabilities', 'guides', 'safety', 'settings']) {
  assert.match(html, new RegExp(`data-page="${required}"`), `missing ${required} tab`);
  assert.match(html, new RegExp(`data-panel="${required}"`), `missing ${required} panel`);
}
assert.match(html, /role="tablist"/);
assert.match(html, /aria-orientation="vertical"/);
assert.match(html, /id="settings-search"/);
assert.match(html, /id="settings-regex-button"/);
assert.match(html, /id="command-palette"/);
assert.match(html, /safe-package-catalogue-dark\.png/);
assert.match(js, /event\.ctrlKey && event\.shiftKey/);
assert.match(js, /localStorage/);
assert.match(js, /new RegExp/);
assert.match(css, /@media \(max-width: 640px\)/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.ok(Array.isArray(coverage.verified) && coverage.verified.length >= 10, 'coverage manifest is incomplete');
assert.ok(Array.isArray(coverage.explicitlyUnavailable) && coverage.explicitlyUnavailable.length >= 8, 'unavailable inventory is incomplete');

for (const [name, content] of [['index.html', html], ['styles.css', css], ['app.js', js]]) {
  assert.doesNotMatch(content, /https?:\/\//i, `${name} must not load remote assets`);
  assert.doesNotMatch(content, /analytics|googletagmanager|fonts\.google/i, `${name} contains a forbidden external integration`);
}

console.log('PASS: documentation site structure, coverage, local assets, and capability boundary verified');
