import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [renderer, main, preload, types, docs] = await Promise.all([
  readFile(new URL('../../src/renderer/renderer.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/main/main.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/main/preload.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/shared/types.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../docs/features/locks-and-authenticator.md', import.meta.url), 'utf8'),
]);
const styles = await readFile(new URL('../../src/renderer/styles.css', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../smoke/app-manifest.json', import.meta.url), 'utf8'));

test('authenticator renderer calls every reviewed bridge operation', () => {
  for (const call of ['authenticatorBegin(', 'authenticatorImportPngFile(', 'authenticatorImportClipboardPng(', 'authenticatorConfirm(', 'authenticatorCancel(', 'authenticatorList(', 'authenticatorCodes(', 'authenticatorRemove(']) {
    assert.match(renderer, new RegExp(call.replace('(', '\\(')));
  }
});

test('trusted file and clipboard image routes decode bounded PNG locally and reuse confirmation', () => {
  for (const method of ['authenticatorImportPngFile', 'authenticatorImportClipboardPng']) {
    assert.match(types, new RegExp(`\\b${method}\\(`));
    assert.match(preload, new RegExp(`${method}:`));
    assert.match(renderer, new RegExp(`${method}\\(`));
  }
  assert.match(main, /authenticator:import-png-file[\s\S]*?showOpenDialog[\s\S]*?extensions: \['png'\][\s\S]*?beginFromPng/u);
  assert.match(main, /authenticator:import-clipboard-png[\s\S]*?clipboard\.readImage\(\)[\s\S]*?toPNG\(\)[\s\S]*?beginFromPng/u);
  assert.match(main, /AUTHENTICATOR_PNG_LIMITS\.maxBytes/u);
  assert.match(renderer, /importAuthenticatorPng\('file'\)/u);
  assert.match(renderer, /importAuthenticatorPng\('clipboard'\)/u);
  assert.match(renderer, /acceptAuthenticatorRegistration\(registration, generation\)/u);
  assert.match(docs, /up to 1 MiB, 2048 pixels on either edge, and 4,194,304 total pixels/u);
  assert.match(docs, /Camera scanning remains unavailable because it requires camera hardware and permission/u);
  assert.doesNotMatch(preload, /node:fs|clipboard\.readImage|PNG\.sync|jsQR/u);
});

test('registration keeps one-time secrets inside confirmation and clears imported URI state', () => {
  assert.match(renderer, /state\.auth\.draft\.uri = ''/u);
  assert.match(renderer, /state\.auth\.registration = null; state\.auth\.revealSecret = false/u);
  assert.match(renderer, /scheduleAuthenticatorExpiry\(registration, generation\)/u);
  assert.match(renderer, /generation !== authenticatorOperationGeneration/u);
  assert.match(renderer, /The one-time secret is no longer displayed/u);
  assert.match(renderer, /aria-expanded.*revealSecret/u);
  assert.doesNotMatch(styles, /content\s*:\s*["'][A-Z2-7]{16,}/u);
});

test('live code refresh discards cross-entry responses and avoids a one-second full render', () => {
  assert.match(renderer, /const requestedId = state\.auth\.selectedId/u);
  assert.match(renderer, /state\.auth\.selectedId !== requestedId/u);
  assert.match(renderer, /updateAuthenticatorCodeDom\(\)/u);
  assert.match(renderer, /updateAuthenticatorFeedbackDom\(\)/u);
  assert.match(renderer, /'data-auth-feedback': 'true'/u);
  const refreshBody = renderer.slice(renderer.indexOf('async function refreshAuthenticatorCodes'), renderer.indexOf('function resetAuthenticatorRegistration'));
  assert.doesNotMatch(refreshBody, /\brender\(\)/u);
});

test('entry search owns an adjacent full regex builder and dialog semantics are accessible', () => {
  assert.match(renderer, /searchLine\('auth-entries', authText\('search'\)\)/u);
  assert.match(renderer, /role: 'dialog', tabindex: '-1', 'aria-modal': 'true', 'aria-labelledby': titleId/u);
  assert.match(renderer, /\(firstInput \?\? dialog\)\?\.focus\(\)/u);
  assert.match(renderer, /'aria-haspopup': 'listbox', 'aria-expanded': 'false'/u);
  assert.match(renderer, /role: 'listbox'/u);
  assert.match(renderer, /role: 'option', 'aria-selected'/u);
  assert.match(renderer, /event\.key === 'Escape'.*event\.stopPropagation\(\).*close\(\)/su);
  assert.match(renderer, /\['ArrowDown', 'ArrowUp', 'Home', 'End'\]/u);
  assert.match(renderer, /e\.key !== 'Tab'/u);
  assert.match(renderer, /dialogReturnFocus\?\.focus\(\)/u);
});

test('authenticator QR, removal, and unmapped errors retain localized factual detail', () => {
  assert.match(renderer, /alt: `\$\{authText\('qrAlt'\)\}/u);
  assert.match(renderer, /gate\(`\$\{authText\('removeAction'\)\}/u);
  assert.match(renderer, /return `\$\{authText\('operationFailed'\)\}: \$\{detail\}`/u);
});

test('authenticator controls meet the 44px target and narrow dialogs reflow', () => {
  assert.match(styles, /\.auth-entry\s*\{[^}]*min-height:\s*56px/su);
  assert.match(styles, /@media \(max-width: 600px\)[\s\S]*\.auth-registration, \.auth-codes\s*\{\s*grid-template-columns:\s*minmax\(0,1fr\)/u);
  assert.match(styles, /\.scrim\s*\{[^}]*overflow:\s*auto/su);
  assert.match(styles, /\.dialog\s*\{[^}]*max-height:\s*calc\(100dvh - clamp\(/su);
});

test('smoke coverage uses deterministic non-persistent states for the full authenticator flow', () => {
  const captures = manifest.captures.filter((capture) => capture.id.startsWith('auth-'));
  assert.deepEqual(captures.map((capture) => capture.id), [
    'auth-empty', 'auth-generate-form', 'auth-import-form', 'auth-entry-list',
  ]);
  for (const capture of captures) {
    assert.match(capture.prepare, /fixtureMode=true/u);
    assert.doesNotMatch(capture.prepare, /authenticator(?:Begin|Confirm|Remove)\(/u);
  }
  const publicCaptureText = JSON.stringify(captures);
  assert.doesNotMatch(publicCaptureText, /manualSecret|qrDataUrl|otpauth:\/\/|current['"]?\s*:|next['"]?\s*:|\b\d{6,8}\b/u);
});
