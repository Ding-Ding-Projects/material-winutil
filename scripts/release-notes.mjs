#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write('Usage: node scripts/release-notes.mjs [output.md]\nRequired environment: WORKFLOW_STARTED_AT, WORKFLOW_COMPLETED_AT, RELEASE_TAG, RELEASE_COMMIT, GITHUB_RUN_ID, WORKFLOW_RUN_URL, RUNNER_NAME, RUNNER_OS, RUNNER_ARCH, RUNNER_IMAGE, INSTALLER_SIGNATURE_STATUS, RELEASE_ASSET_MANIFEST.\n');
  process.exit(0);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseUtc(name) {
  const value = required(name);
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error(`${name} is not a valid timestamp: ${value}`);
  return date;
}

function duration(start, end) {
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function safe(value) {
  return value?.trim() || 'Unavailable';
}

function lineCountMarkdown() {
  return execFileSync(process.execPath, [path.join(root, 'scripts', 'count-lines.mjs')], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}

function assetRows() {
  const file = required('RELEASE_ASSET_MANIFEST');
  const assets = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(assets) || assets.length === 0) throw new Error('Release asset manifest is empty.');
  return assets.map((asset) => {
    for (const field of ['name', 'size', 'sha256']) {
      if (asset[field] === undefined || asset[field] === '') throw new Error(`Release asset is missing ${field}.`);
    }
    return `| \`${asset.name}\` | ${asset.size} | \`${asset.sha256}\` |`;
  }).join('\n');
}

const started = parseUtc('WORKFLOW_STARTED_AT');
const completed = parseUtc('WORKFLOW_COMPLETED_AT');
if (completed < started) throw new Error('Workflow completion precedes its start.');

const dishId = process.env.DIM_SUM_ID?.trim();
const dimSum = dishId ? [
  `- Dim sum code name: **${required('DIM_SUM_CODE_NAME')}**`,
  `- Dim sum catalog ID: \`${dishId}\``,
  `- Public catalog volume: \`${required('DIM_SUM_CATALOG_TAG')}\``,
  `- Public photo: [${safe(process.env.DIM_SUM_ALT_EN)}](${required('DIM_SUM_IMAGE_URL')})`,
].join('\n') : '- Dim sum code name: unavailable because no unused published catalog asset could be resolved; release publication was not delayed.';

const notes = `# Material System Utility ${required('RELEASE_TAG')}

This release contains a real, unsigned Squirrel.Windows installer for Windows x64. Windows may show an unknown-publisher or SmartScreen warning because code signing is intentionally disabled.

呢個版本係真材實料嘅 Windows x64 Squirrel.Windows 安裝程式；檔案刻意無簽署，所以 Windows 可能會彈 unknown-publisher 或 SmartScreen 提示，唔係個安裝程式突然戴咗口罩。

## Release evidence

| Evidence | Value |
|---|---|
| Commit | \`${required('RELEASE_COMMIT')}\` |
| Workflow run | [${required('GITHUB_RUN_ID')}](${required('WORKFLOW_RUN_URL')}) |
| Workflow started | \`${started.toISOString()}\` |
| Workflow completed | \`${completed.toISOString()}\` |
| Workflow duration | \`${duration(started, completed)}\` |
| Runner | \`${required('RUNNER_NAME')}\` / \`${required('RUNNER_OS')}\` / \`${required('RUNNER_ARCH')}\` / \`${required('RUNNER_IMAGE')}\` |
| Signing status | \`${required('INSTALLER_SIGNATURE_STATUS')}\` (unsigned, required) |
| Canonical build commands | \`build.bat /s\`, then \`build-installer.bat /s\` |

## Release assets

| Asset | Bytes | SHA-256 |
|---|---:|---|
${assetRows()}

## Checks actually run

- The cloud one-click application build ran its locked dependency install, production TypeScript compilation, and asset copy. The local-only baseline and behavioral checks were intentionally skipped in GitHub Actions.
- The cloud one-click installer build repeated the locked bootstrap, compiled and packaged Squirrel.Windows output, validated the exact Setup.exe, RELEASES, and .nupkg set, checked index hashes and package version, and rejected any signed Setup executable.
- GitHub Actions contains no test, lint, type-check, static-analysis, accessibility, or screenshot job. These checks therefore do not gate publication. A release can ship from a commit whose unrun checks would have failed; that is the repository's accepted delivery trade-off.

## Dim sum code name

${dimSum}

The dish image remains in the public [Ding-Ding-Projects/dim-sum-photos](https://github.com/Ding-Ding-Projects/dim-sum-photos) catalog and is linked above. It is not copied into this repository or attached to this release.

## Line count at this commit

${lineCountMarkdown()}
`;

const output = process.argv[2];
if (output) writeFileSync(path.resolve(output), notes, 'utf8');
else process.stdout.write(notes);
