import assert from 'node:assert/strict';
import test from 'node:test';

const history = await import(new URL('../../dist/shared/history-manager.js', import.meta.url));

const auth = Object.freeze({ method: 'password', verifierReference: 'history-manager-primary', proof: 'ephemeral-proof' });

function harness(overrides = {}) {
  let sequence = 0;
  let tick = 0;
  const appended = [];
  const manager = new history.HistoryManagerCore({
    verify: async ({ verifierReference, proof }) => verifierReference === 'history-manager-primary' && proof === 'ephemeral-proof',
    append: async (revision) => { appended.push(revision); },
    now: () => new Date(Date.UTC(2026, 7, 1 + tick++)),
    createId: () => `revision-${++sequence}`,
    ...overrides,
  });
  return { manager, appended };
}

async function seed(manager) {
  const first = await manager.appendMutation({
    action: 'created',
    stableRecordId: 'record-alpha',
    snapshot: { title: 'First', state: 'open' },
    metadata: { summary: 'Created First document' },
  });
  const second = await manager.appendMutation({
    action: 'updated',
    stableRecordId: 'record-alpha',
    snapshot: { title: 'First', state: 'closed' },
    metadata: { summary: 'Closed First document' },
  });
  const third = await manager.appendMutation({
    action: 'settings-changed',
    stableRecordId: 'settings-main',
    snapshot: { theme: 'dark' },
    metadata: { summary: 'Changed theme' },
  });
  return { first, second, third };
}

test('every mutation appends a child revision without rewriting earlier revisions', async () => {
  const { manager, appended } = harness();
  const { first, second, third } = await seed(manager);
  assert.deepEqual(appended.map((entry) => entry.id), ['revision-1', 'revision-2', 'revision-3']);
  assert.equal(first.parentId, null);
  assert.equal(second.parentId, first.id);
  assert.equal(third.parentId, second.id);
  assert.equal(manager.document().revisions.length, 3);
  assert.equal(manager.document().revisions[0].snapshot.state, 'open');
});

test('restore is a new child and retains the source snapshot and stable encryption AAD', async () => {
  const { manager } = harness();
  const { first, third } = await seed(manager);
  const restored = await manager.restore(auth, first.id);
  assert.equal(restored.action, 'restored');
  assert.equal(restored.parentId, third.id);
  assert.equal(restored.sourceRevisionId, first.id);
  assert.equal(restored.metadata.restoredFrom, first.id);
  assert.deepEqual(restored.snapshot, first.snapshot);
  assert.equal(restored.encryptionAad, first.encryptionAad);
  assert.equal(manager.document().revisions.length, 4);
});

test('plain text, bounded regex, date range, and multi-action filters compose', async () => {
  const { manager } = harness();
  await seed(manager);
  const result = await manager.browse(auth, {
    query: 'first',
    regex: { source: 'closed', flags: 'iu' },
    actions: ['updated', 'created'],
    dateRange: { start: '2026-08-02', end: '2026-08-02' },
    limit: 10,
  });
  assert.equal(result.totalMatches, 1);
  assert.equal(result.revisions[0].action, 'updated');
  assert.equal('snapshot' in result.revisions[0], false);
  await assert.rejects(manager.browse(auth, { regex: { source: '(a+)+$', flags: 'i' } }), /unsafe construct/i);
  await assert.rejects(manager.browse(auth, { limit: history.HISTORY_MANAGER_LIMITS.resultLimit + 1 }), /limit must be between/i);
});

test('action filters are derived from history, counted, sorted, and independently selected', async () => {
  const { manager } = harness();
  await seed(manager);
  await manager.appendMutation({ action: 'updated', stableRecordId: 'record-beta', snapshot: {}, metadata: {} });
  const result = await manager.browse(auth, { actions: ['updated', 'created'] });
  assert.deepEqual(result.actionFilters, [
    { action: 'created', count: 1, selected: true },
    { action: 'settings-changed', count: 1, selected: false },
    { action: 'updated', count: 2, selected: true },
  ]);
  assert.equal(result.totalMatches, 3);
});

test('manager access accepts password, PIN, or TOTP through injected verifier references only', async () => {
  const seen = [];
  const { manager } = harness({
    verify: async (context) => { seen.push(context); return context.verifierReference === 'allowed' && context.proof === 'one-time'; },
  });
  await manager.appendMutation({ action: 'created', stableRecordId: 'record-auth', snapshot: {}, metadata: {} });
  await assert.rejects(manager.browse({ method: 'pin', verifierReference: 'wrong', proof: 'one-time' }), /did not match/i);
  await assert.rejects(manager.browse({ method: 'totp', verifierReference: '', proof: '' }), /authentication is required/i);
  await manager.browse({ method: 'totp', verifierReference: 'allowed', proof: 'one-time' });
  assert.equal(seen.at(-1).method, 'totp');
  assert.equal(JSON.stringify(manager.document()).includes('one-time'), false);
  assert.equal(JSON.stringify(manager.document()).includes('allowed'), false);
});

test('diffs are bounded to redacted state and labels append their own revision', async () => {
  const { manager } = harness();
  const { first, second, third } = await seed(manager);
  assert.deepEqual(await manager.diff(auth, first.id, second.id), [
    { path: '$.state', kind: 'changed', before: 'open', after: 'closed' },
  ]);
  const labeled = await manager.label(auth, first.id, 'Before close');
  assert.equal(labeled.action, 'labeled');
  assert.equal(labeled.parentId, third.id);
  assert.equal(labeled.sourceRevisionId, first.id);
  assert.equal(manager.document().revisions[0].label, undefined);
});

test('retention preview protects labels and prune records its decision without deletion', async () => {
  const { manager } = harness();
  const { first } = await seed(manager);
  await manager.label(auth, first.id, 'Keep this point');
  const before = manager.document().revisions.map((entry) => entry.id);
  const candidates = manager.retentionCandidates({ maximumRevisions: 2, keepLabeled: true }, new Date('2026-08-20T00:00:00.000Z'));
  assert.deepEqual(candidates, ['revision-1', 'revision-2']);
  const pruned = await manager.prune(auth, { maximumRevisions: 2, keepLabeled: true });
  assert.equal(pruned.action, 'pruned');
  assert.deepEqual(pruned.metadata.candidateRevisionIds, candidates);
  assert.deepEqual(manager.document().revisions.slice(0, before.length).map((entry) => entry.id), before);
  assert.equal(manager.document().revisions.length, before.length + 1);
});

test('sensitive fields, unsafe keys, authentication URIs, and unstable AAD fail closed', async () => {
  const { manager } = harness();
  await assert.rejects(manager.appendMutation({ action: 'created', stableRecordId: 'record-safe', snapshot: { accessToken: 'redacted' } }), /sensitive field/i);
  await assert.rejects(manager.appendMutation({ action: 'created', stableRecordId: 'record-safe', snapshot: { note: 'otpauth://totp/not-allowed' } }), /authentication secrets/i);
  const unsafe = Object.create(null);
  Object.defineProperty(unsafe, '__proto__', { enumerable: true, value: 'nope' });
  await assert.rejects(manager.appendMutation({ action: 'created', stableRecordId: 'record-safe', snapshot: unsafe }), /unsafe key/i);
  assert.throws(() => history.validateHistoryManagerDocument({
    schemaVersion: 1,
    revisions: [{
      id: 'revision-1', parentId: null, stableRecordId: 'record-safe', encryptionAad: 'changed-aad',
      action: 'created', recordedAt: '2026-08-01T00:00:00.000Z', metadata: {}, snapshot: {},
    }],
  }), /encryptionAad is not stable/i);
});

test('an interrupted history append preserves the primary result and yields visible recovery', async () => {
  const { manager } = harness({ append: async () => { throw new Error('simulated interrupted commit'); } });
  let primaryCompleted = false;
  const result = await manager.runMutation(async () => {
    primaryCompleted = true;
    return { saved: true };
  }, { action: 'updated', stableRecordId: 'record-primary', snapshot: { state: 'saved' } });
  assert.equal(primaryCompleted, true);
  assert.deepEqual(result.value, { saved: true });
  assert.equal(result.revision, undefined);
  assert.equal(result.recovery.visible, true);
  assert.equal(result.recovery.kind, 'history-write-failed');
  assert.equal(result.recovery.recoveryAction, 'open-history-manager');
  assert.match(result.recovery.detail, /simulated interrupted commit/i);
  assert.equal(manager.document().revisions.length, 0);
});

test('date input preserves empty, partial, invalid, and valid typed states', () => {
  assert.deepEqual(history.parseHistoryDateInput(''), { state: 'empty', value: '' });
  assert.deepEqual(history.parseHistoryDateInput('2026-08-'), { state: 'partial', value: '2026-08-' });
  assert.deepEqual(history.parseHistoryDateInput('2026-02-30'), {
    state: 'invalid', value: '2026-02-30', message: 'Enter a complete calendar date as YYYY-MM-DD.',
  });
  assert.deepEqual(history.parseHistoryDateInput('2026-08-12'), { state: 'valid', value: '2026-08-12', isoDate: '2026-08-12' });
});

test('redacted export states omissions and excludes snapshots, proofs, keys, and verifier references', async () => {
  const { manager } = harness();
  await seed(manager);
  const exported = await manager.exportRedacted(auth, { actions: ['updated'] });
  assert.deepEqual(exported.omissions, ['snapshot contents', 'credentials and verifier proofs', 'encryption keys']);
  assert.equal(exported.revisions.length, 1);
  assert.equal('snapshot' in exported.revisions[0], false);
  const serialized = JSON.stringify(exported);
  assert.doesNotMatch(serialized, /ephemeral-proof|history-manager-primary|"theme":"dark"/i);
  assert.match(serialized, /snapshot contents/);
});

test('discard and bulk actions each append ordinary revisions with truthful batch metadata', async () => {
  const { manager } = harness();
  const discarded = await manager.discard(auth, 'record-discarded');
  assert.equal(discarded.action, 'document-discarded');
  const bulk = await manager.bulk(auth, [
    { action: 'updated', stableRecordId: 'record-a', snapshot: { enabled: true } },
    { action: 'deleted', stableRecordId: 'record-b', snapshot: null },
  ]);
  assert.deepEqual(bulk.map((entry) => ({ ...entry.metadata })), [
    { bulkIndex: 0, bulkSize: 2 },
    { bulkIndex: 1, bulkSize: 2 },
  ]);
  assert.equal(bulk[0].parentId, discarded.id);
  assert.equal(bulk[1].parentId, bulk[0].id);
});

test('exact versioned parser rejects duplicate, unknown, unsafe, malformed, and over-bound input', () => {
  assert.deepEqual(history.parseHistoryManagerDocument('{"schemaVersion":1,"revisions":[]}'), { schemaVersion: 1, revisions: [] });
  assert.throws(() => history.parseHistoryManagerDocument('{"schemaVersion":1,"schemaVersion":1,"revisions":[]}'), /duplicate key/i);
  assert.throws(() => history.parseHistoryManagerDocument('{"schemaVersion":1,"revisions":[],"extra":true}'), /unexpected field/i);
  assert.throws(() => history.parseHistoryManagerDocument('{"schemaVersion":1,"revisions":[],"__proto__":{}}'), /unsafe key/i);
  assert.throws(() => history.parseHistoryManagerDocument('{nope'), /malformed/i);
  assert.throws(() => history.parseHistoryManagerDocument('{"schemaVersion":2,"revisions":[]}'), /unsupported.*version/i);
  assert.throws(() => history.parseHistoryManagerDocument(' '.repeat(history.HISTORY_MANAGER_LIMITS.jsonBytes + 1)), /byte limit/i);
  assert.throws(() => history.parseHistoryManagerDocument(Uint8Array.from([0xc3, 0x28])), /UTF-8/i);
});
