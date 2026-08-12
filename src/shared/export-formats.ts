export const EXPORT_SCHEMA_VERSION = 1 as const;

export const EXPORT_FORMATS = [
  'json', 'jsonl', 'yaml', 'toml', 'xml', 'csv', 'tsv', 'markdown', 'html', 'sql',
  'typescript', 'javascript', 'python', 'go', 'rust', 'json-schema', 'protobuf',
] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export type ExportLineEnding = 'lf' | 'crlf';
export type ExportPrimitive = null | boolean | number | string;
export type ExportValue = ExportPrimitive | ExportValue[] | { [key: string]: ExportValue };
export type ExportRecord = Record<string, ExportValue>;

export const EXPORT_LIMITS = Object.freeze({
  records: 10_000,
  fieldsPerObject: 256,
  depth: 12,
  stringBytes: 256 * 1024,
  inputBytes: 4 * 1024 * 1024,
  outputBytes: 8 * 1024 * 1024,
  schemaNameLength: 120,
  scopeDetailLength: 1_024,
});

export interface ExportScope {
  kind: 'all' | 'filtered-view' | 'selection';
  detail?: string;
  sourceCount: number;
  exportedCount?: number;
}

export interface ExportOmission {
  category: 'private-vocabulary' | 'totp-secrets';
  paths: string[];
  reason: string;
}

export interface ExportManifest {
  exportSchemaVersion: typeof EXPORT_SCHEMA_VERSION;
  recordSchema: { name: string; version: string };
  encoding: 'UTF-8';
  lineEnding: ExportLineEnding;
  format: ExportFormat;
  scope: Required<ExportScope>;
  omissions: ExportOmission[];
}

export interface ExportRequest {
  format: ExportFormat;
  records: readonly unknown[];
  schema: { name: string; version: string | number };
  scope: ExportScope;
  lineEnding?: ExportLineEnding;
}

export interface ExportResult {
  text: string;
  mediaType: string;
  extension: string;
  manifest: ExportManifest;
  records: ExportRecord[];
  byteLength: number;
}

export interface ParsedExport {
  manifest: ExportManifest;
  records: ExportRecord[];
}

export interface ExportFieldLoss {
  path: string;
  reason: string;
}

export class ExportContractError extends Error {
  readonly code: 'INVALID_REQUEST' | 'FIELD_LOSS' | 'LIMIT_EXCEEDED' | 'PARSE_ERROR';
  readonly losses: readonly ExportFieldLoss[];

  constructor(
    code: ExportContractError['code'],
    message: string,
    losses: readonly ExportFieldLoss[] = [],
  ) {
    super(message);
    this.name = 'ExportContractError';
    this.code = code;
    this.losses = losses;
  }
}

const MEDIA: Record<ExportFormat, { mediaType: string; extension: string }> = {
  json: { mediaType: 'application/json', extension: 'json' },
  jsonl: { mediaType: 'application/x-ndjson', extension: 'jsonl' },
  yaml: { mediaType: 'application/yaml', extension: 'yaml' },
  toml: { mediaType: 'application/toml', extension: 'toml' },
  xml: { mediaType: 'application/xml', extension: 'xml' },
  csv: { mediaType: 'text/csv', extension: 'csv' },
  tsv: { mediaType: 'text/tab-separated-values', extension: 'tsv' },
  markdown: { mediaType: 'text/markdown', extension: 'md' },
  html: { mediaType: 'text/html', extension: 'html' },
  sql: { mediaType: 'application/sql', extension: 'sql' },
  typescript: { mediaType: 'text/typescript', extension: 'ts' },
  javascript: { mediaType: 'text/javascript', extension: 'js' },
  python: { mediaType: 'text/x-python', extension: 'py' },
  go: { mediaType: 'text/x-go', extension: 'go' },
  rust: { mediaType: 'text/x-rust', extension: 'rs' },
  'json-schema': { mediaType: 'application/schema+json', extension: 'schema.json' },
  protobuf: { mediaType: 'application/protobuf+json', extension: 'protobuf.json' },
};

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const PRIVATE_VOCABULARY_KEYS = new Set([
  'privatevocabulary', 'personalvocabulary', 'vocabularymapping', 'vocabularymappings',
  'personalvocabularycache', 'privatevocabularycache',
]);
const TOTP_SECRET_KEYS = new Set([
  'totpsecret', 'totpsecrets', 'otpsecret', 'otpsecrets', 'authenticatorsecret',
  'authenticatorsecrets', 'otpauthuri', 'manualsecret',
]);

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function normalizedKey(key: string): string {
  return key.toLocaleLowerCase('en-US').replace(/[^a-z0-9]/gu, '');
}

function sensitiveCategory(key: string): ExportOmission['category'] | undefined {
  const normalized = normalizedKey(key);
  if (PRIVATE_VOCABULARY_KEYS.has(normalized)) return 'private-vocabulary';
  if (TOTP_SECRET_KEYS.has(normalized) || (normalized.includes('totp') && normalized.includes('secret'))) {
    return 'totp-secrets';
  }
  return undefined;
}

function pathProperty(parent: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

function formatLosses(format: ExportFormat, losses: readonly ExportFieldLoss[]): ExportContractError {
  const ordered = [...losses].sort((left, right) => left.path.localeCompare(right.path) || left.reason.localeCompare(right.reason));
  return new ExportContractError(
    'FIELD_LOSS',
    `Export refused because ${format} would lose fields: ${ordered.map((loss) => `${loss.path} (${loss.reason})`).join('; ')}`,
    ordered,
  );
}

function canonicalize(
  value: unknown,
  path: string,
  depth: number,
  seen: Set<object>,
  omissions: Map<ExportOmission['category'], string[]>,
  losses: ExportFieldLoss[],
): ExportValue | undefined {
  if (depth > EXPORT_LIMITS.depth) {
    throw new ExportContractError('LIMIT_EXCEEDED', `${path} exceeds maximum depth ${EXPORT_LIMITS.depth}`);
  }
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) losses.push({ path, reason: 'non-finite number is not portable' });
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    if (byteLength(value) > EXPORT_LIMITS.stringBytes) {
      throw new ExportContractError('LIMIT_EXCEEDED', `${path} exceeds maximum string size ${EXPORT_LIMITS.stringBytes} bytes`);
    }
    return value;
  }
  if (typeof value !== 'object' || value === undefined) {
    losses.push({ path, reason: `${value === undefined ? 'undefined' : typeof value} is not a portable structured value` });
    return undefined;
  }
  if (seen.has(value)) {
    losses.push({ path, reason: 'cyclic reference is not serializable' });
    return undefined;
  }
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    losses.push({ path, reason: 'non-plain object would lose its type or prototype' });
    return undefined;
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const result: ExportValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const item = canonicalize(value[index], `${path}[${index}]`, depth + 1, seen, omissions, losses);
        if (item === undefined) losses.push({ path: `${path}[${index}]`, reason: 'array entry cannot be omitted without changing position' });
        else result.push(item);
      }
      return result;
    }
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > EXPORT_LIMITS.fieldsPerObject) {
      throw new ExportContractError('LIMIT_EXCEEDED', `${path} exceeds maximum field count ${EXPORT_LIMITS.fieldsPerObject}`);
    }
    const result: Record<string, ExportValue> = {};
    for (const [key, item] of entries.sort(([left], [right]) => left.localeCompare(right))) {
      const itemPath = pathProperty(path, key);
      if (UNSAFE_KEYS.has(key)) {
        losses.push({ path: itemPath, reason: 'unsafe object key is not exportable' });
        continue;
      }
      const category = sensitiveCategory(key);
      if (category !== undefined) {
        omissions.get(category)?.push(itemPath);
        continue;
      }
      const normalized = canonicalize(item, itemPath, depth + 1, seen, omissions, losses);
      if (normalized !== undefined) result[key] = normalized;
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

function stableJson(value: unknown, indent = 0): string {
  return JSON.stringify(value, null, indent);
}

function validateRequest(request: ExportRequest): {
  records: ExportRecord[];
  manifest: ExportManifest;
} {
  if (!EXPORT_FORMATS.includes(request.format)) {
    throw new ExportContractError('INVALID_REQUEST', `Unsupported export format: ${String(request.format)}`);
  }
  if (!Array.isArray(request.records) || request.records.length > EXPORT_LIMITS.records) {
    throw new ExportContractError('LIMIT_EXCEEDED', `records must contain at most ${EXPORT_LIMITS.records} entries`);
  }
  if (!request.schema || typeof request.schema.name !== 'string' || request.schema.name.length === 0 || request.schema.name.length > EXPORT_LIMITS.schemaNameLength) {
    throw new ExportContractError('INVALID_REQUEST', 'schema.name must be a non-empty bounded string');
  }
  const schemaVersion = String(request.schema.version);
  if (!schemaVersion || schemaVersion.length > 64) throw new ExportContractError('INVALID_REQUEST', 'schema.version must be non-empty and bounded');
  if (!request.scope || !['all', 'filtered-view', 'selection'].includes(request.scope.kind)) {
    throw new ExportContractError('INVALID_REQUEST', 'scope.kind must be all, filtered-view, or selection');
  }
  if (!Number.isSafeInteger(request.scope.sourceCount) || request.scope.sourceCount < request.records.length) {
    throw new ExportContractError('INVALID_REQUEST', 'scope.sourceCount must be an integer at least as large as the exported record count');
  }
  if (request.scope.exportedCount !== undefined && request.scope.exportedCount !== request.records.length) {
    throw new ExportContractError('INVALID_REQUEST', 'scope.exportedCount must equal the exported record count');
  }
  if ((request.scope.detail?.length ?? 0) > EXPORT_LIMITS.scopeDetailLength) {
    throw new ExportContractError('LIMIT_EXCEEDED', `scope.detail exceeds ${EXPORT_LIMITS.scopeDetailLength} characters`);
  }
  const lineEnding = request.lineEnding ?? 'lf';
  if (lineEnding !== 'lf' && lineEnding !== 'crlf') throw new ExportContractError('INVALID_REQUEST', 'lineEnding must be lf or crlf');

  const omissions = new Map<ExportOmission['category'], string[]>([
    ['private-vocabulary', []],
    ['totp-secrets', []],
  ]);
  const losses: ExportFieldLoss[] = [];
  const records: ExportRecord[] = [];
  for (let index = 0; index < request.records.length; index += 1) {
    const normalized = canonicalize(request.records[index], `$[${index}]`, 0, new Set(), omissions, losses);
    if (normalized === undefined || normalized === null || Array.isArray(normalized) || typeof normalized !== 'object') {
      losses.push({ path: `$[${index}]`, reason: 'top-level record must be a plain object' });
    } else {
      records.push(normalized as ExportRecord);
    }
  }
  if (losses.length > 0) throw formatLosses(request.format, losses);
  const canonicalInput = stableJson(records);
  if (byteLength(canonicalInput) > EXPORT_LIMITS.inputBytes) {
    throw new ExportContractError('LIMIT_EXCEEDED', `canonical records exceed ${EXPORT_LIMITS.inputBytes} bytes`);
  }

  const omissionReason: Record<ExportOmission['category'], string> = {
    'private-vocabulary': 'Private vocabulary data is always omitted and is never serialized.',
    'totp-secrets': 'TOTP and authenticator secrets are always omitted and are never serialized.',
  };
  const manifest: ExportManifest = {
    exportSchemaVersion: EXPORT_SCHEMA_VERSION,
    recordSchema: { name: request.schema.name, version: schemaVersion },
    encoding: 'UTF-8',
    lineEnding,
    format: request.format,
    scope: {
      kind: request.scope.kind,
      detail: request.scope.detail ?? '',
      sourceCount: request.scope.sourceCount,
      exportedCount: request.records.length,
    },
    omissions: (['private-vocabulary', 'totp-secrets'] as const).map((category) => ({
      category,
      paths: [...(omissions.get(category) ?? [])].sort(),
      reason: omissionReason[category],
    })),
  };
  return { records, manifest };
}

function applyLineEnding(text: string, lineEnding: ExportLineEnding): string {
  const lf = text.replace(/\r\n|\r/gu, '\n');
  return lineEnding === 'crlf' ? lf.replace(/\n/gu, '\r\n') : lf;
}

function csvCell(value: string, separator: ',' | '\t'): string {
  // Every exported cell is JSON text, so strings that begin =, +, -, or @ remain
  // inert quoted JSON strings when a spreadsheet opens the file.
  return `"${value.replace(/"/gu, '""')}"`;
}

function tabular(records: ExportRecord[], manifest: ExportManifest, separator: ',' | '\t'): string {
  const columns = [...new Set(records.flatMap((record) => Object.keys(record)))].sort();
  const lines = [`# export-manifest=${stableJson(manifest)}`];
  lines.push(columns.map((column) => csvCell(stableJson(column), separator)).join(separator));
  for (const record of records) {
    lines.push(columns.map((column) => Object.hasOwn(record, column) ? csvCell(stableJson(record[column]), separator) : '').join(separator));
  }
  return `${lines.join('\n')}\n`;
}

function markdownEscape(value: string): string {
  return value.replace(/\\/gu, '\\\\').replace(/\|/gu, '\\|').replace(/`/gu, '&#96;').replace(/\r?\n/gu, '<br>');
}

function htmlEscape(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}

function utf8Hex(value: string): string {
  return [...new TextEncoder().encode(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function rustRawString(value: string): string {
  let hashes = '#';
  while (value.includes(`"${hashes}`)) hashes += '#';
  return `r${hashes}"${value}"${hashes}`;
}

function render(format: ExportFormat, records: ExportRecord[], manifest: ExportManifest): string {
  const bundle = { manifest, records };
  const compact = stableJson(bundle);
  const pretty = stableJson(bundle, 2);
  const manifestJson = stableJson(manifest);
  const columns = [...new Set(records.flatMap((record) => Object.keys(record)))].sort();
  switch (format) {
    case 'json': return `${pretty}\n`;
    case 'jsonl': return `${stableJson({ $exportManifest: manifest })}\n${records.map((record) => stableJson({ record })).join('\n')}${records.length ? '\n' : ''}`;
    case 'yaml': return `# YAML 1.2; canonical JSON flow values preserve every JSON type\nmanifest: ${manifestJson}\nrecords: ${stableJson(records)}\n`;
    case 'toml': return `# Canonical JSON strings preserve nulls, nested values, and mixed arrays without TOML coercion.\nmanifest_json = ${stableJson(manifestJson)}\nrecords_json = ${stableJson(stableJson(records))}\n`;
    case 'xml': return `<?xml version="1.0" encoding="UTF-8"?>\n<structured-export schema-version="${EXPORT_SCHEMA_VERSION}"><canonical-json encoding="utf-8-hex">${utf8Hex(compact)}</canonical-json></structured-export>\n`;
    case 'csv': return tabular(records, manifest, ',');
    case 'tsv': return tabular(records, manifest, '\t');
    case 'markdown': {
      const lines = ['# Structured-record export', '', `- Manifest: \`${markdownEscape(manifestJson)}\``, ''];
      lines.push(`| ${columns.map(markdownEscape).join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`);
      for (const record of records) lines.push(`| ${columns.map((column) => markdownEscape(Object.hasOwn(record, column) ? stableJson(record[column]) : '')).join(' | ')} |`);
      return `${lines.join('\n')}\n`;
    }
    case 'html': {
      const safeJson = pretty.replace(/</gu, '\\u003c').replace(/>/gu, '\\u003e').replace(/&/gu, '\\u0026');
      const header = columns.map((column) => `<th scope="col">${htmlEscape(column)}</th>`).join('');
      const rows = records.map((record) => `<tr>${columns.map((column) => `<td>${htmlEscape(Object.hasOwn(record, column) ? stableJson(record[column]) : '')}</td>`).join('')}</tr>`).join('\n');
      return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Structured-record export</title></head><body><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table><script type="application/json" id="structured-export">${safeJson}</script></body></html>\n`;
    }
    case 'sql': return `-- UTF-8 structured export; canonical JSON preserves all field names and value types.\nCREATE TABLE structured_export (schema_name TEXT NOT NULL, schema_version TEXT NOT NULL, scope_json TEXT NOT NULL, records_json TEXT NOT NULL);\nINSERT INTO structured_export VALUES (${sqlLiteral(manifest.recordSchema.name)}, ${sqlLiteral(manifest.recordSchema.version)}, ${sqlLiteral(stableJson(manifest.scope))}, ${sqlLiteral(stableJson(records))});\n-- omission_manifest: ${manifest.omissions.map((item) => `${item.category}=${item.paths.length}`).join(', ')}\n`;
    case 'typescript': return `export const exportManifest = ${stableJson(manifest, 2)} as const;\nexport const records = ${stableJson(records, 2)} as const;\n`;
    case 'javascript': return `export const exportManifest = Object.freeze(${stableJson(manifest, 2)});\nexport const records = Object.freeze(${stableJson(records, 2)});\n`;
    case 'python': return `# UTF-8 structured export\nimport json\nexport_manifest = json.loads(${stableJson(manifestJson)})\nrecords = json.loads(${stableJson(stableJson(records))})\n`;
    case 'go': return `package exportdata\n\n// UTF-8 canonical JSON; decode with encoding/json.\nvar ManifestJSON = []byte(${stableJson(manifestJson)})\nvar RecordsJSON = []byte(${stableJson(stableJson(records))})\n`;
    case 'rust': return `// UTF-8 canonical JSON; decode with the consumer's JSON implementation.\npub const MANIFEST_JSON: &str = ${rustRawString(manifestJson)};\npub const RECORDS_JSON: &str = ${rustRawString(stableJson(records))};\n`;
    case 'json-schema': return `${stableJson({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: manifest.recordSchema.name,
      description: `Version ${manifest.recordSchema.version}; exact exported records are constrained by const.`,
      type: 'array',
      const: records,
      'x-export-manifest': manifest,
    } as unknown as ExportValue, 2)}\n`;
    case 'protobuf': return `${stableJson({
      '@type': 'type.googleapis.com/google.protobuf.Struct',
      export_manifest: manifest,
      records,
    } as unknown as ExportValue, 2)}\n`;
  }
}

export function exportStructuredRecords(request: ExportRequest): ExportResult {
  const { records, manifest } = validateRequest(request);
  const text = applyLineEnding(render(request.format, records, manifest), manifest.lineEnding);
  const resultBytes = byteLength(text);
  if (resultBytes > EXPORT_LIMITS.outputBytes) {
    throw new ExportContractError('LIMIT_EXCEEDED', `export output exceeds ${EXPORT_LIMITS.outputBytes} bytes`);
  }
  return { text, ...MEDIA[request.format], manifest, records, byteLength: resultBytes };
}

function assertParsedBundle(value: unknown): ParsedExport {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ExportContractError('PARSE_ERROR', 'export bundle must be an object');
  const bundle = value as { manifest?: unknown; records?: unknown };
  if (!Array.isArray(bundle.records) || typeof bundle.manifest !== 'object' || bundle.manifest === null) {
    throw new ExportContractError('PARSE_ERROR', 'export bundle must contain manifest and records');
  }
  return { manifest: bundle.manifest as ExportManifest, records: bundle.records as ExportRecord[] };
}

function parseDelimitedLine(line: string, separator: ',' | '\t'): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.length === 0) quoted = true;
    else if (char === separator) { cells.push(cell); cell = ''; }
    else cell += char;
  }
  if (quoted) throw new ExportContractError('PARSE_ERROR', 'unterminated quoted field');
  cells.push(cell);
  return cells;
}

function parseTabular(text: string, separator: ',' | '\t'): ParsedExport {
  const lines = text.replace(/\r\n|\r/gu, '\n').split('\n');
  if (!lines[0]?.startsWith('# export-manifest=')) throw new ExportContractError('PARSE_ERROR', 'tabular export is missing its manifest');
  let manifest: ExportManifest;
  try { manifest = JSON.parse(lines[0].slice('# export-manifest='.length)) as ExportManifest; }
  catch { throw new ExportContractError('PARSE_ERROR', 'tabular export manifest is malformed'); }
  if (!lines[1]) return { manifest, records: [] };
  let columns: string[];
  try { columns = parseDelimitedLine(lines[1], separator).map((cell) => JSON.parse(cell) as string); }
  catch { throw new ExportContractError('PARSE_ERROR', 'tabular export header is malformed'); }
  const records: ExportRecord[] = [];
  for (const line of lines.slice(2)) {
    if (!line) continue;
    const cells = parseDelimitedLine(line, separator);
    if (cells.length !== columns.length) throw new ExportContractError('PARSE_ERROR', 'tabular row has the wrong field count');
    const record: ExportRecord = {};
    for (let index = 0; index < columns.length; index += 1) {
      if (cells[index] === '') continue;
      try { record[columns[index]] = JSON.parse(cells[index]) as ExportValue; }
      catch { throw new ExportContractError('PARSE_ERROR', `tabular cell for ${columns[index]} is malformed`); }
    }
    records.push(record);
  }
  return { manifest, records };
}

export function parseStructuredExport(text: string, format: 'json' | 'jsonl' | 'csv' | 'tsv'): ParsedExport {
  if (byteLength(text) > EXPORT_LIMITS.outputBytes) throw new ExportContractError('LIMIT_EXCEEDED', 'export text exceeds parse size limit');
  if (format === 'csv' || format === 'tsv') return parseTabular(text, format === 'csv' ? ',' : '\t');
  try {
    if (format === 'json') return assertParsedBundle(JSON.parse(text) as unknown);
    const lines = text.replace(/\r\n|\r/gu, '\n').split('\n').filter(Boolean);
    const first = JSON.parse(lines.shift() ?? '') as { $exportManifest?: ExportManifest };
    if (!first.$exportManifest) throw new Error('missing manifest');
    const records = lines.map((line) => {
      const item = JSON.parse(line) as { record?: ExportRecord };
      if (!item.record) throw new Error('missing record');
      return item.record;
    });
    return { manifest: first.$exportManifest, records };
  } catch (error) {
    if (error instanceof ExportContractError) throw error;
    throw new ExportContractError('PARSE_ERROR', `${format} export is malformed`);
  }
}
