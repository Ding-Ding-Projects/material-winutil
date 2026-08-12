import assert from 'node:assert/strict';
import test from 'node:test';

const notices = await import(new URL('../../dist/shared/notifications.js', import.meta.url));

function add(state, kind, title, at, extra = {}) {
  return notices.addNotification(state, { kind, text: { title, detail: `${title} detail` }, ...extra }, at);
}

test('records bounded versioned history, order, anchors, auto-dismiss policy, and an announcement once', () => {
  let state = notices.createNotificationState('bottom-left');
  state = add(state, 'info', 'First', 10);
  state = add(state, 'warning', 'Watch', 20, { actions: [{ id: 'retry', label: 'Retry' }], links: [{ label: 'Help', href: 'https://example.com/help' }] });
  const visible = notices.visibleNotifications(state);
  assert.deepEqual(visible.map((item) => [item.id, item.stackOrder, item.autoDismissMs, item.anchor]), [['notice-2', 0, null, 'bottom-left'], ['notice-1', 1, 6000, 'bottom-left']]);
  assert.match(visible[0].liveAnnouncement, /Watch\. Watch detail/);
  state = notices.markNotificationAnnounced(state, 'notice-2');
  assert.equal(notices.visibleNotifications(state)[0].liveAnnouncement, null);
  assert.equal(notices.autoDismissMs('success'), 5000);
  assert.equal(notices.autoDismissMs('progress'), 8000);
  assert.equal(notices.autoDismissMs('error'), null);
});

test('dismissal keeps reviewable history and restart parsing preserves stable records', () => {
  let state = add(notices.createNotificationState(), 'error', 'Cannot start', 10);
  state = notices.dismissNotification(state, 'notice-1');
  assert.equal(notices.visibleNotifications(state).length, 0);
  assert.equal(notices.searchNotifications(state, { reviews: ['dismissed'] }).length, 1);
  const restart = notices.parseNotificationStateJson(notices.serializeNotificationState(state));
  assert.deepEqual(restart, state);
  assert.equal(notices.setNotificationReview(restart, 'notice-1', 'read').entries[0].review, 'read');
});

test('search, filters, pagination, click/toggle/shift-range, select-all and inverse compose', () => {
  let state = notices.createNotificationState();
  state = add(state, 'info', 'Alpha', 10); state = add(state, 'error', 'Bravo', 20); state = add(state, 'warning', 'Alpha warning', 30); state = add(state, 'success', 'Delta', 40);
  const match = notices.searchNotifications(state, { text: 'alpha' });
  assert.deepEqual(match.map((record) => record.id), ['notice-3', 'notice-1']);
  const page = notices.pageNotifications(state, {}, 0, 2);
  let selection = notices.createNotificationSelection();
  selection = notices.selectNotification(selection, page.items.map((x) => x.id), 'notice-4');
  selection = notices.selectNotification(selection, page.items.map((x) => x.id), 'notice-3', 'toggle');
  assert.deepEqual(selection.ids, ['notice-4', 'notice-3']);
  selection = notices.selectNotification(selection, state.entries.map((x) => x.id), 'notice-1', 'range');
  assert.deepEqual(selection.ids, ['notice-3', 'notice-2', 'notice-1']);
  selection = notices.selectAllNotifications(selection, page, match, 'every-match');
  assert.equal(selection.ids.includes('notice-1'), true);
  selection = notices.invertNotificationSelection(selection, match);
  assert.deepEqual(selection.ids, []);
});

test('bulk operations disclose selected, will-change and excluded counts with no silent skips', () => {
  let state = notices.createNotificationState();
  state = add(state, 'info', 'One', 1); state = add(state, 'error', 'Two', 2); state = notices.dismissNotification(state, 'notice-1');
  const selected = Object.freeze({ ids: Object.freeze(['notice-2', 'notice-1']), anchorId: 'notice-2' });
  const current = notices.pageNotifications(state, {}, 0, 1).items;
  const preview = notices.previewBulkDismiss(state, selected, current, 'current-page');
  assert.deepEqual({ selected: preview.selected, willChange: preview.willChange, excluded: preview.excluded }, { selected: 2, willChange: 1, excluded: 1 });
  const dismissed = notices.applyBulkDismiss(state, selected, current, 'current-page');
  assert.deepEqual(dismissed.changedIds, ['notice-2']);
  assert.deepEqual(dismissed.excludedIds, ['notice-1']);
  const exported = notices.exportNotifications(state, selected, notices.searchNotifications(state), 'every-match');
  assert.equal(exported.preview.willChange, 2);
  assert.equal(exported.records.length, 2);
  assert.throws(() => notices.applyConfirmedBulkDelete(state, selected, current, 'current-page', false), /super-confirmation/);
  const deleted = notices.applyConfirmedBulkDelete(state, selected, current, 'current-page', true);
  assert.equal(deleted.state.entries.length, 1);
  assert.deepEqual(deleted.excludedIds, ['notice-1']);
});

test('rejects unsafe persistent shapes, unsafe descriptors, duplicates, bounds, and invalid inputs', () => {
  const base = JSON.parse(notices.serializeNotificationState(add(notices.createNotificationState(), 'info', 'Safe', 1)));
  assert.throws(() => notices.parseNotificationStateJson('{"__proto__":{},"schemaVersion":1}'), /unsafe key|invalid shape/);
  assert.throws(() => notices.parseNotificationStateJson('{"schemaVersion":1,"schemaVersion":1}'), /duplicate key/);
  assert.throws(() => notices.parseNotificationStateJson(' '.repeat(notices.NOTIFICATION_LIMITS.jsonBytes + 1)), /byte limit/);
  assert.throws(() => notices.parseNotificationStateJson(Uint8Array.from([0xc3, 0x28])), /UTF-8/);
  assert.throws(() => notices.validateNotificationState({ ...base, entries: [...base.entries, base.entries[0]] }), /unique/);
  assert.throws(() => add(notices.createNotificationState(), 'info', 'Bad', 1, { links: [{ label: 'bad', href: 'javascript:alert(1)' }] }), /HTTPS/);
  assert.throws(() => add(notices.createNotificationState(), 'info', 'Bad', 1, { actions: [{ id: 'bad id', label: 'Bad' }] }), /invalid/);
  let full = notices.createNotificationState(); for (let index = 0; index < notices.NOTIFICATION_LIMITS.maxEntries; index += 1) full = add(full, 'info', `n${index}`, index);
  assert.throws(() => add(full, 'info', 'overflow', notices.NOTIFICATION_LIMITS.maxEntries + 1), /history is full/);
});

test('facts are immutable and preserve caller-supplied localized/funny framing facts', () => {
  const facts = notices.notificationFacts({ title: 'Delete 3 notices', detail: 'These records will be removed after confirmation.' });
  assert.equal(Object.isFrozen(facts), true);
  assert.equal(facts.title, 'Delete 3 notices');
  assert.match(facts.detail, /after confirmation/);
});
