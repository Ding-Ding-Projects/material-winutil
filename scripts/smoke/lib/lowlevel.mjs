import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

function quoteWindows(value) {
  if (!/[\s"]/u.test(value)) return value;
  return `"${value.replace(/(\\*)"/gu, '$1$1\\"').replace(/(\\+)$/u, '$1$1')}"`;
}

export function commandLine(executable, args) {
  return [executable, ...args].map(quoteWindows).join(' ');
}

export async function locateLowlevelCheckout() {
  const candidates = [
    process.env.LOWLEVEL_CU_REPO,
    join(process.env.USERPROFILE ?? '', 'Documents', 'GitHub', 'lowlevel-computer-use-mcp'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { await access(join(candidate, 'pyproject.toml')); return candidate; } catch { /* keep looking */ }
  }
  throw new Error('cheap Lowlevel MCP checkout is unavailable; set LOWLEVEL_CU_REPO to its checkout path');
}

export async function lowlevel(tool, payload = {}, options = {}) {
  const cwd = options.cwd ?? await locateLowlevelCheckout();
  const args = ['run', 'lowlevel-computer-use-cheap', tool, '--json', JSON.stringify(payload)];
  const result = await new Promise((resolve, reject) => {
    const child = spawn('uv', args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const timeoutMs = options.timeoutMs ?? 120000;
    const outputLimit = options.outputLimit ?? 1024 * 1024;
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (fn, value) => { if (!settled) { settled = true; clearTimeout(timer); fn(value); } };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(reject, new Error(`cheap Lowlevel MCP ${tool} timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout = (stdout + chunk).slice(-outputLimit); });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-outputLimit); });
    child.once('error', (error) => finish(reject, error));
    child.once('close', (code) => finish(resolve, { code, stdout, stderr }));
  });
  if (result.code !== 0) throw new Error(`cheap Lowlevel MCP ${tool} exited ${result.code}: ${result.stderr.trim() || result.stdout.trim()}`);
  let parsed;
  const trimmed = result.stdout.trim();
  try { parsed = JSON.parse(trimmed); } catch { /* fall through to mixed-output extraction */ }
  if (!parsed) {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try { parsed = JSON.parse(trimmed.slice(first, last + 1)); } catch { /* report below */ }
    }
  }
  if (!parsed) throw new Error(`cheap Lowlevel MCP ${tool} returned no JSON object`);
  if (!parsed.ok) throw new Error(`cheap Lowlevel MCP ${tool} failed: ${parsed.error ?? 'unknown error'}`);
  return parsed;
}
