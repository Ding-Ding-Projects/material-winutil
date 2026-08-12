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
const updater = await readFile(new URL('../src/main/update-service.ts', import.meta.url), 'utf8');
assert.doesNotMatch(main, /ScriptBlock::Create|DownloadString\(|Invoke-WinUtilTweaks|Set-WinUtilUpdateProfile/);
assert.match(main, /resolvePackageRequest/);
assert.match(main, /sandbox: true/);
assert.match(main, /setWindowOpenHandler/);
assert.match(main, /setPermissionRequestHandler/);

const html = await readFile(new URL('../src/renderer/index.html', import.meta.url), 'utf8');
assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic|https?:\/\//);

const renderer = await readFile(new URL('../src/renderer/renderer.ts', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/renderer/styles.css', import.meta.url), 'utf8');
assert.match(renderer, /function selectedPackageIds\(\): string\[\]/);
assert.match(renderer, /\.map\(\(app\) => app\.id\)/);
// Real, user-created locks are allowed.  Seeded locked demo tabs are not: they
// make a fresh install look inaccessible before the user has created a lock.
assert.doesNotMatch(renderer, /\{\s*id:\s*'t\d+'[^\n]+locked:\s*true/u);
assert.doesNotMatch(renderer, /requestAnimationFrame\(drawQr\)/);
assert.doesNotMatch(renderer, /lockWizardDialog|credential:\s*w\.|Math\.random\(\).*899999/);
assert.match(renderer, /This is a user-experience lock, not a security boundary/);
assert.match(renderer, /lockOpenRecoveryFolder/);
assert.doesNotMatch(renderer, /Element and tab locks are unavailable/);
assert.match(renderer, /ISO customization is a documented preview/);
assert.match(renderer, /Local Git-backed history is append-only/);
assert.match(renderer, /\[app\.id\]\)/);
assert.match(renderer, /bridge\(\)\.historyBrowse\(/);
assert.match(main, /exportStructuredRecords/);
assert.match(main, /openExportInVSCode/);
assert.match(renderer, /bridge\(\)\.history\(\)/);
assert.match(renderer, /role: 'switch'/);
assert.match(renderer, /id: 'live-status'/);
assert.match(renderer, /finally \{\s*state\.queue\.active = false;/);
assert.match(main, /electron-squirrel-startup/);
assert.match(renderer, /role: 'tab'/);
assert.match(renderer, /role: 'checkbox'/);
assert.match(styles, /\[tabindex\]:focus-visible/);
assert.match(updater, /adapter\.setFeedURL/);
assert.match(updater, /UPDATE_CHECK_INTERVAL_MS = 4 \* 60 \* 60 \* 1000/);
assert.match(main, /new UpdateService/);
assert.match(main, /updateService!\.restart\(request\)/);
assert.match(renderer, /Restart to install update/);
assert.match(renderer, /Cancel check/);
assert.match(renderer, /confirmDiscard: false/);
assert.match(renderer, /every installer is unsigned/);
console.log('PASS: safe catalogue baseline verified');
