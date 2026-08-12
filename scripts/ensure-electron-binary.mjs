#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const electronRoot = join(root, 'node_modules', 'electron');
const distRoot = join(electronRoot, 'dist');
const checkOnly = process.argv.includes('--check');
const say = (message) => process.stdout.write(`${message}\n`);
const fail = (message) => { process.stderr.write(`${message}\n`); process.exit(1); };

function executableName() {
  if (process.platform === 'win32') return 'electron.exe';
  if (process.platform === 'darwin') return 'Electron.app/Contents/MacOS/Electron';
  return 'electron';
}

if (!existsSync(electronRoot)) fail('node_modules/electron is absent; run the dependency install first.');
const executable = join(distRoot, executableName());
if (existsSync(executable)) {
  if (!existsSync(join(electronRoot, 'path.txt'))) writeFileSync(join(electronRoot, 'path.txt'), executableName());
  say(`ok electron binary present at ${executable}`);
  process.exit(0);
}
if (checkOnly) fail(`electron binary missing at ${executable}`);

const version = JSON.parse(readFileSync(join(electronRoot, 'package.json'), 'utf8')).version;
const assetName = `electron-v${version}-${process.platform}-${process.arch}.zip`;
const cacheRoot = process.env.electron_config_cache ?? (
  process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA ?? '', 'electron', 'Cache')
    : process.platform === 'darwin'
      ? join(process.env.HOME ?? '', 'Library', 'Caches', 'electron')
      : join(process.env.HOME ?? '', '.cache', 'electron')
);

function findCachedAsset() {
  if (!existsSync(cacheRoot)) return null;
  const direct = join(cacheRoot, assetName);
  if (existsSync(direct)) return direct;
  for (const entry of readdirSync(cacheRoot)) {
    const candidate = join(cacheRoot, entry, assetName);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const asset = findCachedAsset();
if (asset === null) fail(`${assetName} is not in the Electron cache at ${cacheRoot}. Re-run npm ci with install scripts enabled.`);
const checksums = JSON.parse(readFileSync(join(electronRoot, 'checksums.json'), 'utf8'));
const expected = checksums[assetName];
if (typeof expected !== 'string') fail(`checksums.json has no entry for ${assetName}`);
const actual = createHash('sha256').update(readFileSync(asset)).digest('hex');
if (actual.toLowerCase() !== expected.toLowerCase()) fail(`${assetName} failed SHA-256 verification; delete the corrupt cache entry and install again.`);
say('sha-256 verified against the Electron package checksums');

mkdirSync(distRoot, { recursive: true });
if (process.platform === 'win32') {
  execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
    `Expand-Archive -LiteralPath '${asset.replaceAll("'", "''")}' -DestinationPath '${distRoot.replaceAll("'", "''")}' -Force`,
  ], { stdio: 'inherit' });
} else {
  execFileSync('unzip', ['-o', '-q', asset, '-d', distRoot], { stdio: 'inherit' });
}
writeFileSync(join(electronRoot, 'path.txt'), executableName());
if (!existsSync(executable)) fail(`extraction finished but ${executable} is still absent`);
say(`ok extracted Electron ${version} to ${distRoot}`);
