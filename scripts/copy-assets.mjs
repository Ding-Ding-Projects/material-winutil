import { cp, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

await mkdir(new URL('../dist/renderer', import.meta.url), { recursive: true });
await mkdir(new URL('../dist/config', import.meta.url), { recursive: true });
await Promise.all([
  cp(new URL('../src/renderer/index.html', import.meta.url), new URL('../dist/renderer/index.html', import.meta.url)),
  cp(new URL('../src/renderer/styles.css', import.meta.url), new URL('../dist/renderer/styles.css', import.meta.url)),
  cp(new URL('../config/winutil.json', import.meta.url), new URL('../dist/config/winutil.json', import.meta.url)),
]);

const root = new URL('../', import.meta.url);
const output = new URL('../dist/config/changelog.json', import.meta.url);
const forgeBaseUrl = 'https://github.com/Ding-Ding-Projects/material-winutil';
const runGit = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const tags = runGit(['tag', '--merged', 'HEAD', '--sort=-creatordate'])
  .split(/\r?\n/)
  .map((tag) => tag.trim())
  .filter((tag) => /^v[0-9A-Za-z][0-9A-Za-z._+-]*$/.test(tag));
const entries = tags.map((tag) => {
  const commitSha = runGit(['rev-list', '-n', '1', tag]).toLowerCase();
  const releaseDate = runGit(['log', '-1', '--format=%cs', tag]);
  const subject = runGit(['log', '-1', '--format=%s', tag]).replace(/[\r\n]+/g, ' ').trim();
  if (!/^[0-9a-f]{40}$/.test(commitSha) || !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate) || !subject) {
    throw new Error(`Release changelog source for ${tag} is incomplete.`);
  }
  return {
    schemaVersion: 1,
    version: tag,
    releaseDate,
    category: 'Release',
    facts: {
      English: subject,
      Yue: `版本 ${tag}：${subject}`,
    },
    commitSha,
    forgeBaseUrl,
  };
});
await writeFile(output, `${JSON.stringify(entries)}\n`, 'utf8');
