#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const textExtensions = new Set([
  '.bat', '.cjs', '.css', '.html', '.js', '.json', '.jsonl', '.jsx', '.md',
  '.mjs', '.ps1', '.scss', '.sh', '.toml', '.ts', '.tsx', '.txt', '.xml',
  '.yaml', '.yml',
]);
const excludedNames = new Set(['package-lock.json']);
const excludedPrefixes = ['design/', 'dist/', 'node_modules/', 'release/'];
const agentIdentity = /(?:Claude Fable 5|\bCodex\b|\bagent\b|\bautomation\b|\[bot\])/i;

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

function trackedFiles() {
  return git(['ls-files', '-z'])
    .split('\0')
    .filter(Boolean)
    .filter((file) => !excludedNames.has(file))
    .filter((file) => !excludedPrefixes.some((prefix) => file.startsWith(prefix)))
    .filter((file) => textExtensions.has(path.extname(file).toLowerCase()) || file === 'LICENSE');
}

function linesFor(file) {
  const value = readFileSync(path.join(root, file), 'utf8').replace(/\r\n?/g, '\n');
  if (value.length === 0) return [];
  const lines = value.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function categoryFor(file) {
  const extension = path.extname(file).toLowerCase();
  if (/(^|\/)(test|tests|__tests__)(\/|$)/i.test(file) || /\.(spec|test)\.[^.]+$/i.test(file)) return 'Tests';
  if (file.startsWith('docs/') || extension === '.md' || file === 'LICENSE') return 'Documentation';
  if (['.css', '.scss', '.html'].includes(extension)) return 'Styles / markup';
  if (file.startsWith('.github/') || ['.json', '.toml', '.yaml', '.yml'].includes(extension)) return 'Configuration';
  return 'Source and scripts';
}

const commitAgentCache = new Map();
function isAgentCommit(commit) {
  if (commitAgentCache.has(commit)) return commitAgentCache.get(commit);
  let metadata = '';
  try {
    metadata = git(['show', '-s', '--format=%an%n%ae%n%B', commit]);
  } catch {
    commitAgentCache.set(commit, false);
    return false;
  }
  const result = agentIdentity.test(metadata);
  commitAgentCache.set(commit, result);
  return result;
}

function blamedAgentLines(file, expectedLines) {
  if (expectedLines === 0) return 0;
  let porcelain;
  try {
    porcelain = git(['blame', '--line-porcelain', '--', file]);
  } catch {
    return 0;
  }
  const commits = [];
  for (const line of porcelain.split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{40}) \d+ \d+(?: \d+)?$/);
    if (match) commits.push(match[1]);
  }
  if (commits.length !== expectedLines) {
    throw new Error(`Attribution arithmetic mismatch for ${file}: ${commits.length} blamed lines versus ${expectedLines} counted lines.`);
  }
  return commits.reduce((total, commit) => total + (isAgentCommit(commit) ? 1 : 0), 0);
}

function summarize() {
  const categories = new Map();
  let grandTotal = 0;
  let grandNonBlank = 0;
  let agentLines = 0;
  const files = trackedFiles();

  for (const file of files) {
    const lines = linesFor(file);
    const nonBlank = lines.filter((line) => line.trim().length > 0).length;
    const category = categoryFor(file);
    const row = categories.get(category) ?? { files: 0, total: 0, nonBlank: 0 };
    row.files += 1;
    row.total += lines.length;
    row.nonBlank += nonBlank;
    categories.set(category, row);
    grandTotal += lines.length;
    grandNonBlank += nonBlank;
    agentLines += blamedAgentLines(file, lines.length);
  }

  if (agentLines > grandTotal) throw new Error('Agent attribution exceeds the counted line total.');
  return {
    revision: git(['rev-parse', 'HEAD']).trim(),
    categories: [...categories.entries()].map(([category, values]) => ({ category, ...values })),
    totals: {
      files: files.length,
      total: grandTotal,
      nonBlank: grandNonBlank,
      agent: agentLines,
      people: grandTotal - agentLines,
    },
    exclusions: ['package-lock.json', 'design/', 'dist/', 'node_modules/', 'release/', 'binary and non-text assets'],
    attributionRule: 'A surviving line is agent-authored when git blame points to a commit whose author, email, or commit message identifies Claude Fable 5, Codex, an agent, automation, or a bot account.',
  };
}

function markdown(result) {
  const rows = result.categories
    .map((row) => `| ${row.category} | ${row.files} | ${row.total} | ${row.nonBlank} |`)
    .join('\n');
  return [
    '| Category | Files | Total lines | Non-blank lines |',
    '|---|---:|---:|---:|',
    rows,
    `| **Project total** | **${result.totals.files}** | **${result.totals.total}** | **${result.totals.nonBlank}** |`,
    '',
    `Surviving-line attribution: **${result.totals.agent} agent-authored** and **${result.totals.people} people-authored** lines (grand total: **${result.totals.total}**).`,
    '',
    `Attribution rule: ${result.attributionRule}`,
    '',
    `Excluded: ${result.exclusions.join(', ')}. Generated files are not currently tracked outside excluded build output.`,
    '',
    'Reproduce with: `node scripts/count-lines.mjs`',
  ].join('\n');
}

const result = summarize();
if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`${markdown(result)}\n`);
}
