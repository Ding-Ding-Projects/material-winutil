import { createHash } from 'node:crypto';
import { access, readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
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
  const result = await new Promise((resolveResult, reject) => {
    const child = spawn('git', ['rev-parse', 'HEAD'], { cwd: repo, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolveResult({ code, stdout, stderr }));
  });
  if (result.code !== 0 || !/^[0-9a-f]{40}\s*$/u.test(result.stdout)) throw new Error(`cannot resolve Git commit: ${result.stderr.trim()}`);
  return result.stdout.trim();
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
