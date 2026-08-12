import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  OFFLINE_DOCS_LIMITS,
  assertOfflineDocsComplete,
  buildOfflineDocsBundle,
  compareOfflineDocsInventory,
  searchOfflineDocs,
  verifyOfflineDocsBundle,
} from '../../dist/shared/offline-docs.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const featuresRoot = path.join(repositoryRoot, 'docs', 'features');

async function actualFeatureSources() {
  const collect = async (directory, relative = '') => {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return collect(path.join(directory, entry.name), childRelative);
      return entry.isFile() && entry.name.endsWith('.md') ? [childRelative] : [];
    }));
    return nested.flat();
  };
  const paths = (await collect(featuresRoot))
    .map((name) => `docs/features/${name}`)
    .sort((left, right) => left.localeCompare(right));
  const sources = await Promise.all(paths.map(async (sourcePath) => ({
    path: sourcePath,
    content: await readFile(path.join(repositoryRoot, ...sourcePath.split('/'))),
  })));
  return { paths, sources };
}

const encode = (value) => new TextEncoder().encode(value);

function fixtureSources(overrides = {}) {
  const sources = [
    {
      path: 'docs/features/alpha.md',
      content: encode(`# Alpha guide

Welcome to **Alpha** and *Unicode 香港* with \`inline code\`.

## Steps

1. Open [Beta](beta.md#details).
2. Read [the public reference](https://example.test/reference).

\`\`\`ts
const answer = 42;
\`\`\`

## Suggested articles

- [Beta guide](beta.md)
`),
    },
    {
      path: 'docs/features/beta.md',
      content: encode(`# Beta guide

## Details

Body-only phrase: steam basket.
`),
    },
  ];
  return sources.map((source) => ({ ...source, ...overrides[source.path] }));
}

function fixtureBundle(sources = fixtureSources()) {
  return buildOfflineDocsBundle({
    schemaVersion: 1,
    sources,
    diskInventory: sources.map(({ path: sourcePath }) => sourcePath),
  });
}

test('bundles every actual docs/features Markdown article with immutable manifest metadata', async () => {
  const { paths, sources } = await actualFeatureSources();
  const bundle = buildOfflineDocsBundle({ schemaVersion: 1, sources, diskInventory: paths });
  verifyOfflineDocsBundle(bundle);

  assert.equal(bundle.schemaVersion, 1);
  assert.equal(bundle.articles.length, paths.length);
  assert.deepEqual(bundle.articles.map((article) => article.path), paths);
  assert.deepEqual(bundle.manifest.map((entry) => entry.path), paths);
  assert.equal(Object.isFrozen(bundle), true);
  assert.equal(Object.isFrozen(bundle.articles), true);

  for (const article of bundle.articles) {
    assert.ok(article.title.length > 0, article.path);
    assert.ok(article.category.length > 0, article.path);
    assert.match(article.hash, /^[a-f0-9]{64}$/u, article.path);
    assert.equal(article.ast[0].type, 'heading', article.path);
    assert.ok(article.suggestedArticles.length > 0 || article.path === 'docs/features/README.md', article.path);
    assert.equal(article.links.every((link) => link.autoOpen === false), true, article.path);
  }
});

test('builds a safe Markdown AST for headings, lists, code, links, and emphasis', () => {
  const bundle = fixtureBundle();
  const alpha = bundle.articles.find((article) => article.path.endsWith('/alpha.md'));
  assert.ok(alpha);
  assert.deepEqual([...new Set(alpha.ast.map(({ type }) => type))].sort(), ['code', 'heading', 'list', 'paragraph']);

  const paragraph = alpha.ast.find((node) => node.type === 'paragraph');
  assert.ok(paragraph);
  assert.deepEqual(paragraph.children.map(({ type }) => type), ['text', 'strong', 'text', 'emphasis', 'text', 'code', 'text']);

  const ordered = alpha.ast.find((node) => node.type === 'list' && node.ordered);
  assert.ok(ordered);
  assert.equal(ordered.start, 1);
  assert.equal(ordered.items.length, 2);
  assert.equal(alpha.ast.some((node) => node.type === 'html'), false);
});

test('resolves internal links only to bundled articles and extracts suggested articles', () => {
  const alpha = fixtureBundle().articles.find((article) => article.path.endsWith('/alpha.md'));
  assert.ok(alpha);
  const internal = alpha.links.filter((link) => link.kind === 'internal');
  assert.deepEqual(internal.map(({ articlePath, fragment }) => [articlePath, fragment]), [
    ['docs/features/beta.md', 'details'],
    ['docs/features/beta.md', null],
  ]);
  assert.deepEqual(alpha.suggestedArticles, [{ articlePath: 'docs/features/beta.md', title: 'Beta guide' }]);

  const broken = fixtureSources({
    'docs/features/alpha.md': { content: encode('# Alpha\n\n[Missing](missing.md)\n') },
  });
  assert.throws(() => fixtureBundle(broken), /unbundled Markdown article/);
});

test('describes external links without auto-opening and rejects unsafe URL schemes and path escapes', () => {
  const sources = fixtureSources({
    'docs/features/alpha.md': {
      content: encode(`# Alpha

[HTTPS](https://example.test/path) [mail](mailto:docs@example.test)
[script](javascript:alert(1)) [file](file:///C:/secret) [escape](../../outside.md)
`),
    },
  });
  const alpha = fixtureBundle(sources).articles.find((article) => article.path.endsWith('/alpha.md'));
  assert.ok(alpha);
  assert.deepEqual(alpha.links.map(({ kind }) => kind), ['external', 'external', 'unsafe', 'unsafe', 'unsafe']);
  assert.deepEqual(alpha.links.filter(({ kind }) => kind === 'external').map(({ autoOpen }) => autoOpen), [false, false]);
  assert.deepEqual(alpha.links.filter(({ kind }) => kind === 'unsafe').map(({ reason }) => reason), [
    'unsupported-scheme', 'unsupported-scheme', 'outside-docs-root',
  ]);
});

test('keeps raw HTML inert as text and grants it no AST privileges', () => {
  const sources = fixtureSources({
    'docs/features/alpha.md': {
      content: encode(`# Alpha

<script>globalThis.compromised = true</script>

<img src=x onerror=alert(1)> **still parsed safely**
`),
    },
  });
  const alpha = fixtureBundle(sources).articles.find((article) => article.path.endsWith('/alpha.md'));
  assert.ok(alpha);
  assert.match(alpha.bodyText, /<script>globalThis\.compromised/);
  assert.equal(JSON.stringify(alpha.ast).includes('"type":"html"'), false);
  assert.equal(alpha.links.length, 0);
});

test('plain title and body searches are independently scoped and Unicode-aware', () => {
  const bundle = fixtureBundle();
  assert.deepEqual(searchOfflineDocs(bundle, {
    mode: 'plain', query: 'ALPHA GUIDE', fields: ['title'],
  }).map(({ article }) => article.title), ['Alpha guide']);
  assert.deepEqual(searchOfflineDocs(bundle, {
    mode: 'plain', query: '香港', fields: ['body'],
  }).map(({ article }) => article.title), ['Alpha guide']);
  assert.deepEqual(searchOfflineDocs(bundle, {
    mode: 'plain', query: 'steam basket', fields: ['title'],
  }), []);
  assert.deepEqual(searchOfflineDocs(bundle, {
    mode: 'plain', query: 'steam basket', fields: ['body'],
  }).map(({ matchedFields }) => matchedFields), [['body']]);
});

test('regex descriptors keep title/body scopes independent and validate flags and unsafe patterns', () => {
  const bundle = fixtureBundle();
  const result = searchOfflineDocs(bundle, {
    mode: 'regex', pattern: '^Beta guide$', flags: 'iu', fields: ['title'],
  });
  assert.deepEqual(result.map(({ article, matchedFields }) => [article.title, matchedFields]), [['Beta guide', ['title']]]);
  assert.deepEqual(searchOfflineDocs(bundle, {
    mode: 'regex', pattern: 'steam\\s+basket', flags: 'iu', fields: ['body'],
  }).map(({ article }) => article.title), ['Beta guide']);
  assert.throws(() => searchOfflineDocs(bundle, {
    mode: 'regex', pattern: 'alpha', flags: 'g', fields: ['title'],
  }), /Unsupported.*flag/);
  assert.throws(() => searchOfflineDocs(bundle, {
    mode: 'regex', pattern: '(a+)+$', flags: 'u', fields: ['body'],
  }), /Potentially unsafe/);
});

test('completeness comparison fails missing, extra, and duplicate paths', () => {
  const bundle = ['docs/features/alpha.md', 'docs/features/beta.md'];
  const disk = ['docs/features/alpha.md', 'docs/features/gamma.md'];
  assert.deepEqual(compareOfflineDocsInventory(bundle, disk), {
    complete: false,
    missing: ['docs/features/gamma.md'],
    extra: ['docs/features/beta.md'],
    duplicateBundlePaths: [],
    duplicateDiskPaths: [],
  });
  assert.throws(() => assertOfflineDocsComplete(bundle, disk), /missing.*gamma.*extra.*beta/);
  assert.throws(() => assertOfflineDocsComplete(
    ['docs/features/alpha.md', 'docs/features/ALPHA.md'],
    ['docs/features/alpha.md'],
  ), /duplicate bundle paths/);
});

test('the actual inventory check deliberately fails when one disk article is omitted', async () => {
  const { paths, sources } = await actualFeatureSources();
  assert.ok(paths.length > 1);
  assert.throws(() => buildOfflineDocsBundle({
    schemaVersion: 1,
    sources: sources.slice(1),
    diskInventory: paths,
  }), /completeness check failed.*missing/);
});

test('rejects unsupported versions, invalid UTF-8, and article byte-limit overflow', () => {
  assert.throws(() => buildOfflineDocsBundle({
    schemaVersion: 2,
    sources: fixtureSources(),
    diskInventory: fixtureSources().map(({ path: sourcePath }) => sourcePath),
  }), /schemaVersion/);
  assert.throws(() => fixtureBundle([{
    path: 'docs/features/invalid.md',
    content: Uint8Array.from([0xc3, 0x28]),
  }]), /valid UTF-8/);
  assert.throws(() => fixtureBundle([{
    path: 'docs/features/large.md',
    content: new Uint8Array(OFFLINE_DOCS_LIMITS.maxArticleBytes + 1),
  }]), /byte limit/);
});

test('hash verification detects article and manifest tampering', () => {
  const bundle = fixtureBundle();
  const tamperedArticle = {
    ...bundle.articles[0],
    bodyText: `${bundle.articles[0].bodyText}\nTampered`,
  };
  assert.throws(() => verifyOfflineDocsBundle({
    ...bundle,
    articles: [tamperedArticle, ...bundle.articles.slice(1)],
  }), /hash mismatch/);

  const tamperedManifest = {
    ...bundle.manifest[0],
    title: 'Counterfeit title',
  };
  assert.throws(() => verifyOfflineDocsBundle({
    ...bundle,
    manifest: [tamperedManifest, ...bundle.manifest.slice(1)],
  }), /manifest mismatch/);
});
