import { createHash } from 'node:crypto';
import { access, readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';

export async function sha256File(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function filesBelow(root) {
  const out = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) out.push(...await filesBelow(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

async function newest(files) {
  let result = { path: '', mtimeMs: 0 };
  for (const file of files) {
    const info = await stat(file);
    if (info.mtimeMs > result.mtimeMs) result = { path: file, mtimeMs: info.mtimeMs };
  }
  return result;
}

export async function assertBuiltArtifactFresh(repo) {
  const checks = [
    { sources: [join(repo, 'src', 'main')], outputs: [join(repo, 'dist', 'main', 'main.js'), join(repo, 'dist', 'main', 'preload.js')] },
    { sources: [join(repo, 'src', 'shared')], outputs: [join(repo, 'dist', 'shared', 'types.js')] },
    { sources: [join(repo, 'src', 'renderer', 'renderer.ts')], outputs: [join(repo, 'dist', 'renderer', 'renderer.js')] },
    { sources: [join(repo, 'src', 'renderer', 'index.html')], outputs: [join(repo, 'dist', 'renderer', 'index.html')] },
    { sources: [join(repo, 'src', 'renderer', 'styles.css')], outputs: [join(repo, 'dist', 'renderer', 'styles.css')] },
    { sources: [join(repo, 'config')], outputs: [join(repo, 'dist', 'config', 'winutil.json')] },
  ];
  const evidence = [];
  for (const check of checks) {
    const sources = [];
    for (const source of check.sources) {
      const info = await stat(source);
      sources.push(...(info.isDirectory() ? await filesBelow(source) : [source]));
    }
    const latestSource = await newest(sources);
    for (const output of check.outputs) {
      await access(output);
      const outputInfo = await stat(output);
      if (outputInfo.mtimeMs < latestSource.mtimeMs) {
        throw new Error(`built artifact is stale: ${relative(repo, output)} predates ${relative(repo, latestSource.path)}; run npm run build`);
      }
      evidence.push({ output: relative(repo, output), newestSource: relative(repo, latestSource.path) });
    }
  }
  return evidence;
}

export async function gitCommit(repo) {
  return gitText(repo, ['rev-parse', 'HEAD'], /^[0-9a-f]{40}\s*$/u, 'cannot resolve Git commit');
}

async function gitText(repo, args, expected, label) {
  const result = await new Promise((resolveResult, reject) => {
    const child = spawn('git', args, { cwd: repo, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolveResult({ code, stdout, stderr }));
  });
  if (result.code !== 0 || (expected && !expected.test(result.stdout))) throw new Error(`${label}: ${result.stderr.trim() || result.stdout.trim()}`);
  return result.stdout.trim();
}

export async function assertGitClean(repo) {
  const status = await gitText(repo, ['status', '--porcelain=v1', '--untracked-files=all'], null, 'cannot inspect Git status');
  const entries = status ? status.split(/\r?\n/u).filter(Boolean) : [];
  if (entries.length) {
    const paths = entries.slice(0, 12).join(', ');
    throw new Error(`capture requires a clean working tree; preserve or commit every change first: ${paths}`);
  }
  return { clean: true, commit: await gitCommit(repo) };
}

export async function gitChangedPaths(repo, fromCommit, toCommit = 'HEAD') {
  const output = await gitText(repo, ['diff', '--name-only', `${fromCommit}..${toCommit}`, '--'], null, 'cannot inspect capture-source changes');
  return output ? output.split(/\r?\n/u).filter(Boolean).map((path) => path.replaceAll('\\', '/')) : [];
}

export function selectCaptureManifests(manifests, ids) {
  if (!ids.length) return manifests;
  const wanted = new Set(ids);
  const available = new Set(manifests.flatMap(([, manifest]) => manifest.captures.map((capture) => capture.id)));
  const missing = [...wanted].filter((id) => !available.has(id));
  if (missing.length) throw new Error(`unknown capture id(s) for selected mode: ${missing.join(', ')}`);
  return manifests.map(([kind, manifest]) => [kind, {
    ...manifest,
    captures: manifest.captures.filter((capture) => wanted.has(capture.id)),
  }]);
}

async function findFiles(root, predicate) {
  const found = [];
  for (const file of await filesBelow(root)) if (predicate(file)) found.push(file);
  return found;
}

export async function findCurrentSquirrelPackage(repo, expectedCommit) {
  const releaseRoot = join(repo, 'release');
  const provenancePath = join(releaseRoot, 'release-provenance.json');
  const assetsPath = join(releaseRoot, 'release-assets.json');
  try { await access(provenancePath); await access(assetsPath); }
  catch { return null; }
  const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
  if (String(provenance.commit).toLowerCase() !== expectedCommit.toLowerCase()) {
    throw new Error(`Squirrel provenance commit ${provenance.commit ?? '(missing)'} does not match current commit ${expectedCommit}`);
  }
  if (!provenance.fullPackage || basename(provenance.fullPackage) !== provenance.fullPackage) throw new Error('Squirrel provenance has an invalid fullPackage name');
  const assets = JSON.parse(await readFile(assetsPath, 'utf8'));
  const asset = assets.find((item) => item.name === provenance.fullPackage);
  if (!asset || !/^[0-9a-f]{64}$/iu.test(asset.sha256 ?? '')) throw new Error('Squirrel asset manifest does not describe the full package');
  const matches = await findFiles(releaseRoot, (file) => basename(file) === provenance.fullPackage);
  if (matches.length !== 1) throw new Error(`expected exactly one current Squirrel full package; found ${matches.length}`);
  const actual = await sha256File(matches[0]);
  if (actual.toLowerCase() !== asset.sha256.toLowerCase()) throw new Error('Squirrel full package hash does not match release-assets.json');
  return {
    packagePath: matches[0],
    packageSha256: actual,
    provenancePath,
    assetsPath,
    provenance,
  };
}

export async function extractSquirrelApplication(repo, squirrel, destination) {
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archivePath = [IO.Path]::GetFullPath($env:MATERIAL_WINUTIL_SMOKE_ARCHIVE)
$destinationPath = [IO.Path]::GetFullPath($env:MATERIAL_WINUTIL_SMOKE_DESTINATION)
[IO.Directory]::CreateDirectory($destinationPath) | Out-Null
$zip = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  foreach ($entry in $zip.Entries) {
    if (-not $entry.FullName.StartsWith('lib/net45/')) { continue }
    $relative = $entry.FullName.Substring('lib/net45/'.Length).Replace('/', [IO.Path]::DirectorySeparatorChar)
    if ([string]::IsNullOrWhiteSpace($relative)) { continue }
    $target = [IO.Path]::GetFullPath((Join-Path $destinationPath $relative))
    if (-not $target.StartsWith($destinationPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe path in package.' }
    if ($entry.FullName.EndsWith('/')) { [IO.Directory]::CreateDirectory($target) | Out-Null; continue }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
    $input = $entry.Open()
    try {
      $output = [IO.File]::Create($target)
      try { $input.CopyTo($output) } finally { $output.Dispose() }
    } finally { $input.Dispose() }
  }
} finally { $zip.Dispose() }
`;
  const result = await new Promise((resolveResult, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      cwd: repo,
      env: {
        ...process.env,
        MATERIAL_WINUTIL_SMOKE_ARCHIVE: squirrel.packagePath,
        MATERIAL_WINUTIL_SMOKE_DESTINATION: destination,
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject); child.once('close', (code) => resolveResult({ code, stdout, stderr }));
  });
  if (result.code !== 0) throw new Error(`Squirrel application extraction failed: ${result.stderr.trim() || result.stdout.trim()}`);
}

export function parseArgs(argv) {
  const options = { mode: 'all', verifyOnly: false, allowPartial: false, ids: [], captureRoot: '', siteUrl: 'https://ding-ding-projects.github.io/material-winutil/' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--verify-only') options.verifyOnly = true;
    else if (arg === '--allow-partial') options.allowPartial = true;
    else if (arg === '--mode') options.mode = argv[++i];
    else if (arg === '--id') options.ids.push(argv[++i]);
    else if (arg === '--capture-root') options.captureRoot = resolve(argv[++i]);
    else if (arg === '--site-url') options.siteUrl = argv[++i];
    else throw new Error(`unknown smoke option: ${arg}`);
  }
  if (!['app', 'site', 'all'].includes(options.mode)) throw new Error(`invalid --mode: ${options.mode}`);
  return options;
}
