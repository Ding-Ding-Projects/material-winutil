import assert from 'node:assert/strict';
import test from 'node:test';

const tabs = await import(new URL('../../dist/shared/tabs.js', import.meta.url));
const LOCATION = { workspaceId: 'workspace.one', windowId: 'window.one', stripId: 'strip.one' };

const decoration = (overrides = {}) => ({
  icon: null, badge: null, foreground: null, background: null, ...overrides,
});

function tab(id, label, overrides = {}) {
  return { id, label, pinned: false, locked: false, unsaved: false, groupId: null, decoration: decoration(), ...overrides };
}

function descriptor(query = '', mode = 'plain', flags = '') {
  return { mode, query, flags };
}

function fixture() {
  return tabs.validateTabWorkspaceState({
    schemaVersion: 1,
    dock: 'left',
    activeWorkspaceId: 'workspace.one',
    workspaces: [{
      id: 'workspace.one',
      label: 'Workspace One',
      activeWindowId: 'window.one',
      windows: [{
        id: 'window.one',
        label: 'Window One',
        activeStripId: 'strip.one',
        strips: [{
          id: 'strip.one',
          label: 'Primary strip',
          activeTabId: 'tab.docs',
          focusTabId: 'tab.docs',
          tabOrder: ['tab.pin', 'tab.docs', 'tab.settings', 'tab.danger', 'tab.loose'],
          tabs: [
            tab('tab.pin', 'Pinned guide', { pinned: true }),
            tab('tab.docs', 'Docs home', { groupId: 'group.docs' }),
            tab('tab.settings', 'Docs settings', { groupId: 'group.docs', unsaved: true }),
            tab('tab.danger', 'Danger tools', { groupId: 'group.tools', locked: true }),
            tab('tab.loose', 'Loose page'),
          ],
          groups: [
            { id: 'group.docs', label: 'Documentation', color: '#0061a4', collapsed: true, tabIds: ['tab.docs', 'tab.settings'], decoration: decoration({ badge: '2' }) },
            { id: 'group.tools', label: 'Tools', color: '#725573', collapsed: false, tabIds: ['tab.danger'], decoration: decoration() },
          ],
          searches: {
            strip: descriptor(), groups: descriptor(), master: descriptor(),
            group: [
              { groupId: 'group.docs', descriptor: descriptor() },
              { groupId: 'group.tools', descriptor: descriptor() },
            ],
          },
        }],
      }],
    }, {
      id: 'workspace.two',
      label: 'Workspace Two',
      activeWindowId: 'window.two',
      windows: [{
        id: 'window.two', label: 'Window Two', activeStripId: 'strip.two',
        strips: [{
          id: 'strip.two', label: 'Secondary strip', activeTabId: 'tab.other', focusTabId: 'tab.other',
          tabOrder: ['tab.other'], tabs: [tab('tab.other', 'Docs elsewhere')], groups: [],
          searches: { strip: descriptor(), groups: descriptor(), master: descriptor(), group: [] },
        }],
      }],
    }],
  });
}

function strip(state = fixture()) {
  return state.workspaces[0].windows[0].strips[0];
}

test('defaults to a persistent left dock and round-trips every edge with stable metadata', () => {
  const empty = tabs.createDefaultTabWorkspaceState();
  assert.equal(empty.dock, 'left');
  for (const dock of ['left', 'right', 'top', 'bottom']) {
    const changed = tabs.setTabDock(fixture(), dock);
    const restored = tabs.parseTabWorkspaceJson(tabs.serializeTabWorkspaceState(changed));
    assert.equal(restored.dock, dock);
    assert.deepEqual(restored.workspaces, changed.workspaces);
  }
});

test('group, membership, order, decoration, pinning, and removal transitions remain consistent', () => {
  let state = tabs.createTabGroup(fixture(), LOCATION, {
    id: 'group.new', label: 'New group', color: '#123456', collapsed: true,
    decoration: decoration({ icon: 'folder' }),
  });
  state = tabs.renameTabGroup(state, LOCATION, 'group.new', 'Renamed group');
  state = tabs.moveTabIntoGroup(state, LOCATION, 'tab.loose', 'group.new');
  state = tabs.reorderTabGroup(state, LOCATION, 'group.new', 0);
  state = tabs.pinTab(state, LOCATION, 'tab.loose');
  assert.deepEqual(strip(state).tabOrder.slice(0, 2), ['tab.pin', 'tab.loose']);
  assert.deepEqual(strip(state).groups[0], {
    id: 'group.new', label: 'Renamed group', color: '#123456', collapsed: true,
    tabIds: ['tab.loose'], decoration: decoration({ icon: 'folder' }),
  });
  state = tabs.reorderTab(state, LOCATION, 'tab.loose', 0);
  assert.deepEqual(strip(state).tabOrder.slice(0, 2), ['tab.loose', 'tab.pin']);
  state = tabs.unpinTab(state, LOCATION, 'tab.loose');
  assert.equal(strip(state).tabOrder[1], 'tab.loose');
  state = tabs.removeTabGroup(state, LOCATION, 'group.new');
  assert.equal(strip(state).tabs.find((item) => item.id === 'tab.loose').groupId, null);
  assert.equal(strip(state).searches.group.some((item) => item.groupId === 'group.new'), false);
});

test('all four discovery searches own independent persisted state and contextual results', () => {
  let state = fixture();
  state = tabs.setDiscoverySearch(state, { scope: 'strip', location: LOCATION }, descriptor('Docs'));
  state = tabs.setDiscoverySearch(state, { scope: 'groups', location: LOCATION }, descriptor('^Doc', 'regex', 'i'));
  state = tabs.setDiscoverySearch(state, { scope: 'group', location: LOCATION, groupId: 'group.docs' }, descriptor('settings'));
  state = tabs.setDiscoverySearch(state, { scope: 'master' }, descriptor('elsewhere'));

  assert.deepEqual(strip(state).searches.strip, descriptor('Docs'));
  assert.deepEqual(strip(state).searches.groups, descriptor('^Doc', 'regex', 'i'));
  assert.deepEqual(strip(state).searches.group[0].descriptor, descriptor('settings'));
  assert.deepEqual(strip(state).searches.master, descriptor('elsewhere'));

  const current = tabs.searchTabWorkspace(state, { scope: 'strip', location: LOCATION });
  assert.deepEqual(current.results.map((item) => item.tabId), ['tab.docs', 'tab.settings']);
  assert.deepEqual(current.results[0], {
    kind: 'tab', workspaceId: 'workspace.one', windowId: 'window.one', stripId: 'strip.one',
    tabId: 'tab.docs', groupId: 'group.docs', pinned: false, label: 'Docs home', groupCollapsed: true,
  });
  assert.deepEqual(tabs.searchTabWorkspace(state, { scope: 'groups', location: LOCATION }).results.map((item) => item.groupId), ['group.docs']);
  assert.deepEqual(tabs.searchTabWorkspace(state, { scope: 'group', location: LOCATION, groupId: 'group.docs' }).results.map((item) => item.tabId), ['tab.settings']);
  assert.deepEqual(tabs.searchTabWorkspace(state, { scope: 'master' }).results.map((item) => item.tabId), ['tab.other']);
  assert.deepEqual(tabs.parseTabWorkspaceJson(tabs.serializeTabWorkspaceState(state)).workspaces, state.workspaces);
});

test('invalid regular expressions report inline and revealing collapsed results preserves preference', () => {
  let state = tabs.setDiscoverySearch(fixture(), { scope: 'strip', location: LOCATION }, descriptor('[', 'regex'));
  assert.deepEqual(tabs.searchTabWorkspace(state, { scope: 'strip', location: LOCATION }), {
    status: 'invalid', descriptor: descriptor('[', 'regex'), error: 'The regular expression is invalid.', results: [],
  });
  state = tabs.setDiscoverySearch(state, { scope: 'strip', location: LOCATION }, descriptor('Docs home'));
  const result = tabs.searchTabWorkspace(state, { scope: 'strip', location: LOCATION }).results[0];
  const revealed = tabs.revealDiscoveryResult(state, result);
  assert.equal(revealed.instruction.temporarilyExpandGroup, true);
  assert.equal(revealed.instruction.preserveCollapsedPreference, true);
  assert.equal(strip(revealed.state).groups.find((group) => group.id === 'group.docs').collapsed, true);
  assert.deepEqual(revealed.state, state);
});

test('bulk-close preview rejects empty and invalid input, and containing/not-containing are exact inverses', () => {
  assert.throws(() => tabs.buildBulkClosePreview(fixture(), LOCATION, { mode: 'containing', descriptor: descriptor() }), /non-empty/i);
  assert.throws(() => tabs.buildBulkClosePreview(fixture(), LOCATION, { mode: 'containing', descriptor: descriptor('[', 'regex') }), /regular expression/i);

  const containing = tabs.buildBulkClosePreview(fixture(), LOCATION, { mode: 'containing', descriptor: descriptor('Docs') });
  const inverse = tabs.buildBulkClosePreview(fixture(), LOCATION, { mode: 'not-containing', descriptor: descriptor('Docs') });
  assert.deepEqual(containing.closingTabIds, ['tab.docs', 'tab.settings']);
  assert.deepEqual(containing.unsavedTabIds, ['tab.settings']);
  assert.deepEqual(inverse.closingTabIds, ['tab.loose']);
  assert.deepEqual(inverse.excludedPinnedTabIds, ['tab.pin']);
  assert.deepEqual(inverse.excludedLockedTabIds, ['tab.danger']);
  assert.equal(containing.totalMatched + inverse.totalMatched, strip().tabs.length);

  const included = tabs.buildBulkClosePreview(fixture(), LOCATION, {
    mode: 'not-containing', descriptor: descriptor('Docs'), includePinned: true, includeLocked: true,
  });
  assert.deepEqual(included.closingTabIds, ['tab.pin', 'tab.danger', 'tab.loose']);
});

test('bulk close protects unsaved tabs until confirmed and focuses the deterministic right then left neighbor', () => {
  const preview = tabs.buildBulkClosePreview(fixture(), LOCATION, { mode: 'containing', descriptor: descriptor('Docs') });
  const protectedResult = tabs.executeBulkClose(fixture(), preview);
  assert.deepEqual(protectedResult.closedTabIds, ['tab.docs']);
  assert.deepEqual(protectedResult.protectedUnsavedTabIds, ['tab.settings']);
  assert.equal(protectedResult.focusedTabId, 'tab.settings');
  assert.equal(strip(protectedResult.state).activeTabId, 'tab.settings');

  const confirmed = tabs.executeBulkClose(fixture(), preview, ['tab.settings']);
  assert.deepEqual(confirmed.closedTabIds, ['tab.docs', 'tab.settings']);
  assert.equal(confirmed.focusedTabId, 'tab.danger');
  assert.equal(strip(confirmed.state).activeTabId, 'tab.danger');

  const lastFocused = JSON.parse(tabs.serializeTabWorkspaceState(fixture()));
  lastFocused.workspaces[0].windows[0].strips[0].focusTabId = 'tab.loose';
  lastFocused.workspaces[0].windows[0].strips[0].activeTabId = 'tab.loose';
  const lastState = tabs.validateTabWorkspaceState(lastFocused);
  const lastPreview = tabs.buildBulkClosePreview(lastState, LOCATION, {
    mode: 'containing', descriptor: descriptor('Loose'),
  });
  const lastResult = tabs.executeBulkClose(lastState, lastPreview);
  assert.equal(lastResult.focusedTabId, 'tab.danger');
  assert.equal(strip(lastResult.state).activeTabId, 'tab.danger');
});

test('move-into-group picker exposes real data, search, create route, and empty states', () => {
  const all = tabs.buildMoveIntoGroupPicker(fixture(), LOCATION, descriptor());
  assert.equal(all.status, 'ready');
  assert.deepEqual(all.items.map((item) => [item.label, item.memberCount]), [['Documentation', 2], ['Tools', 1]]);
  assert.equal(all.canCreate, true);
  const filtered = tabs.buildMoveIntoGroupPicker(fixture(), LOCATION, descriptor('tool'));
  assert.deepEqual(filtered.items.map((item) => item.groupId), ['group.tools']);
  assert.equal(filtered.suggestedNewGroupLabel, 'tool');
  assert.equal(tabs.buildMoveIntoGroupPicker(fixture(), LOCATION, descriptor('missing')).status, 'no-match');

  const empty = tabs.createDefaultTabWorkspaceState();
  const emptyLocation = { workspaceId: 'workspace.default', windowId: 'window.default', stripId: 'strip.default' };
  assert.equal(tabs.buildMoveIntoGroupPicker(empty, emptyLocation, descriptor()).status, 'empty');
  assert.equal(tabs.buildMoveIntoGroupPicker(fixture(), LOCATION, descriptor('[', 'regex')).status, 'invalid');
});

test('roving focus follows each dock axis, supports Home/End, wraps, and skips hidden collapsed members', () => {
  for (const dock of ['left', 'right']) {
    const state = tabs.setTabDock(fixture(), dock);
    const wrongAxis = tabs.moveRovingTabFocus(state, LOCATION, 'ArrowRight');
    assert.equal(wrongAxis.orientation, 'vertical');
    assert.equal(wrongAxis.handled, false);
    const next = tabs.moveRovingTabFocus(state, LOCATION, 'ArrowDown');
    assert.equal(next.focusedTabId, 'tab.danger');
  }
  for (const dock of ['top', 'bottom']) {
    const state = tabs.setTabDock(fixture(), dock);
    const wrongAxis = tabs.moveRovingTabFocus(state, LOCATION, 'ArrowDown');
    assert.equal(wrongAxis.orientation, 'horizontal');
    assert.equal(wrongAxis.handled, false);
    const next = tabs.moveRovingTabFocus(state, LOCATION, 'ArrowRight');
    assert.equal(next.focusedTabId, 'tab.danger');
  }
  assert.equal(tabs.moveRovingTabFocus(fixture(), LOCATION, 'Home').focusedTabId, 'tab.pin');
  assert.equal(tabs.moveRovingTabFocus(fixture(), LOCATION, 'End').focusedTabId, 'tab.loose');
});

test('versioned parser rejects bounds, unsafe keys, duplicates, and inconsistent structural references', () => {
  const base = JSON.parse(tabs.serializeTabWorkspaceState(fixture()));
  assert.throws(() => tabs.parseTabWorkspaceJson('{'), /malformed/i);
  assert.throws(() => tabs.parseTabWorkspaceJson(' '.repeat(tabs.TAB_WORKSPACE_LIMITS.jsonBytes + 1)), /byte limit/i);
  assert.throws(() => tabs.parseTabWorkspaceJson(Uint8Array.from([0xc3, 0x28])), /UTF-8/i);
  assert.throws(() => tabs.validateTabWorkspaceState({ ...base, schemaVersion: 2 }), /version/i);
  assert.throws(() => tabs.parseTabWorkspaceJson(tabs.serializeTabWorkspaceState(fixture()).replace('"dock":"left"', '"__proto__":{},"dock":"left"')), /unsafe/i);
  assert.throws(() => tabs.validateTabWorkspaceState({ ...base, mystery: true }), /unexpected/i);

  const duplicateTab = structuredClone(base);
  duplicateTab.workspaces[1].windows[0].strips[0].tabs[0].id = 'tab.docs';
  duplicateTab.workspaces[1].windows[0].strips[0].tabOrder[0] = 'tab.docs';
  duplicateTab.workspaces[1].windows[0].strips[0].activeTabId = 'tab.docs';
  duplicateTab.workspaces[1].windows[0].strips[0].focusTabId = 'tab.docs';
  assert.throws(() => tabs.validateTabWorkspaceState(duplicateTab), /duplicate tab/i);

  const brokenMembership = structuredClone(base);
  brokenMembership.workspaces[0].windows[0].strips[0].groups[0].tabIds.reverse();
  assert.throws(() => tabs.validateTabWorkspaceState(brokenMembership), /group order/i);
});
