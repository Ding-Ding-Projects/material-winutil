import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [html, css, js, coverageText] = await Promise.all([
  readFile(resolve(root, 'index.html'), 'utf8'),
  readFile(resolve(root, 'styles.css'), 'utf8'),
  readFile(resolve(root, 'app.js'), 'utf8'),
  readFile(resolve(root, 'coverage.json'), 'utf8')
]);
const coverage = JSON.parse(coverageText);

function assertExactUniqueIds(required, entries, label) {
  assert.ok(Array.isArray(required), `${label} required ID list is missing`);
  assert.ok(Array.isArray(entries), `${label} entries are missing`);
  assert.equal(new Set(required).size, required.length, `${label} required IDs must be unique`);
  const actual = entries.map((entry) => entry.id);
  assert.equal(new Set(actual).size, actual.length, `${label} entry IDs must be unique`);
  assert.deepEqual([...actual].sort(), [...required].sort(), `${label} entries must exactly match the hand-written required IDs`);
}

assert.equal(coverage.schemaVersion, 2, 'coverage schema version must be 2');
assertExactUniqueIds(coverage.requiredIds, coverage.verified, 'verified coverage');
assertExactUniqueIds(coverage.requiredUnavailableIds, coverage.explicitlyUnavailable, 'unavailable coverage');

for (const entry of coverage.verified) {
  assert.ok(Array.isArray(entry.evidence) && entry.evidence.length > 0, `${entry.id} must resolve at least one evidence item`);
  for (const evidence of entry.evidence) {
    const path = resolve(root, evidence.file);
    await access(path);
    if (evidence.contains) {
      const content = await readFile(path, 'utf8');
      assert.ok(content.includes(evidence.contains), `${entry.id} evidence is stale: ${evidence.file} does not contain ${JSON.stringify(evidence.contains)}`);
    }
  }
}

for (const required of ['home', 'capabilities', 'guides', 'safety', 'settings']) {
  assert.match(html, new RegExp(`data-page="${required}"`), `missing ${required} tab`);
  assert.match(html, new RegExp(`data-panel="${required}"`), `missing ${required} panel`);
}
assert.match(html, /id="documentation-tab-list"[^>]+role="tablist"[^>]+aria-orientation="vertical"/);
assert.match(html, /id="palette-launch"[^>]+aria-label="Open command palette"/);
assert.match(html, /id="command-result-count"[^>]+role="status"[^>]+aria-live="polite"/);
assert.match(html, /releases\/latest\/download\/MaterialSystemUtility-Setup\.exe/);
assert.match(html, /GitHub immutable releases are disabled/);
assert.match(html, /data-setting="desktop display name rename title about stable identity"/);
assert.match(html, /data-setting="desktop dialog emoji toggle semantic accessibility presentation only"/);
assert.match(html, /data-setting="desktop school mode shared local record live watcher English password credential manager"/);
assert.match(js, /Read desktop display-name settings/);
assert.match(js, /Read desktop dialog-emoji settings/);
assert.match(js, /Read shared School mode settings/);
assert.match(html, /href="screenshots\/safe-package-catalogue-dark\.png"/);
assert.match(html, /src="screenshots\/safe-package-catalogue-dark\.png"/);
assert.doesNotMatch(html, /(?:href|src)="\.\.\//);
assert.match(js, /function syncTabOrientation\(\)/);
assert.match(js, /setAttribute\('aria-orientation', vertical \? 'vertical' : 'horizontal'\)/);
assert.match(js, /rail\.setAttribute\('aria-hidden', String\(closed\)\)/);
assert.match(js, /rail\.setAttribute\('inert', ''\)/);
assert.match(js, /if \(event\.key === 'Tab'\)/);
assert.match(js, /command-result-count/);
assert.match(css, /@media \(max-width: 640px\)/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);

assert.doesNotMatch(html, /first immutable release|No installer link is shown|No verified public installer/i);
for (const [name, content] of [['styles.css', css], ['app.js', js]]) {
  assert.doesNotMatch(content, /https?:\/\//i, `${name} must not load remote assets`);
}
assert.doesNotMatch(html, /<(?:script|img|link)[^>]+(?:src|href)="https?:\/\//i, 'index.html must not load remote executable or visual assets');
for (const [name, content] of [['index.html', html], ['styles.css', css], ['app.js', js]]) {
  assert.doesNotMatch(content, /analytics|googletagmanager|fonts\.google/i, `${name} contains a forbidden external integration`);
}

console.log(`PASS: ${coverage.verified.length} exact site contracts and ${coverage.explicitlyUnavailable.length} exact unavailable contracts verified with resolved evidence`);
