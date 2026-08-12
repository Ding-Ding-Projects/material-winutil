import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXPORT_FORMATS,
  EXPORT_LIMITS,
  ExportContractError,
  exportStructuredRecords,
  parseStructuredExport,
} from '../../dist/shared/export-formats.js';

const sampleRecords = [
  {
    active: true,
    count: 0,
    empty: '',
    missing: null,
    name: '蝦餃 🥟 e\u0301',
    nested: { flags: [false, true], note: 'line 1\nline 2' },
  },
  {
    active: false,
    count: 42.5,
    empty: '=2+3',
    missing: null,
    name: 'O\'Reilly <script>& "quoted"',
    nested: { flags: [], note: 'comma, tab\t pipe| quote"' },
  },
];

function request(format, overrides = {}) {
  return {
    format,
    records: sampleRecords,
    schema: { name: 'utility-records', version: 7 },
    scope: { kind: 'filtered-view', detail: 'query=active', sourceCount: 5 },
    lineEnding: 'lf',
    ...overrides,
  };
}

test('exports every declared format with deterministic metadata and bytes', () => {
  assert.equal(EXPORT_FORMATS.length, 17);
  for (const format of EXPORT_FORMATS) {
    const first = exportStructuredRecords(request(format));
    const second = exportStructuredRecords(request(format));
    assert.equal(first.text, second.text, `${format} must be deterministic`);
    assert.equal(first.byteLength, new TextEncoder().encode(first.text).byteLength);
    assert.ok(first.text.length > 0, `${format} must emit content`);
    assert.equal(first.manifest.exportSchemaVersion, 1);
    assert.deepEqual(first.manifest.recordSchema, { name: 'utility-records', version: '7' });
    assert.deepEqual(first.manifest.scope, {
      kind: 'filtered-view', detail: 'query=active', sourceCount: 5, exportedCount: 2,
    });
    assert.equal(first.manifest.encoding, 'UTF-8');
    assert.equal(first.manifest.lineEnding, 'lf');
    assert.ok(!first.text.includes('\r'));
  }
});

test('round trips JSON, JSONL, CSV, and TSV without changing values or types', () => {
  for (const format of ['json', 'jsonl', 'csv', 'tsv']) {
    const exported = exportStructuredRecords(request(format));
    const parsed = parseStructuredExport(exported.text, format);
    assert.deepEqual(parsed.manifest, exported.manifest, `${format} manifest round trip`);
    assert.deepEqual(parsed.records, exported.records, `${format} records round trip`);
  }
});

test('tabular formats quote every JSON cell and prevent spreadsheet formula execution', () => {
  const records = [
    { value: '=SUM(1,2)' },
    { value: '+cmd' },
    { value: '-2+3' },
    { value: '@formula' },
    { value: '\t=hidden' },
    { value: '\r=hidden' },
  ];
  for (const format of ['csv', 'tsv']) {
    const result = exportStructuredRecords(request(format, {
      records,
      scope: { kind: 'selection', detail: 'six selected rows', sourceCount: 6 },
    }));
    for (const line of result.text.replace(/\r\n|\r/gu, '\n').split('\n').slice(2).filter(Boolean)) {
      assert.ok(line.startsWith('"""'), `${format} cells start with a quote, not a formula prefix`);
    }
    assert.deepEqual(parseStructuredExport(result.text, format).records, result.records);
  }
});

test('escapes active content and language-specific strings safely', () => {
  const html = exportStructuredRecords(request('html')).text;
  assert.ok(!html.includes('<script>&'));
  assert.match(html, /&lt;script&gt;&amp;/u);
  assert.match(html, /\\u003cscript\\u003e/u);

  const xml = exportStructuredRecords(request('xml')).text;
  assert.doesNotMatch(xml, /<script>/u);
  assert.match(xml, /encoding="utf-8-hex"/u);

  const sql = exportStructuredRecords(request('sql')).text;
  assert.match(sql, /O''Reilly/u);
  assert.doesNotMatch(sql, /O'Reilly/u);

  const markdown = exportStructuredRecords(request('markdown')).text;
  assert.match(markdown, /pipe\\\|/u);

  const sourceFormats = ['typescript', 'javascript', 'python', 'go', 'rust'];
  for (const format of sourceFormats) {
    const body = exportStructuredRecords(request(format)).text;
    assert.match(body, /utility-records/u);
    assert.match(body, /蝦餃/u);
  }
});

test('records mandatory secret omissions in every manifest and never serializes secret values', () => {
  const records = [{
    id: 'safe',
    personalVocabulary: { hidden: 'NEVER_VOCAB_PAYLOAD' },
    nested: { totp_secret: 'NEVER_TOTP_PAYLOAD', visible: 'kept' },
  }];
  for (const format of EXPORT_FORMATS) {
    const result = exportStructuredRecords(request(format, {
      records,
      scope: { kind: 'selection', sourceCount: 1 },
    }));
    assert.equal(result.text.includes('NEVER_VOCAB_PAYLOAD'), false, `${format} vocabulary omission`);
    assert.equal(result.text.includes('NEVER_TOTP_PAYLOAD'), false, `${format} TOTP omission`);
    assert.deepEqual(result.records, [{ id: 'safe', nested: { visible: 'kept' } }]);
    assert.deepEqual(result.manifest.omissions.map((item) => item.category), ['private-vocabulary', 'totp-secrets']);
    assert.deepEqual(result.manifest.omissions[0].paths, ['$[0].personalVocabulary']);
    assert.deepEqual(result.manifest.omissions[1].paths, ['$[0].nested.totp_secret']);
  }
});

test('refuses every unsupported or lossy shape with an exact sorted field-loss report', () => {
  const cycle = {};
  cycle.self = cycle;
  const records = [{ valid: 'yes', z: undefined, a: Number.NaN, b: 1n, c: new Date(0), cycle }];
  assert.throws(
    () => exportStructuredRecords(request('json', { records, scope: { kind: 'all', sourceCount: 1 } })),
    (error) => {
      assert.ok(error instanceof ExportContractError);
      assert.equal(error.code, 'FIELD_LOSS');
      assert.deepEqual(error.losses, [
        { path: '$[0].a', reason: 'non-finite number is not portable' },
        { path: '$[0].b', reason: 'bigint is not a portable structured value' },
        { path: '$[0].c', reason: 'non-plain object would lose its type or prototype' },
        { path: '$[0].cycle.self', reason: 'cyclic reference is not serializable' },
        { path: '$[0].z', reason: 'undefined is not a portable structured value' },
      ]);
      assert.equal(error.message, 'Export refused because json would lose fields: $[0].a (non-finite number is not portable); $[0].b (bigint is not a portable structured value); $[0].c (non-plain object would lose its type or prototype); $[0].cycle.self (cyclic reference is not serializable); $[0].z (undefined is not a portable structured value)');
      return true;
    },
  );
});

test('enforces record, field, depth, input, string, scope, and parse bounds', () => {
  assert.throws(
    () => exportStructuredRecords(request('json', {
      records: Array.from({ length: EXPORT_LIMITS.records + 1 }, () => ({})),
      scope: { kind: 'all', sourceCount: EXPORT_LIMITS.records + 1 },
    })),
    /at most 10000/u,
  );
  assert.throws(
    () => exportStructuredRecords(request('json', {
      records: [Object.fromEntries(Array.from({ length: EXPORT_LIMITS.fieldsPerObject + 1 }, (_, index) => [`k${index}`, index]))],
      scope: { kind: 'all', sourceCount: 1 },
    })),
    /maximum field count/u,
  );
  let nested = { value: true };
  for (let index = 0; index <= EXPORT_LIMITS.depth; index += 1) nested = { child: nested };
  assert.throws(
    () => exportStructuredRecords(request('json', { records: [nested], scope: { kind: 'all', sourceCount: 1 } })),
    /maximum depth/u,
  );
  assert.throws(
    () => exportStructuredRecords(request('json', {
      records: [{ huge: 'x'.repeat(EXPORT_LIMITS.stringBytes + 1) }],
      scope: { kind: 'all', sourceCount: 1 },
    })),
    /maximum string size/u,
  );
  assert.throws(() => exportStructuredRecords(request('json', {
    scope: { kind: 'selection', detail: 'x'.repeat(EXPORT_LIMITS.scopeDetailLength + 1), sourceCount: 2 },
  })), /scope.detail/u);
  assert.throws(() => parseStructuredExport('x'.repeat(EXPORT_LIMITS.outputBytes + 1), 'json'), /parse size limit/u);
});

test('normalizes CRLF deterministically with exactly one terminal line break', () => {
  for (const format of EXPORT_FORMATS) {
    const result = exportStructuredRecords(request(format, { lineEnding: 'crlf' }));
    assert.equal(result.manifest.lineEnding, 'crlf');
    assert.ok(result.text.endsWith('\r\n'), format);
    assert.equal(result.text.replace(/\r\n/gu, '').includes('\n'), false, `${format} has no bare LF`);
    assert.equal(result.text.endsWith('\r\n\r\n'), false, `${format} has one terminal line ending`);
  }
});

test('fails closed on invalid request metadata and malformed round-trip inputs', () => {
  assert.throws(() => exportStructuredRecords(request('wat')), /Unsupported export format/u);
  assert.throws(() => exportStructuredRecords(request('json', { schema: { name: '', version: 1 } })), /schema.name/u);
  assert.throws(() => exportStructuredRecords(request('json', { scope: { kind: 'all', sourceCount: 1 } })), /sourceCount/u);
  assert.throws(() => exportStructuredRecords(request('json', { scope: { kind: 'all', sourceCount: 2, exportedCount: 1 } })), /exportedCount/u);
  assert.throws(() => parseStructuredExport('{', 'json'), /malformed/u);
  assert.throws(() => parseStructuredExport('{}\n', 'jsonl'), /malformed/u);
  assert.throws(() => parseStructuredExport('no manifest\n', 'csv'), /missing its manifest/u);
});
