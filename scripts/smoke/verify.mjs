import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitChangedPaths, gitCommit, sha256File } from './lib/contracts.mjs';
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
  if (metadata.commit !== commit) {
    const changed = await gitChangedPaths(repo, metadata.commit, commit);
    const invalid = changed.filter((path) => path !== 'README.md' && !path.startsWith('docs/screenshots/smoke/') && !path.startsWith('docs/site/'));
    if (invalid.length) throw new Error(`capture source ${metadata.commit} is stale after product changes: ${invalid.join(', ')}`);
  }
  if (/^[A-Za-z]:[\\/]|^\\\\/u.test(metadata.captureRoot ?? '')) throw new Error('capture metadata exposes an absolute capture root');
  if (metadata.safety?.systemChangingActions !== 0 || metadata.safety?.packageCommands !== 0 || metadata.safety?.visibleDesktopInteractions !== 0) {
    throw new Error('capture metadata does not prove a non-mutating hidden-desktop run');
  }
  const verified = [];
  for (const capture of metadata.captures) {
    if (/^[A-Za-z]:[\\/]|^\\\\/u.test(capture.file ?? '') || /^[A-Za-z]:[\\/]|^\\\\/u.test(capture.executable ?? '')) throw new Error(`${capture.id} exposes an absolute local path`);
    if (capture.artifact?.developmentFallback || capture.artifact?.kind !== 'validated-squirrel-full-package') throw new Error(`${capture.id} was not captured from a validated Squirrel package`);
    if (capture.artifact?.sourceCommit !== metadata.commit) throw new Error(`${capture.id} package provenance does not match the photographed commit`);
    if (capture.artifact?.signatureStatus !== 'NotSigned') throw new Error(`${capture.id} does not prove the unsigned installer policy`);
    if (capture.artifact?.setup !== 'MaterialSystemUtility-Setup.exe' || capture.artifact?.releases !== 'RELEASES' || capture.artifact?.packageCount !== 1) throw new Error(`${capture.id} does not describe the exact Squirrel asset set`);
    if (capture.artifact?.fullPackage !== capture.artifact?.packagePath) throw new Error(`${capture.id} full package identity is inconsistent`);
    const file = join(repo, 'docs', 'screenshots', capture.relativeFile);
    const png = await inspectPng(file);
    if (png.sha256 !== capture.png.sha256 || png.width !== capture.png.width || png.height !== capture.png.height) throw new Error(`${capture.id} does not match its metadata`);
    if (!/^[0-9a-f]{64}$/iu.test(capture.executableSha256 ?? '') || !/^[0-9a-f]{64}$/iu.test(capture.artifact?.packageSha256 ?? '')) throw new Error(`${capture.id} lacks artifact hashes`);
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
