import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ARCHIVE_COMPRESSION_COSTS,
  ARCHIVE_EXPORT_LIMITS,
  SEVEN_ZIP_METHOD_COSTS,
  buildSevenZipCommand,
  createArchiveListFile,
  createArchiveManifest,
  parseArchiveExportJson,
  validateArchiveEntryPath,
} from '../../dist/shared/archive-export.js';

function request(options = { format: '7z' }, entries = [{ path: 'reports/result.json', bytes: 12 }], extra = {}) {
  return { schemaVersion: 1, options, entries, ...extra };
}

test('publishes every required method and compression level with cost explanations', () => {
  assert.deepEqual(Object.keys(SEVEN_ZIP_METHOD_COSTS), ['LZMA2', 'LZMA', 'PPMd', 'BZip2', 'Deflate']);
  assert.deepEqual(Object.keys(ARCHIVE_COMPRESSION_COSTS), ['store', 'fastest', 'fast', 'normal', 'maximum', 'ultra']);
  for (const explanation of [...Object.values(SEVEN_ZIP_METHOD_COSTS), ...Object.values(ARCHIVE_COMPRESSION_COSTS)]) {
    assert.ok(explanation.length > 20);
  }
});

test('normalizes sane ZIP and 7z defaults', () => {
  const zip = createArchiveManifest(request({ format: 'zip' }));
  assert.deepEqual(zip.options, { format: 'zip', compressionLevel: 'normal' });
  const seven = createArchiveManifest(request({ format: '7z' }));
  assert.deepEqual(seven.options, {
    format: '7z',
    method: 'LZMA2',
    compressionLevel: 'normal',
    dictionarySizeMiB: 64,
    wordSize: 64,
    solid: true,
    solidBlockSizeMiB: 256,
    threads: 4,
    encryption: { algorithm: 'AES-256', enabled: false, encryptHeaders: false },
  });
});

test('parses bounded JSON and rejects malformed or non-JSON configuration', () => {
  assert.equal(parseArchiveExportJson(JSON.stringify(request({ format: 'zip' }))).format, 'zip');
  assert.throws(() => parseArchiveExportJson('{broken'), /malformed/i);
  assert.throws(() => createArchiveManifest(undefined), /serializable JSON/i);
});

test('accepts the complete 7z option matrix', () => {
  for (const method of Object.keys(SEVEN_ZIP_METHOD_COSTS)) {
    for (const compressionLevel of Object.keys(ARCHIVE_COMPRESSION_COSTS)) {
      const manifest = createArchiveManifest(request({
        format: '7z', method, compressionLevel, dictionarySizeMiB: 128, wordSize: 96,
        solid: false, solidBlockSizeMiB: 512, threads: 8, splitVolumeSizeMiB: 100,
        encryption: { enabled: true, encryptHeaders: true },
      }));
      assert.equal(manifest.options.method, method);
      assert.equal(manifest.options.compressionLevel, compressionLevel);
      assert.equal(manifest.options.splitVolumeSizeMiB, 100);
    }
  }
});

test('rejects traversal, absolute, drive, ADS, backslash, empty segments, and control characters', () => {
  const unsafe = ['../secret.txt', 'safe/../../secret.txt', '/etc/passwd', 'C:/secret.txt',
    String.raw`C:\secret.txt`, String.raw`folder\file.txt`, '//server/share/file', 'safe/file.txt:stream',
    'safe//file.txt', './file.txt', 'safe/./file.txt', 'safe/../file.txt', 'safe/file\nname.txt'];
  for (const candidate of unsafe) assert.throws(() => validateArchiveEntryPath(candidate), /archive entry path/i, candidate);
  assert.equal(validateArchiveEntryPath('safe/nested/file.txt'), 'safe/nested/file.txt');
});

test('warns when AES-256 leaves filenames visible and rejects impossible header encryption', () => {
  const visible = createArchiveManifest(request({ format: '7z', encryption: { enabled: true, encryptHeaders: false } }));
  assert.equal(visible.warnings.length, 1);
  assert.match(visible.warnings[0], /filenames remain visible/i);
  const hidden = createArchiveManifest(request({ format: '7z', encryption: { enabled: true, encryptHeaders: true } }));
  assert.deepEqual(hidden.warnings, []);
  assert.throws(() => createArchiveManifest(request({ format: '7z', encryption: { enabled: false, encryptHeaders: true } })), /require.*encryption/i);
});

test('requires explicit authorization before including a sensitive entry', () => {
  const entries = [{ path: 'private/export.json', bytes: 1, sensitive: true }];
  assert.throws(() => createArchiveManifest(request({ format: '7z' }, entries)), /explicitly authorized sensitive flow/i);
  assert.equal(createArchiveManifest(request({ format: '7z' }, entries, { sensitiveFlowAuthorized: true })).entries[0].sensitive, true);
});

test('enforces config, entry, path, option, and aggregate byte bounds', () => {
  assert.throws(() => createArchiveManifest(request({ format: '7z', threads: 0 })), /threads/i);
  assert.throws(() => createArchiveManifest(request({ format: '7z', dictionarySizeMiB: ARCHIVE_EXPORT_LIMITS.dictionarySizeMiB + 1 })), /dictionary/i);
  assert.throws(() => createArchiveManifest(request({ format: '7z', wordSize: 4 })), /wordSize/i);
  assert.throws(() => createArchiveManifest(request({ format: '7z', solidBlockSizeMiB: 0 })), /solidBlock/i);
  assert.throws(() => createArchiveManifest(request({ format: '7z', splitVolumeSizeMiB: 0 })), /splitVolume/i);
  assert.throws(() => createArchiveManifest(request({ format: 'zip', compressionLevel: 'impossible' })), /compressionLevel/i);
  assert.throws(() => createArchiveManifest(request({ format: '7z', method: 'RAR' })), /method/i);
  assert.throws(() => createArchiveManifest(request({ format: '7z' }, [{ path: 'a'.repeat(ARCHIVE_EXPORT_LIMITS.entryPathBytes + 1), bytes: 0 }])), /path exceeds/i);
  assert.throws(() => createArchiveManifest(request({ format: '7z' }, [{ path: 'huge.bin', bytes: ARCHIVE_EXPORT_LIMITS.entryBytes + 1 }])), /bytes/i);
  assert.throws(() => createArchiveManifest(request({ format: '7z' }, [
    { path: 'a.bin', bytes: ARCHIVE_EXPORT_LIMITS.entryBytes },
    { path: 'b.bin', bytes: ARCHIVE_EXPORT_LIMITS.entryBytes },
    { path: 'c.bin', bytes: ARCHIVE_EXPORT_LIMITS.entryBytes },
    { path: 'd.bin', bytes: ARCHIVE_EXPORT_LIMITS.entryBytes },
    { path: 'e.bin', bytes: 1 },
  ])), /total limit/i);
  assert.throws(() => createArchiveManifest(request({ format: '7z' }, [{ path: 'a.txt', bytes: 1, note: 'x'.repeat(ARCHIVE_EXPORT_LIMITS.configBytes) }])), /configuration exceeds/i);
  const tooManyEntries = Array.from({ length: ARCHIVE_EXPORT_LIMITS.entries + 1 }, (_, index) => ({ path: `f/${index}`, bytes: 0 }));
  assert.throws(() => createArchiveManifest(request({ format: 'zip' }, tooManyEntries)), /entries must contain/i);
});

test('manifest and list file state the exact contents in caller order', () => {
  const manifest = createArchiveManifest(request({ format: 'zip', compressionLevel: 'fast' }, [
    { path: 'z-last.txt', bytes: 9 },
    { path: 'folder/a-first.txt', bytes: 3, sensitive: false },
  ]));
  assert.deepEqual(manifest.entries, [
    { path: 'z-last.txt', bytes: 9, sensitive: false },
    { path: 'folder/a-first.txt', bytes: 3, sensitive: false },
  ]);
  assert.equal(manifest.entryCount, 2);
  assert.equal(manifest.totalBytes, 12);
  assert.equal(createArchiveListFile(manifest), 'z-last.txt\nfolder/a-first.txt\n');
  assert.throws(() => createArchiveListFile({ ...manifest, entries: [{ path: 'ok.txt\nsecret.txt', bytes: 1, sensitive: false }] }), /control characters/i);
  assert.throws(() => createArchiveManifest(request({ format: 'zip' }, [
    { path: 'same.txt', bytes: 1 }, { path: 'same.txt', bytes: 2 },
  ])), /duplicate/i);
});

test('builds exact shell-free 7z arguments and keeps the password out of args and logs', () => {
  const manifest = createArchiveManifest(request({
    format: '7z', method: 'PPMd', compressionLevel: 'ultra', dictionarySizeMiB: 128,
    wordSize: 96, solid: true, solidBlockSizeMiB: 512, threads: 6, splitVolumeSizeMiB: 100,
    encryption: { enabled: true, encryptHeaders: true },
  }));
  const descriptor = buildSevenZipCommand({
    manifest,
    executable: { path: String.raw`C:\Program Files\7-Zip\7z.exe`, trusted: true },
    sourceDirectory: String.raw`C:\Exports\staging`,
    outputArchive: String.raw`C:\Exports\bundle.7z`,
    listFile: String.raw`C:\Exports\entries.txt`,
  });
  assert.equal(descriptor.shell, false);
  assert.deepEqual(descriptor.args, [
    'a', '-t7z', String.raw`C:\Exports\bundle.7z`, String.raw`@C:\Exports\entries.txt`, '-mx=9', '-spf-', '-y', '-bb0', '-scsUTF-8',
    '-m0=PPMd', '-md=128m', '-mfb=96', '-ms=512m', '-mmt=6', '-v100m', '-mem=AES256', '-p', '-mhe=on',
  ]);
  assert.deepEqual(descriptor.stdin, {
    kind: 'secret', purpose: 'archive-password', prompts: 2, encoding: 'utf8', appendNewline: true,
  });
  assert.deepEqual(descriptor.redactedLog.args, descriptor.args);
  const serialized = JSON.stringify(descriptor);
  assert.doesNotMatch(serialized, /correct horse battery staple/i);
  assert.ok(!descriptor.args.some((argument) => /^-p.+/u.test(argument)));
});

test('requires a trusted absolute 7z.exe and absolute command paths', () => {
  const manifest = createArchiveManifest(request({ format: 'zip' }));
  const base = {
    manifest, executable: { path: String.raw`C:\Tools\7z.exe`, trusted: true },
    sourceDirectory: String.raw`C:\source`, outputArchive: String.raw`C:\out\bundle.zip`, listFile: String.raw`C:\out\list.txt`,
  };
  assert.throws(() => buildSevenZipCommand({ ...base, executable: { path: '7z.exe', trusted: true } }), /absolute/i);
  assert.throws(() => buildSevenZipCommand({ ...base, executable: { path: String.raw`C:\Tools\evil.exe`, trusted: true } }), /must be 7z\.exe/i);
  assert.throws(() => buildSevenZipCommand({ ...base, executable: { path: String.raw`C:\Tools\7z.exe`, trusted: false } }), /explicitly trusted/i);
  assert.throws(() => buildSevenZipCommand({ ...base, sourceDirectory: '.' }), /absolute/i);
  assert.throws(() => buildSevenZipCommand({ ...base, outputArchive: String.raw`C:\out\bundle.7z` }), /\.zip extension/i);
});
