import type { PersonalVocabularyErrorCode } from './personal-vocabulary';
import type { DialogEmojiCategory, DialogEmojiPreferences } from './dialog-emoji';
import type { DisplayNameState } from './display-name';
import type { SchoolModeSnapshot, SchoolModeState } from './school-mode';
import type { ArchiveCompressionLevel, SevenZipMethod } from './archive-export';
import type { ExportFormat as StructuredExportFormat, ExportLineEnding, ExportManifest, ExportRecord } from './export-formats';
import type { LocalHistoryAction, LocalHistoryEntry } from '../main/local-history';
import type {
  LockCreateRequest, LockRecoveryDescriptor, LockSearchRequest, LockSurfaceState,
  LockUnlockResult, LockUpdateRequest, PreparedLockTotp,
} from '../main/lock-service';
import type { OfflineDocsBundle } from './offline-docs';
import type {
  ScheduledSettingRule, ScheduledSettingsDocument, ScheduledSettingValue,
} from './scheduled-settings';

/**
 * Shared contracts between the Electron main process, the preload bridge and the renderer.
 * No runtime code lives here so it can be imported from either side.
 */

export type ViewId =
  | 'install' | 'tweaks' | 'config' | 'updates' | 'iso'
  | 'overview' | 'sync' | 'skills' | 'memory' | 'history'
  | 'changelog' | 'operations' | 'security' | 'settings';

export type LanguageMode = 'English' | 'Yue' | 'Bilingual';
export type ThemeMode = 'light' | 'dark';
export type Density = 'comfortable' | 'compact';

export interface WinutilApp {
  id: string;
  name: string;
  cat: string;
  desc: string;
  winget: string;
  choco: string;
  link: string;
  foss: boolean;
}

export interface WinutilTweak {
  id: string;
  name: string;
  cat: string;
  desc: string;
  panel: string;
  type: 'Checkbox' | 'Button' | 'ComboBox' | string;
}

export interface WinutilCatalog {
  apps: WinutilApp[];
  tweaks: WinutilTweak[];
  features: WinutilTweak[];
  presets: Record<string, string[]>;
  dns: Record<string, Record<string, string>>;
}

export interface SyncTarget {
  runtime: string;
  path: string;
  status: 'current' | 'drift' | 'missing' | 'conflict';
}

export interface HistoryEntry {
  id: string;
  action: string;
  detail: string;
  at: string;
}

export interface ReleaseEntry {
  tag: string;
  name: string;
  publishedAt: string;
  commit: string;
  evidence: string;
}

export interface SkillEntry {
  name: string;
  description: string;
  source: string;
}

export interface MemoryDoc {
  name: string;
  path: string;
  kind: string;
}

export interface OpsEvidence {
  label: string;
  detail: string;
  tag: string;
}

export interface NotificationEntry {
  id: string;
  title: string;
  detail: string;
  icon: string;
  read: boolean;
}

export interface WorkspaceTab {
  id: string;
  view: ViewId;
  pinned: boolean;
  group: string | null;
  locked: boolean;
}

export interface AppearanceOverride {
  accent?: string;
  font?: string;
  radius?: number;
  scale?: number;
  weight?: number;
}

export interface Preferences {
  theme: ThemeMode;
  density: Density;
  language: LanguageMode;
  narrator: 'English' | 'Yue' | 'Both';
  narratorEnabled: boolean;
  narratorQuiet: boolean;
  narratorReducedSound: boolean;
  enFunny: number;
  yueFunny: number;
  accent: string;
  font: string;
  scale: number;
  weight: number;
  radius: number;
  reducedMotion: boolean;
  exportFormat: ExportFormat;
}

export interface NarrationEvent {
  category: string;
  English: string;
  Yue: string;
  kind?: 'event' | 'error';
}

export interface NarrationSpeechRequest {
  id: number;
  text: string;
  language: 'English' | 'Yue';
}

export interface NarrationSpeechCancel {
  id: number;
}

export interface NarrationRuntimeState {
  platformSpeechAvailable: boolean;
  screenReaderActive: boolean;
}

export interface SettingsSurfaceState {
  displayName: DisplayNameState;
  dialogEmoji: DialogEmojiPreferences;
  dialogDecorations: Readonly<Record<DialogEmojiCategory, string | null>>;
  schoolMode: SchoolModeSnapshot;
}

export interface ScheduledSourceStatus {
  ruleId: string;
  state: 'local' | 'ready' | 'off' | 'missing-token' | 'error' | 'pending';
  checkedAt: string | null;
  nextRefreshAt: string | null;
  code: string | null;
}

export interface ScheduledSettingsState {
  document: ScheduledSettingsDocument;
  effectiveSettings: Readonly<Record<string, ScheduledSettingValue>>;
  activeRuleIds: readonly string[];
  settingRuleIds: Readonly<Record<string, string>>;
  sourceStatuses: readonly ScheduledSourceStatus[];
  timezone: string;
  evaluatedAt: string;
}

export interface ScheduledRuleSaveRequest {
  rule: ScheduledSettingRule;
}

export type SchoolModeChangeResult =
  | { ok: true; state: SchoolModeState }
  | { ok: false; code: 'credential-rejected' | 'credential-unavailable'; state: SchoolModeState };

export type NarrationClientResult =
  | { status: 'spoken'; languages: readonly ('English' | 'Yue')[] }
  | { status: 'suppressed'; reason: string }
  | { status: 'superseded' | 'cancelled' | 'stopped' }
  | { status: 'failed'; error: string };

export type ExportFormat =
  | 'md' | 'json' | 'jsonl' | 'yaml' | 'toml' | 'xml' | 'csv' | 'tsv'
  | 'html' | 'sql' | 'ts' | 'js' | 'py' | 'go' | 'rs' | 'proto' | 'schema.json';

export interface StructuredExportRequest {
  view: string;
  format: StructuredExportFormat;
  records: ExportRecord[];
  scope: { kind: 'all' | 'filtered-view' | 'selection'; detail: string; sourceCount: number; exportedCount: number };
  lineEnding: ExportLineEnding;
  archive?: {
    format: 'zip' | '7z';
    compressionLevel: ArchiveCompressionLevel;
    method?: SevenZipMethod;
    dictionarySizeMiB?: number;
    wordSize?: number;
    solid?: boolean;
    solidBlockSizeMiB?: number;
    threads?: number;
    splitVolumeSizeMiB?: number;
    encryption?: { enabled: boolean; encryptHeaders: boolean; password?: string };
  };
}

export interface StructuredExportSaveResult {
  status: 'saved' | 'cancelled';
  filePath?: string;
  manifest?: ExportManifest;
  warnings: string[];
  vscode?: { available: boolean; label?: string };
}

export interface HistoryQuery {
  query?: string;
  regex?: { source: string; flags: string };
  actions?: LocalHistoryAction[];
  from?: string;
  to?: string;
  limit?: number;
}

export interface HistoryBrowseResult {
  entries: LocalHistoryEntry[];
  actionCounts: Array<{ action: LocalHistoryAction; count: number }>;
}

export interface HistoryAccessState { configured: boolean; unlocked: boolean }

export interface CommandResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

export interface UpdateStatus {
  state: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date' | 'error';
  currentVersion: string;
  updateVersion: string;
  message: string;
  releaseUrl: string;
}

export interface TotpSecret {
  id: string;
  label: string;
  issuer: string;
  secret: string;
}

export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

export interface AuthenticatorEntry {
  id: string;
  label: string;
  account: string;
  issuer?: string;
  algorithm: TotpAlgorithm;
  digits: number;
  period: number;
  createdAt: string;
}

export type AuthenticatorBeginRequest =
  | { mode: 'generate'; account: string; issuer?: string; label?: string; algorithm?: TotpAlgorithm; digits?: number; period?: number }
  | { mode: 'import'; uri: string };

export interface AuthenticatorRegistration {
  registrationId: string;
  entry: AuthenticatorEntry;
  manualSecret: string;
  uri: string;
  qrDataUrl: string;
  imported: boolean;
  expiresAt: string;
}

export interface AuthenticatorCodes {
  id: string;
  current: string;
  next: string;
  secondsRemaining: number;
  period: number;
  digits: number;
}

export type PersonalVocabularyState =
  | { state: 'empty'; entryCount: 0; mappings: Record<string, never> }
  | { state: 'invalid'; entryCount: 0; mappings: Record<string, never> }
  | { state: 'loaded'; entryCount: number; mappings: Readonly<Record<string, string>> };

export type PersonalVocabularyUploadResult =
  | { ok: true; vocabulary: PersonalVocabularyState }
  | { ok: false; code: PersonalVocabularyErrorCode; message: 'Personal vocabulary data is invalid.' };

export type RunKind = 'install' | 'upgrade' | 'uninstall' | 'tweak' | 'undo' | 'feature' | 'update-profile';

/** The surface exposed on `window.winutil` by the preload bridge. */
export interface Bridge {
  platform: NodeJS.Platform | 'browser';
  isElevated(): Promise<boolean>;
  loadCatalog(): Promise<WinutilCatalog>;
  window(action: 'minimize' | 'maximize' | 'close'): void;
  run(kind: RunKind, ids: string[]): Promise<CommandResult>;
  installed(): Promise<string[]>;
  ensureDeps(): Promise<Array<{ name: string; present: boolean; installed: boolean; detail: string }>>;
  onProgress(cb: (p: { id: string; index: number; total: number; state: string; detail: string }) => void): void;
  loadOfflineDocs(): Promise<OfflineDocsBundle>;
  openExternal(url: string): Promise<{ ok: boolean; status: 'opened' | 'rejected' | 'failed'; error?: string }>;
  exportView(payload: StructuredExportRequest): Promise<StructuredExportSaveResult>;
  openExportInVSCode(filePath: string): Promise<{ ok: boolean; status: string; error?: string; vscodeDownloadUrl?: string }>;
  readPrefs(): Promise<Partial<Preferences>>;
  writePrefs(prefs: Preferences): Promise<void>;
  history(): Promise<HistoryEntry[]>;
  appendHistory(entry: Omit<HistoryEntry, 'id' | 'at'>): Promise<HistoryEntry>;
  historyAccess(): Promise<HistoryAccessState>;
  historyConfigureCredential(password: string): Promise<HistoryAccessState>;
  historyUnlock(password: string): Promise<HistoryAccessState>;
  historyLock(): Promise<HistoryAccessState>;
  historyBrowse(query: HistoryQuery): Promise<HistoryBrowseResult>;
  historyDiff(left: string, right: string): Promise<Array<{ path: string; kind: string; before?: unknown; after?: unknown }>>;
  historyRestore(revision: string): Promise<LocalHistoryEntry>;
  historyLabel(revision: string, label: string): Promise<LocalHistoryEntry>;
  historyPrune(keep: number): Promise<LocalHistoryEntry>;
  historyExport(query: HistoryQuery): Promise<StructuredExportSaveResult>;
  updateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<UpdateStatus>;
  restartToUpdate(): void;
  onUpdateStatus(cb: (status: UpdateStatus) => void): void;
  authenticatorBegin(request: AuthenticatorBeginRequest): Promise<AuthenticatorRegistration>;
  authenticatorImportPngFile(): Promise<AuthenticatorRegistration | null>;
  authenticatorImportClipboardPng(): Promise<AuthenticatorRegistration>;
  authenticatorConfirm(registrationId: string, code: string): Promise<AuthenticatorEntry>;
  authenticatorCancel(registrationId: string): Promise<boolean>;
  authenticatorList(): Promise<AuthenticatorEntry[]>;
  authenticatorCodes(id: string): Promise<AuthenticatorCodes>;
  authenticatorRemove(id: string): Promise<boolean>;
  lockState(surfaceId?: string): Promise<LockSurfaceState>;
  lockPrepareTotp(label: string, account?: string): Promise<PreparedLockTotp>;
  lockCreate(request: LockCreateRequest): Promise<LockSurfaceState>;
  lockUpdate(lockId: string, request: LockUpdateRequest): Promise<LockSurfaceState>;
  lockRemove(lockId: string): Promise<LockSurfaceState>;
  lockSearch(request: LockSearchRequest): Promise<LockSurfaceState['locks']>;
  lockUnlock(lockId: string, credential: string, surfaceId?: string): Promise<LockUnlockResult>;
  lockRelock(lockId: string): Promise<LockSurfaceState>;
  lockRecovery(): Promise<LockRecoveryDescriptor>;
  lockOpenRecoveryFolder(): Promise<LockRecoveryDescriptor>;
  personalVocabularyLoad(): Promise<PersonalVocabularyState>;
  personalVocabularyUpload(payload: Uint8Array): Promise<PersonalVocabularyUploadResult>;
  personalVocabularyClear(): Promise<PersonalVocabularyState>;
  narrationState(): Promise<NarrationRuntimeState>;
  narrate(event: NarrationEvent): Promise<NarrationClientResult>;
  stopNarration(): Promise<void>;
  onNarrationSpeech(cb: (request: NarrationSpeechRequest) => void): void;
  onNarrationCancel(cb: (request: NarrationSpeechCancel) => void): void;
  narrationSpeechResult(id: number, ok: boolean, error?: string): void;
  onNarrationState(cb: (state: NarrationRuntimeState) => void): void;
  settingsSurfaceState(): Promise<SettingsSurfaceState>;
  renameDisplayName(displayName: string): Promise<SettingsSurfaceState>;
  resetDisplayName(): Promise<SettingsSurfaceState>;
  setDialogEmojis(enabled: boolean): Promise<SettingsSurfaceState>;
  renameSchoolMode(displayLabel: string): Promise<SettingsSurfaceState>;
  configureSchoolModePassword(password: string): Promise<SettingsSurfaceState>;
  resetSchoolModeCredential(): Promise<SettingsSurfaceState>;
  setSchoolModeEnabled(enabled: boolean, password?: string): Promise<SchoolModeChangeResult>;
  onSettingsSurfaceState(cb: (state: SettingsSurfaceState) => void): void;
  scheduledSettingsState(): Promise<ScheduledSettingsState>;
  saveScheduledSettings(document: ScheduledSettingsDocument): Promise<ScheduledSettingsState>;
  refreshScheduledSettings(): Promise<ScheduledSettingsState>;
  setScheduledHomeAssistantToken(ruleId: string, token: Uint8Array): Promise<ScheduledSettingsState>;
  clearScheduledHomeAssistantToken(ruleId: string): Promise<ScheduledSettingsState>;
  onScheduledSettingsState(cb: (state: ScheduledSettingsState) => void): void;
}

declare global {
  interface Window {
    winutil: Bridge;
  }
}
