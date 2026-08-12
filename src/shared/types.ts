import type { PersonalVocabularyErrorCode } from './personal-vocabulary';

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

export type NarrationClientResult =
  | { status: 'spoken'; languages: readonly ('English' | 'Yue')[] }
  | { status: 'suppressed'; reason: string }
  | { status: 'superseded' | 'cancelled' | 'stopped' }
  | { status: 'failed'; error: string };

export type ExportFormat =
  | 'md' | 'txt' | 'json' | 'jsonl' | 'yaml' | 'toml' | 'xml' | 'csv' | 'tsv'
  | 'html' | 'sql' | 'ts' | 'py' | 'go' | 'rs' | 'proto' | 'schema.json';

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
  /** Retained for typing only — the app never opens a browser. */
  openExternal(url: string): void;
  exportView(payload: { view: string; format: ExportFormat; body: string }): Promise<string>;
  readPrefs(): Promise<Partial<Preferences>>;
  writePrefs(prefs: Preferences): Promise<void>;
  history(): Promise<HistoryEntry[]>;
  appendHistory(entry: Omit<HistoryEntry, 'id' | 'at'>): Promise<HistoryEntry>;
  updateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<UpdateStatus>;
  restartToUpdate(): void;
  onUpdateStatus(cb: (status: UpdateStatus) => void): void;
  authenticatorBegin(request: AuthenticatorBeginRequest): Promise<AuthenticatorRegistration>;
  authenticatorConfirm(registrationId: string, code: string): Promise<AuthenticatorEntry>;
  authenticatorCancel(registrationId: string): Promise<boolean>;
  authenticatorList(): Promise<AuthenticatorEntry[]>;
  authenticatorCodes(id: string): Promise<AuthenticatorCodes>;
  authenticatorRemove(id: string): Promise<boolean>;
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
}

declare global {
  interface Window {
    winutil: Bridge;
  }
}
