import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildOfflineDocsBundle, verifyOfflineDocsBundle } from '../dist/shared/offline-docs.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const featuresRoot = path.join(repositoryRoot, 'docs', 'features');
const outputDirectory = path.join(repositoryRoot, 'dist', 'offline-docs');
const outputFile = path.join(outputDirectory, 'bundle.json');
const temporaryFile = path.join(outputDirectory, 'bundle.json.tmp');

async function collectMarkdown(directory, relative = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) paths.push(...await collectMarkdown(path.join(directory, entry.name), childRelative));
    else if (entry.isFile() && entry.name.endsWith('.md')) paths.push(`docs/features/${childRelative}`);
  }
  return paths;
}

const inventory = (await collectMarkdown(featuresRoot)).sort((left, right) => left.localeCompare(right));
const sources = await Promise.all(inventory.map(async (sourcePath) => ({
  path: sourcePath,
  content: await readFile(path.join(repositoryRoot, ...sourcePath.split('/'))),
})));
const bundle = buildOfflineDocsBundle({ schemaVersion: 1, sources, diskInventory: inventory });
verifyOfflineDocsBundle(bundle);
await mkdir(outputDirectory, { recursive: true });
const serialized = `${JSON.stringify(bundle)}\n`;
if (Buffer.byteLength(serialized, 'utf8') > 4 * 1024 * 1024) throw new RangeError('Offline documentation bundle exceeds the 4 MiB runtime boundary.');
await rm(temporaryFile, { force: true });
await writeFile(temporaryFile, serialized, { encoding: 'utf8', flag: 'wx' });
await rename(temporaryFile, outputFile);
console.log(`Bundled ${bundle.articles.length} offline documentation articles with verified hashes.`);
