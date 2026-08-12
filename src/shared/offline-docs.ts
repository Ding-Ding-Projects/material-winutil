import { createHash } from 'node:crypto';
import path from 'node:path';
import { TextDecoder } from 'node:util';

export const OFFLINE_DOCS_SCHEMA_VERSION = 1 as const;

export const OFFLINE_DOCS_LIMITS = Object.freeze({
  maxArticles: 256,
  maxArticleBytes: 256 * 1024,
  maxBundleBytes: 4 * 1024 * 1024,
  maxPathCodeUnits: 512,
  maxTitleCodeUnits: 256,
  maxCategoryCodeUnits: 128,
  maxBlocksPerArticle: 4_096,
  maxInlineNodesPerBlock: 2_048,
  maxLinksPerArticle: 1_024,
  maxSuggestedArticles: 64,
  maxSearchCodeUnits: 512,
  maxSearchBodyCodeUnits: 256 * 1024,
});

export interface OfflineDocSource {
  readonly path: string;
  readonly content: Uint8Array;
  readonly category?: string;
}

export type OfflineDocInlineNode =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'code'; readonly value: string }
  | { readonly type: 'emphasis'; readonly children: readonly OfflineDocInlineNode[] }
  | { readonly type: 'strong'; readonly children: readonly OfflineDocInlineNode[] }
  | { readonly type: 'link'; readonly link: number; readonly children: readonly OfflineDocInlineNode[] };

export type OfflineDocBlockNode =
  | { readonly type: 'heading'; readonly level: number; readonly children: readonly OfflineDocInlineNode[] }
  | { readonly type: 'paragraph'; readonly children: readonly OfflineDocInlineNode[] }
  | {
    readonly type: 'list';
    readonly ordered: boolean;
    readonly start: number | null;
    readonly items: readonly (readonly OfflineDocInlineNode[])[];
  }
  | { readonly type: 'code'; readonly language: string | null; readonly value: string };

export type OfflineDocLink =
  | {
    readonly kind: 'internal';
    readonly href: string;
    readonly articlePath: string;
    readonly fragment: string | null;
    readonly autoOpen: false;
  }
  | {
    readonly kind: 'external';
    readonly href: string;
    readonly protocol: 'https:' | 'http:' | 'mailto:';
    readonly autoOpen: false;
  }
  | {
    readonly kind: 'local-resource';
    readonly href: string;
    readonly resourcePath: string;
    readonly fragment: string | null;
    readonly autoOpen: false;
  }
  | {
    readonly kind: 'unsafe';
    readonly href: string;
    readonly reason: 'unsupported-scheme' | 'absolute-local-path' | 'outside-docs-root' | 'invalid-target';
    readonly autoOpen: false;
  };

export interface OfflineDocSuggestedArticle {
  readonly articlePath: string;
  readonly title: string;
}

export interface OfflineDocArticle {
  readonly schemaVersion: typeof OFFLINE_DOCS_SCHEMA_VERSION;
  readonly path: string;
  readonly title: string;
  readonly category: string;
  readonly hash: string;
  readonly bodyText: string;
  readonly ast: readonly OfflineDocBlockNode[];
  readonly links: readonly OfflineDocLink[];
  readonly suggestedArticles: readonly OfflineDocSuggestedArticle[];
}

export interface OfflineDocManifestEntry {
  readonly path: string;
  readonly title: string;
  readonly category: string;
  readonly hash: string;
  readonly links: readonly OfflineDocLink[];
  readonly suggestedArticles: readonly OfflineDocSuggestedArticle[];
}

export interface OfflineDocsBundle {
  readonly schemaVersion: typeof OFFLINE_DOCS_SCHEMA_VERSION;
  readonly articles: readonly OfflineDocArticle[];
  readonly manifest: readonly OfflineDocManifestEntry[];
}

export interface OfflineDocsCompleteness {
  readonly complete: boolean;
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  readonly duplicateBundlePaths: readonly string[];
  readonly duplicateDiskPaths: readonly string[];
}

export type OfflineDocsSearchDescriptor =
  | {
    readonly mode: 'plain';
    readonly query: string;
    readonly fields: readonly ('title' | 'body')[];
    readonly caseSensitive?: boolean;
  }
  | {
    readonly mode: 'regex';
    readonly pattern: string;
    readonly flags: string;
    readonly fields: readonly ('title' | 'body')[];
  };

export interface OfflineDocsSearchResult {
  readonly article: OfflineDocArticle;
  readonly matchedFields: readonly ('title' | 'body')[];
}

interface RawLink {
  readonly href: string;
  readonly blockIndex: number;
}

interface ParsedArticle {
  readonly path: string;
  readonly title: string;
  readonly category: string;
  readonly bodyText: string;
  readonly ast: readonly OfflineDocBlockNode[];
  readonly rawLinks: readonly RawLink[];
  readonly suggestedLinkIndexes: readonly number[];
}

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const SAFE_REGEX_FLAGS = new Set(['i', 'm', 's', 'u']);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function assertBoundedString(name: string, value: unknown, maximum: number, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string.`);
  if (!allowEmpty && value.trim().length === 0) throw new RangeError(`${name} cannot be empty.`);
  if (value.length > maximum) throw new RangeError(`${name} exceeds the ${maximum} code-unit limit.`);
  if (value.includes('\0')) throw new TypeError(`${name} cannot contain NUL characters.`);
}

function normalizeArticlePath(value: string): string {
  assertBoundedString('article path', value, OFFLINE_DOCS_LIMITS.maxPathCodeUnits);
  const slashPath = value.replace(/\\/gu, '/');
  if (/^[A-Za-z]:\//u.test(slashPath) || slashPath.startsWith('/')) {
    throw new TypeError(`Article paths must be repository-relative: ${value}`);
  }
  const normalized = path.posix.normalize(slashPath);
  if (normalized === '..' || normalized.startsWith('../') || !normalized.startsWith('docs/features/')) {
    throw new TypeError(`Article path is outside docs/features: ${value}`);
  }
  if (!normalized.endsWith('.md')) throw new TypeError(`Offline documentation articles must be Markdown files: ${value}`);
  return normalized;
}

function pathKey(value: string): string {
  return normalizeArticlePath(value).toLocaleLowerCase('en-US');
}

function duplicatePaths(paths: readonly string[]): readonly string[] {
  const counts = new Map<string, { path: string; count: number }>();
  for (const candidate of paths) {
    const normalized = normalizeArticlePath(candidate);
    const key = normalized.toLocaleLowerCase('en-US');
    const existing = counts.get(key);
    counts.set(key, { path: existing?.path ?? normalized, count: (existing?.count ?? 0) + 1 });
  }
  return Object.freeze([...counts.values()].filter(({ count }) => count > 1).map(({ path: duplicate }) => duplicate).sort());
}

export function compareOfflineDocsInventory(
  bundlePaths: readonly string[],
  diskInventory: readonly string[],
): OfflineDocsCompleteness {
  if (bundlePaths.length > OFFLINE_DOCS_LIMITS.maxArticles || diskInventory.length > OFFLINE_DOCS_LIMITS.maxArticles) {
    throw new RangeError(`Offline documentation inventory exceeds the ${OFFLINE_DOCS_LIMITS.maxArticles}-article limit.`);
  }
  const duplicateBundlePaths = duplicatePaths(bundlePaths);
  const duplicateDiskPaths = duplicatePaths(diskInventory);
  const bundle = new Map(bundlePaths.map((item) => [pathKey(item), normalizeArticlePath(item)]));
  const disk = new Map(diskInventory.map((item) => [pathKey(item), normalizeArticlePath(item)]));
  const missing = [...disk].filter(([key]) => !bundle.has(key)).map(([, item]) => item).sort();
  const extra = [...bundle].filter(([key]) => !disk.has(key)).map(([, item]) => item).sort();
  return deepFreeze({
    complete: missing.length === 0 && extra.length === 0
      && duplicateBundlePaths.length === 0 && duplicateDiskPaths.length === 0,
    missing,
    extra,
    duplicateBundlePaths,
    duplicateDiskPaths,
  });
}

export function assertOfflineDocsComplete(bundlePaths: readonly string[], diskInventory: readonly string[]): void {
  const result = compareOfflineDocsInventory(bundlePaths, diskInventory);
  if (result.complete) return;
  const parts = [
    result.missing.length ? `missing: ${result.missing.join(', ')}` : '',
    result.extra.length ? `extra: ${result.extra.join(', ')}` : '',
    result.duplicateBundlePaths.length ? `duplicate bundle paths: ${result.duplicateBundlePaths.join(', ')}` : '',
    result.duplicateDiskPaths.length ? `duplicate disk paths: ${result.duplicateDiskPaths.join(', ')}` : '',
  ].filter(Boolean);
  throw new Error(`Offline documentation completeness check failed (${parts.join('; ')}).`);
}

function decodeSource(source: OfflineDocSource): string {
  if (!(source.content instanceof Uint8Array)) throw new TypeError(`Article ${source.path} content must be UTF-8 bytes.`);
  if (source.content.byteLength === 0) throw new RangeError(`Article ${source.path} cannot be empty.`);
  if (source.content.byteLength > OFFLINE_DOCS_LIMITS.maxArticleBytes) {
    throw new RangeError(`Article ${source.path} exceeds the ${OFFLINE_DOCS_LIMITS.maxArticleBytes}-byte limit.`);
  }
  try {
    return UTF8_DECODER.decode(source.content);
  } catch {
    throw new TypeError(`Article ${source.path} is not valid UTF-8.`);
  }
}

function mergeText(nodes: OfflineDocInlineNode[]): readonly OfflineDocInlineNode[] {
  const merged: OfflineDocInlineNode[] = [];
  for (const node of nodes) {
    const previous = merged.at(-1);
    if (node.type === 'text' && previous?.type === 'text') {
      merged[merged.length - 1] = { type: 'text', value: previous.value + node.value };
    } else {
      merged.push(node);
    }
  }
  if (merged.length > OFFLINE_DOCS_LIMITS.maxInlineNodesPerBlock) {
    throw new RangeError(`Markdown block exceeds the ${OFFLINE_DOCS_LIMITS.maxInlineNodesPerBlock}-inline-node limit.`);
  }
  return Object.freeze(merged.map((node) => deepFreeze(node)));
}

function findClosing(source: string, marker: string, start: number): number {
  let cursor = start;
  while (cursor < source.length) {
    const found = source.indexOf(marker, cursor);
    if (found < 0) return -1;
    let escapes = 0;
    for (let index = found - 1; index >= 0 && source[index] === '\\'; index -= 1) escapes += 1;
    if (escapes % 2 === 0) return found;
    cursor = found + marker.length;
  }
  return -1;
}

function parseInline(source: string, rawLinks: RawLink[], blockIndex: number): readonly OfflineDocInlineNode[] {
  const nodes: OfflineDocInlineNode[] = [];
  let plain = '';
  const flush = (): void => {
    if (plain) nodes.push({ type: 'text', value: plain });
    plain = '';
  };
  for (let cursor = 0; cursor < source.length;) {
    if (source[cursor] === '\\' && cursor + 1 < source.length) {
      plain += source[cursor + 1];
      cursor += 2;
      continue;
    }
    if (source[cursor] === '`') {
      const end = findClosing(source, '`', cursor + 1);
      if (end > cursor + 1) {
        flush();
        nodes.push({ type: 'code', value: source.slice(cursor + 1, end) });
        cursor = end + 1;
        continue;
      }
    }
    if (source[cursor] === '[' && source[cursor - 1] !== '!') {
      const labelEnd = findClosing(source, ']', cursor + 1);
      if (labelEnd > cursor && source[labelEnd + 1] === '(') {
        const targetEnd = findClosing(source, ')', labelEnd + 2);
        if (targetEnd > labelEnd + 2) {
          const href = source.slice(labelEnd + 2, targetEnd).trim().replace(/^<|>$/gu, '');
          if (href.length <= OFFLINE_DOCS_LIMITS.maxPathCodeUnits * 4) {
            flush();
            const link = rawLinks.length;
            rawLinks.push({ href, blockIndex });
            nodes.push({ type: 'link', link, children: parseInline(source.slice(cursor + 1, labelEnd), rawLinks, blockIndex) });
            cursor = targetEnd + 1;
            continue;
          }
        }
      }
    }
    const strongMarker = source.startsWith('**', cursor) ? '**' : source.startsWith('__', cursor) ? '__' : null;
    if (strongMarker) {
      const end = findClosing(source, strongMarker, cursor + 2);
      if (end > cursor + 2) {
        flush();
        nodes.push({ type: 'strong', children: parseInline(source.slice(cursor + 2, end), rawLinks, blockIndex) });
        cursor = end + 2;
        continue;
      }
    }
    const emphasisMarker = source[cursor] === '*' || source[cursor] === '_' ? source[cursor] : null;
    if (emphasisMarker) {
      const end = findClosing(source, emphasisMarker, cursor + 1);
      if (end > cursor + 1) {
        flush();
        nodes.push({ type: 'emphasis', children: parseInline(source.slice(cursor + 1, end), rawLinks, blockIndex) });
        cursor = end + 1;
        continue;
      }
    }
    plain += source[cursor];
    cursor += 1;
  }
  flush();
  return mergeText(nodes);
}

function inlineText(nodes: readonly OfflineDocInlineNode[]): string {
  return nodes.map((node) => node.type === 'text' || node.type === 'code' ? node.value : inlineText(node.children)).join('');
}

function parseMarkdown(articlePath: string, category: string, markdown: string): ParsedArticle {
  const lines = markdown.replace(/\r\n?/gu, '\n').split('\n');
  const blocks: OfflineDocBlockNode[] = [];
  const rawLinks: RawLink[] = [];
  let cursor = 0;
  while (cursor < lines.length) {
    if (lines[cursor].trim().length === 0) { cursor += 1; continue; }
    const fence = /^(\s*)(`{3,}|~{3,})([^`]*)$/u.exec(lines[cursor]);
    if (fence) {
      const marker = fence[2][0];
      const minimum = fence[2].length;
      const language = fence[3].trim().split(/\s+/u)[0] || null;
      const code: string[] = [];
      cursor += 1;
      while (cursor < lines.length && !new RegExp(`^\\s*${marker}{${minimum},}\\s*$`, 'u').test(lines[cursor])) {
        code.push(lines[cursor]);
        cursor += 1;
      }
      if (cursor >= lines.length) throw new TypeError(`Article ${articlePath} contains an unclosed fenced code block.`);
      blocks.push({ type: 'code', language, value: code.join('\n') });
      cursor += 1;
      continue;
    }
    const heading = /^(#{1,6})\s+(.+?)\s*#*$/u.exec(lines[cursor]);
    if (heading) {
      const blockIndex = blocks.length;
      blocks.push({ type: 'heading', level: heading[1].length, children: parseInline(heading[2], rawLinks, blockIndex) });
      cursor += 1;
      continue;
    }
    const listMatch = /^\s*(?:(\d+)[.)]|[-+*])\s+(.+)$/u.exec(lines[cursor]);
    if (listMatch) {
      const ordered = listMatch[1] !== undefined;
      const start = ordered ? Number.parseInt(listMatch[1], 10) : null;
      const items: (readonly OfflineDocInlineNode[])[] = [];
      while (cursor < lines.length) {
        const item = /^\s*(?:(\d+)[.)]|[-+*])\s+(.+)$/u.exec(lines[cursor]);
        if (!item || (item[1] !== undefined) !== ordered) break;
        items.push(parseInline(item[2], rawLinks, blocks.length));
        cursor += 1;
      }
      blocks.push({ type: 'list', ordered, start, items: Object.freeze(items) });
      continue;
    }
    const paragraph: string[] = [];
    while (cursor < lines.length && lines[cursor].trim().length > 0
      && !/^(#{1,6})\s+/u.test(lines[cursor])
      && !/^\s*(?:\d+[.)]|[-+*])\s+/u.test(lines[cursor])
      && !/^\s*(`{3,}|~{3,})/u.test(lines[cursor])) {
      paragraph.push(lines[cursor].trim());
      cursor += 1;
    }
    const blockIndex = blocks.length;
    blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n'), rawLinks, blockIndex) });
  }
  if (blocks.length > OFFLINE_DOCS_LIMITS.maxBlocksPerArticle) {
    throw new RangeError(`Article ${articlePath} exceeds the ${OFFLINE_DOCS_LIMITS.maxBlocksPerArticle}-block limit.`);
  }
  if (rawLinks.length > OFFLINE_DOCS_LIMITS.maxLinksPerArticle) {
    throw new RangeError(`Article ${articlePath} exceeds the ${OFFLINE_DOCS_LIMITS.maxLinksPerArticle}-link limit.`);
  }
  const firstHeading = blocks.find(
    (block): block is Extract<OfflineDocBlockNode, { type: 'heading' }> => block.type === 'heading' && block.level === 1,
  );
  if (!firstHeading) throw new TypeError(`Article ${articlePath} requires a level-one title.`);
  const title = inlineText(firstHeading.children).trim();
  assertBoundedString(`Article ${articlePath} title`, title, OFFLINE_DOCS_LIMITS.maxTitleCodeUnits);
  const bodyText = blocks.map((block) => {
    if (block.type === 'code') return block.value;
    if (block.type === 'list') return block.items.map(inlineText).join('\n');
    return inlineText(block.children);
  }).join('\n');
  if (bodyText.length > OFFLINE_DOCS_LIMITS.maxSearchBodyCodeUnits) {
    throw new RangeError(`Article ${articlePath} searchable body exceeds its bounded limit.`);
  }
  let suggestedHeading = -1;
  let suggestedLevel = 0;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.type === 'heading' && inlineText(block.children).trim().toLocaleLowerCase('en-US') === 'suggested articles') {
      suggestedHeading = index;
      suggestedLevel = block.level;
      break;
    }
  }
  const suggestedLinkIndexes: number[] = [];
  if (suggestedHeading >= 0) {
    let end = blocks.length;
    for (let index = suggestedHeading + 1; index < blocks.length; index += 1) {
      const block = blocks[index];
      if (block.type === 'heading' && block.level <= suggestedLevel) { end = index; break; }
    }
    rawLinks.forEach((link, index) => {
      if (link.blockIndex > suggestedHeading && link.blockIndex < end) suggestedLinkIndexes.push(index);
    });
  }
  return deepFreeze({ path: articlePath, title, category, bodyText, ast: blocks, rawLinks, suggestedLinkIndexes });
}

function categoryFor(articlePath: string, supplied?: string): string {
  if (supplied !== undefined) {
    assertBoundedString(`Category for ${articlePath}`, supplied, OFFLINE_DOCS_LIMITS.maxCategoryCodeUnits);
    return supplied.trim();
  }
  const relative = articlePath.slice('docs/features/'.length);
  const firstDirectory = relative.includes('/') ? relative.split('/')[0] : 'Features';
  return firstDirectory.replace(/[-_]+/gu, ' ').replace(/\b\p{L}/gu, (character) => character.toLocaleUpperCase('en-US'));
}

function splitHref(href: string): { pathname: string; fragment: string | null } {
  const hash = href.indexOf('#');
  return hash < 0 ? { pathname: href, fragment: null } : {
    pathname: href.slice(0, hash),
    fragment: href.slice(hash + 1) || null,
  };
}

function unsafeLink(href: string, reason: Extract<OfflineDocLink, { kind: 'unsafe' }>['reason']): OfflineDocLink {
  return deepFreeze({ kind: 'unsafe' as const, href, reason, autoOpen: false as const });
}

function resolveLink(articlePath: string, href: string, knownArticles: ReadonlyMap<string, string>): OfflineDocLink {
  const trimmed = href.trim();
  if (trimmed.length === 0) return unsafeLink(href, 'invalid-target');
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/u.exec(trimmed)?.[1]?.toLocaleLowerCase('en-US');
  if (scheme) {
    if (scheme !== 'https' && scheme !== 'http' && scheme !== 'mailto') {
      return unsafeLink(href, 'unsupported-scheme');
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== `${scheme}:`) throw new TypeError('Protocol mismatch.');
      return deepFreeze({ kind: 'external', href: parsed.href, protocol: parsed.protocol as 'https:' | 'http:' | 'mailto:', autoOpen: false });
    } catch {
      return unsafeLink(href, 'invalid-target');
    }
  }
  if (/^[A-Za-z]:[\\/]/u.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('\\')) {
    return unsafeLink(href, 'absolute-local-path');
  }
  const { pathname, fragment } = splitHref(trimmed.replace(/\\/gu, '/'));
  let decodedPath: string;
  try { decodedPath = decodeURIComponent(pathname); } catch {
    return unsafeLink(href, 'invalid-target');
  }
  const target = pathname.length === 0 ? articlePath : path.posix.normalize(path.posix.join(path.posix.dirname(articlePath), decodedPath));
  if (target === '..' || target.startsWith('../') || !target.startsWith('docs/')) {
    return unsafeLink(href, 'outside-docs-root');
  }
  if (target.endsWith('.md')) {
    const resolved = knownArticles.get(target.toLocaleLowerCase('en-US'));
    if (!resolved) throw new Error(`Article ${articlePath} links to an unbundled Markdown article: ${href}`);
    return deepFreeze({ kind: 'internal', href, articlePath: resolved, fragment, autoOpen: false });
  }
  return deepFreeze({ kind: 'local-resource', href, resourcePath: target, fragment, autoOpen: false });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const fields = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`);
    return `{${fields.join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashArticle(article: Omit<OfflineDocArticle, 'hash'>): string {
  return createHash('sha256').update(stableJson(article), 'utf8').digest('hex');
}

export function buildOfflineDocsBundle(input: Readonly<{
  schemaVersion: typeof OFFLINE_DOCS_SCHEMA_VERSION;
  sources: readonly OfflineDocSource[];
  diskInventory: readonly string[];
}>): OfflineDocsBundle {
  if (input.schemaVersion !== OFFLINE_DOCS_SCHEMA_VERSION) throw new TypeError('Unsupported offline documentation schemaVersion.');
  if (!Array.isArray(input.sources) || !Array.isArray(input.diskInventory)) throw new TypeError('sources and diskInventory must be arrays.');
  if (input.sources.length === 0) throw new RangeError('Offline documentation requires at least one article.');
  if (input.sources.length > OFFLINE_DOCS_LIMITS.maxArticles) throw new RangeError('Offline documentation article limit exceeded.');
  const totalBytes = input.sources.reduce((total, source) => total + source.content.byteLength, 0);
  if (totalBytes > OFFLINE_DOCS_LIMITS.maxBundleBytes) throw new RangeError('Offline documentation bundle byte limit exceeded.');
  const normalizedPaths = input.sources.map((source) => normalizeArticlePath(source.path));
  assertOfflineDocsComplete(normalizedPaths, input.diskInventory);
  const knownArticles = new Map(normalizedPaths.map((articlePath) => [articlePath.toLocaleLowerCase('en-US'), articlePath]));
  const parsed = input.sources.map((source, index) => {
    const articlePath = normalizedPaths[index];
    return parseMarkdown(articlePath, categoryFor(articlePath, source.category), decodeSource(source));
  });
  const titleByPath = new Map(parsed.map((article) => [article.path, article.title]));
  const articles = parsed.map((article) => {
    const links = Object.freeze(article.rawLinks.map((link) => resolveLink(article.path, link.href, knownArticles)));
    const suggestedArticles: OfflineDocSuggestedArticle[] = [];
    for (const index of article.suggestedLinkIndexes) {
      const link = links[index];
      if (link?.kind !== 'internal' || suggestedArticles.some((item) => item.articlePath === link.articlePath)) continue;
      suggestedArticles.push(deepFreeze({ articlePath: link.articlePath, title: titleByPath.get(link.articlePath) ?? link.articlePath }));
    }
    if (suggestedArticles.length > OFFLINE_DOCS_LIMITS.maxSuggestedArticles) {
      throw new RangeError(`Article ${article.path} has too many suggested articles.`);
    }
    const unhashed = deepFreeze({
      schemaVersion: OFFLINE_DOCS_SCHEMA_VERSION,
      path: article.path,
      title: article.title,
      category: article.category,
      bodyText: article.bodyText,
      ast: article.ast,
      links,
      suggestedArticles: Object.freeze(suggestedArticles),
    });
    return deepFreeze({ ...unhashed, hash: hashArticle(unhashed) });
  }).sort((left, right) => left.path.localeCompare(right.path));
  const manifest = articles.map((article) => deepFreeze({
    path: article.path,
    title: article.title,
    category: article.category,
    hash: article.hash,
    links: article.links,
    suggestedArticles: article.suggestedArticles,
  }));
  return deepFreeze({ schemaVersion: OFFLINE_DOCS_SCHEMA_VERSION, articles, manifest });
}

export function verifyOfflineDocsBundle(bundle: OfflineDocsBundle): void {
  if (bundle.schemaVersion !== OFFLINE_DOCS_SCHEMA_VERSION) throw new TypeError('Unsupported offline documentation bundle schemaVersion.');
  assertOfflineDocsComplete(bundle.articles.map((article) => article.path), bundle.manifest.map((entry) => entry.path));
  const manifestByPath = new Map(bundle.manifest.map((entry) => [pathKey(entry.path), entry]));
  for (const article of bundle.articles) {
    if (article.schemaVersion !== OFFLINE_DOCS_SCHEMA_VERSION) throw new TypeError(`Article ${article.path} has an unsupported schemaVersion.`);
    if (!SHA256_PATTERN.test(article.hash)) throw new TypeError(`Article ${article.path} has an invalid SHA-256 hash.`);
    const { hash, ...unhashed } = article;
    const actual = hashArticle(unhashed);
    if (actual !== hash) throw new Error(`Offline documentation hash mismatch for ${article.path}.`);
    const manifest = manifestByPath.get(pathKey(article.path));
    if (!manifest || stableJson(manifest) !== stableJson({
      path: article.path,
      title: article.title,
      category: article.category,
      hash: article.hash,
      links: article.links,
      suggestedArticles: article.suggestedArticles,
    })) throw new Error(`Offline documentation manifest mismatch for ${article.path}.`);
  }
}

function validateSearchFields(fields: readonly ('title' | 'body')[]): readonly ('title' | 'body')[] {
  if (!Array.isArray(fields) || fields.length === 0) throw new TypeError('Search fields must include title, body, or both.');
  const unique = [...new Set(fields)];
  if (unique.some((field) => field !== 'title' && field !== 'body')) throw new TypeError('Unsupported offline documentation search field.');
  return Object.freeze(unique);
}

function validateRegex(pattern: string, flags: string): RegExp {
  assertBoundedString('regex pattern', pattern, OFFLINE_DOCS_LIMITS.maxSearchCodeUnits, true);
  assertBoundedString('regex flags', flags, SAFE_REGEX_FLAGS.size, true);
  const seen = new Set<string>();
  for (const flag of flags) {
    if (!SAFE_REGEX_FLAGS.has(flag)) throw new TypeError(`Unsupported offline documentation regex flag: ${flag}.`);
    if (seen.has(flag)) throw new TypeError(`Duplicate offline documentation regex flag: ${flag}.`);
    seen.add(flag);
  }
  if (/\\[1-9]|\\k<|\([^)]*[+*][^)]*\)[+*{]/u.test(pattern)) {
    throw new TypeError('Potentially unsafe backreferences or nested repeated quantifiers are not supported.');
  }
  return new RegExp(pattern, flags);
}

export function searchOfflineDocs(
  bundle: OfflineDocsBundle,
  descriptor: OfflineDocsSearchDescriptor,
): readonly OfflineDocsSearchResult[] {
  verifyOfflineDocsBundle(bundle);
  const fields = validateSearchFields(descriptor.fields);
  let matcher: (text: string) => boolean;
  if (descriptor.mode === 'plain') {
    assertBoundedString('plain search query', descriptor.query, OFFLINE_DOCS_LIMITS.maxSearchCodeUnits, true);
    if (descriptor.caseSensitive !== undefined && typeof descriptor.caseSensitive !== 'boolean') {
      throw new TypeError('caseSensitive must be boolean.');
    }
    const needle = descriptor.caseSensitive ? descriptor.query : descriptor.query.toLocaleLowerCase('en-US');
    matcher = (text) => (descriptor.caseSensitive ? text : text.toLocaleLowerCase('en-US')).includes(needle);
  } else if (descriptor.mode === 'regex') {
    const expression = validateRegex(descriptor.pattern, descriptor.flags);
    matcher = (text) => expression.test(text);
  } else {
    throw new TypeError('Offline documentation search mode must be plain or regex.');
  }
  const results: OfflineDocsSearchResult[] = [];
  for (const article of bundle.articles) {
    const matchedFields = fields.filter((field) => matcher(field === 'title' ? article.title : article.bodyText));
    if (matchedFields.length > 0) results.push(deepFreeze({ article, matchedFields: Object.freeze(matchedFields) }));
  }
  return Object.freeze(results);
}
