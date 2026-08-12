import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const policySource = await readFile(new URL('../../dist/main/package-policy.js', import.meta.url), 'utf8');
const catalog = JSON.parse(await readFile(new URL('../../config/winutil.json', import.meta.url), 'utf8'));
const policy = await import(new URL('../../dist/main/package-policy.js', import.meta.url));

test('catalog validation accepts the reviewed inventory', () => {
  assert.equal(policy.validateCatalog(catalog).apps.length, 227);
});

test('catalog validation rejects duplicate owned identifiers', () => {
  const bad = structuredClone(catalog);
  bad.apps[1].id = bad.apps[0].id;
  assert.throws(() => policy.validateCatalog(bad), /invalid application record/);
});

test('package requests resolve app-owned catalogue ids, never renderer package ids', () => {
  const result = policy.resolvePackageRequest(catalog, 'install', ['7zip']);
  assert.equal(result.ok, true);
  assert.deepEqual(result.packages[0], { catalogId: '7zip', packageId: '7zip.7zip', source: 'winget' });
  assert.equal(policy.resolvePackageRequest(catalog, 'install', ['Some.Attacker.Package']).ok, false);
  assert.equal(policy.resolvePackageRequest(catalog, 'install', ['7zip.7zip']).ok, false);
});

test('package policy rejects empty, duplicate, oversized, and unsupported requests', () => {
  assert.equal(policy.resolvePackageRequest(catalog, 'install', []).code, 64);
  assert.equal(policy.resolvePackageRequest(catalog, 'uninstall', ['7zip', '7zip']).code, 64);
  assert.equal(policy.resolvePackageRequest(catalog, 'install', Array.from({ length: 101 }, (_, i) => `x${i}`)).code, 64);
  assert.equal(policy.resolvePackageRequest(catalog, 'tweak', ['7zip']).code, 78);
  assert.equal(policy.resolvePackageRequest(catalog, 'upgrade', ['7zip']).code, 64);
  assert.equal(policy.resolvePackageRequest(catalog, 'upgrade', []).ok, true);
});

test('winget argument construction is exact, noninteractive, and shell-free', () => {
  const result = policy.resolvePackageRequest(catalog, 'install', ['chatgpt']);
  assert.equal(result.ok, true);
  assert.deepEqual(policy.wingetArgs('install', result.packages[0]), [
    'install', '--id', '9NT1R1C2HH7J', '--source', 'msstore', '--exact', '--silent', '--disable-interactivity',
    '--accept-source-agreements', '--accept-package-agreements',
  ]);
  assert.doesNotMatch(policy.wingetArgs('uninstall', result.packages[0]).join(' '), /accept-package-agreements/);
});

test('runtime policy source does not expose shell evaluation', () => {
  assert.doesNotMatch(policySource, /exec\(|eval\(|Function\(/);
});
