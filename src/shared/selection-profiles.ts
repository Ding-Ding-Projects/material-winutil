export type SelectionProfileViewId = 'install' | 'tweaks' | 'config' | 'updates' | 'iso' | 'converter' | 'ollama' | 'history' | 'changelog' | 'docs' | 'settings';

export const SELECTION_PROFILES_SCHEMA_VERSION = 1 as const;
export const SELECTION_PROFILE_LIMITS = Object.freeze({
  documentBytes: 512 * 1024,
  profiles: 512,
  identifierCodePoints: 128,
  nameCodePoints: 160,
  selectedIdsPerProfile: 4_096,
  selectedIdCodePoints: 256,
});

export interface SelectionProfile {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly view: SelectionProfileViewId;
  readonly ids: readonly string[];
}

export interface SelectionProfileCreateRequest {
  readonly name: string;
  readonly color: string;
  readonly view: SelectionProfileViewId;
  readonly ids: readonly string[];
}

export interface SelectionProfileUpdateRequest {
  readonly name?: string;
  readonly color?: string;
  readonly view?: SelectionProfileViewId;
  readonly ids?: readonly string[];
}

export interface SelectionProfilesMigrationRequest {
  readonly profiles: readonly SelectionProfileCreateRequest[];
}

export interface SelectionProfilesDocument {
  readonly schemaVersion: typeof SELECTION_PROFILES_SCHEMA_VERSION;
  readonly profiles: readonly SelectionProfile[];
}

const VIEWS: readonly SelectionProfileViewId[] = [
  'install', 'tweaks', 'config', 'updates', 'iso', 'converter', 'ollama', 'history',
  'changelog', 'docs', 'settings',
];

function isSelectionProfileViewId(value: string): value is SelectionProfileViewId {
  return VIEWS.some((view) => view === value);
}

function boundedText(value: unknown, label: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== 'string') throw new TypeError(`${label} is invalid.`);
  const normalized = value.trim().replace(/\s+/gu, ' ');
  const size = [...normalized].length;
  if ((!allowEmpty && size === 0) || size > maximum || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError(`${label} is invalid.`);
  }
  return normalized;
}

export function validateSelectionProfileId(value: unknown): string {
  const id = boundedText(value, 'Selection profile identifier', SELECTION_PROFILE_LIMITS.identifierCodePoints);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(id)) throw new TypeError('Selection profile identifier is invalid.');
  return id;
}

function profileColor(value: unknown): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(value)) {
    throw new TypeError('Selection profile colour is invalid.');
  }
  return value.toLowerCase();
}

function profileView(value: unknown): SelectionProfileViewId {
  if (typeof value !== 'string' || !isSelectionProfileViewId(value)) throw new TypeError('Selection profile view is invalid.');
  return value;
}

function profileIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > SELECTION_PROFILE_LIMITS.selectedIdsPerProfile) {
    throw new TypeError('Selection profile selected IDs are invalid.');
  }
  const ids = value.map((id) => boundedText(id, 'Selection profile selected ID', SELECTION_PROFILE_LIMITS.selectedIdCodePoints));
  if (new Set(ids).size !== ids.length) throw new TypeError('Selection profile selected IDs are invalid.');
  return ids;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Selection profile is invalid.');
  return value as Record<string, unknown>;
}

export function validateSelectionProfile(value: unknown): SelectionProfile {
  const input = record(value);
  if (Object.keys(input).some((key) => !['id', 'name', 'color', 'view', 'ids'].includes(key))) {
    throw new TypeError('Selection profile is invalid.');
  }
  return Object.freeze({
    id: validateSelectionProfileId(input.id),
    name: boundedText(input.name, 'Selection profile name', SELECTION_PROFILE_LIMITS.nameCodePoints),
    color: profileColor(input.color),
    view: profileView(input.view),
    ids: Object.freeze(profileIds(input.ids)),
  });
}

export function validateSelectionProfileCreateRequest(value: unknown): SelectionProfileCreateRequest {
  const input = record(value);
  if (Object.keys(input).some((key) => !['name', 'color', 'view', 'ids'].includes(key))) {
    throw new TypeError('Selection profile create request is invalid.');
  }
  return Object.freeze({
    name: boundedText(input.name, 'Selection profile name', SELECTION_PROFILE_LIMITS.nameCodePoints),
    color: profileColor(input.color),
    view: profileView(input.view),
    ids: Object.freeze(profileIds(input.ids)),
  });
}

export function validateSelectionProfileUpdateRequest(value: unknown): SelectionProfileUpdateRequest {
  const input = record(value);
  const keys = Object.keys(input);
  if (keys.length === 0 || keys.some((key) => !['name', 'color', 'view', 'ids'].includes(key))) {
    throw new TypeError('Selection profile update request is invalid.');
  }
  return Object.freeze({
    ...(input.name === undefined ? {} : { name: boundedText(input.name, 'Selection profile name', SELECTION_PROFILE_LIMITS.nameCodePoints) }),
    ...(input.color === undefined ? {} : { color: profileColor(input.color) }),
    ...(input.view === undefined ? {} : { view: profileView(input.view) }),
    ...(input.ids === undefined ? {} : { ids: Object.freeze(profileIds(input.ids)) }),
  });
}

export function validateSelectionProfilesMigrationRequest(value: unknown): SelectionProfilesMigrationRequest {
  const input = record(value);
  if (Object.keys(input).some((key) => key !== 'profiles') || !Array.isArray(input.profiles)
    || input.profiles.length > SELECTION_PROFILE_LIMITS.profiles) {
    throw new TypeError('Selection profile migration request is invalid.');
  }
  return Object.freeze({ profiles: Object.freeze(input.profiles.map(validateSelectionProfileCreateRequest)) });
}

export function validateSelectionProfilesDocument(value: unknown): SelectionProfilesDocument {
  const input = record(value);
  if (Object.keys(input).some((key) => key !== 'schemaVersion' && key !== 'profiles')
    || input.schemaVersion !== SELECTION_PROFILES_SCHEMA_VERSION || !Array.isArray(input.profiles)
    || input.profiles.length > SELECTION_PROFILE_LIMITS.profiles) {
    throw new TypeError('Selection profile document is invalid.');
  }
  const profiles = input.profiles.map(validateSelectionProfile);
  if (new Set(profiles.map(({ id }) => id)).size !== profiles.length) throw new TypeError('Selection profile document is invalid.');
  return Object.freeze({ schemaVersion: SELECTION_PROFILES_SCHEMA_VERSION, profiles: Object.freeze(profiles) });
}

export function parseSelectionProfilesJson(source: string): SelectionProfilesDocument {
  if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > SELECTION_PROFILE_LIMITS.documentBytes) {
    throw new TypeError('Selection profile document is invalid.');
  }
  try { return validateSelectionProfilesDocument(JSON.parse(source) as unknown); }
  catch { throw new TypeError('Selection profile document is invalid.'); }
}

export function serializeSelectionProfilesDocument(document: SelectionProfilesDocument): string {
  const validated = validateSelectionProfilesDocument(document);
  const source = `${JSON.stringify(validated)}\n`;
  if (Buffer.byteLength(source, 'utf8') > SELECTION_PROFILE_LIMITS.documentBytes) {
    throw new TypeError('Selection profile document exceeds the safe size limit.');
  }
  return source;
}
