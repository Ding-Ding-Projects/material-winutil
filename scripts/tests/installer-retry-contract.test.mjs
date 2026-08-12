import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');

test('retries the Squirrel packaging operation with bounded backoff', async () => {
  const source = await readFile(resolve(root, 'scripts', 'invoke-build.ps1'), 'utf8');
  assert.match(source, /function Build-InstallerPackage\(/u);
  assert.match(source, /\$attempts = 3/u);
  assert.match(source, /Packaging the unsigned Squirrel\.Windows installer \(attempt \$attempt of \$attempts\)/u);
  assert.match(source, /\$delaySeconds = 10 \* \$attempt/u);
  assert.match(source, /after \$attempts packaging attempts/u);
  assert.match(source, /Build-InstallerPackage -NpmPath \$npm -SkipChecks \$SkipLocalChecks/u);
});
