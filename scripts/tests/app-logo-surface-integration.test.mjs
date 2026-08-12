import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [main, preload, types, renderer, docs] = await Promise.all([
  readFile(new URL('../../src/main/main.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/main/preload.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/shared/types.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/renderer/renderer.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../docs/features/app-logo-customization.md', import.meta.url), 'utf8'),
]);

test('trusted IPC and preload expose only bounded app-logo operations', () => {
  for (const channel of ['state', 'pick-png', 'select-preset', 'update-transform', 'reset']) {
    assert.match(main, new RegExp(`app-logo:${channel}`));
    assert.match(preload, new RegExp(`app-logo:${channel}`));
  }
  assert.match(types, /appLogoPickPng\(transform: AppLogoTransform\)/u);
  assert.match(main, /requireTrustedSender\(event\)/u);
  assert.match(main, /APP_LOGO_LIMITS\.maxUploadBytes/u);
  assert.match(main, /finally \{ bytes\.fill\(0\); \}/u);
  const logoBridgeLines = preload.split(/\r?\n/u).filter((line) => line.includes('appLogo')).join('\n');
  assert.doesNotMatch(logoBridgeLines, /filePath|sourceHash|sourceBytes/u);
});

test('settings, title bar, search, palette, and School boundaries consume the logo surface', () => {
  assert.match(renderer, /data-app-logo-control/u);
  assert.match(renderer, /app-logo-titlebar/u);
  assert.match(renderer, /appLogoPickPng/u);
  assert.match(renderer, /appLogoSelectPreset/u);
  assert.match(renderer, /appLogoUpdateTransform/u);
  assert.match(renderer, /appLogoReset/u);
  assert.match(renderer, /Manage application logo/u);
  assert.match(renderer, /schoolModeRestrictsPersonalization\(\).*app logo/su);
  assert.match(renderer, /schoolModeRestrictsPersonalization\(\)\s*\?\s*undefined\s*:\s*state\.appLogo\.data\?\.assets/u);
  assert.match(renderer, /state\.prefs\.enFunny >= 4 \? englishPlayful : english/u);
  assert.match(renderer, /state\.prefs\.yueFunny >= 4 \? yuePlayful : yue/u);
  assert.match(renderer, /window\.setTimeout\(\(\) => document\.querySelector<HTMLElement>\('\[data-app-logo-control="true"\]'\)\?\.focus\(\), 0\)/u);
});

test('documentation states the privacy, rasterization, and stable-identity boundaries', () => {
  assert.match(docs, /local PNG/u);
  assert.match(docs, /raster/u);
  assert.match(docs, /source path/u);
  assert.match(docs, /package identity/u);
  assert.match(docs, /update feed/u);
  assert.match(docs, /application-data/u);
});
