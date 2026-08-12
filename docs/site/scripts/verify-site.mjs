import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [html, css, js, coverageText] = await Promise.all(['index.html', 'styles.css', 'app.js', 'coverage.json'].map((name) => readFile(resolve(root, name), 'utf8')));
const coverage = JSON.parse(coverageText);

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, 'HTML ids must be unique');
for (const match of js.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.includes(match[1]), `app.js references missing literal id ${match[1]}`);

function exactInventory(required, entries, name) {
  assert.ok(Array.isArray(required) && Array.isArray(entries), `${name} inventory is missing`);
  assert.equal(new Set(required).size, required.length, `${name} required IDs are not unique`);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length, `${name} entries are not unique`);
  assert.deepEqual(entries.map((entry) => entry.id).sort(), [...required].sort(), `${name} entries do not match the hand-written inventory`);
}

assert.equal(coverage.schemaVersion, 3);
exactInventory(coverage.requiredIds, coverage.verified, 'verified');
exactInventory(coverage.requiredUnavailableIds, coverage.explicitlyUnavailable, 'unavailable');
for (const contract of coverage.verified) {
  assert.ok(contract.evidence?.length, `${contract.id} has no evidence`);
  for (const evidence of contract.evidence) {
    const path = resolve(root, evidence.file); await access(path);
    if (evidence.contains) assert.ok((await readFile(path, 'utf8')).includes(evidence.contains), `${contract.id} has stale evidence: ${evidence.file} lacks ${JSON.stringify(evidence.contains)}`);
  }
}

for (const page of ['home', 'capabilities', 'guides', 'settings', 'schedule', 'tools', 'records', 'changelog']) {
  assert.match(html, new RegExp(`data-page="${page}"`), `missing ${page} tab`);
  assert.match(html, new RegExp(`data-panel="${page}"`), `missing ${page} panel`);
}
for (const search of ['tab', 'group', 'master-tab', 'learn-tab', 'workspace-tab', 'capability', 'settings', 'schedule', 'lock', 'record', 'changelog', 'palette', 'tab-menu']) {
  const id = `${search}-search`;
  assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  assert.match(html, new RegExp(`data-builder-for="${id}"`), `missing builder button for ${id}`);
  assert.match(html, new RegExp(`data-builder="${id}"`), `missing builder panel for ${id}`);
}

assert.match(html, /id="documentation-tab-list"[^>]+role="tablist"[^>]+aria-orientation="vertical"/);
assert.match(html, /id="command-result-count" role="status" aria-live="polite"/);
assert.match(html, /type="file" accept="application\/json,\.json"/);
assert.match(html, /Nothing is sent anywhere\. No real ticket is created outside this browser/);
assert.match(js, /function validateVocabularyObject/);
assert.match(js, /function detectDuplicateKeys/);
assert.match(js, /Math\.random\(\) >= \.1/);
assert.match(js, /function scheduleMatches/);
assert.match(js, /async function totpCode/);
assert.match(js, /event\.ctrlKey && event\.shiftKey/);
assert.match(js, /if \(event\.key === 'Tab'\)/);
assert.match(css, /@media\(max-width:640px\)/);
assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
assert.match(css, /min-width:320px/);
assert.match(css, /min-height:48px/);

for (const [name, content] of [['styles.css', css], ['app.js', js]]) assert.doesNotMatch(content, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/i, `${name} must not make runtime network requests`);
assert.doesNotMatch(html, /<(?:script|img|link)[^>]+(?:src|href)="https?:\/\//i, 'index must not load remote executable or visual assets');
for (const [name, content] of [['index.html', html], ['styles.css', css], ['app.js', js]]) assert.doesNotMatch(content, /googletagmanager|fonts\.google|analytics\.js/i, `${name} contains a forbidden external integration`);
assert.doesNotMatch(html, /dim[-_ ]sum[^\n]+<img|<img[^>]+dim[-_ ]sum/i, 'dim-sum surprise must not vendor or load an image');
assert.match(html, /GitHub immutable releases are disabled/);
assert.match(html, /releases\/latest\/download\/MaterialSystemUtility-Setup\.exe/);

console.log(`PASS: ${coverage.verified.length} exact site contracts and ${coverage.explicitlyUnavailable.length} exact unavailable contracts verified with resolved evidence`);
