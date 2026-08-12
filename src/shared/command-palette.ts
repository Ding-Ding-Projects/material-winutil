/**
 * Framework-neutral command-palette domain contract.
 *
 * This module owns discoverability, bounded layout preference, search, selection,
 * and exact teleport metadata only. Hosts render it, persist its serialized layout,
 * and execute the same actions and setting validators they already use elsewhere.
 * It deliberately performs no I/O and never accepts credential material.
 */

export const COMMAND_PALETTE_SHORTCUT = 'Ctrl+Shift+F' as const;
export const COMMAND_PALETTE_SCHEMA_VERSION = 1 as const;

export const COMMAND_PALETTE_LIMITS = Object.freeze({
  maxEntries: 2_000,
  maxRequiredIds: 2_000,
  maxTextLength: 240,
  maxKeywords: 32,
  maxSearchLength: 256,
  maxRegexFlagsLength: 8,
  minCardWidth: 360,
  maxCardWidth: 1_280,
  minCardHeight: 280,
  maxCardHeight: 960,
});

export type CommandPaletteLanguageMode = 'English' | 'Yue' | 'Bilingual';
export type CommandPaletteFunnyLevel = 1 | 2 | 3 | 4 | 5;
export type CommandPaletteEntryKind = 'command' | 'page' | 'article' | 'destination' | 'setting' | 'appearance-control';
export type CommandPaletteSize = 'card' | 'full-window';
export type CommandPaletteSearchMode = 'plain' | 'regex';

export interface CommandPalettePresentation {
  readonly language: CommandPaletteLanguageMode;
  readonly englishFunnyLevel: CommandPaletteFunnyLevel;
  readonly cantoneseFunnyLevel: CommandPaletteFunnyLevel;
  readonly schoolModeEnabled: boolean;
}

export interface CommandPaletteTeleportTarget {
  readonly surfaceId: string;
  readonly tabId: string;
  readonly groupId: string | null;
  readonly elementId: string;
  readonly instructions: readonly ['reveal', 'focus', 'highlight'];
}

/** A host-owned rich control; values are neither read nor persisted by the palette. */
export interface CommandPaletteRichControl {
  readonly settingId: string;
  readonly control: 'toggle' | 'select' | 'slider' | 'stepper' | 'text' | 'color' | 'action';
  readonly validate: (value: unknown) => boolean;
}

export interface CommandPaletteEntry {
  readonly id: string;
  readonly kind: CommandPaletteEntryKind;
  readonly title: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly teleport: CommandPaletteTeleportTarget;
  readonly richControl?: CommandPaletteRichControl;
  /** Entries marked false are omitted while School mode is active. */
  readonly availableInSchoolMode: boolean;
  /** The original search and bulk routes stay visible to the host after activation. */
  readonly retainsSearchAccess: boolean;
  readonly retainsBulkActions: boolean;
}

export interface CommandPaletteRegistry {
  readonly entries: readonly CommandPaletteEntry[];
}

export interface CommandPaletteRequiredInventory {
  readonly ids: readonly string[];
}

export interface CommandPaletteLayoutPreference {
  readonly schemaVersion: typeof COMMAND_PALETTE_SCHEMA_VERSION;
  readonly size: CommandPaletteSize;
  readonly cardWidth: number;
  readonly cardHeight: number;
}

export interface CommandPaletteSearchState {
  readonly mode: CommandPaletteSearchMode;
  readonly query: string;
  readonly flags: string;
}

export interface CommandPaletteSelectionState {
  readonly activeId: string | null;
}

export class CommandPaletteContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandPaletteContractError';
  }
}

const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,159}$/u;
const VALID_FLAGS = new Set(['d', 'g', 'i', 'm', 's', 'u', 'v', 'y']);
const SECRET_FIELD = /^(?:password|passcode|pin|secret|token|credential|otp|totp|apiKey|privateKey)$/iu;

function fail(message: string): never { throw new CommandPaletteContractError(message); }
function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function boundedText(value: unknown, context: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0) || value.length > COMMAND_PALETTE_LIMITS.maxTextLength) {
    fail(`${context} must be bounded text.`);
  }
  return value;
}
function boundedId(value: unknown, context: string): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) fail(`${context} must be a safe identifier.`);
  return value;
}
function boundedDimension(value: unknown, min: number, max: number, context: string): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) fail(`${context} is outside supported bounds.`);
  return value as number;
}
function assertNoSecretFields(value: unknown): void {
  if (Array.isArray(value)) { for (const child of value) assertNoSecretFields(child); return; }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_FIELD.test(key)) fail('Command palette descriptors must not contain credential material.');
    assertNoSecretFields(child);
  }
}
function freezeEntry(entry: CommandPaletteEntry): CommandPaletteEntry {
  return Object.freeze({
    ...entry,
    keywords: Object.freeze([...entry.keywords]),
    teleport: Object.freeze({ ...entry.teleport, instructions: Object.freeze([...entry.teleport.instructions]) as CommandPaletteTeleportTarget['instructions'] }),
    ...(entry.richControl ? { richControl: Object.freeze({ ...entry.richControl }) } : {}),
  });
}

export function createDefaultCommandPaletteLayout(): CommandPaletteLayoutPreference {
  return Object.freeze({ schemaVersion: COMMAND_PALETTE_SCHEMA_VERSION, size: 'card', cardWidth: 680, cardHeight: 560 });
}

/** Validate the only state allowed to cross a persistence boundary. */
export function validateCommandPaletteLayout(value: unknown): CommandPaletteLayoutPreference {
  if (!isRecord(value) || Object.keys(value).length !== 4) fail('Command palette layout is invalid.');
  if (value.schemaVersion !== COMMAND_PALETTE_SCHEMA_VERSION || (value.size !== 'card' && value.size !== 'full-window')) {
    fail('Command palette layout is invalid.');
  }
  return Object.freeze({
    schemaVersion: COMMAND_PALETTE_SCHEMA_VERSION,
    size: value.size,
    cardWidth: boundedDimension(value.cardWidth, COMMAND_PALETTE_LIMITS.minCardWidth, COMMAND_PALETTE_LIMITS.maxCardWidth, 'Card width'),
    cardHeight: boundedDimension(value.cardHeight, COMMAND_PALETTE_LIMITS.minCardHeight, COMMAND_PALETTE_LIMITS.maxCardHeight, 'Card height'),
  });
}

export function serializeCommandPaletteLayout(value: CommandPaletteLayoutPreference): string {
  return JSON.stringify(validateCommandPaletteLayout(value));
}

export function parseCommandPaletteLayout(source: string | Uint8Array): CommandPaletteLayoutPreference {
  let text: string;
  try { text = typeof source === 'string' ? source : new TextDecoder('utf-8', { fatal: true }).decode(source); } catch { return fail('Command palette layout is not UTF-8.'); }
  try { return validateCommandPaletteLayout(JSON.parse(text) as unknown); } catch (error) {
    if (error instanceof CommandPaletteContractError) throw error;
    return fail('Command palette layout is not valid JSON.');
  }
}

export function createCommandPaletteSearchState(): CommandPaletteSearchState {
  return Object.freeze({ mode: 'plain', query: '', flags: 'iu' });
}

/** Plain and regex state travel together but each palette owns its own instance. */
export function validateCommandPaletteSearchState(value: unknown): CommandPaletteSearchState {
  if (!isRecord(value) || Object.keys(value).length !== 3 || (value.mode !== 'plain' && value.mode !== 'regex')) fail('Command palette search state is invalid.');
  const query = boundedText(value.query, 'Search query', true);
  if (query.length > COMMAND_PALETTE_LIMITS.maxSearchLength || typeof value.flags !== 'string' || value.flags.length > COMMAND_PALETTE_LIMITS.maxRegexFlagsLength) {
    fail('Command palette search state is invalid.');
  }
  const flags = value.flags;
  if (new Set(flags).size !== flags.length || [...flags].some((flag) => !VALID_FLAGS.has(flag))) fail('Command palette search flags are invalid.');
  if (value.mode === 'regex') { try { new RegExp(query, flags); } catch { fail('Command palette regex is invalid.'); } }
  return Object.freeze({ mode: value.mode, query, flags });
}

export function validateCommandPaletteRegistry(value: unknown): CommandPaletteRegistry {
  if (!isRecord(value) || !Array.isArray(value.entries) || Object.keys(value).length !== 1 || value.entries.length > COMMAND_PALETTE_LIMITS.maxEntries) {
    fail('Command palette registry is invalid.');
  }
  const ids = new Set<string>();
  const entries: CommandPaletteEntry[] = value.entries.map((candidate): CommandPaletteEntry => {
    assertNoSecretFields(candidate);
    if (!isRecord(candidate)) fail('Command palette entry is invalid.');
    const allowed = new Set(['id', 'kind', 'title', 'description', 'keywords', 'teleport', 'richControl', 'availableInSchoolMode', 'retainsSearchAccess', 'retainsBulkActions']);
    if (Object.keys(candidate).some((key) => !allowed.has(key))) fail('Command palette entry has an unexpected field.');
    const id = boundedId(candidate.id, 'Entry id');
    if (ids.has(id)) fail('Command palette entry ids must be unique.');
    ids.add(id);
    if (!['command', 'page', 'article', 'destination', 'setting', 'appearance-control'].includes(candidate.kind as string)) fail('Command palette entry kind is invalid.');
    if (!Array.isArray(candidate.keywords) || candidate.keywords.length > COMMAND_PALETTE_LIMITS.maxKeywords) fail('Command palette keywords are invalid.');
    const keywords = candidate.keywords.map((keyword) => boundedText(keyword, 'Keyword'));
    if (!isRecord(candidate.teleport) || Object.keys(candidate.teleport).length !== 5) fail('Command palette teleport target is invalid.');
    const instructions = candidate.teleport.instructions;
    if (!Array.isArray(instructions) || instructions.length !== 3 || instructions[0] !== 'reveal' || instructions[1] !== 'focus' || instructions[2] !== 'highlight') {
      fail('Command palette teleport instructions are invalid.');
    }
    let richControl: CommandPaletteRichControl | undefined;
    if (candidate.richControl !== undefined) {
      if (!isRecord(candidate.richControl) || Object.keys(candidate.richControl).length !== 3 || typeof candidate.richControl.validate !== 'function') fail('Command palette rich control is invalid.');
      const control = candidate.richControl.control;
      if (!['toggle', 'select', 'slider', 'stepper', 'text', 'color', 'action'].includes(control as string)) fail('Command palette rich control is invalid.');
      richControl = Object.freeze({ settingId: boundedId(candidate.richControl.settingId, 'Setting id'), control: control as CommandPaletteRichControl['control'], validate: candidate.richControl.validate as CommandPaletteRichControl['validate'] });
    }
    if ((candidate.kind === 'setting' || candidate.kind === 'appearance-control') && !richControl) fail('Settings and appearance controls require a rich control.');
    if (typeof candidate.availableInSchoolMode !== 'boolean' || typeof candidate.retainsSearchAccess !== 'boolean' || typeof candidate.retainsBulkActions !== 'boolean') fail('Command palette availability is invalid.');
    return freezeEntry({
      id, kind: candidate.kind as CommandPaletteEntryKind, title: boundedText(candidate.title, 'Entry title'), description: boundedText(candidate.description, 'Entry description'), keywords,
      teleport: { surfaceId: boundedId(candidate.teleport.surfaceId, 'Surface id'), tabId: boundedId(candidate.teleport.tabId, 'Tab id'), groupId: candidate.teleport.groupId === null ? null : boundedId(candidate.teleport.groupId, 'Group id'), elementId: boundedId(candidate.teleport.elementId, 'Element id'), instructions: ['reveal', 'focus', 'highlight'] },
      ...(richControl ? { richControl } : {}), availableInSchoolMode: candidate.availableInSchoolMode, retainsSearchAccess: candidate.retainsSearchAccess, retainsBulkActions: candidate.retainsBulkActions,
    });
  });
  return Object.freeze({ entries: Object.freeze(entries) });
}

/** Handwritten inventory guard: call with every required command/page/article/destination/setting/control id. */
export function assertCommandPaletteInventory(registryInput: CommandPaletteRegistry, requiredInput: CommandPaletteRequiredInventory): void {
  const registry = validateCommandPaletteRegistry(registryInput);
  if (!isRecord(requiredInput) || !Array.isArray(requiredInput.ids) || Object.keys(requiredInput).length !== 1 || requiredInput.ids.length > COMMAND_PALETTE_LIMITS.maxRequiredIds) {
    fail('Command palette required inventory is invalid.');
  }
  const required = new Set<string>();
  for (const id of requiredInput.ids) { const safeId = boundedId(id, 'Required inventory id'); if (required.has(safeId)) fail('Command palette required inventory ids must be unique.'); required.add(safeId); }
  const registered = new Set(registry.entries.map(({ id }) => id));
  const missing = [...required].filter((id) => !registered.has(id));
  if (missing.length) fail(`Command palette inventory is missing: ${missing.join(', ')}.`);
}

export function searchCommandPalette(registryInput: CommandPaletteRegistry, stateInput: CommandPaletteSearchState, presentation: CommandPalettePresentation): readonly CommandPaletteEntry[] {
  const registry = validateCommandPaletteRegistry(registryInput);
  const state = validateCommandPaletteSearchState(stateInput);
  if (!['English', 'Yue', 'Bilingual'].includes(presentation.language) || ![1, 2, 3, 4, 5].includes(presentation.englishFunnyLevel) || ![1, 2, 3, 4, 5].includes(presentation.cantoneseFunnyLevel) || typeof presentation.schoolModeEnabled !== 'boolean') fail('Command palette presentation is invalid.');
  const query = state.query.trim();
  let matches: (text: string) => boolean;
  if (!query) matches = () => true;
  else if (state.mode === 'plain') { const needle = query.toLocaleLowerCase(); matches = (text) => text.toLocaleLowerCase().includes(needle); }
  else { const expression = new RegExp(query, state.flags.replace(/[gy]/gu, '')); matches = (text) => { expression.lastIndex = 0; return expression.test(text); }; }
  return Object.freeze(registry.entries.filter((entry) => (
    (!presentation.schoolModeEnabled || entry.availableInSchoolMode)
    && [entry.title, entry.description, ...entry.keywords].some((field) => matches(field))
  )));
}

export function activateCommandPaletteSelection(entries: readonly CommandPaletteEntry[], current: CommandPaletteSelectionState, key: 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'): CommandPaletteSelectionState {
  if (!Array.isArray(entries) || entries.some((entry) => !entry || typeof entry.id !== 'string')) fail('Command palette selection entries are invalid.');
  if (!isRecord(current) || Object.keys(current).length !== 1 || (current.activeId !== null && typeof current.activeId !== 'string')) fail('Command palette selection state is invalid.');
  if (entries.length === 0) return Object.freeze({ activeId: null });
  const position = entries.findIndex((entry) => entry.id === current.activeId);
  const next = key === 'Home' ? 0 : key === 'End' ? entries.length - 1 : key === 'ArrowUp' ? (position <= 0 ? entries.length - 1 : position - 1) : (position + 1) % entries.length;
  return Object.freeze({ activeId: entries[next]!.id });
}

export function resolveCommandPaletteTeleport(entry: CommandPaletteEntry): CommandPaletteTeleportTarget {
  return validateCommandPaletteRegistry({ entries: [entry] }).entries[0]!.teleport;
}

export function validateCommandPaletteInlineValue(entry: CommandPaletteEntry, value: unknown): boolean {
  const safeEntry = validateCommandPaletteRegistry({ entries: [entry] }).entries[0]!;
  return safeEntry.richControl ? safeEntry.richControl.validate(value) : false;
}
