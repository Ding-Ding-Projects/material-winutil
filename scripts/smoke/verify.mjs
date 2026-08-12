import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitCommit, sha256File } from './lib/contracts.mjs';
import { assertUniquePngs, inspectPng } from './lib/png.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const root = resolve(process.argv[2] ?? join(repo, 'docs', 'screenshots', 'smoke'));

async function main() {
  const metadataPath = join(root, 'metadata.json');
  await access(metadataPath);
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  if (metadata.schemaVersion !== 1 || !Array.isArray(metadata.captures)) throw new Error('unsupported smoke metadata schema');
  const commit = await gitCommit(repo);
  if (metadata.commit !== commit) throw new Error(`capture commit ${metadata.commit} does not match current commit ${commit}`);
  if (metadata.safety?.systemChangingActions !== 0 || metadata.safety?.packageCommands !== 0 || metadata.safety?.visibleDesktopInteractions !== 0) {
    throw new Error('capture metadata does not prove a non-mutating hidden-desktop run');
  }
  const verified = [];
  for (const capture of metadata.captures) {
    const file = join(repo, 'docs', 'screenshots', capture.relativeFile);
    const png = await inspectPng(file);
    if (png.sha256 !== capture.png.sha256 || png.width !== capture.png.width || png.height !== capture.png.height) throw new Error(`${capture.id} does not match its metadata`);
    const executableExists = await access(capture.executable).then(() => true, () => false);
    if (executableExists && capture.executableSha256 !== await sha256File(capture.executable)) throw new Error(`${capture.id} executable hash no longer matches`);
    if (!String(capture.captureMethod).includes('cheap Lowlevel MCP hidden desktop')) throw new Error(`${capture.id} has an unsupported capture method`);
    verified.push({ file, png });
  }
  assertUniquePngs(verified);
  process.stdout.write(`verified metadata and ${verified.length} capture(s) at ${commit}\n`);
}

main().catch((error) => {
  process.stderr.write(`smoke verification failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
