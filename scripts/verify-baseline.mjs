import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const catalog = JSON.parse(await readFile(new URL('../config/winutil.json', import.meta.url), 'utf8'));
assert.equal(catalog.apps.length, 227, 'expected the reviewed WinUtil application catalogue');
assert.equal(catalog.tweaks.length, 67, 'expected the reviewed WinUtil tweak catalogue');
assert.equal(catalog.features.length, 33, 'expected the reviewed WinUtil feature catalogue');
for (const app of catalog.apps) {
  assert.match(app.id, /^[A-Za-z0-9][A-Za-z0-9._+-]{0,199}$/, `invalid catalogue id: ${app.id}`);
  if (app.winget) {
    assert.match(app.winget, /^(?:[A-Za-z0-9][A-Za-z0-9._+-]{0,199}|msstore:[A-Za-z0-9]{1,32})$/, `invalid WinGet id: ${app.winget}`);
  }
}

const main = await readFile(new URL('../src/main/main.ts', import.meta.url), 'utf8');
assert.doesNotMatch(main, /ScriptBlock::Create|DownloadString\(|Invoke-WinUtilTweaks|Set-WinUtilUpdateProfile/);
assert.match(main, /PACKAGE_ID/);
assert.match(main, /value\.startsWith\('msstore:'\)/);
assert.match(main, /'--source', item\.source/);

const html = await readFile(new URL('../src/renderer/index.html', import.meta.url), 'utf8');
assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic|https?:\/\//);

const renderer = await readFile(new URL('../src/renderer/renderer.ts', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/renderer/styles.css', import.meta.url), 'utf8');
assert.match(renderer, /function selectedPackageIds\(\): string\[\]/);
assert.match(renderer, /\.map\(\(app\) => app\.winget\)/);
assert.doesNotMatch(renderer, /locked: true/);
assert.doesNotMatch(renderer, /requestAnimationFrame\(drawQr\)/);
assert.match(renderer, /case 'lockwizard': return lockDialog\(\);/);
assert.match(renderer, /role: 'tab'/);
assert.match(renderer, /role: 'checkbox'/);
assert.match(styles, /\[tabindex\]:focus-visible/);
console.log('PASS: safe catalogue baseline verified');
