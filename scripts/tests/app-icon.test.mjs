import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');

test('ships a multi-resolution local icon for the unsigned Squirrel package', async () => {
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const icon = await readFile(join(root, 'build', 'icon.ico'));
  assert.equal(packageJson.build.directories.buildResources, 'build');
  assert.equal(packageJson.build.win.icon, 'build/icon.ico');
  assert.equal(packageJson.build.squirrelWindows.iconUrl, 'https://raw.githubusercontent.com/Ding-Ding-Projects/material-winutil/main/build/icon.ico');
  assert.equal(icon.readUInt16LE(0), 0); assert.equal(icon.readUInt16LE(2), 1);
  const count = icon.readUInt16LE(4); assert.equal(count, 7);
  const sizes = [];
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16; sizes.push(icon[entry] || 256);
    const imageOffset = icon.readUInt32LE(entry + 12);
    assert.deepEqual([...icon.subarray(imageOffset, imageOffset + 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
  assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256]);
});
