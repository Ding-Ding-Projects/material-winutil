/** Framework-neutral, bounded tab-workspace state and transition model. */

export const TAB_WORKSPACE_SCHEMA_VERSION = 1 as const;
export const TAB_WORKSPACE_LIMITS = Object.freeze({
  jsonBytes: 256 * 1024,
  workspaces: 16,
  windowsPerWorkspace: 16,
  stripsPerWindow: 8,
  tabsPerStrip: 256,
  groupsPerStrip: 64,
  identifierCodePoints: 80,
  labelCodePoints: 160,
  queryCodePoints: 512,
  decorationCodePoints: 160,
});

export type TabDock = 'left' | 'right' | 'top' | 'bottom';
export type SearchMode = 'plain' | 'regex';
export type DiscoveryScope = 'strip' | 'group' | 'groups' | 'master';
export type BulkCloseMode = 'containing' | 'not-containing';
export type RovingKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End';

export interface SearchDescriptor {
  mode: SearchMode;
  query: string;
  flags: string;
}

export interface TabDecoration {
  icon: string | null;
  badge: string | null;
  foreground: string | null;
  background: string | null;
}

export interface WorkspaceTab {
  id: string;
  label: string;
  pinned: boolean;
  locked: boolean;
  unsaved: boolean;
  groupId: string | null;
  decoration: TabDecoration;
}

export interface TabGroup {
  id: string;
  label: string;
  color: string;
  collapsed: boolean;
  tabIds: string[];
  decoration: TabDecoration;
}

export interface GroupSearchDescriptor {
  groupId: string;
  descriptor: SearchDescriptor;
}

export interface TabSearchState {
  strip: SearchDescriptor;
  groups: SearchDescriptor;
  master: SearchDescriptor;
  group: GroupSearchDescriptor[];
}

export interface TabStrip {
  id: string;
  label: string;
  activeTabId: string | null;
  focusTabId: string | null;
  tabOrder: string[];
  tabs: WorkspaceTab[];
  groups: TabGroup[];
  searches: TabSearchState;
}

export interface TabWindow {
  id: string;
  label: string;
  activeStripId: string;
  strips: TabStrip[];
}

export interface TabWorkspace {
  id: string;
  label: string;
  activeWindowId: string;
  windows: TabWindow[];
}

export interface TabWorkspaceState {
  schemaVersion: typeof TAB_WORKSPACE_SCHEMA_VERSION;
  dock: TabDock;
  activeWorkspaceId: string;
  workspaces: TabWorkspace[];
}

export interface StripLocation {
  workspaceId: string;
  windowId: string;
  stripId: string;
}

export interface DiscoveryTarget {
  scope: DiscoveryScope;
  location?: StripLocation;
  groupId?: string;
}

export interface DiscoveryResult {
  kind: 'tab' | 'group';
  workspaceId: string;
  windowId: string;
  stripId: string;
  tabId: string | null;
  groupId: string | null;
  pinned: boolean;
  label: string;
  groupCollapsed: boolean;
}

export interface DiscoveryResponse {
  status: 'ready' | 'empty' | 'invalid';
  descriptor: SearchDescriptor;
  error: string | null;
  results: DiscoveryResult[];
}

export interface RevealInstruction {
  workspaceId: string;
  windowId: string;
  stripId: string;
  tabId: string | null;
  groupId: string | null;
  temporarilyExpandGroup: boolean;
  preserveCollapsedPreference: true;
}

export interface BulkCloseOptions {
  mode: BulkCloseMode;
  descriptor: SearchDescriptor;
  includePinned?: boolean;
  includeLocked?: boolean;
}

export interface BulkClosePreview {
  location: StripLocation;
  mode: BulkCloseMode;
  descriptor: SearchDescriptor;
  totalMatched: number;
  closingTabIds: string[];
  unsavedTabIds: string[];
  excludedPinnedTabIds: string[];
  excludedLockedTabIds: string[];
}

export interface BulkCloseResult {
  state: TabWorkspaceState;
  closedTabIds: string[];
  protectedUnsavedTabIds: string[];
  excludedPinnedTabIds: string[];
  excludedLockedTabIds: string[];
  focusedTabId: string | null;
}

export interface MoveIntoGroupPickerItem {
  groupId: string;
  label: string;
  color: string;
  memberCount: number;
  collapsed: boolean;
}

export interface MoveIntoGroupPickerData {
  status: 'ready' | 'empty' | 'no-match' | 'invalid';
  error: string | null;
  items: MoveIntoGroupPickerItem[];
  canCreate: true;
  suggestedNewGroupLabel: string | null;
}

export interface RovingFocusResult {
  state: TabWorkspaceState;
  orientation: 'horizontal' | 'vertical';
  handled: boolean;
  focusedTabId: string | null;
}

const ROOT_FIELDS = new Set(['schemaVersion', 'dock', 'activeWorkspaceId', 'workspaces']);
const WORKSPACE_FIELDS = new Set(['id', 'label', 'activeWindowId', 'windows']);
const WINDOW_FIELDS = new Set(['id', 'label', 'activeStripId', 'strips']);
const STRIP_FIELDS = new Set(['id', 'label', 'activeTabId', 'focusTabId', 'tabOrder', 'tabs', 'groups', 'searches']);
const TAB_FIELDS = new Set(['id', 'label', 'pinned', 'locked', 'unsaved', 'groupId', 'decoration']);
const GROUP_FIELDS = new Set(['id', 'label', 'color', 'collapsed', 'tabIds', 'decoration']);
const DECORATION_FIELDS = new Set(['icon', 'badge', 'foreground', 'background']);
const SEARCHES_FIELDS = new Set(['strip', 'groups', 'master', 'group']);
const SEARCH_FIELDS = new Set(['mode', 'query', 'flags']);
const GROUP_SEARCH_FIELDS = new Set(['groupId', 'descriptor']);
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,78}[A-Za-z0-9])?$/u;
const REGEX_FLAGS_PATTERN = /^[imsuy]*$/u;
const CONTROL_PATTERN = /[\p{Cc}\p{Cf}]/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertOnlyFields(value: Record<string, unknown>, allowed: ReadonlySet<string>, context: string): void {
  for (const key of Object.keys(value)) {
    if (UNSAFE_KEYS.has(key)) throw new TypeError(`${context} contains an unsafe key.`);
    if (!allowed.has(key)) throw new TypeError(`${context} contains an unexpected field: ${key}.`);
  }
}

function codePoints(value: string): number { return Array.from(value).length; }

function boundedText(value: unknown, context: string, maximum: number, allowEmpty = false): string {
  if (
    typeof value !== 'string'
    || (!allowEmpty && value.trim().length === 0)
    || codePoints(value) > maximum
    || CONTROL_PATTERN.test(value)
  ) throw new TypeError(`${context} must be bounded text.`);
  return value;
}

function identifier(value: unknown, context: string): string {
  const result = boundedText(value, context, TAB_WORKSPACE_LIMITS.identifierCodePoints);
  if (!ID_PATTERN.test(result)) throw new TypeError(`${context} is not a stable identifier.`);
  return result;
}

function nullableIdentifier(value: unknown, context: string): string | null {
  return value === null ? null : identifier(value, context);
}

function stringArray(value: unknown, maximum: number, context: string): string[] {
  if (!Array.isArray(value) || value.length > maximum) throw new RangeError(`${context} exceeds its entry limit.`);
  const result = value.map((entry, index) => identifier(entry, `${context}[${index}]`));
  if (new Set(result).size !== result.length) throw new TypeError(`${context} contains duplicate identifiers.`);
  return result;
}

function decoration(value: unknown, context: string): TabDecoration {
  if (!isRecord(value)) throw new TypeError(`${context} must be an object.`);
  assertOnlyFields(value, DECORATION_FIELDS, context);
  const optional = (input: unknown, field: string): string | null => input === null
    ? null
    : boundedText(input, `${context}.${field}`, TAB_WORKSPACE_LIMITS.decorationCodePoints);
  return {
    icon: optional(value.icon, 'icon'),
    badge: optional(value.badge, 'badge'),
    foreground: optional(value.foreground, 'foreground'),
    background: optional(value.background, 'background'),
  };
}

export function createSearchDescriptor(
  query = '',
  mode: SearchMode = 'plain',
  flags = '',
): SearchDescriptor {
  return validateSearchDescriptor({ mode, query, flags });
}

export function validateSearchDescriptor(value: unknown): SearchDescriptor {
  if (!isRecord(value)) throw new TypeError('Search descriptor must be an object.');
  assertOnlyFields(value, SEARCH_FIELDS, 'Search descriptor');
  if (value.mode !== 'plain' && value.mode !== 'regex') throw new TypeError('Search mode is invalid.');
  const query = boundedText(value.query, 'Search query', TAB_WORKSPACE_LIMITS.queryCodePoints, true);
  if (typeof value.flags !== 'string' || !REGEX_FLAGS_PATTERN.test(value.flags)) {
    throw new TypeError('Search flags are invalid.');
  }
  if (new Set(value.flags).size !== value.flags.length) throw new TypeError('Search flags contain duplicates.');
  if (value.mode === 'plain' && value.flags !== '') throw new TypeError('Plain search cannot carry regex flags.');
  return { mode: value.mode, query, flags: value.flags };
}

function defaultDecoration(): TabDecoration {
  return { icon: null, badge: null, foreground: null, background: null };
}

function defaultSearchState(): TabSearchState {
  return {
    strip: createSearchDescriptor(),
    groups: createSearchDescriptor(),
    master: createSearchDescriptor(),
    group: [],
  };
}

export function createDefaultTabWorkspaceState(): TabWorkspaceState {
  return {
    schemaVersion: TAB_WORKSPACE_SCHEMA_VERSION,
    dock: 'left',
    activeWorkspaceId: 'workspace.default',
    workspaces: [{
      id: 'workspace.default',
      label: 'Default workspace',
      activeWindowId: 'window.default',
      windows: [{
        id: 'window.default',
        label: 'Main window',
        activeStripId: 'strip.default',
        strips: [{
          id: 'strip.default', label: 'Main tabs', activeTabId: null, focusTabId: null,
          tabOrder: [], tabs: [], groups: [], searches: defaultSearchState(),
        }],
      }],
    }],
  };
}

function validateTab(value: unknown, context: string): WorkspaceTab {
  if (!isRecord(value)) throw new TypeError(`${context} must be an object.`);
  assertOnlyFields(value, TAB_FIELDS, context);
  if (typeof value.pinned !== 'boolean' || typeof value.locked !== 'boolean' || typeof value.unsaved !== 'boolean') {
    throw new TypeError(`${context} state flags must be boolean.`);
  }
  return {
    id: identifier(value.id, `${context}.id`),
    label: boundedText(value.label, `${context}.label`, TAB_WORKSPACE_LIMITS.labelCodePoints),
    pinned: value.pinned,
    locked: value.locked,
    unsaved: value.unsaved,
    groupId: nullableIdentifier(value.groupId, `${context}.groupId`),
    decoration: decoration(value.decoration, `${context}.decoration`),
  };
}

function validateGroup(value: unknown, context: string): TabGroup {
  if (!isRecord(value)) throw new TypeError(`${context} must be an object.`);
  assertOnlyFields(value, GROUP_FIELDS, context);
  if (typeof value.collapsed !== 'boolean') throw new TypeError(`${context}.collapsed must be boolean.`);
  return {
    id: identifier(value.id, `${context}.id`),
    label: boundedText(value.label, `${context}.label`, TAB_WORKSPACE_LIMITS.labelCodePoints),
    color: boundedText(value.color, `${context}.color`, TAB_WORKSPACE_LIMITS.decorationCodePoints),
    collapsed: value.collapsed,
    tabIds: stringArray(value.tabIds, TAB_WORKSPACE_LIMITS.tabsPerStrip, `${context}.tabIds`),
    decoration: decoration(value.decoration, `${context}.decoration`),
  };
}

function validateSearchState(value: unknown, groupIds: ReadonlySet<string>, context: string): TabSearchState {
  if (!isRecord(value)) throw new TypeError(`${context} must be an object.`);
  assertOnlyFields(value, SEARCHES_FIELDS, context);
  if (!Array.isArray(value.group) || value.group.length > TAB_WORKSPACE_LIMITS.groupsPerStrip) {
    throw new RangeError(`${context}.group exceeds its entry limit.`);
  }
  const seen = new Set<string>();
  const group = value.group.map((entry, index): GroupSearchDescriptor => {
    const entryContext = `${context}.group[${index}]`;
    if (!isRecord(entry)) throw new TypeError(`${entryContext} must be an object.`);
    assertOnlyFields(entry, GROUP_SEARCH_FIELDS, entryContext);
    const groupId = identifier(entry.groupId, `${entryContext}.groupId`);
    if (!groupIds.has(groupId) || seen.has(groupId)) throw new TypeError(`${entryContext} references an invalid or duplicate group.`);
    seen.add(groupId);
    return { groupId, descriptor: validateSearchDescriptor(entry.descriptor) };
  });
  return {
    strip: validateSearchDescriptor(value.strip),
    groups: validateSearchDescriptor(value.groups),
    master: validateSearchDescriptor(value.master),
    group,
  };
}

interface GlobalIds { workspaces: Set<string>; windows: Set<string>; strips: Set<string>; tabs: Set<string>; groups: Set<string> }

function validateStrip(value: unknown, context: string, ids: GlobalIds): TabStrip {
  if (!isRecord(value)) throw new TypeError(`${context} must be an object.`);
  assertOnlyFields(value, STRIP_FIELDS, context);
  const id = identifier(value.id, `${context}.id`);
  if (ids.strips.has(id)) throw new TypeError(`Duplicate strip identifier: ${id}.`);
  ids.strips.add(id);
  if (!Array.isArray(value.tabs) || value.tabs.length > TAB_WORKSPACE_LIMITS.tabsPerStrip) {
    throw new RangeError(`${context}.tabs exceeds its entry limit.`);
  }
  if (!Array.isArray(value.groups) || value.groups.length > TAB_WORKSPACE_LIMITS.groupsPerStrip) {
    throw new RangeError(`${context}.groups exceeds its entry limit.`);
  }
  const tabs = value.tabs.map((tab, index) => validateTab(tab, `${context}.tabs[${index}]`));
  const groups = value.groups.map((group, index) => validateGroup(group, `${context}.groups[${index}]`));
  for (const tab of tabs) {
    if (ids.tabs.has(tab.id)) throw new TypeError(`Duplicate tab identifier: ${tab.id}.`);
    ids.tabs.add(tab.id);
  }
  for (const group of groups) {
    if (ids.groups.has(group.id)) throw new TypeError(`Duplicate group identifier: ${group.id}.`);
    ids.groups.add(group.id);
  }
  const localTabIds = new Set(tabs.map((tab) => tab.id));
  const localGroupIds = new Set(groups.map((group) => group.id));
  const tabOrder = stringArray(value.tabOrder, TAB_WORKSPACE_LIMITS.tabsPerStrip, `${context}.tabOrder`);
  if (tabOrder.length !== tabs.length || tabOrder.some((tabId) => !localTabIds.has(tabId))) {
    throw new TypeError(`${context}.tabOrder must contain every local tab exactly once.`);
  }
  let ordinarySeen = false;
  for (const tabId of tabOrder) {
    const tab = tabs.find((candidate) => candidate.id === tabId)!;
    if (!tab.pinned) ordinarySeen = true;
    if (tab.pinned && ordinarySeen) throw new TypeError(`${context}.tabOrder must keep pinned tabs in its leading region.`);
  }
  const memberships = new Set<string>();
  for (const group of groups) {
    for (const tabId of group.tabIds) {
      if (!localTabIds.has(tabId) || memberships.has(tabId)) throw new TypeError(`${context} has invalid group membership.`);
      memberships.add(tabId);
      if (tabs.find((tab) => tab.id === tabId)?.groupId !== group.id) throw new TypeError(`${context} group membership is inconsistent.`);
    }
    const expected = tabOrder.filter((tabId) => tabs.find((tab) => tab.id === tabId)?.groupId === group.id);
    if (expected.join('\0') !== group.tabIds.join('\0')) throw new TypeError(`${context} group order is inconsistent with tab order.`);
  }
  for (const tab of tabs) {
    if (tab.groupId !== null && (!localGroupIds.has(tab.groupId) || !memberships.has(tab.id))) {
      throw new TypeError(`${context} tab references an invalid group.`);
    }
  }
  const activeTabId = nullableIdentifier(value.activeTabId, `${context}.activeTabId`);
  const focusTabId = nullableIdentifier(value.focusTabId, `${context}.focusTabId`);
  if ((activeTabId !== null && !localTabIds.has(activeTabId)) || (focusTabId !== null && !localTabIds.has(focusTabId))) {
    throw new TypeError(`${context} active or focused tab is invalid.`);
  }
  if (tabs.length > 0 && (activeTabId === null || focusTabId === null)) {
    throw new TypeError(`${context} with tabs requires active and focused tab identifiers.`);
  }
  if (tabs.length === 0 && (activeTabId !== null || focusTabId !== null)) {
    throw new TypeError(`${context} without tabs cannot have active or focused tabs.`);
  }
  return {
    id,
    label: boundedText(value.label, `${context}.label`, TAB_WORKSPACE_LIMITS.labelCodePoints),
    activeTabId,
    focusTabId,
    tabOrder,
    tabs,
    groups,
    searches: validateSearchState(value.searches, localGroupIds, `${context}.searches`),
  };
}

function validateWindow(value: unknown, context: string, ids: GlobalIds): TabWindow {
  if (!isRecord(value)) throw new TypeError(`${context} must be an object.`);
  assertOnlyFields(value, WINDOW_FIELDS, context);
  const id = identifier(value.id, `${context}.id`);
  if (ids.windows.has(id)) throw new TypeError(`Duplicate window identifier: ${id}.`);
  ids.windows.add(id);
  if (!Array.isArray(value.strips) || value.strips.length === 0 || value.strips.length > TAB_WORKSPACE_LIMITS.stripsPerWindow) {
    throw new RangeError(`${context}.strips must contain a bounded non-empty list.`);
  }
  const strips = value.strips.map((strip, index) => validateStrip(strip, `${context}.strips[${index}]`, ids));
  const activeStripId = identifier(value.activeStripId, `${context}.activeStripId`);
  if (!strips.some((strip) => strip.id === activeStripId)) throw new TypeError(`${context}.activeStripId is invalid.`);
  return { id, label: boundedText(value.label, `${context}.label`, TAB_WORKSPACE_LIMITS.labelCodePoints), activeStripId, strips };
}

function validateWorkspace(value: unknown, context: string, ids: GlobalIds): TabWorkspace {
  if (!isRecord(value)) throw new TypeError(`${context} must be an object.`);
  assertOnlyFields(value, WORKSPACE_FIELDS, context);
  const id = identifier(value.id, `${context}.id`);
  if (ids.workspaces.has(id)) throw new TypeError(`Duplicate workspace identifier: ${id}.`);
  ids.workspaces.add(id);
  if (!Array.isArray(value.windows) || value.windows.length === 0 || value.windows.length > TAB_WORKSPACE_LIMITS.windowsPerWorkspace) {
    throw new RangeError(`${context}.windows must contain a bounded non-empty list.`);
  }
  const windows = value.windows.map((window, index) => validateWindow(window, `${context}.windows[${index}]`, ids));
  const activeWindowId = identifier(value.activeWindowId, `${context}.activeWindowId`);
  if (!windows.some((window) => window.id === activeWindowId)) throw new TypeError(`${context}.activeWindowId is invalid.`);
  return { id, label: boundedText(value.label, `${context}.label`, TAB_WORKSPACE_LIMITS.labelCodePoints), activeWindowId, windows };
}

export function validateTabWorkspaceState(value: unknown): TabWorkspaceState {
  if (!isRecord(value)) throw new TypeError('Tab workspace state must be an object.');
  assertOnlyFields(value, ROOT_FIELDS, 'Tab workspace state');
  if (value.schemaVersion !== TAB_WORKSPACE_SCHEMA_VERSION) throw new TypeError('Tab workspace schema version is unsupported.');
  if (value.dock !== 'left' && value.dock !== 'right' && value.dock !== 'top' && value.dock !== 'bottom') {
    throw new TypeError('Tab dock is invalid.');
  }
  if (!Array.isArray(value.workspaces) || value.workspaces.length === 0 || value.workspaces.length > TAB_WORKSPACE_LIMITS.workspaces) {
    throw new RangeError('Tab workspaces must contain a bounded non-empty list.');
  }
  const ids: GlobalIds = { workspaces: new Set(), windows: new Set(), strips: new Set(), tabs: new Set(), groups: new Set() };
  const workspaces = value.workspaces.map((workspace, index) => validateWorkspace(workspace, `workspaces[${index}]`, ids));
  const activeWorkspaceId = identifier(value.activeWorkspaceId, 'activeWorkspaceId');
  if (!workspaces.some((workspace) => workspace.id === activeWorkspaceId)) throw new TypeError('Active workspace identifier is invalid.');
  return { schemaVersion: TAB_WORKSPACE_SCHEMA_VERSION, dock: value.dock, activeWorkspaceId, workspaces };
}

export function parseTabWorkspaceJson(source: string | Uint8Array): TabWorkspaceState {
  const bytes = typeof source === 'string' ? new TextEncoder().encode(source) : source;
  if (bytes.byteLength > TAB_WORKSPACE_LIMITS.jsonBytes) throw new RangeError('Tab workspace JSON exceeds its byte limit.');
  let text: string;
  try { text = typeof source === 'string' ? source : new TextDecoder('utf-8', { fatal: true }).decode(source); }
  catch { throw new TypeError('Tab workspace JSON is not valid UTF-8.'); }
  let value: unknown;
  try { value = JSON.parse(text) as unknown; }
  catch { throw new TypeError('Tab workspace JSON is malformed.'); }
  return validateTabWorkspaceState(value);
}

export function serializeTabWorkspaceState(state: TabWorkspaceState): string {
  return JSON.stringify(validateTabWorkspaceState(state));
}

function cloneState(state: TabWorkspaceState): TabWorkspaceState {
  return validateTabWorkspaceState(JSON.parse(JSON.stringify(validateTabWorkspaceState(state))) as unknown);
}

function resolveStrip(state: TabWorkspaceState, location: StripLocation): { workspace: TabWorkspace; window: TabWindow; strip: TabStrip } {
  const workspace = state.workspaces.find((candidate) => candidate.id === location.workspaceId);
  const window = workspace?.windows.find((candidate) => candidate.id === location.windowId);
  const strip = window?.strips.find((candidate) => candidate.id === location.stripId);
  if (!workspace || !window || !strip) throw new TypeError('Tab strip location is invalid.');
  return { workspace, window, strip };
}

function changedState(state: TabWorkspaceState, mutate: (draft: TabWorkspaceState) => void): TabWorkspaceState {
  const draft = cloneState(state);
  mutate(draft);
  return validateTabWorkspaceState(draft);
}

function syncGroupOrders(strip: TabStrip): void {
  for (const group of strip.groups) {
    group.tabIds = strip.tabOrder.filter((tabId) => strip.tabs.find((tab) => tab.id === tabId)?.groupId === group.id);
  }
}

export function setTabDock(state: TabWorkspaceState, dock: TabDock): TabWorkspaceState {
  if (!['left', 'right', 'top', 'bottom'].includes(dock)) throw new TypeError('Tab dock is invalid.');
  return changedState(state, (draft) => { draft.dock = dock; });
}

export function reorderTab(state: TabWorkspaceState, location: StripLocation, tabId: string, targetIndex: number): TabWorkspaceState {
  return changedState(state, (draft) => {
    const { strip } = resolveStrip(draft, location);
    const sourceIndex = strip.tabOrder.indexOf(identifier(tabId, 'tabId'));
    if (sourceIndex < 0) throw new TypeError('Tab identifier is not in the target strip.');
    const tab = strip.tabs.find((candidate) => candidate.id === tabId)!;
    const region = strip.tabOrder.filter((candidateId) => strip.tabs.find((candidate) => candidate.id === candidateId)?.pinned === tab.pinned);
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= region.length) throw new RangeError('Target index is outside the tab region.');
    const reorderedRegion = region.filter((candidateId) => candidateId !== tabId);
    reorderedRegion.splice(targetIndex, 0, tabId);
    const pinned = tab.pinned ? reorderedRegion : strip.tabOrder.filter((candidateId) => strip.tabs.find((candidate) => candidate.id === candidateId)?.pinned);
    const ordinary = tab.pinned ? strip.tabOrder.filter((candidateId) => !strip.tabs.find((candidate) => candidate.id === candidateId)?.pinned) : reorderedRegion;
    strip.tabOrder = [...pinned, ...ordinary];
    syncGroupOrders(strip);
  });
}

function setPinned(state: TabWorkspaceState, location: StripLocation, tabId: string, pinned: boolean): TabWorkspaceState {
  return changedState(state, (draft) => {
    const { strip } = resolveStrip(draft, location);
    const tab = strip.tabs.find((candidate) => candidate.id === identifier(tabId, 'tabId'));
    if (!tab) throw new TypeError('Tab identifier is not in the target strip.');
    if (tab.pinned === pinned) return;
    tab.pinned = pinned;
    strip.tabOrder = strip.tabOrder.filter((candidateId) => candidateId !== tab.id);
    const firstOrdinary = strip.tabOrder.findIndex((candidateId) => !strip.tabs.find((candidate) => candidate.id === candidateId)?.pinned);
    if (pinned) strip.tabOrder.splice(firstOrdinary < 0 ? strip.tabOrder.length : firstOrdinary, 0, tab.id);
    else strip.tabOrder.splice(firstOrdinary < 0 ? strip.tabOrder.length : firstOrdinary, 0, tab.id);
    syncGroupOrders(strip);
  });
}

export function pinTab(state: TabWorkspaceState, location: StripLocation, tabId: string): TabWorkspaceState {
  return setPinned(state, location, tabId, true);
}

export function unpinTab(state: TabWorkspaceState, location: StripLocation, tabId: string): TabWorkspaceState {
  return setPinned(state, location, tabId, false);
}

export function createTabGroup(
  state: TabWorkspaceState,
  location: StripLocation,
  group: Pick<TabGroup, 'id' | 'label' | 'color'> & Partial<Pick<TabGroup, 'collapsed' | 'decoration'>>,
): TabWorkspaceState {
  return changedState(state, (draft) => {
    const { strip } = resolveStrip(draft, location);
    const candidate = validateGroup({
      id: group.id, label: group.label, color: group.color, collapsed: group.collapsed ?? false,
      tabIds: [], decoration: group.decoration ?? defaultDecoration(),
    }, 'New tab group');
    if (draft.workspaces.some((workspace) => workspace.windows.some((window) => window.strips.some((item) => item.groups.some((existing) => existing.id === candidate.id))))) {
      throw new TypeError('Group identifier already exists.');
    }
    strip.groups.push(candidate);
    strip.searches.group.push({ groupId: candidate.id, descriptor: createSearchDescriptor() });
  });
}

export function renameTabGroup(state: TabWorkspaceState, location: StripLocation, groupId: string, label: string): TabWorkspaceState {
  return changedState(state, (draft) => {
    const group = resolveStrip(draft, location).strip.groups.find((candidate) => candidate.id === identifier(groupId, 'groupId'));
    if (!group) throw new TypeError('Group identifier is not in the target strip.');
    group.label = boundedText(label, 'Group label', TAB_WORKSPACE_LIMITS.labelCodePoints);
  });
}

export function reorderTabGroup(state: TabWorkspaceState, location: StripLocation, groupId: string, targetIndex: number): TabWorkspaceState {
  return changedState(state, (draft) => {
    const { strip } = resolveStrip(draft, location);
    const sourceIndex = strip.groups.findIndex((candidate) => candidate.id === identifier(groupId, 'groupId'));
    if (sourceIndex < 0) throw new TypeError('Group identifier is not in the target strip.');
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= strip.groups.length) throw new RangeError('Target group index is invalid.');
    const [group] = strip.groups.splice(sourceIndex, 1);
    strip.groups.splice(targetIndex, 0, group);
  });
}

export function setTabGroupCollapsed(state: TabWorkspaceState, location: StripLocation, groupId: string, collapsed: boolean): TabWorkspaceState {
  if (typeof collapsed !== 'boolean') throw new TypeError('Collapsed state must be boolean.');
  return changedState(state, (draft) => {
    const group = resolveStrip(draft, location).strip.groups.find((candidate) => candidate.id === identifier(groupId, 'groupId'));
    if (!group) throw new TypeError('Group identifier is not in the target strip.');
    group.collapsed = collapsed;
  });
}

export function removeTabGroup(state: TabWorkspaceState, location: StripLocation, groupId: string): TabWorkspaceState {
  return changedState(state, (draft) => {
    const { strip } = resolveStrip(draft, location);
    const id = identifier(groupId, 'groupId');
    if (!strip.groups.some((group) => group.id === id)) throw new TypeError('Group identifier is not in the target strip.');
    for (const tab of strip.tabs) if (tab.groupId === id) tab.groupId = null;
    strip.groups = strip.groups.filter((group) => group.id !== id);
    strip.searches.group = strip.searches.group.filter((entry) => entry.groupId !== id);
  });
}

export function moveTabIntoGroup(state: TabWorkspaceState, location: StripLocation, tabId: string, groupId: string | null): TabWorkspaceState {
  return changedState(state, (draft) => {
    const { strip } = resolveStrip(draft, location);
    const tab = strip.tabs.find((candidate) => candidate.id === identifier(tabId, 'tabId'));
    if (!tab) throw new TypeError('Tab identifier is not in the target strip.');
    const target = groupId === null ? null : identifier(groupId, 'groupId');
    if (target !== null && !strip.groups.some((group) => group.id === target)) throw new TypeError('Group identifier is not in the target strip.');
    tab.groupId = target;
    syncGroupOrders(strip);
  });
}

function descriptorFor(state: TabWorkspaceState, target: DiscoveryTarget): SearchDescriptor {
  if (target.scope === 'master') {
    const activeWorkspace = state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)!;
    const activeWindow = activeWorkspace.windows.find((window) => window.id === activeWorkspace.activeWindowId)!;
    const activeStrip = activeWindow.strips.find((strip) => strip.id === activeWindow.activeStripId)!;
    return activeStrip.searches.master;
  }
  if (!target.location) throw new TypeError('This discovery scope requires a strip location.');
  const strip = resolveStrip(state, target.location).strip;
  if (target.scope === 'strip') return strip.searches.strip;
  if (target.scope === 'groups') return strip.searches.groups;
  if (!target.groupId) throw new TypeError('Group discovery requires a group identifier.');
  return strip.searches.group.find((entry) => entry.groupId === target.groupId)?.descriptor
    ?? (() => { throw new TypeError('Group search descriptor does not exist.'); })();
}

export function setDiscoverySearch(state: TabWorkspaceState, target: DiscoveryTarget, descriptor: SearchDescriptor): TabWorkspaceState {
  const checked = validateSearchDescriptor(descriptor);
  return changedState(state, (draft) => {
    if (target.scope === 'master') {
      const activeWorkspace = draft.workspaces.find((workspace) => workspace.id === draft.activeWorkspaceId)!;
      const activeWindow = activeWorkspace.windows.find((window) => window.id === activeWorkspace.activeWindowId)!;
      activeWindow.strips.find((strip) => strip.id === activeWindow.activeStripId)!.searches.master = checked;
      return;
    }
    if (!target.location) throw new TypeError('This discovery scope requires a strip location.');
    const strip = resolveStrip(draft, target.location).strip;
    if (target.scope === 'strip') strip.searches.strip = checked;
    else if (target.scope === 'groups') strip.searches.groups = checked;
    else {
      if (!target.groupId) throw new TypeError('Group discovery requires a group identifier.');
      const entry = strip.searches.group.find((candidate) => candidate.groupId === target.groupId);
      if (!entry) throw new TypeError('Group search descriptor does not exist.');
      entry.descriptor = checked;
    }
  });
}

type CompiledMatcher =
  | { status: 'ready'; test(value: string): boolean }
  | { status: 'empty'; error: string }
  | { status: 'invalid'; error: string };

function matcher(descriptor: SearchDescriptor, requireQuery: boolean): CompiledMatcher {
  const checked = validateSearchDescriptor(descriptor);
  if (checked.query.length === 0) return { status: 'empty', error: requireQuery ? 'A non-empty query is required.' : '' };
  if (checked.mode === 'plain') {
    const needle = checked.query.toLocaleLowerCase();
    return { status: 'ready', test: (value) => value.toLocaleLowerCase().includes(needle) };
  }
  try {
    const expression = new RegExp(checked.query, checked.flags);
    return { status: 'ready', test: (value) => { expression.lastIndex = 0; return expression.test(value); } };
  } catch {
    return { status: 'invalid', error: 'The regular expression is invalid.' };
  }
}

function tabResult(workspace: TabWorkspace, window: TabWindow, strip: TabStrip, tab: WorkspaceTab): DiscoveryResult {
  const group = tab.groupId === null ? null : strip.groups.find((candidate) => candidate.id === tab.groupId) ?? null;
  return {
    kind: 'tab', workspaceId: workspace.id, windowId: window.id, stripId: strip.id,
    tabId: tab.id, groupId: tab.groupId, pinned: tab.pinned, label: tab.label,
    groupCollapsed: group?.collapsed ?? false,
  };
}

export function searchTabWorkspace(stateInput: TabWorkspaceState, target: DiscoveryTarget): DiscoveryResponse {
  const state = validateTabWorkspaceState(stateInput);
  const descriptor = descriptorFor(state, target);
  const compiled = matcher(descriptor, false);
  if (compiled.status === 'invalid') return { status: 'invalid', descriptor, error: compiled.error, results: [] };
  const accept: (value: string) => boolean = compiled.status === 'empty' ? () => true : compiled.test;
  const results: DiscoveryResult[] = [];
  if (target.scope === 'master') {
    for (const workspace of state.workspaces) for (const window of workspace.windows) for (const strip of window.strips) {
      for (const tabId of strip.tabOrder) {
        const tab = strip.tabs.find((candidate) => candidate.id === tabId)!;
        if (accept(tab.label)) results.push(tabResult(workspace, window, strip, tab));
      }
    }
  } else {
    if (!target.location) throw new TypeError('This discovery scope requires a strip location.');
    const { workspace, window, strip } = resolveStrip(state, target.location);
    if (target.scope === 'groups') {
      for (const group of strip.groups) if (accept(group.label)) results.push({
        kind: 'group', workspaceId: workspace.id, windowId: window.id, stripId: strip.id,
        tabId: null, groupId: group.id, pinned: false, label: group.label, groupCollapsed: group.collapsed,
      });
    } else {
      const groupId = target.scope === 'group' ? target.groupId : undefined;
      for (const tabId of strip.tabOrder) {
        const tab = strip.tabs.find((candidate) => candidate.id === tabId)!;
        if ((groupId === undefined || tab.groupId === groupId) && accept(tab.label)) results.push(tabResult(workspace, window, strip, tab));
      }
    }
  }
  return { status: compiled.status === 'empty' ? 'empty' : 'ready', descriptor, error: null, results };
}

export function revealDiscoveryResult(stateInput: TabWorkspaceState, result: DiscoveryResult): { state: TabWorkspaceState; instruction: RevealInstruction } {
  const state = validateTabWorkspaceState(stateInput);
  const { strip } = resolveStrip(state, { workspaceId: result.workspaceId, windowId: result.windowId, stripId: result.stripId });
  const group = result.groupId === null ? null : strip.groups.find((candidate) => candidate.id === result.groupId);
  if (result.kind === 'tab' && !strip.tabs.some((tab) => tab.id === result.tabId)) throw new TypeError('Discovery result tab no longer exists.');
  if (result.kind === 'group' && !group) throw new TypeError('Discovery result group no longer exists.');
  return {
    state,
    instruction: {
      workspaceId: result.workspaceId, windowId: result.windowId, stripId: result.stripId,
      tabId: result.tabId, groupId: result.groupId,
      temporarilyExpandGroup: group?.collapsed ?? false,
      preserveCollapsedPreference: true,
    },
  };
}

export function buildBulkClosePreview(stateInput: TabWorkspaceState, location: StripLocation, options: BulkCloseOptions): BulkClosePreview {
  const state = validateTabWorkspaceState(stateInput);
  if (options.mode !== 'containing' && options.mode !== 'not-containing') throw new TypeError('Bulk-close mode is invalid.');
  const compiled = matcher(options.descriptor, true);
  if (compiled.status === 'empty') throw new TypeError(compiled.error);
  if (compiled.status === 'invalid') throw new TypeError(compiled.error);
  const { strip } = resolveStrip(state, location);
  const test = compiled.test;
  const matched = strip.tabOrder.map((tabId) => strip.tabs.find((tab) => tab.id === tabId)!)
    .filter((tab) => options.mode === 'containing' ? test(tab.label) : !test(tab.label));
  const excludedPinnedTabIds = matched.filter((tab) => tab.pinned && !options.includePinned).map((tab) => tab.id);
  const excludedLockedTabIds = matched.filter((tab) => tab.locked && !options.includeLocked && !excludedPinnedTabIds.includes(tab.id)).map((tab) => tab.id);
  const closing = matched.filter((tab) => !excludedPinnedTabIds.includes(tab.id) && !excludedLockedTabIds.includes(tab.id));
  return {
    location: { ...location }, mode: options.mode, descriptor: validateSearchDescriptor(options.descriptor),
    totalMatched: matched.length, closingTabIds: closing.map((tab) => tab.id),
    unsavedTabIds: closing.filter((tab) => tab.unsaved).map((tab) => tab.id),
    excludedPinnedTabIds, excludedLockedTabIds,
  };
}

function deterministicNeighbor(order: readonly string[], closing: ReadonlySet<string>, anchorId: string | null): string | null {
  if (anchorId === null || !closing.has(anchorId)) return anchorId;
  const index = order.indexOf(anchorId);
  for (let offset = index + 1; offset < order.length; offset += 1) if (!closing.has(order[offset])) return order[offset];
  for (let offset = index - 1; offset >= 0; offset -= 1) if (!closing.has(order[offset])) return order[offset];
  return null;
}

export function executeBulkClose(
  state: TabWorkspaceState,
  preview: BulkClosePreview,
  confirmedUnsavedTabIds: readonly string[] = [],
): BulkCloseResult {
  const confirmed = new Set(confirmedUnsavedTabIds.map((id) => identifier(id, 'confirmedUnsavedTabId')));
  const protectedUnsavedTabIds = preview.unsavedTabIds.filter((id) => !confirmed.has(id));
  const closing = new Set(preview.closingTabIds.filter((id) => !protectedUnsavedTabIds.includes(id)));
  let focusedTabId: string | null = null;
  const next = changedState(state, (draft) => {
    const { strip } = resolveStrip(draft, preview.location);
    for (const id of closing) if (!strip.tabs.some((tab) => tab.id === id)) throw new TypeError('Bulk-close preview is stale.');
    focusedTabId = deterministicNeighbor(strip.tabOrder, closing, strip.focusTabId);
    const activeTabId = deterministicNeighbor(strip.tabOrder, closing, strip.activeTabId);
    strip.tabOrder = strip.tabOrder.filter((id) => !closing.has(id));
    strip.tabs = strip.tabs.filter((tab) => !closing.has(tab.id));
    for (const group of strip.groups) group.tabIds = group.tabIds.filter((id) => !closing.has(id));
    strip.focusTabId = focusedTabId;
    strip.activeTabId = activeTabId;
  });
  return {
    state: next, closedTabIds: [...closing], protectedUnsavedTabIds,
    excludedPinnedTabIds: [...preview.excludedPinnedTabIds],
    excludedLockedTabIds: [...preview.excludedLockedTabIds], focusedTabId,
  };
}

export function buildMoveIntoGroupPicker(
  stateInput: TabWorkspaceState,
  location: StripLocation,
  descriptor: SearchDescriptor,
): MoveIntoGroupPickerData {
  const state = validateTabWorkspaceState(stateInput);
  const { strip } = resolveStrip(state, location);
  const compiled = matcher(descriptor, false);
  if (compiled.status === 'invalid') return { status: 'invalid', error: compiled.error, items: [], canCreate: true, suggestedNewGroupLabel: null };
  const accept: (value: string) => boolean = compiled.status === 'empty' ? () => true : compiled.test;
  const items = strip.groups.filter((group) => accept(group.label)).map((group) => ({
    groupId: group.id, label: group.label, color: group.color, memberCount: group.tabIds.length, collapsed: group.collapsed,
  }));
  const status = strip.groups.length === 0 ? 'empty' : items.length === 0 ? 'no-match' : 'ready';
  return {
    status, error: null, items, canCreate: true,
    suggestedNewGroupLabel: descriptor.query.trim().length === 0 ? null : descriptor.query.trim().slice(0, TAB_WORKSPACE_LIMITS.labelCodePoints),
  };
}

function rovingVisibleTabs(strip: TabStrip): string[] {
  const collapsed = new Set(strip.groups.filter((group) => group.collapsed).map((group) => group.id));
  return strip.tabOrder.filter((tabId) => {
    const tab = strip.tabs.find((candidate) => candidate.id === tabId)!;
    return tab.groupId === null || !collapsed.has(tab.groupId) || tab.id === strip.activeTabId;
  });
}

export function moveRovingTabFocus(state: TabWorkspaceState, location: StripLocation, key: RovingKey): RovingFocusResult {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) throw new TypeError('Roving-focus key is invalid.');
  const orientation = state.dock === 'left' || state.dock === 'right' ? 'vertical' : 'horizontal';
  const previous = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
  const next = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
  if (key !== previous && key !== next && key !== 'Home' && key !== 'End') {
    return { state: validateTabWorkspaceState(state), orientation, handled: false, focusedTabId: resolveStrip(state, location).strip.focusTabId };
  }
  let focusedTabId: string | null = null;
  const result = changedState(state, (draft) => {
    const { strip } = resolveStrip(draft, location);
    const visible = rovingVisibleTabs(strip);
    if (visible.length === 0) { focusedTabId = null; return; }
    const current = Math.max(0, visible.indexOf(strip.focusTabId ?? ''));
    const target = key === 'Home' ? 0 : key === 'End' ? visible.length - 1
      : key === next ? (current + 1) % visible.length : (current - 1 + visible.length) % visible.length;
    focusedTabId = visible[target];
    strip.focusTabId = focusedTabId;
  });
  return { state: result, orientation, handled: true, focusedTabId };
}
