/* ============================================================================
 * WinUtil — renderer process.
 * Pure TypeScript, no framework. Compiled by `tsc` for Electron; the same file
 * is transpiled in-browser by preview.html, so it stays a single script-scope
 * file with no module imports.
 * ========================================================================== */

type ViewId = 'install' | 'tweaks' | 'config' | 'updates' | 'iso' | 'history' | 'docs' | 'settings';

type ThemeMode = 'light' | 'dark';
type Density = 'comfortable' | 'compact';
type LanguageMode = 'English' | 'Yue' | 'Bilingual';
type TabDock = 'left' | 'right' | 'top' | 'bottom';
type AppearanceColorSpace = 'hex' | 'rgb' | 'hsl' | 'hsv' | 'hwb' | 'lab' | 'lch' | 'oklab' | 'oklch' | 'cmyk';
type AppearanceColorValue = { space: AppearanceColorSpace; [channel: string]: string | number | undefined };
interface AppearanceColorConversion {
  value: AppearanceColorValue;
  inGamut: boolean;
  clipped: boolean;
  clippedChannels: readonly string[];
}
interface AppearanceContrastResult {
  ratio: number;
  normalTextAA: boolean;
  normalTextAAA: boolean;
  largeTextAA: boolean;
  largeTextAAA: boolean;
}
interface AppearanceColorRuntime {
  convertColor(input: AppearanceColorValue, targetSpace: AppearanceColorSpace): AppearanceColorConversion;
  contrastRatio(foreground: AppearanceColorValue, background: AppearanceColorValue): AppearanceContrastResult;
}
type TabSearchKey = 'current' | 'groupNames' | 'master' | 'inGroup' | 'closeContaining' | 'closeNot';
type DialogId =
  | 'palette' | 'regex' | 'tabs' | 'appearance' | 'lock' | 'auth'
  | 'notifications' | 'export' | 'gate' | 'about' | 'profiles' | 'saveselection' | 'dimsum' | 'color'
  | 'school-unlock' | null;

interface WinutilApp { id: string; name: string; cat: string; desc: string; winget: string; choco: string; link: string; foss: boolean; }
interface WinutilTweak { id: string; name: string; cat: string; desc: string; panel?: string; type?: string; }
interface Catalog { apps: WinutilApp[]; tweaks: WinutilTweak[]; features: WinutilTweak[]; presets: Record<string, string[]>; dns: Record<string, Record<string, string>>; }
interface WorkspaceTab { id: string; view: ViewId; pinned: boolean; group: string | null; locked: boolean; }
interface HistoryEntry { id: string; action: string; detail: string; at: string; }
interface GitHistoryEntry { commit: string; action: string; recordedAt: string; revisionId: string; restoredFrom?: string; label?: string; }
interface ExportSaveResult { status: 'saved' | 'cancelled'; filePath?: string; warnings: string[]; vscode?: { available: boolean; label?: string }; }
interface NotificationEntry { id: string; title: string; detail: string; icon: string; read: boolean; }
interface UpdateStatus { state: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date' | 'error'; currentVersion: string; updateVersion: string; message: string; releaseUrl: string; }
type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';
interface AuthenticatorEntry { id: string; label: string; account: string; issuer?: string; algorithm: TotpAlgorithm; digits: number; period: number; createdAt: string; }
interface AuthenticatorRegistration { registrationId: string; entry: AuthenticatorEntry; manualSecret: string; uri: string; qrDataUrl: string; imported: boolean; expiresAt: string; }
interface AuthenticatorCodes { id: string; current: string; next: string; secondsRemaining: number; period: number; digits: number; }
type LockTargetKind = 'tab' | 'group' | 'appearance-property';
type LockDuration = { kind: 'surface' | 'until-close'; minutes: null } | { kind: 'minutes'; minutes: number };
interface LockPublicRecord { id: string; target: { kind: LockTargetKind; id: string }; label: string; credential: { method: 'password-hash' | 'totp'; revision: number }; unlockDuration: LockDuration; lockedOnLaunch: true; }
interface LockSurfaceEntry { record: LockPublicRecord; locked: boolean; }
interface LockSurfaceState { generation: number; appDataFolder: string; locks: readonly LockSurfaceEntry[]; }
interface LockRecovery { appDataFolder: string; disclosure: string; resetInstruction: string; copyText: string; action: 'open-folder-only'; deletesData: false; }
interface PreparedLockTotp { manualSecret: string; uri: string; qrDataUrl: string; }
interface LockCreateRequest { target: { kind: LockTargetKind; id: string }; label: string; credential: { method: 'password'; credential: string; confirmationCode?: string } | { method: 'totp'; credential: string; confirmationCode?: string }; unlockDuration: LockDuration; }
interface LockUnlockResult { ok: boolean; code: 'unlocked' | 'credential-rejected' | 'credential-unavailable' | 'rate-limited'; retryAtMs: number | null; }
type DialogEmojiCategory = 'information' | 'success' | 'warning' | 'error' | 'destructive' | 'security';
interface SettingsSurfaceState {
  displayName: { schemaVersion: 1; displayName: string };
  dialogEmoji: { schemaVersion: 1; showEmojisInDialogsAndMessageBoxes: boolean };
  dialogDecorations: Record<DialogEmojiCategory, string | null>;
  schoolMode:
    | { status: 'unavailable'; code: 'shared-store-unavailable'; cause: 'read-failed' | 'watch-failed'; eventGeneration: number; recordGeneration: number | null }
    | { status: 'ready'; eventGeneration: number; recordGeneration: number; state: { enabled: boolean; displayLabel: string; credential: { method: 'none' | 'password' | 'totp'; credentialId: string | null; revision: number } }; effective: { enabled: boolean; displayLabel: string; language: LanguageMode; personalVocabularyEnabled: boolean; dimSumEnabled: boolean } };
}
type ScheduledSettingValue = null | boolean | number | string | ScheduledSettingValue[] | { [key: string]: ScheduledSettingValue };
type ScheduledSource =
  | { kind: 'local' }
  | { kind: 'json-api'; url: string; refreshMinutes: number; allowLoopbackHttpForDevelopment: boolean }
  | { kind: 'home-assistant'; baseUrl: string; entityId: string; refreshMinutes: number };
interface ScheduledRule {
  id: string; label: string; enabled: boolean; priority: number; startDate?: string; endDate?: string;
  startTime: string; endTime: string; weekdays: 'every-day' | number[];
  settings: Record<string, ScheduledSettingValue>; source?: ScheduledSource;
}
interface ScheduledSettingsState {
  document: { schemaVersion: 1; rules: ScheduledRule[] };
  effectiveSettings: Readonly<Record<string, ScheduledSettingValue>>;
  activeRuleIds: readonly string[];
  settingRuleIds: Readonly<Record<string, string>>;
  sourceStatuses: ReadonlyArray<{ ruleId: string; state: 'local' | 'ready' | 'off' | 'missing-token' | 'error' | 'pending'; checkedAt: string | null; nextRefreshAt: string | null; code: string | null }>;
  timezone: string; evaluatedAt: string;
}
type PersonalVocabularyState =
  | { state: 'empty'; entryCount: 0; mappings: Record<string, never> }
  | { state: 'invalid'; entryCount: 0; mappings: Record<string, never> }
  | { state: 'loaded'; entryCount: number; mappings: Readonly<Record<string, string>> };
type PersonalVocabularyErrorCode =
  | 'payload-too-large' | 'invalid-encoding' | 'invalid-json' | 'depth-limit' | 'duplicate-key'
  | 'unsafe-key' | 'invalid-schema' | 'too-many-entries' | 'invalid-key' | 'invalid-value';
type PersonalVocabularyUploadResult =
  | { ok: true; vocabulary: PersonalVocabularyState }
  | { ok: false; code: PersonalVocabularyErrorCode; message: 'Personal vocabulary data is invalid.' };
const MAX_PERSONAL_VOCABULARY_BYTES = 64 * 1024;
interface Prefs {
  theme: ThemeMode; density: Density; language: LanguageMode;
  narrator: 'English' | 'Yue' | 'Both'; narratorEnabled: boolean; narratorQuiet: boolean; narratorReducedSound: boolean;
  enFunny: number; yueFunny: number; accent: string; font: string;
  scale: number; weight: number; radius: number; reducedMotion: boolean; exportFormat: string;
  tabDock: TabDock;
}
interface SearchState { text: string; regex: boolean; flags: string; }
type OfflineDocInlineNode =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'emphasis'; children: readonly OfflineDocInlineNode[] }
  | { type: 'strong'; children: readonly OfflineDocInlineNode[] }
  | { type: 'link'; link: number; children: readonly OfflineDocInlineNode[] };
type OfflineDocBlockNode =
  | { type: 'heading'; level: number; children: readonly OfflineDocInlineNode[] }
  | { type: 'paragraph'; children: readonly OfflineDocInlineNode[] }
  | { type: 'list'; ordered: boolean; start: number | null; items: readonly (readonly OfflineDocInlineNode[])[] }
  | { type: 'code'; language: string | null; value: string };
type OfflineDocLink =
  | { kind: 'internal'; href: string; articlePath: string; fragment: string | null; autoOpen: false }
  | { kind: 'external'; href: string; protocol: 'https:' | 'http:' | 'mailto:'; autoOpen: false }
  | { kind: 'local-resource'; href: string; resourcePath: string; fragment: string | null; autoOpen: false }
  | { kind: 'unsafe'; href: string; reason: string; autoOpen: false };
interface OfflineDocArticle { schemaVersion: 1; path: string; title: string; category: string; hash: string; bodyText: string; ast: readonly OfflineDocBlockNode[]; links: readonly OfflineDocLink[]; suggestedArticles: ReadonlyArray<{ articlePath: string; title: string }>; }
interface OfflineDocsBundle { schemaVersion: 1; articles: readonly OfflineDocArticle[]; manifest: ReadonlyArray<{ path: string; title: string; category: string; hash: string }>; }
interface Bridge {
  platform: string;
  loadCatalog(): Promise<Catalog>;
  window(action: 'minimize' | 'maximize' | 'close'): void;
  run(kind: RunKind, ids: string[]): Promise<{ ok: boolean; code: number; stdout: string; stderr: string }>;
  installed(): Promise<string[]>;
  ensureDeps(): Promise<Array<{ name: string; present: boolean; installed: boolean; detail: string }>>;
  onProgress(cb: (p: { id: string; index: number; total: number; state: string; detail: string }) => void): void;
  loadOfflineDocs(): Promise<OfflineDocsBundle>;
  openExternal(url: string): Promise<{ ok: boolean; status: 'opened' | 'rejected' | 'failed'; error?: string }>;
  exportView(p: { view: string; format: string; records: Array<Record<string, unknown>>; scope: { kind: 'all' | 'filtered-view' | 'selection'; detail: string; sourceCount: number; exportedCount: number }; lineEnding: 'lf' | 'crlf'; archive?: Record<string, unknown> }): Promise<ExportSaveResult>;
  openExportInVSCode(filePath: string): Promise<{ ok: boolean; status: string; error?: string; vscodeDownloadUrl?: string }>;
  readPrefs(): Promise<Partial<Prefs>>;
  writePrefs(p: Prefs): Promise<void>;
  history(): Promise<HistoryEntry[]>;
  appendHistory(e: { action: string; detail: string }): Promise<HistoryEntry>;
  historyBrowse(query: { query?: string; regex?: { source: string; flags: string }; actions?: string[]; from?: string; to?: string; limit?: number }): Promise<{ entries: GitHistoryEntry[]; actionCounts: Array<{ action: string; count: number }> }>;
  historyAccess(): Promise<{ configured: boolean; unlocked: boolean }>;
  historyConfigureCredential(password: string): Promise<{ configured: boolean; unlocked: boolean }>;
  historyUnlock(password: string): Promise<{ configured: boolean; unlocked: boolean }>;
  historyLock(): Promise<{ configured: boolean; unlocked: boolean }>;
  historyDiff(left: string, right: string): Promise<Array<{ path: string; kind: string; before?: unknown; after?: unknown }>>;
  historyRestore(revision: string): Promise<GitHistoryEntry>;
  historyLabel(revision: string, label: string): Promise<GitHistoryEntry>;
  historyPrune(keep: number): Promise<GitHistoryEntry>;
  historyExport(query: Record<string, unknown>): Promise<ExportSaveResult>;
  updateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<UpdateStatus>;
  restartToUpdate(): void;
  onUpdateStatus(cb: (status: UpdateStatus) => void): void;
  authenticatorBegin(request: { mode: 'generate'; account: string; issuer?: string; label?: string; algorithm?: TotpAlgorithm; digits?: number; period?: number } | { mode: 'import'; uri: string }): Promise<AuthenticatorRegistration>;
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
  lockUpdate(lockId: string, request: { label?: string; credential?: LockCreateRequest['credential']; unlockDuration?: LockDuration }): Promise<LockSurfaceState>;
  lockRemove(lockId: string): Promise<LockSurfaceState>;
  lockSearch(request: { query?: string; regex?: { source: string; flags: string }; surfaceId?: string }): Promise<readonly LockSurfaceEntry[]>;
  lockUnlock(lockId: string, credential: string, surfaceId?: string): Promise<LockUnlockResult>;
  lockRelock(lockId: string): Promise<LockSurfaceState>;
  lockRecovery(): Promise<LockRecovery>;
  lockOpenRecoveryFolder(): Promise<LockRecovery>;
  personalVocabularyLoad(): Promise<PersonalVocabularyState>;
  personalVocabularyUpload(payload: Uint8Array): Promise<PersonalVocabularyUploadResult>;
  personalVocabularyClear(): Promise<PersonalVocabularyState>;
  narrationState(): Promise<{ platformSpeechAvailable: boolean; screenReaderActive: boolean }>;
  narrate(event: { category: string; English: string; Yue: string; kind?: 'event' | 'error' }): Promise<{ status: string; reason?: string; error?: string }>;
  stopNarration(): Promise<void>;
  onNarrationSpeech(cb: (request: { id: number; text: string; language: 'English' | 'Yue' }) => void): void;
  onNarrationCancel(cb: (request: { id: number }) => void): void;
  narrationSpeechResult(id: number, ok: boolean, error?: string): void;
  onNarrationState(cb: (state: { platformSpeechAvailable: boolean; screenReaderActive: boolean }) => void): void;
  settingsSurfaceState(): Promise<SettingsSurfaceState>;
  renameDisplayName(displayName: string): Promise<SettingsSurfaceState>;
  resetDisplayName(): Promise<SettingsSurfaceState>;
  setDialogEmojis(enabled: boolean): Promise<SettingsSurfaceState>;
  renameSchoolMode(displayLabel: string): Promise<SettingsSurfaceState>;
  configureSchoolModePassword(password: string): Promise<SettingsSurfaceState>;
  resetSchoolModeCredential(): Promise<SettingsSurfaceState>;
  setSchoolModeEnabled(enabled: boolean, password?: string): Promise<{ ok: boolean; code?: 'credential-rejected' | 'credential-unavailable' }>;
  onSettingsSurfaceState(cb: (state: SettingsSurfaceState) => void): void;
  scheduledSettingsState(): Promise<ScheduledSettingsState>;
  saveScheduledSettings(document: ScheduledSettingsState['document']): Promise<ScheduledSettingsState>;
  refreshScheduledSettings(): Promise<ScheduledSettingsState>;
  setScheduledHomeAssistantToken(ruleId: string, token: Uint8Array): Promise<ScheduledSettingsState>;
  clearScheduledHomeAssistantToken(ruleId: string): Promise<ScheduledSettingsState>;
  onScheduledSettingsState(cb: (state: ScheduledSettingsState) => void): void;
}

/* ------------------------------------------------------------- constants -- */

type RunKind = 'install' | 'upgrade' | 'uninstall' | 'tweak' | 'undo' | 'feature' | 'update-profile';

const NAV: Array<{ heading: string } | { id: ViewId; label: string; icon: string }> = [
  { heading: 'System' },
  { id: 'install', label: 'Install', icon: 'download' },
  { id: 'tweaks', label: 'Tweaks', icon: 'tune' },
  { id: 'config', label: 'Config', icon: 'build' },
  { id: 'updates', label: 'Updates', icon: 'system_update_alt' },
  { id: 'iso', label: 'Win11 Creator', icon: 'album' },
  { heading: '' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'docs', label: 'Docs', icon: 'menu_book' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const VIEW_META: Record<ViewId, { title: string; search: string }> = {
  install: { title: 'Install', search: 'Search 227 applications, winget ids and descriptions' },
  tweaks: { title: 'Tweaks', search: 'Search tweaks, categories and registry effects' },
  config: { title: 'Config', search: 'Search features, fixes, legacy panels and remote access' },
  updates: { title: 'Updates', search: 'Search update profiles' },
  iso: { title: 'Win11 Creator', search: 'Search image customization steps' },
  history: { title: 'History', search: 'Search history actions and details' },
  docs: { title: 'Docs', search: 'Search the built-in documentation' },
  settings: { title: 'Settings', search: 'Search settings, descriptions and current values' },
};

const APP_CATS = ['All', 'Browsers', 'Communications', 'Development', 'Document', 'Games',
  'Microsoft Tools', 'Multimedia Tools', 'Pro Tools', 'Selfhosted Tools', 'Utilities'];

const CAT_ICONS: Record<string, string> = {
  'Essential Tweaks': 'verified', 'z__Advanced Tweaks - CAUTION': 'warning',
  'Customize Preferences': 'palette', 'Performance Plans - NOT FOR LAPTOPS': 'bolt',
  'Features': 'extension', 'Fixes': 'healing', 'Legacy Windows Panels': 'history_toggle_off',
  'Powershell Profile Powershell 7+ Only': 'terminal', 'Remote Access': 'cast_connected',
};

/** Documentation ships inside the app. Nothing here links out to a browser. */
const DOC_PAGES: Array<{ id: string; title: string; section: string; body: string }> = [
  {
    id: 'quick-start', title: 'Quick start', section: 'Getting started',
    body: `Material System Utility launches normally without requiring administrator rights.

Package operations use Windows Package Manager (winget) with exact catalogue identifiers. Windows may request elevation for an individual package when that package requires it; browsing, search, documentation, and settings remain unelevated.

If winget is unavailable or an operation fails, the app reports the exact failed operation and exit code. It never silently substitutes a higher-risk tweak, configuration, update-profile, AppX, or ISO operation.`,
  },
  {
    id: 'install-flow', title: 'How installs are processed', section: 'Install',
    body: `Select any number of applications, then use Install selected. The queue is processed automatically and unattended:

  1. Prerequisites are verified once per session.
  2. Each package runs through winget with --silent, --accept-package-agreements,
     --accept-source-agreements and --disable-interactivity, so nothing prompts.
  3. If a package has no winget id, the Chocolatey id from the catalogue is used instead.
  4. Progress is reported per package: queued → running → done or failed with its exit code.
  5. Every completed queue appends one history revision.

Upgrade all runs winget upgrade --all. Uninstall selected runs winget uninstall with the same
silent flags. Get installed reads winget list and marks matching catalogue rows.`,
  },
  {
    id: 'presets', title: 'Tweak presets', section: 'Tweaks',
    body: `Presets come from the repository's own preset.json and select a fixed list of tweak ids.

  Standard   Balanced defaults for most users
  Minimal    Minimal changes to suit every user
  Advanced   Deep tweaks for power users

A preset only changes the selection. Nothing runs until you use Run tweaks and pass the two-key
safety gate. Undo selected reverts the same rows using each tweak's recorded original value.`,
  },
  {
    id: 'search', title: 'Search and the regex builder', section: 'Search',
    body: `Every search field in the app is independent: it keeps its own text, its own plain-text or regex
mode, and its own flags. Plain text is always the default.

The .* button beside any field, dropdown or context menu opens the builder for that field only:

  Matches   per-line match list with numbered and named capture groups and match offsets
  Replace   live replacement preview using $&, $1 and $<name>
  Explain   a token-by-token plain-English breakdown of the pattern
  Library   twelve ready patterns for winget ids, tweak ids, registry paths, versions and more

Flags i, g, m, s, u and y are toggled individually. "Test against the current view" reports how many
real rows the pattern matches before you apply it.`,
  },
  {
    id: 'bulk', title: 'Bulk actions', section: 'Search',
    body: `Right-click any row, category header, toolbar or notification for its bulk menu.

  Select all in view          adds every currently visible row to the selection
  Invert the selection        flips selected and unselected rows
  Select by regex…            opens the builder, then selects every row whose id, name or
                              description matches the pattern you apply
  Run / export / lock         act on the whole selection at once

The notification centre has the same model: select all, invert, mark read, mark unread, delete and
export operate on the checked notices.`,
  },
  {
    id: 'tabs', title: 'Tabs and groups', section: 'Workspace',
    body: `Tabs can be pinned, grouped and locked. Four independent searches exist in the tab manager:

  Current strip search   the tabs visible right now
  Group name search      the groups themselves
  Master tab search      every tab in every group
  Group tab search       the tabs inside the selected group

Close tabs containing text and its inverse, Close tabs not containing text, both preview the exact
visible-label match set first. You then authorize that previewed set. Pinned tabs are excluded until
you opt them in, and locked tabs are never closed by a bulk operation.`,
  },
  {
    id: 'locks', title: 'Locks and the authenticator', section: 'Workspace',
    body: `A lock is a for-fun lock, never a security boundary.

Every lockable element runs its own three-step wizard — method, credential, confirm — and stores its
own password or its own TOTP secret. Locking a tab does not lock its group. Locking a group does not
lock the rows inside it. There is no master credential and no inheritance.

Unlocking asks for that one element's credential. If you lose it, the Support Tickets desk opens
%APPDATA%\\winutil-m3\\locks so you can delete that single lock file yourself.

The authenticator draws its QR locally from the otpauth:// URI and shows the manual base32 key beside
it. Pairing is confirmed by typing one live code. Secrets stay in the local vault and are omitted from
ordinary exports, and the export says so.`,
  },
  {
    id: 'appearance', title: 'Appearance', section: 'Workspace',
    body: `Every rendered element has an anchored, persisted appearance editor: the palette button on a row or
card, the tab context menu, or Shift+right-click on a tab.

Each editor sets accent colour, font family, corner radius, font scale and font weight for that one
element. Reset element returns it to the inherited appearance. Save named theme stores the current
combination for reuse.

Global theme, density, font and motion preference live in Settings and persist locally to this profile.`,
  },
  {
    id: 'updates-doc', title: 'Windows update profiles', section: 'Maintenance',
    body: `Each profile replaces the Windows Update settings managed by WinUtil.

  Recommended       defers feature updates 365 days, quality updates 4 days, excludes drivers,
                    prevents automatic restarts while a user is signed in.
                    Pro, Enterprise and Education editions only.
  Windows Default   removes the policies WinUtil applied, restores update service startup
                    settings, re-enables the update scheduled tasks.
  Disable Updates   disables the automatic update policy, stops the services and scheduled tasks,
                    clears downloaded update files. Security updates will not install.

Changes apply system-wide. Restart Windows after switching profiles.`,
  },
  {
    id: 'iso-doc', title: 'Win11 Creator', section: 'Maintenance',
    body: `Four steps build a customized image from an official Microsoft ISO:

  1. Select the ISO. Only official images are supported; pre-modified images may produce broken results.
  2. Mount and verify. The edition table, build number and install.wim index are checked read-only.
  3. Modify install.wim. Selected tweaks, the AppX removal list and autounattend.xml are applied offline.
  4. Output. Write a new bootable ISO, keep the working directory, or reset to Step 1.

The build log pane shows the real DISM and oscdimg output and is itself searchable.`,
  },
  {
    id: 'export-doc', title: 'Exports', section: 'Data',
    body: `Any view exports in seventeen formats: Markdown, plain text, JSON, JSONL, YAML, TOML, XML, CSV, TSV,
HTML, SQL, TypeScript, Python, Go, Rust, Protobuf and JSON Schema.

The dialog previews the exact bytes before you save. Authenticator secrets and lock credentials are
never included, and every export states that omission.`,
  },
  {
    id: 'history-doc', title: 'History', section: 'Data',
    body: `Every state-changing action appends one revision: preset applied, queue completed, tweak undone,
lock set, settings changed.

Restoring writes a new revision rather than rewinding, so the previous state stays undoable. Filter by
free text, by date range, and by action, and export the filtered set.`,
  },
  {
    id: 'data-sources', title: 'Where the data comes from', section: 'Data',
    body: `Everything in the catalogue is read from config/winutil.json, projected from the repository config:

  applications.json   227 applications across 10 categories
  tweaks.json         67 tweaks across 4 categories
  feature.json        33 features and fixes across 5 categories
  preset.json         Standard, Minimal, Advanced
  dns.json            DNS provider table

Nothing in the app is fetched from the network at runtime except the packages you explicitly install.`,
  },
];

/** Only verified behavior is exposed through the in-app documentation. */
const SHIPPED_DOC_PAGES: Array<{ id: string; title: string; section: string; body: string }> = [
  {
    id: 'release-boundary', title: 'What this build can do', section: 'Getting started',
    body: `This safe baseline can browse and search the reviewed WinUtil catalogue, detect installed WinGet packages, install or uninstall exact catalogue package identifiers, and request a WinGet upgrade-all operation.

Tweaks, optional features, update profiles, AppX removal, ISO servicing, locks, the authenticator, automatic updates, and other higher-risk adapters are not installed. If one of those actions is reached, the app reports that it is unavailable instead of running a guessed command.`,
  },
  {
    id: 'package-operations', title: 'Package operations', section: 'Install',
    body: `The renderer uses a named, context-isolated bridge. The main process accepts only bounded WinGet identifiers or the explicit msstore:<StoreId> catalogue form. Microsoft Store entries are separated into --source msstore and a validated Store ID before execution.

Commands use argument arrays, --exact, --silent, --disable-interactivity, and agreement flags. Every real exit code and output is returned to the app.`,
  },
  {
    id: 'search', title: 'Search and regex', section: 'Workspace',
    body: `Plain-text search is the default. Each search field keeps its own query, regex mode, and flags. The adjacent .* control opens the local regex builder for that field, including flags, sample text, matches, captures, replacement preview, explanation, and a pattern library.`,
  },
  {
    id: 'tabs', title: 'Tabs and groups', section: 'Workspace',
    body: `The current shell provides browser-style tabs, pinning, named groups, group search, current-strip search, master tab search, and within-group search. Bulk close actions preview matching tabs and exclude pinned tabs unless explicitly included.`,
  },
  {
    id: 'appearance', title: 'Appearance controls', section: 'Workspace',
    body: `Theme, density, accent, font family, font scale, weight, corner radius, and reduced motion are local preferences. Per-element editors expose the currently implemented accent, font, radius, scale, and weight controls. Unsupported word-processor-depth properties are not claimed by this build.`,
  },
  {
    id: 'provenance', title: 'Catalogue provenance', section: 'Data',
    body: `The bundled catalogue is derived from WinUtil commit aee3e7a1f4a3249ff2f95e75b5bd3768626a21b6 and contains 227 applications, 67 tweaks, and 33 features. The upstream MIT notice is bundled in THIRD_PARTY_NOTICES.md. Material System Utility uses independent branding and assets.`,
  },
];

const SELECTION_COLORS: Array<[string, string]> = [
  ['violet', '#6750A4'], ['teal', '#00696E'], ['amber', '#7A5900'], ['rose', '#8E4957'],
  ['indigo', '#3F5F90'], ['moss', '#3F6B3F'], ['clay', '#8C4A28'], ['slate', '#4A5560'],
];

/** Shown by the dim sum surprise. Names only — the catalogue itself is a separate product. */
const DIM_SUM = [
  ['Har gow', 'Steamed shrimp dumpling in a translucent wheat-starch wrapper'],
  ['Siu mai', 'Open-topped pork and shrimp dumpling, often crowned with roe'],
  ['Char siu bao', 'Barbecued pork bun, steamed soft or baked with a crackly top'],
  ['Cheung fun', 'Rolled rice noodle sheets with sweet soy'],
  ['Lo mai gai', 'Glutinous rice with chicken, steamed in a lotus leaf'],
  ['Dan tat', 'Egg tart with a flaky or shortcrust shell'],
  ['Phoenix claws', 'Braised chicken feet in black bean sauce'],
  ['Woo kok', 'Deep-fried taro puff with a lacy shell'],
  ['Ma lai go', 'Steamed brown sugar sponge cake'],
  ['Jin deui', 'Sesame ball with lotus or red bean paste'],
];

const EXPORT_FORMATS: Array<[string, string]> = [
  ['md', 'Markdown'], ['json', 'JSON'], ['jsonl', 'JSONL'], ['yaml', 'YAML'],
  ['toml', 'TOML'], ['xml', 'XML'], ['csv', 'CSV'], ['tsv', 'TSV'], ['html', 'HTML'], ['sql', 'SQL'],
  ['ts', 'TypeScript'], ['js', 'JavaScript'], ['py', 'Python'], ['go', 'Go'], ['rs', 'Rust'], ['proto', 'Protobuf'],
  ['schema.json', 'JSON Schema'],
];

const UPDATE_PROFILES = [
  {
    key: 'security', title: 'Recommended', subtitle: 'Balanced security and stability', variant: 'filled', button: 'Apply Recommended',
    bullets: ['Defers feature updates for 365 days', 'Defers quality updates for 4 days', 'Excludes drivers from quality updates', 'Prevents automatic restarts while a user is signed in'],
    note: 'Available on Windows Pro, Enterprise, and Education editions.', danger: false,
  },
  {
    key: 'default', title: 'Windows Default', subtitle: 'Return control to Windows', variant: 'tonal', button: 'Restore Defaults',
    bullets: ['Removes Windows Update policies applied by WinUtil', 'Restores update service startup settings', 'Re-enables update scheduled tasks'],
    note: 'Use this to undo the Recommended or Disable profile.', danger: false,
  },
  {
    key: 'disable', title: 'Disable Updates', subtitle: 'Advanced use only', variant: 'danger', button: 'Disable Updates',
    bullets: ['Disables automatic update policy', 'Stops update services and scheduled tasks', 'Clears downloaded update files'],
    note: 'Security updates will not be installed while this profile is active.', danger: true,
  },
];

const ISO_STEPS = [
  { n: 1, title: 'Select Windows 11 ISO', body: 'Browse to your locally saved Windows 11 ISO file. Only official ISOs downloaded from Microsoft are supported. NOTE: this is only meant for fresh and new Windows installs.', warn: 'You must use an official Microsoft ISO. Third-party, pre-modified, or unofficial images are not supported and may produce broken results.', field: 'No ISO selected...', button: 'Browse', options: [] as Array<{ icon: string; label: string }> },
  { n: 2, title: 'Mount & Verify ISO', body: 'The image is mounted read-only and its edition table, build number, and install.wim index are verified before anything is written.', warn: '', field: 'Not mounted', button: 'Mount', options: [] },
  { n: 3, title: 'Modify install.wim', body: 'Apply the selected tweaks, remove the chosen AppX packages, and inject the autounattend answer file into the offline image.', warn: '', field: '', button: '', options: [{ icon: 'tune', label: 'Carry over selected tweaks' }, { icon: 'delete_sweep', label: 'Apply the AppX removal list' }, { icon: 'description', label: 'Inject autounattend.xml' }] },
  { n: 4, title: 'Output: what would you like to do with the modified image?', body: 'Write a new bootable ISO, keep the working directory for inspection, or reset the interface back to Step 1.', warn: '', field: '', button: '', options: [{ icon: 'save', label: 'Create a new bootable ISO' }, { icon: 'folder_open', label: 'Keep the working directory' }, { icon: 'restart_alt', label: 'Clean up and reset to Step 1' }] },
];

const COPY_EN = {
  run: 'Run selected', clear: 'Clear selection', installed: 'Get installed',
  ready: 'Everything is local, searchable and reversible.',
  mainMenu: 'Main menu', notificationCentre: 'Notification centre', theme: 'Theme', settings: 'Settings',
  minimize: 'Minimize', maximize: 'Maximize', close: 'Close', search: 'Search', clearSearch: 'Clear search',
  regexForSearch: 'Open the regex builder for this search', searchDestinations: 'Search destinations',
  system: 'System', install: 'Install', tweaks: 'Tweaks', config: 'Config', updates: 'Updates',
  creator: 'Win11 Creator', history: 'History', docs: 'Docs',
  installSearch: 'Search 227 applications, winget ids and descriptions',
  tweakSearch: 'Search tweaks, categories and registry effects',
  configSearch: 'Search features, fixes, legacy panels and remote access',
  updateSearch: 'Search update profiles', creatorSearch: 'Search image customization steps',
  historySearch: 'Search history actions and details', docsSearch: 'Search the built-in documentation',
  settingsSearch: 'Search settings, descriptions and current values',
  installSelectedPackages: 'Install the selected packages', readOnlyView: 'Read-only view',
  adapterUnavailable: 'Unavailable until the reviewed system adapter is installed',
  openWorkspaceTabs: 'Open workspace tabs', pinned: 'pinned', locked: 'locked', openTab: 'Open a tab',
  tabManager: 'Tabs, groups and safe closing', selectAll: 'Select all', deselectAll: 'Deselect all',
  refresh: 'Refresh', moreActions: '{count} more action(s)', selectionColour: 'Selection colour',
  saveSelection: 'Save this selection as a profile', selectionProfiles: 'Selection profiles ({count})',
  exportView: 'Export this view ({format})', installSelected: 'Install selected', upgradeAll: 'Upgrade all',
  uninstallSelected: 'Uninstall selected', nothingSelected: 'Nothing is selected.',
  installCount: '{visible} of {total} · {selected} selected', searchCategories: 'Search categories',
  noApplications: 'No application matches this filter.', installedChip: 'INSTALLED',
  noCategories: 'No category matches this search.',
  selectItem: 'Select {name}', showEntry: 'Show the catalogue entry', copyWinget: 'Copy the winget id',
  copiedWinget: 'Copied {id}', installOne: 'Install just this package', editAppearance: 'Edit appearance',
  installPackage: 'Install {name}', installPackages: 'Install {count} package(s)',
  upgradePackages: 'Upgrade every installed package', uninstallPackages: 'Uninstall {count} package(s)',
  chipHint: 'Click to filter, Ctrl+click to combine several', filterOnly: 'Filter to {category} only',
  addFilter: 'Add {category} to the current filter', selectCategory: 'Select every app in {category}',
  installCategory: 'Install every selected app in {category}', editChip: 'Edit this chip’s appearance…',
  lockFilter: 'Lock the {category} filter…',
} as const;
type CopyKey = keyof typeof COPY_EN;

const COPY_YUE: Record<CopyKey, string> = {
  run: '執行揀咗嘅', clear: '清除選擇', installed: '查看已安裝',
  ready: '全部都喺本機，可搜尋，亦可以還原。',
  mainMenu: '主選單', notificationCentre: '通知中心', theme: '主題', settings: '設定',
  minimize: '最小化', maximize: '最大化', close: '關閉', search: '搜尋', clearSearch: '清除搜尋',
  regexForSearch: '開啟呢個搜尋欄嘅正規表示式建構器', searchDestinations: '搜尋目的地',
  system: '系統', install: '安裝', tweaks: '調校', config: '設定功能', updates: '更新',
  creator: 'Win11 映像製作器', history: '歷史', docs: '說明文件',
  installSearch: '搜尋 227 個應用程式、winget 識別碼同描述',
  tweakSearch: '搜尋調校、分類同登錄效果',
  configSearch: '搜尋功能、修正、傳統面板同遙距存取',
  updateSearch: '搜尋更新設定檔', creatorSearch: '搜尋映像自訂步驟',
  historySearch: '搜尋歷史動作同詳情', docsSearch: '搜尋內置說明文件',
  settingsSearch: '搜尋設定、說明同目前值',
  installSelectedPackages: '安裝已選套件', readOnlyView: '唯讀檢視',
  adapterUnavailable: '要等經審核嘅系統配接器安裝好先可以用',
  openWorkspaceTabs: '已開啟嘅工作區分頁', pinned: '已釘選', locked: '已鎖定', openTab: '開新分頁',
  tabManager: '分頁、群組同安全關閉', selectAll: '全部選取', deselectAll: '全部取消選取',
  refresh: '重新整理', moreActions: '另外 {count} 個動作', selectionColour: '選擇項目顏色',
  saveSelection: '將目前選擇儲存為設定檔', selectionProfiles: '選擇設定檔（{count}）',
  exportView: '匯出呢個檢視（{format}）', installSelected: '安裝已選項目', upgradeAll: '全部升級',
  uninstallSelected: '解除安裝已選項目', nothingSelected: '未有揀任何項目。',
  installCount: '顯示 {visible} / {total} · 已選 {selected}', searchCategories: '搜尋分類',
  noApplications: '冇應用程式符合呢個篩選條件。', installedChip: '已安裝',
  noCategories: '冇分類符合呢個搜尋。',
  selectItem: '選取 {name}', showEntry: '顯示目錄項目', copyWinget: '複製 winget 識別碼',
  copiedWinget: '已複製 {id}', installOne: '只安裝呢個套件', editAppearance: '編輯外觀',
  installPackage: '安裝 {name}', installPackages: '安裝 {count} 個套件',
  upgradePackages: '升級所有已安裝套件', uninstallPackages: '解除安裝 {count} 個套件',
  chipHint: '按一下篩選；按住 Ctrl 再按可合併多個分類', filterOnly: '只篩選 {category}',
  addFilter: '將 {category} 加入目前篩選', selectCategory: '選取 {category} 入面所有應用程式',
  installCategory: '安裝 {category} 入面所有已選應用程式', editChip: '編輯呢個分類籤嘅外觀…',
  lockFilter: '鎖定 {category} 篩選…',
};

const VIEW_COPY: Record<ViewId, { title: CopyKey; search: CopyKey }> = {
  install: { title: 'install', search: 'installSearch' }, tweaks: { title: 'tweaks', search: 'tweakSearch' },
  config: { title: 'config', search: 'configSearch' }, updates: { title: 'updates', search: 'updateSearch' },
  iso: { title: 'creator', search: 'creatorSearch' }, history: { title: 'history', search: 'historySearch' },
  docs: { title: 'docs', search: 'docsSearch' }, settings: { title: 'settings', search: 'settingsSearch' },
};

const CATEGORY_YUE: Record<string, string> = {
  All: '全部', Browsers: '瀏覽器', Communications: '通訊', Development: '開發', Document: '文件',
  Games: '遊戲', 'Microsoft Tools': 'Microsoft 工具', 'Multimedia Tools': '多媒體工具',
  'Pro Tools': '專業工具', 'Selfhosted Tools': '自託管工具', Utilities: '實用工具',
};

/* ----------------------------------------------------------------- state -- */

const DEFAULT_PREFS: Prefs = {
  theme: 'dark', density: 'comfortable', language: 'English', narrator: 'English', narratorEnabled: false,
  narratorQuiet: false, narratorReducedSound: false,
  enFunny: 3, yueFunny: 4, accent: '#6750A4', font: 'Segoe UI Variable', scale: 1, weight: 400, radius: 16,
  reducedMotion: false, exportFormat: 'md', tabDock: 'left',
};

const makeSearchState = (): SearchState => ({ text: '', regex: false, flags: 'iu' });

const state = {
  catalog: { apps: [], tweaks: [], features: [], presets: {}, dns: {} } as Catalog,
  view: 'install' as ViewId,
  drawerCollapsed: false,
  search: { text: '', regex: false, flags: 'iu' } as SearchState,
  dialogSearch: { text: '', regex: false, flags: 'iu' } as SearchState,
  searches: {} as Record<string, SearchState>,
  cat: 'All',
  chips: new Set<string>(['All']),
  selected: new Set<string>(),
  selectionColor: '#6750A4',
  rowColors: {} as Record<string, string>,
  profiles: [] as Array<{ id: string; name: string; color: string; view: ViewId; ids: string[] }>,
  profileDraft: { name: '', color: '#6750A4' },
  dimSumSeen: 0,
  picker: { target: '', label: '', h: 258, s: 32, l: 48, alpha: 1, representation: 'hex' as AppearanceColorSpace, representationInput: '', contrastBackground: '#ffffff', error: '', recents: [] as string[] },
  collapsedGroups: new Set<string>(),
  reading: null as null | { title: string; path: string; body: string; article?: OfflineDocArticle },
  offlineDocs: null as OfflineDocsBundle | null,
  offlineDocsError: '',
  installedIds: new Set<string>(),
  tabs: [
    { id: 't1', view: 'install', pinned: true, group: 'System', locked: false },
    { id: 't2', view: 'tweaks', pinned: false, group: 'System', locked: false },
    { id: 't3', view: 'config', pinned: false, group: 'System', locked: false },
    { id: 't4', view: 'updates', pinned: false, group: 'Maintenance', locked: false },
  ] as WorkspaceTab[],
  groups: ['System', 'Maintenance'] as string[],
  activeTab: 't1',
  tabSearches: {
    current: makeSearchState(), groupNames: makeSearchState(), master: makeSearchState(),
    inGroup: makeSearchState(), closeContaining: makeSearchState(), closeNot: makeSearchState(),
  } as Record<TabSearchKey, SearchState>,
  tabClosePreview: [] as string[],
  tabIncludePinned: false,
  selectedGroup: 'System',
  dialog: null as DialogId,
  dialogArg: '' as string,
  regexDraft: {
    pattern: '(chrome|firefox|brave)', flags: 'iu', target: 'main' as string,
    sample: 'Brave Browser\nMozilla Firefox\nGoogle Chrome\nChromium\n7zip.7zip\nMicrosoft.PowerToys',
    replace: '[$&]', tab: 'match' as 'match' | 'replace' | 'explain' | 'library',
    history: [] as string[], cursor: 0,
  },
  dlgSelected: new Set<string>(),
  appearanceTarget: { id: 'app-root', label: 'Application root' },
  appearanceOverrides: {} as Record<string, { accent: string; font: string; radius: number; scale: number; weight: number }>,
  gate: { left: false, right: false, slider: 0, action: '', kind: null as RunKind | null, ids: null as string[] | null, after: null as null | (() => void) },
  queue: { active: false, index: 0, total: 0, current: '', log: [] as string[] },
  deps: [] as Array<{ name: string; present: boolean; installed: boolean; detail: string }>,
  prefs: { ...DEFAULT_PREFS },
  runOutput: 'No command has run yet. Package actions use WinGet. Other system operations stay disabled until their verified WinUtil adapter is installed.',
  history: [] as HistoryEntry[],
  gitHistory: [] as GitHistoryEntry[],
  historyCounts: [] as Array<{ action: string; count: number }>,
  historyFilter: { from: '', to: '', action: 'all' },
  historySelected: [] as string[],
  historyMessage: '',
  historyAccess: { configured: false, unlocked: false, password: '' },
  exportDraft: { archive: 'none', lineEnding: 'lf', level: 'normal', method: 'LZMA2', dictionary: 64, word: 64, solid: true, solidBlock: 256, threads: 4, split: 0, encryption: false, encryptHeaders: true, password: '', savedPath: '' },
  notifications: [] as NotificationEntry[],
  update: { state: 'idle', currentVersion: '0.1.0', updateVersion: '', message: 'Automatic update checks are enabled.', releaseUrl: '' } as UpdateStatus,
  auth: {
    phase: 'list' as 'list' | 'generate' | 'import' | 'confirm', loading: false, error: '', status: '',
    entries: [] as AuthenticatorEntry[], selectedId: '', codes: null as AuthenticatorCodes | null,
    registration: null as AuthenticatorRegistration | null, revealSecret: false,
    fixtureMode: false,
    draft: { issuer: 'Material System Utility', account: '', label: '', algorithm: 'SHA1' as TotpAlgorithm, digits: 6, period: 30, uri: '', code: '' },
  },
  locks: {
    data: { generation: 0, appDataFolder: '', locks: [] } as LockSurfaceState,
    loading: false, error: '', phase: 'list' as 'list' | 'set' | 'unlock' | 'recovery' | 'support',
    target: { kind: 'appearance-property' as LockTargetKind, id: 'app-root', label: 'Application root' },
    selectedId: '', credential: '', confirmCredential: '', totpCode: '', method: 'password' as 'password' | 'totp',
    duration: 'surface' as 'surface' | 'minutes' | 'until-close', minutes: 15,
    recovery: null as LockRecovery | null,
    preparedTotp: null as PreparedLockTotp | null, revealTotpSecret: false,
    tickets: [] as Array<{ id: string; category: string; description: string; status: string; createdAt: string }>,
    ticketCategory: 'Forgotten lock credential', ticketDescription: '',
  },
  vocabulary: {
    data: { state: 'empty', entryCount: 0, mappings: {} } as PersonalVocabularyState,
    status: 'empty' as 'empty' | 'loaded' | 'invalid', loading: false,
  },
  narration: { platformSpeechAvailable: true, screenReaderActive: false, activeSpeechId: 0 },
  settingsSurface: null as SettingsSurfaceState | null,
  settingsDraft: { displayName: '', schoolLabel: '', password: '', confirmPassword: '', error: '', busy: false },
  schedule: {
    data: null as ScheduledSettingsState | null, selectedId: '', tab: 'rules' as 'rules' | 'editor' | 'sources',
    busy: false, error: '', token: '',
    draft: null as ScheduledRule | null,
  },
  snack: '',
  isoLog: '[00:00:00] Waiting for an ISO. Select an official Microsoft image to begin.',
};

const WORKSPACE_STORAGE_KEY = 'material-system-utility.workspace.v1';
const VALID_VIEWS = new Set<ViewId>(['install', 'tweaks', 'config', 'updates', 'iso', 'history', 'docs', 'settings']);
let workspaceReady = false;
let authenticatorRefreshTimer = 0;
let authenticatorRefreshBusy = false;
let authenticatorExpiryTimer = 0;
let authenticatorOperationGeneration = 0;
let dialogReturnFocus: HTMLElement | null = null;

interface StoredWorkspace {
  schemaVersion: 1;
  tabs: WorkspaceTab[];
  groups: string[];
  collapsedGroups: string[];
  activeTab: string;
  selectedGroup: string;
  tabDock: TabDock;
}

function normalizeGroupName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 64);
}

function persistWorkspace(): void {
  if (!workspaceReady) return;
  const stored: StoredWorkspace = {
    schemaVersion: 1,
    tabs: state.tabs.map((tab) => ({ ...tab, locked: Boolean(tab.locked) })),
    groups: [...state.groups],
    collapsedGroups: [...state.collapsedGroups],
    activeTab: state.activeTab,
    selectedGroup: state.selectedGroup,
    tabDock: state.prefs.tabDock,
  };
  try { localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(stored)); } catch { /* retain the live workspace */ }
}

function loadWorkspace(): void {
  try {
    const parsed = JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? 'null') as Partial<StoredWorkspace> | null;
    if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.tabs)) return;
    const seen = new Set<string>();
    const tabs = parsed.tabs.filter((tab): tab is WorkspaceTab => {
      if (!tab || typeof tab.id !== 'string' || seen.has(tab.id) || !VALID_VIEWS.has(tab.view)) return false;
      seen.add(tab.id);
      return typeof tab.pinned === 'boolean' && (tab.group === null || typeof tab.group === 'string');
    }).map((tab) => ({ ...tab, group: tab.group ? normalizeGroupName(tab.group) : null, locked: Boolean(tab.locked) }));
    if (!tabs.length) return;
    const groups = Array.isArray(parsed.groups)
      ? parsed.groups.filter((group): group is string => typeof group === 'string').map(normalizeGroupName).filter(Boolean)
      : [];
    tabs.forEach((tab) => { if (tab.group) groups.push(tab.group); });
    state.tabs = tabs;
    state.groups = [...new Set(groups)];
    state.collapsedGroups = new Set(Array.isArray(parsed.collapsedGroups)
      ? parsed.collapsedGroups.filter((group): group is string => typeof group === 'string' && state.groups.includes(group))
      : []);
    state.activeTab = tabs.some((tab) => tab.id === parsed.activeTab) ? parsed.activeTab! : tabs[0].id;
    state.selectedGroup = typeof parsed.selectedGroup === 'string' && state.groups.includes(parsed.selectedGroup)
      ? parsed.selectedGroup : state.groups[0] ?? 'Ungrouped';
    if (parsed.tabDock && ['left', 'right', 'top', 'bottom'].includes(parsed.tabDock)) state.prefs.tabDock = parsed.tabDock;
    const active = tabs.find((tab) => tab.id === state.activeTab)!;
    state.view = active.view;
  } catch { /* a malformed workspace falls back to the reviewed defaults */ }
}

function setTabDock(dock: TabDock): void {
  state.prefs.tabDock = dock;
  render();
}

function moveTabToGroup(tab: WorkspaceTab, group: string | null): void {
  tab.group = group;
  if (group && !state.groups.includes(group)) state.groups.push(group);
  persistWorkspace();
  render();
}

function tabSearch(key: TabSearchKey): SearchState {
  return state.tabSearches[key];
}

function searchValidation(search: SearchState): { valid: boolean; message: string; match: (text: string) => boolean } {
  const text = search.text.trim();
  if (!text) return { valid: false, message: 'Enter text before previewing a close action.', match: () => false };
  if (!search.regex) {
    const lower = text.toLocaleLowerCase();
    return { valid: true, message: 'Plain-text matching is active.', match: (candidate) => candidate.toLocaleLowerCase().includes(lower) };
  }
  try {
    const expression = new RegExp(text, search.flags);
    return {
      valid: true,
      message: `Valid pattern · /${text}/${search.flags}`,
      match: (candidate) => { expression.lastIndex = 0; return expression.test(candidate); },
    };
  } catch (error) {
    return { valid: false, message: `Invalid pattern · ${error instanceof Error ? error.message : String(error)}`, match: () => false };
  }
}

/* ------------------------------------------------------------- utilities -- */

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);

function h(tag: string, attrs: Record<string, unknown> = {}, ...kids: Array<Node | string | null | false>): HTMLElement {
  const node = document.createElement(tag);
  const personalizable = attrs['data-personalizable'] === 'true';
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'style' && typeof v === 'string') node.setAttribute('style', v);
    else if (['title', 'placeholder', 'aria-label', 'aria-description', 'alt'].includes(k)) node.setAttribute(k, personalizable ? personalText(String(v)) : String(v));
    else node.setAttribute(k, String(v));
  }
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.appendChild(typeof kid === 'string' ? document.createTextNode(personalizable ? personalText(kid) : kid) : kid);
  }
  return node;
}

/** Personal vocabulary applies only at the private renderer text boundary.
 * Technical spans, commands, URLs, identifiers, paths, and form values keep
 * their exact source text. The main process has already validated mappings. */
function personalText(input: string): string {
  if (schoolModeRestrictsPersonalization() || state.vocabulary.data.state !== 'loaded' || !input) return input;
  const mappings = state.vocabulary.data.mappings;
  const keys = Object.keys(mappings).sort((left, right) => right.length - left.length || (left < right ? -1 : left > right ? 1 : 0));
  let output = ''; let offset = 0;
  while (offset < input.length) {
    const key = keys.find((candidate) => input.startsWith(candidate, offset));
    if (!key) { output += input[offset]; offset += 1; continue; }
    output += mappings[key]; offset += key.length;
  }
  return output;
}

type VocabularyCopyKey = 'title' | 'description' | 'choose' | 'replace' | 'clear' | 'empty' | 'loaded' | 'invalid' | 'privacy' | 'loading';
const VOCABULARY_COPY: Record<LanguageMode, Record<VocabularyCopyKey, string>> = {
  English: {
    title: 'Personal vocabulary', description: 'Choose a local version 1 JSON file to replace app-owned display text.',
    choose: 'Choose local JSON', replace: 'Replace local JSON', clear: 'Clear and reset', empty: 'No file loaded. Shipped wording is active.',
    loaded: 'Local vocabulary loaded: {count} replacement(s).', invalid: 'That JSON is invalid. The previous valid vocabulary, if any, remains active.',
    privacy: 'Processed only on this device. File contents, source path, and metadata are omitted from exports, history, logs, and telemetry.',
    loading: 'Validating the local file…',
  },
  Yue: {
    title: '個人詞彙', description: '揀一個本機第 1 版 JSON 檔，替換應用程式自己顯示嘅文字。',
    choose: '揀本機 JSON', replace: '更換本機 JSON', clear: '清除並重設', empty: '未載入檔案，依家用緊原裝文字。',
    loaded: '本機詞彙已載入：{count} 個替換。', invalid: '呢個 JSON 無效；如果之前有有效詞彙，會繼續照用，唔會半途換字。',
    privacy: '只喺呢部裝置處理。檔案內容、來源路徑同中繼資料唔會寫入匯出、歷史、日誌或遙測。',
    loading: '正在驗證本機檔案…',
  },
  Bilingual: {} as Record<VocabularyCopyKey, string>,
};

function vocabularyCopy(key: VocabularyCopyKey, count = 0): string {
  const interpolate = (value: string): string => personalText(value).replace('{count}', String(count));
  if (effectiveLanguage() === 'Bilingual') {
    return `${interpolate(VOCABULARY_COPY.English[key])} · ${interpolate(VOCABULARY_COPY.Yue[key])}`;
  }
  return interpolate(VOCABULARY_COPY[effectiveLanguage()][key]);
}

async function loadPersonalVocabulary(): Promise<void> {
  try {
    state.vocabulary.data = await bridge().personalVocabularyLoad();
    state.vocabulary.status = state.vocabulary.data.state;
  } catch {
    state.vocabulary.data = { state: 'invalid', entryCount: 0, mappings: {} };
    state.vocabulary.status = 'invalid';
  }
}

async function uploadPersonalVocabulary(file: File): Promise<void> {
  if (state.vocabulary.loading) return;
  state.vocabulary.loading = true;
  render();
  let payload: Uint8Array | null = null;
  try {
    if (file.size > MAX_PERSONAL_VOCABULARY_BYTES) throw new Error('payload-too-large');
    payload = new Uint8Array(await file.arrayBuffer());
    const result = await bridge().personalVocabularyUpload(payload);
    if (!result.ok) {
      state.vocabulary.status = 'invalid';
      snack(vocabularyCopy('invalid'));
      return;
    }
    state.vocabulary.data = result.vocabulary;
    state.vocabulary.status = 'loaded';
    snack(vocabularyCopy('loaded', result.vocabulary.entryCount));
  } catch {
    state.vocabulary.status = 'invalid';
    snack(vocabularyCopy('invalid'));
  } finally {
    payload?.fill(0);
    state.vocabulary.loading = false;
    render();
  }
}

async function clearPersonalVocabulary(): Promise<void> {
  if (state.vocabulary.loading) return;
  state.vocabulary.loading = true;
  render();
  try {
    state.vocabulary.data = await bridge().personalVocabularyClear();
    state.vocabulary.status = 'empty';
    snack(vocabularyCopy('empty'));
  } catch {
    state.vocabulary.status = 'invalid';
    snack(vocabularyCopy('invalid'));
  } finally {
    state.vocabulary.loading = false;
    render();
  }
}

const ICONS: Record<string, string> = {
  add: '+', album: '◉', arrow_back: '←', arrow_drop_down: '⌄', backspace: '⌫', bookmark: '◆',
  bookmark_add: '◇+', bookmarks: '◆', bolt: 'ϟ', build: '⚒', check: '✓', check_box: '☑',
  check_box_outline_blank: '☐', check_circle: '✓', checklist: '☷', chevron_right: '›',
  clear_all: '≡×', close: '×', close_fullscreen: '↙', colorize: '◒', content_copy: '▣',
  contrast: '◐', crop_square: '□', data_object: '.*', delete: '⌫', delete_sweep: '⌫',
  density_medium: '≡', deselect: '☐', done_all: '✓✓', download: '↓', download_done: '✓',
  drive_file_move: '↪', edit: '✎', error: '!', extension: '✚', fact_check: '☑',
  filter_alt: '▽', filter_alt_off: '▽×', flip_to_front: '⇄', folder_open: '▣',
  healing: '✚', history: '↺', history_toggle_off: '◷', inbox: '▤', indeterminate_check_box: '⊟',
  info: 'i', label: '◇', light_mode: '☀', dark_mode: '☾', lock: '▣', lock_open: '□',
  mark_email_read: '✓', mark_email_unread: '✉', menu: '☰', menu_book: '▤', menu_open: '☷',
  more_vert: '⋮', notifications: '◉', open_in_full: '↗', open_in_new: '↗', palette: '◒',
  password: '•••', pin: '◎', play_arrow: '▶', push_pin: '⌖', recommend: '★', refresh: '↻',
  remove: '−', restart_alt: '↻', restaurant: '♨', restore: '↺', save: '▤', search: '⌕',
  search_off: '⌕×', select_all: '☑', settings: '⚙', settings_backup_restore: '↺',
  system_update_alt: '⇩', tab: '▰', tab_group: '▤', terminal: '>_', translate: '文',
  tune: '≡', undo: '↶', upgrade: '↑', verified: '✓', warning: '⚠', description: '▧',
  cast_connected: '▣', expand_less: '⌃', expand_more: '⌄', folder: '▤', inventory_2: '▣',
  keep_off: '⌖×', play_circle: '▷', article: '▧', image: '▧', content_paste: '▤',
  security: '◈', volume_off: '♪×', help: '?',
};
const icon = (name: string, cls = ''): HTMLElement => h('span', {
  class: `mi ${cls}`.trim(), 'aria-hidden': 'true', title: '',
}, ICONS[name] ?? ICONS.help);

/** Every search field in the app is registered by key, so each one gets its own
 *  persisted text, its own plain-text/regex mode, and its own anchored builder. */
function sq(key: string): SearchState {
  if (key.startsWith('tabs:')) {
    const tabKey = key.slice(5) as TabSearchKey;
    if (tabKey in state.tabSearches) return tabSearch(tabKey);
  }
  state.searches[key] = state.searches[key] ?? { text: '', regex: false, flags: 'iu' };
  return state.searches[key];
}

function searchLine(key: string, placeholder: string, variant: 'field' | 'bar' = 'field'): HTMLElement {
  const s = sq(key);
  const input = h('input', {
    value: s.text, placeholder, 'aria-label': placeholder, spellcheck: 'false',
    oninput: (e: Event) => {
      s.text = (e.target as HTMLInputElement).value;
      if (key === 'history') void refreshGitHistory(); else render();
      const next = document.querySelector<HTMLInputElement>(`[data-search="${key}"] input`);
      if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
    },
  }) as HTMLInputElement;
  return h('div', { class: `searchline${variant === 'bar' ? ' bar' : ''}`, 'data-search': key },
    icon('search', 'lead'),
    input,
    s.text ? h('button', { class: 'icon-btn small', title: 'Clear', onclick: () => { s.text = ''; if (key === 'history') void refreshGitHistory(); else render(); } }, icon('close')) : null,
    h('button', {
      class: `regex-btn${s.regex ? ' on' : ''}`, title: `Regex builder for “${placeholder}”`,
      onclick: () => { state.regexDraft.target = key; state.regexDraft.pattern = s.text || state.regexDraft.pattern; openDialog('regex'); },
    }, '.*'));
}

function makeMatcher(s: SearchState): (text: string) => boolean {
  const q = s.text.trim();
  if (!q) return () => true;
  if (!s.regex) { const lower = q.toLowerCase(); return (t) => t.toLowerCase().includes(lower); }
  try { const re = new RegExp(q, s.flags); return (t) => { re.lastIndex = 0; return re.test(t); }; }
  catch { const lower = q.toLowerCase(); return (t) => t.toLowerCase().includes(lower); }
}

const relTime = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

function snack(msg: string): void {
  state.snack = msg;
  let live = document.getElementById('live-status');
  if (!live) {
    live = h('div', { id: 'live-status', class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    document.body.appendChild(live);
  }
  live.textContent = '';
  window.setTimeout(() => { if (live) live.textContent = msg; }, 0);
  render();
  window.setTimeout(() => { if (state.snack === msg) { state.snack = ''; render(); } }, 3200);
}

function record(action: string, detail: string): void {
  const entry: HistoryEntry = { id: `h-${Date.now()}`, action, detail, at: new Date().toISOString() };
  state.history = [entry, ...state.history];
  void bridge().appendHistory({ action, detail }).catch(() => undefined);
}

/** Browser fallback so preview.html renders the exact same code path. */
function bridge(): Bridge {
  const w = window as unknown as { winutil?: Bridge };
  if (w.winutil) return w.winutil;
  const fake: Bridge = {
    platform: 'browser',
    loadCatalog: () => fetch('config/winutil.json').then((r) => r.json() as Promise<Catalog>),
    window: () => snack('Window controls are handled by the Electron main process.'),
    run: async (kind, ids) => {
      for (let i = 0; i < ids.length; i += 1) {
        state.queue = { ...state.queue, index: i + 1, current: ids[i] };
        render();
        await new Promise((r) => window.setTimeout(r, 120));
      }
      return { ok: true, code: 0, stderr: '', stdout: `${kind}: ${ids.length} item(s) processed.\nPreview mode does not execute system commands.` };
    },
    installed: async () => ['7zip', 'brave', 'vscode', 'powertoys'],
    ensureDeps: async () => [
      { name: 'winget', present: true, installed: false, detail: 'App Installer already present' },
      { name: 'Chocolatey', present: true, installed: false, detail: 'choco already on PATH' },
    ],
    onProgress: () => undefined,
    loadOfflineDocs: () => fetch('../offline-docs/bundle.json').then((response) => {
      if (!response.ok) throw new Error('The offline documentation bundle is unavailable.');
      return response.json() as Promise<OfflineDocsBundle>;
    }),
    openExternal: async () => ({ ok: false, status: 'rejected', error: 'External links are available only in the installed application.' }),
    exportView: async () => ({ status: 'cancelled', warnings: [] }),
    openExportInVSCode: async () => ({ ok: false, status: 'not-installed', error: 'Visual Studio Code handoff is available only in the installed application.' }),
    readPrefs: async () => { try { return JSON.parse(localStorage.getItem('winutil.prefs') ?? '{}') as Partial<Prefs>; } catch { return {}; } },
    writePrefs: async (p) => localStorage.setItem('winutil.prefs', JSON.stringify(p)),
    history: async () => [],
    appendHistory: async (e) => ({ ...e, id: `h-${Date.now()}`, at: new Date().toISOString() }),
    historyBrowse: async () => ({ entries: [], actionCounts: [] }),
    historyAccess: async () => ({ configured: false, unlocked: false }),
    historyConfigureCredential: async () => ({ configured: true, unlocked: true }),
    historyUnlock: async () => ({ configured: true, unlocked: true }),
    historyLock: async () => ({ configured: true, unlocked: false }),
    historyDiff: async () => [],
    historyRestore: async () => { throw new Error('Restore is available only in the installed application.'); },
    historyLabel: async () => { throw new Error('Labels are available only in the installed application.'); },
    historyPrune: async () => { throw new Error('Retention is available only in the installed application.'); },
    historyExport: async () => ({ status: 'cancelled', warnings: [] }),
    updateStatus: async () => state.update,
    checkForUpdates: async () => ({ ...state.update, state: 'disabled', message: 'Update checks run only in an installed build.' }),
    restartToUpdate: () => undefined,
    onUpdateStatus: () => undefined,
    authenticatorBegin: async () => { throw new Error('Authenticator registration is available only in the installed application.'); },
    authenticatorImportPngFile: async () => { throw new Error('Authenticator PNG import is available only in the installed application.'); },
    authenticatorImportClipboardPng: async () => { throw new Error('Authenticator clipboard import is available only in the installed application.'); },
    authenticatorConfirm: async () => { throw new Error('Authenticator confirmation is available only in the installed application.'); },
    authenticatorCancel: async () => false,
    authenticatorList: async () => [],
    authenticatorCodes: async () => { throw new Error('Authenticator codes are available only in the installed application.'); },
    authenticatorRemove: async () => false,
    lockState: async () => state.locks.data,
    lockPrepareTotp: async () => { throw new Error('Local TOTP preparation is available only in the installed application.'); },
    lockCreate: async (request) => {
      const id = `preview-${request.target.kind}-${request.target.id}`.replace(/[^A-Za-z0-9._:/-]/gu, '-');
      const record: LockPublicRecord = { id, target: request.target, label: request.label, credential: { method: request.credential.method === 'password' ? 'password-hash' : 'totp', revision: 1 }, unlockDuration: request.unlockDuration, lockedOnLaunch: true };
      state.locks.data = { ...state.locks.data, generation: state.locks.data.generation + 1, locks: [...state.locks.data.locks, { record, locked: true }] };
      return state.locks.data;
    },
    lockUpdate: async () => state.locks.data,
    lockRemove: async (lockId) => {
      state.locks.data = { ...state.locks.data, generation: state.locks.data.generation + 1, locks: state.locks.data.locks.filter((entry) => entry.record.id !== lockId) };
      return state.locks.data;
    },
    lockSearch: async () => state.locks.data.locks,
    lockUnlock: async () => ({ ok: false, code: 'credential-unavailable', retryAtMs: null }),
    lockRelock: async () => state.locks.data,
    lockRecovery: async () => ({ appDataFolder: 'Application data is available only in the installed app.', disclosure: 'This is a user-experience lock, not a security boundary.', resetInstruction: 'Close the installed app and delete its application-data folder yourself to reset locks.', copyText: 'Preview mode does not open a folder.', action: 'open-folder-only', deletesData: false }),
    lockOpenRecoveryFolder: async () => fake.lockRecovery(),
    personalVocabularyLoad: async () => ({ state: 'empty', entryCount: 0, mappings: {} }),
    personalVocabularyUpload: async () => ({ ok: false, code: 'invalid-schema', message: 'Personal vocabulary data is invalid.' }),
    personalVocabularyClear: async () => ({ state: 'empty', entryCount: 0, mappings: {} }),
    narrationState: async () => ({ platformSpeechAvailable: typeof window.speechSynthesis !== 'undefined', screenReaderActive: false }),
    narrate: async () => ({ status: 'suppressed', reason: 'preview' }),
    stopNarration: async () => { window.speechSynthesis?.cancel(); },
    onNarrationSpeech: () => undefined,
    onNarrationCancel: () => undefined,
    narrationSpeechResult: () => undefined,
    onNarrationState: () => undefined,
    settingsSurfaceState: async () => state.settingsSurface ?? {
      displayName: { schemaVersion: 1, displayName: 'Material System Utility' },
      dialogEmoji: { schemaVersion: 1, showEmojisInDialogsAndMessageBoxes: true },
      dialogDecorations: { information: 'ℹ️', success: '✅', warning: '⚠️', error: '❌', destructive: '🗑️', security: '🔒' },
      schoolMode: { status: 'unavailable', code: 'shared-store-unavailable', cause: 'read-failed', eventGeneration: 0, recordGeneration: null },
    },
    renameDisplayName: async (displayName) => {
      const current = await fake.settingsSurfaceState();
      return { ...current, displayName: { schemaVersion: 1, displayName: displayName.trim() || 'Material System Utility' } };
    },
    resetDisplayName: async () => ({ ...(await fake.settingsSurfaceState()), displayName: { schemaVersion: 1, displayName: 'Material System Utility' } }),
    setDialogEmojis: async (enabled) => ({ ...(await fake.settingsSurfaceState()), dialogEmoji: { schemaVersion: 1, showEmojisInDialogsAndMessageBoxes: enabled } }),
    renameSchoolMode: async () => fake.settingsSurfaceState(),
    configureSchoolModePassword: async () => fake.settingsSurfaceState(),
    resetSchoolModeCredential: async () => fake.settingsSurfaceState(),
    setSchoolModeEnabled: async () => ({ ok: false, code: 'credential-unavailable' }),
    onSettingsSurfaceState: () => undefined,
    scheduledSettingsState: async () => state.schedule.data ?? {
      document: { schemaVersion: 1, rules: [] }, effectiveSettings: {}, activeRuleIds: [], settingRuleIds: {}, sourceStatuses: [],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local system time', evaluatedAt: new Date().toISOString(),
    },
    saveScheduledSettings: async (document) => ({ ...(await fake.scheduledSettingsState()), document }),
    refreshScheduledSettings: async () => fake.scheduledSettingsState(),
    setScheduledHomeAssistantToken: async () => fake.scheduledSettingsState(),
    clearScheduledHomeAssistantToken: async () => fake.scheduledSettingsState(),
    onScheduledSettingsState: () => undefined,
  };
  w.winutil = fake;
  return fake;
}

const activeUtterances = new Map<number, SpeechSynthesisUtterance>();

function platformVoice(language: 'English' | 'Yue'): SpeechSynthesisVoice | undefined {
  const candidates = window.speechSynthesis?.getVoices() ?? [];
  const locale = language === 'Yue' ? /^(yue|zh-HK)/i : /^en/i;
  return candidates
    .filter((voice) => locale.test(voice.lang))
    .sort((left, right) => {
      const natural = (voice: SpeechSynthesisVoice): number => /natural|online/i.test(voice.name) ? 2 : voice.localService ? 1 : 0;
      const exact = (voice: SpeechSynthesisVoice): number => language === 'Yue' && /^(yue|zh-HK)/i.test(voice.lang) ? 2 : 0;
      return (exact(right) + natural(right)) - (exact(left) + natural(left));
    })[0];
}

function bindPlatformNarration(): void {
  bridge().onNarrationSpeech(({ id, text, language }) => {
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
      bridge().narrationSpeechResult(id, false, 'Platform speech synthesis is unavailable.');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === 'Yue' ? 'zh-HK' : 'en-US';
    utterance.voice = platformVoice(language) ?? null;
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    const settle = (ok: boolean, error?: string): void => {
      if (!activeUtterances.delete(id)) return;
      bridge().narrationSpeechResult(id, ok, error);
    };
    utterance.onend = () => settle(true);
    utterance.onerror = (event) => settle(false, event.error || 'Platform speech synthesis failed.');
    activeUtterances.set(id, utterance);
    window.speechSynthesis.speak(utterance);
  });
  bridge().onNarrationCancel(({ id }) => {
    if (!activeUtterances.has(id)) return;
    activeUtterances.delete(id);
    window.speechSynthesis?.cancel();
  });
  bridge().onNarrationState((runtime) => {
    state.narration = { ...state.narration, ...runtime };
    if (runtime.screenReaderActive) window.speechSynthesis?.cancel();
    render();
  });
}

function narrateFact(category: string, English: string, Yue: string, kind: 'event' | 'error' = 'event'): void {
  void bridge().narrate({ category, English, Yue, kind }).then((result) => {
    if (result.status === 'failed') {
      state.notifications = [{
        id: `narration-${Date.now()}`, icon: 'volume_off', title: narratorText('failedTitle'),
        detail: result.error || narratorText('failedBody'), read: false,
      }, ...state.notifications];
      render();
    }
  }).catch((error) => {
    state.notifications = [{
      id: `narration-${Date.now()}`, icon: 'volume_off', title: narratorText('failedTitle'),
      detail: error instanceof Error ? error.message : String(error), read: false,
    }, ...state.notifications];
    render();
  });
}

function lighten(hex: string, amount = 0.55): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return hex;
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (255 - c) * amount));
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('');
}

function applyPrefs(persist = true): void {
  const r = document.documentElement;
  const p = state.prefs;
  r.dataset.theme = p.theme;
  r.dataset.density = p.density;
  r.dataset.motion = p.reducedMotion ? 'reduced' : 'full';
  r.dataset.tabDock = p.tabDock;
  r.style.setProperty('--md-sys-color-primary', p.theme === 'dark' ? lighten(p.accent) : p.accent);
  r.style.setProperty('--shape-l', `${p.radius}px`);
  r.style.setProperty('font-size', `${Math.round(14 * p.scale)}px`);
  document.body.style.fontFamily = `${p.font}, "Segoe UI", system-ui, sans-serif`;
  document.body.style.fontWeight = String(p.weight);
  if (persist) void bridge().writePrefs(p);
  persistWorkspace();
  try { localStorage.setItem('winutil.profiles', JSON.stringify(state.profiles)); } catch { /* profiles stay in memory */ }
}

function schoolModeReady(): SettingsSurfaceState['schoolMode'] & { status: 'ready' } | null {
  const value = state.settingsSurface?.schoolMode;
  return value?.status === 'ready' ? value : null;
}

function schoolModeEnabled(): boolean { return schoolModeReady()?.effective.enabled === true; }
function schoolModeRestrictsPersonalization(): boolean {
  return state.settingsSurface?.schoolMode.status !== 'ready' || schoolModeEnabled();
}

function acceptSettingsSurface(next: SettingsSurfaceState): void {
  state.settingsSurface = next;
  state.settingsDraft.displayName = next.displayName.displayName;
  if (next.schoolMode.status === 'ready') {
    state.settingsDraft.schoolLabel = next.schoolMode.state.displayLabel;
  }
  document.title = next.displayName.displayName;
}

function scheduledDisplayName(): string {
  const value = state.schedule.data?.effectiveSettings.displayName;
  return typeof value === 'string' ? value : state.settingsSurface?.displayName.displayName ?? 'Material System Utility';
}

function acceptScheduledSettings(next: ScheduledSettingsState): void {
  state.schedule.data = next;
  const effective = next.effectiveSettings;
  for (const key of ['theme', 'density', 'language', 'narrator', 'narratorEnabled', 'enFunny', 'yueFunny', 'accent', 'font', 'scale', 'weight', 'radius', 'reducedMotion', 'exportFormat'] as const) {
    if (effective[key] !== undefined) (state.prefs as unknown as Record<string, ScheduledSettingValue>)[key] = effective[key];
  }
  document.title = scheduledDisplayName();
  applyPrefs(false);
}

function effectiveLanguage(): LanguageMode { return schoolModeRestrictsPersonalization() ? 'English' : state.prefs.language; }

function settingsCopy(english: string, yue: string): string {
  if (effectiveLanguage() === 'English') return english;
  if (effectiveLanguage() === 'Yue') return yue;
  return `${english} · ${yue}`;
}

function t(key: CopyKey, values: Record<string, string | number> = {}): string {
  const english = COPY_EN[key];
  const yue = COPY_YUE[key];
  const source = effectiveLanguage() === 'English' ? english
    : effectiveLanguage() === 'Yue' ? yue : `${english} · ${yue}`;
  return personalText(source).replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
}

function viewTitle(view: ViewId): string { return t(VIEW_COPY[view].title); }
function viewSearch(view: ViewId): string { return t(VIEW_COPY[view].search); }
function categoryLabel(category: string): string {
  const yue = CATEGORY_YUE[category];
  const source = !yue || effectiveLanguage() === 'English' ? category
    : effectiveLanguage() === 'Yue' ? yue : `${category} · ${yue}`;
  return personalText(source);
}

/* ------------------------------------------------------------ derivation -- */

const isSystemView = (v: ViewId): boolean => ['install', 'tweaks', 'config', 'updates', 'iso'].includes(v);
const isListView = (v: ViewId): boolean => ['install', 'tweaks', 'config', 'history'].includes(v);

function tweakGroups(source: WinutilTweak[]): Array<{ name: string; items: WinutilTweak[] }> {
  const match = makeMatcher(state.search);
  const map = new Map<string, WinutilTweak[]>();
  for (const item of source) {
    if (!match(`${item.name} ${item.desc} ${item.cat} ${item.id}`)) continue;
    const list = map.get(item.cat) ?? [];
    list.push(item);
    map.set(item.cat, list);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, items]) => ({ name, items }));
}

function visibleApps(): WinutilApp[] {
  const match = makeMatcher(state.search);
  return state.catalog.apps.filter((a) =>
    (state.chips.has('All') || state.chips.has(a.cat)) &&
    (state.cat === 'All' || a.cat === state.cat) &&
    match(`${a.name} ${a.desc} ${a.winget} ${a.choco} ${a.cat}`));
}

function countFor(view: ViewId): string {
  switch (view) {
    case 'install': return String(state.catalog.apps.length);
    case 'tweaks': return String(state.catalog.tweaks.length);
    case 'config': return String(state.catalog.features.length);
    case 'history': return String(state.history.length);
    default: return '';
  }
}

/* ----------------------------------------------------------------- shell -- */

function render(): void {
  applyPrefs();
  const root = $('#app');
  if (!root) return;
  root.replaceChildren(appBar(), h('div', { class: `body${state.drawerCollapsed ? ' drawer-collapsed' : ''}` }, drawer(), content(), sideRail()));
  if (state.dialog) root.appendChild(dialogLayer());
  if (state.snack) root.appendChild(h('div', { class: 'snack', 'aria-hidden': 'true' }, icon('check_circle'), h('span', {}, state.snack)));
}

function appBar(): HTMLElement {
  const unread = state.notifications.filter((n) => !n.read).length;
  return h('header', { class: 'appbar' },
    h('button', {
      class: 'icon-btn', title: t('mainMenu'), 'aria-label': t('mainMenu'),
      'aria-controls': 'primary-navigation', 'aria-expanded': state.drawerCollapsed ? 'true' : 'false',
      onclick: () => { state.drawerCollapsed = !state.drawerCollapsed; render(); },
    }, icon('menu')),
    h('div', { class: 'brand', 'data-personalizable': 'true' },
      h('div', { class: 'brand-mark' }, 'W'),
      h('div', { class: 'brand-name' }, scheduledDisplayName())),
    searchField(),
    h('div', { style: 'flex:1' }),
    h('button', { class: 'icon-btn', title: t('notificationCentre'), style: 'position:relative', onclick: () => openDialog('notifications') },
      icon('notifications'), unread ? h('span', { class: 'badge-dot' }) : null),
    h('button', { class: 'icon-btn', title: t('theme'), onclick: () => { state.prefs.theme = state.prefs.theme === 'dark' ? 'light' : 'dark'; render(); } },
      icon(state.prefs.theme === 'dark' ? 'light_mode' : 'dark_mode')),
    h('button', { class: 'icon-btn', title: t('settings'), onclick: () => go('settings') }, icon('settings')),
    h('div', { class: 'win-controls' },
      h('button', { title: t('minimize'), onclick: () => bridge().window('minimize') }, icon('remove')),
      h('button', { title: t('maximize'), onclick: () => bridge().window('maximize') }, icon('crop_square')),
      h('button', { class: 'close', title: t('close'), onclick: () => bridge().window('close') }, icon('close'))));
}

function searchField(): HTMLElement {
  const input = h('input', {
    value: state.search.text, placeholder: viewSearch(state.view),
    'aria-label': viewSearch(state.view), spellcheck: 'false',
    oninput: (e: Event) => { state.search.text = (e.target as HTMLInputElement).value; renderKeepFocus(); },
  });
  return h('div', { class: 'searchbar' },
    h('button', { class: 'icon-btn', title: t('search') }, icon('search')),
    input,
    state.search.text ? h('button', { class: 'icon-btn small', title: t('clearSearch'), onclick: () => { state.search.text = ''; render(); } }, icon('close')) : null,
    h('button', {
      class: `regex-btn${state.search.regex ? ' on' : ''}`, title: t('regexForSearch'),
      onclick: () => { state.regexDraft.target = 'main'; state.regexDraft.pattern = state.search.text || state.regexDraft.pattern; openDialog('regex'); },
    }, '.*'));
}

function renderKeepFocus(): void {
  render();
  const input = $<HTMLInputElement>('.searchbar input');
  if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
}

function drawer(): HTMLElement {
  const s = sq('nav');
  const match = makeMatcher(s);
  const nodes: HTMLElement[] = [
    h('button', {
      class: 'fab-extended', onclick: () => primaryAction(), disabled: state.view !== 'install',
      title: state.view === 'install' ? t('installSelectedPackages') : t('adapterUnavailable'),
    },
      icon(state.view === 'install' ? 'play_arrow' : 'info'), h('span', {}, state.view === 'install' ? t('run') : t('readOnlyView'))),
    searchLine('nav', t('searchDestinations')),
  ];
  for (const item of NAV) {
    if ('heading' in item) {
      if (item.heading && !s.text) nodes.push(h('div', { class: 'drawer-heading' }, item.heading === 'System' ? t('system') : item.heading));
      continue;
    }
    const label = viewTitle(item.id);
    if (!match(`${item.label} ${label}`)) continue;
    const count = countFor(item.id);
    nodes.push(h('button', {
      class: `nav-item${state.view === item.id ? ' active' : ''}`, title: label, onclick: () => go(item.id),
      oncontextmenu: ctx(`nav-${item.id}`, () => [
        { icon: 'open_in_new', label: `Open ${item.label}`, act: () => go(item.id) },
        { icon: 'tab', label: 'Open in a new tab', act: () => { go(item.id); newTab(); } },
        { icon: 'push_pin', label: 'Open pinned', act: () => { go(item.id); const tb = state.tabs.find((o) => o.view === item.id); if (tb) tb.pinned = true; } },
        'divider',
        { icon: 'palette', label: 'Edit this destination’s appearance…', act: () => openAppearance(`nav-${item.id}`, item.label) },
        { icon: 'lock', label: `Lock ${item.label}…`, act: () => openLockWizard(`nav-${item.id}`, `Destination · ${item.label}`) },
      ], item.label),
    }, icon(item.icon), h('b', {}, label), count ? h('span', { class: 'nav-count' }, count) : null));
  }
  return h('nav', { id: 'primary-navigation', class: 'drawer', 'aria-label': t('searchDestinations') }, ...nodes);
}

function content(): HTMLElement {
  return h('section', { class: `content tab-dock-${state.prefs.tabDock}` },
    tabStrip(), actionToolbar(), workspacePanels());
}

function workspacePanels(): HTMLElement {
  const panels = h('div', { class: 'workspace-panels' });
  for (const tab of state.tabs) {
    const active = tab.id === state.activeTab;
    panels.appendChild(h('div', {
      class: 'workspace-panel', id: `workspace-panel-${tab.id}`, role: 'tabpanel',
      'aria-labelledby': `workspace-tab-${tab.id}`, tabindex: active ? '0' : '-1', hidden: active ? false : 'hidden',
    }, active ? pane() : null));
  }
  return panels;
}

function tabStrip(): HTMLElement {
  const vertical = state.prefs.tabDock === 'left' || state.prefs.tabDock === 'right';
  const strip = h('div', {
    class: 'tabstrip', role: 'tablist', 'aria-label': t('openWorkspaceTabs'),
    'aria-orientation': vertical ? 'vertical' : 'horizontal',
  });
  const activate = (tab: WorkspaceTab, focus = false): void => {
    if (tab.locked) { openLockWizard(`tab-${tab.id}`, `Tab · ${viewTitle(tab.view)}`, 'unlock'); return; }
    state.activeTab = tab.id;
    state.view = tab.view;
    state.reading = null;
    persistWorkspace();
    render();
    if (focus) window.setTimeout(() => document.getElementById(`workspace-tab-${tab.id}`)?.focus(), 0);
  };
  for (const tab of state.tabs) {
    const label = viewTitle(tab.view);
    const navItem = NAV.find((n) => 'id' in n && n.id === tab.view) as { icon: string } | undefined;
    strip.appendChild(h('button', {
      type: 'button', id: `workspace-tab-${tab.id}`, 'aria-controls': `workspace-panel-${tab.id}`,
      class: `wtab${state.activeTab === tab.id ? ' active' : ''}`, title: label,
      role: 'tab', tabindex: state.activeTab === tab.id ? '0' : '-1',
      'aria-selected': state.activeTab === tab.id ? 'true' : 'false',
      'aria-label': `${label}${tab.pinned ? `, ${t('pinned')}` : ''}${tab.locked ? `, ${t('locked')}` : ''}`,
      onclick: () => activate(tab),
      onkeydown: (e: KeyboardEvent) => {
        const previous = vertical ? 'ArrowUp' : 'ArrowLeft';
        const next = vertical ? 'ArrowDown' : 'ArrowRight';
        const index = state.tabs.findIndex((item) => item.id === tab.id);
        let target = -1;
        if (e.key === previous) target = (index - 1 + state.tabs.length) % state.tabs.length;
        if (e.key === next) target = (index + 1) % state.tabs.length;
        if (e.key === 'Home') target = 0;
        if (e.key === 'End') target = state.tabs.length - 1;
        if (target >= 0) { e.preventDefault(); activate(state.tabs[target], true); }
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(tab); }
      },
      oncontextmenu: (e: MouseEvent) => { e.preventDefault(); tabMenu(tab, e.clientX, e.clientY); },
    },
      icon(navItem?.icon ?? 'tab'),
      tab.pinned ? icon('push_pin', 'pin') : null,
      tab.locked ? icon('lock', 'pin') : null,
      h('b', {}, label),
      tab.group ? h('span', { class: 'group-chip' }, tab.group) : null,
      h('span', { class: 'tab-close-mark', 'aria-hidden': 'true' }, '×')));
  }
  strip.appendChild(h('button', { class: 'icon-btn tabstrip-action', title: t('openTab'), onclick: () => newTab() }, icon('add')));
  strip.appendChild(h('button', { class: 'icon-btn tabstrip-action', title: t('tabManager'), onclick: () => openDialog('tabs') }, icon('menu_open')));
  strip.appendChild(h('div', {
    class: 'tabstrip-spacer',
    oncontextmenu: ctx('tabstrip', () => [
      { icon: 'add', label: 'Open a new tab', act: () => newTab() },
      { icon: 'tab_group', label: 'Open the tab manager', act: () => openDialog('tabs') },
      { icon: 'filter_alt_off', label: 'Close tabs not containing text…', act: () => openDialog('tabs') },
      { icon: 'push_pin', label: 'Unpin every tab', act: () => state.tabs.forEach((tb) => { tb.pinned = false; }) },
      { icon: 'lock', label: 'Manage local locks…', act: () => { state.locks.phase = 'list'; openDialog('lock'); } },
      { icon: 'palette', label: 'Edit the tab strip appearance…', act: () => openAppearance('tabstrip', 'Tab strip') },
      { section: 'Docking' },
      ...(['left', 'right', 'top', 'bottom'] as TabDock[]).map((dock) => ({
        icon: state.prefs.tabDock === dock ? 'check' : 'tab', label: `Dock tabs on the ${dock}`, act: () => setTabDock(dock),
      })),
    ], 'Tab strip'),
  }));
  return strip;
}

function actionToolbar(): HTMLElement {
  const left = h('div', { class: 'toolbar-left' });
  const right = h('div', { class: 'toolbar-right' });
  const bar = h('div', {
    class: 'toolbar',
    oncontextmenu: ctx('toolbar', () => [
      ...bulkItems(allIdsInView(), 'row(s)'),
      'divider',
      { icon: 'refresh', label: 'Refresh', act: () => void refresh() },
      { icon: 'download', label: 'Export this view', act: () => openDialog('export') },
      { icon: 'palette', label: 'Edit the toolbar appearance…', act: () => openAppearance('toolbar', 'Toolbar') },
      { icon: 'lock', label: 'Lock this toolbar…', act: () => openLockWizard('toolbar', 'Toolbar') },
    ], 'Toolbar'),
  }, left, right);

  if (state.reading) {
    left.appendChild(h('button', { class: 'icon-btn', title: 'Back to list', onclick: () => { state.reading = null; render(); } }, icon('arrow_back')));
    left.appendChild(h('span', { class: 'count' }, state.reading.path));
    right.appendChild(h('button', { class: 'icon-btn', title: 'Export', onclick: () => openDialog('export') }, icon('download')));
    return bar;
  }

  const listy = isListView(state.view);
  if (listy) {
    const all = allIdsInView();
    const every = all.length > 0 && all.every((id) => state.selected.has(id));
    left.appendChild(h('button', {
      class: 'icon-btn', title: every ? t('deselectAll') : t('selectAll'),
      onclick: () => { if (every) all.forEach((id) => state.selected.delete(id)); else all.forEach((id) => { state.selected.add(id); state.rowColors[id] = state.selectionColor; }); render(); },
    }, icon(every ? 'check_box' : state.selected.size ? 'indeterminate_check_box' : 'check_box_outline_blank')));
    left.appendChild(h('button', { class: 'icon-btn', title: t('refresh'), onclick: () => refresh() }, icon('refresh')));
    left.appendChild(h('div', { class: 'divider-v' }));
  }

  // Primary actions stay inline; everything past the first two collapses into an
  // overflow menu so the toolbar never grows past two rows in a narrow pane.
  const actions = toolbarActions();
  const inline = actions.slice(0, 3);
  const overflow = actions.slice(3);
  for (const b of inline) {
    left.appendChild(h('button', {
      class: `btn ${b.variant}`, onclick: b.act, disabled: b.disabled ?? false,
      title: b.title ?? '', 'aria-disabled': b.disabled ? 'true' : 'false',
    }, b.icon ? icon(b.icon) : null, h('span', {}, b.label)));
  }
  if (overflow.length) {
    left.appendChild(h('button', {
      class: 'icon-btn', title: t('moreActions', { count: overflow.length }),
      onclick: (e: MouseEvent) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        contextMenu('toolbar-overflow', r.left, r.bottom + 4,
          overflow.map((b) => ({
            icon: b.icon ?? 'chevron_right',
            label: b.disabled ? `${b.label} — unavailable in this build` : b.label,
            act: b.disabled ? () => snack(b.title ?? 'Unavailable in this build.') : b.act,
          })), 'More actions');
      },
    }, icon('more_vert')));
  }

  if (state.queue.active) {
    right.appendChild(h('span', { class: 'count' }, `${state.queue.index}/${state.queue.total}`));
    right.appendChild(h('div', { class: 'queue-track' }, h('i', { style: `width:${Math.round((state.queue.index / Math.max(state.queue.total, 1)) * 100)}%` })));
  }
  if (listy) {
    right.appendChild(h('button', {
      class: 'swatch', style: `--sw:${state.selectionColor}`, title: t('selectionColour'),
      onclick: (e: MouseEvent) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        contextMenu('selcolor', r.left - 200, r.bottom + 4, [
          { section: 'Colour' },
          { icon: 'colorize', label: 'Open the infinite colour picker…', act: () => openColorPicker('selection', `Selection · ${state.selected.size} row(s)`) },
          { section: 'Starting points' },
          ...SELECTION_COLORS.map(([name, hex]) => ({
            icon: 'label', label: name,
            act: () => { state.selectionColor = hex; state.selected.forEach((i) => { state.rowColors[i] = hex; }); },
          })),
        ], 'Selection colour');
      },
    }));
    right.appendChild(h('button', { class: 'icon-btn', title: t('saveSelection'), onclick: () => openDialog('saveselection') }, icon('bookmark_add')));
    right.appendChild(h('button', { class: 'icon-btn', title: t('selectionProfiles', { count: state.profiles.length }), onclick: () => openDialog('profiles') }, icon('bookmarks')));
  }
  right.appendChild(h('span', { class: 'count' }, statusLine()));
  right.appendChild(h('button', { class: 'icon-btn', title: t('exportView', { format: state.prefs.exportFormat }), onclick: () => openDialog('export') }, icon('download')));
  return bar;
}

function toolbarActions(): Array<{ label: string; variant: string; icon?: string; act: () => void; disabled?: boolean; title?: string }> {
  switch (state.view) {
    case 'install': return [
      { label: t('installSelected'), variant: 'filled', icon: 'download', act: () => { const ids = selectedPackageIds(); if (!ids.length) snack(t('nothingSelected')); else gate(t('installPackages', { count: ids.length }), 'install', ids); } },
      { label: t('upgradeAll'), variant: 'tonal', icon: 'upgrade', act: () => gate(t('upgradePackages'), 'upgrade') },
      { label: t('uninstallSelected'), variant: 'outlined', icon: 'delete', act: () => { const ids = selectedPackageIds(); if (!ids.length) snack(t('nothingSelected')); else gate(t('uninstallPackages', { count: ids.length }), 'uninstall', ids); } },
      { label: t('installed'), variant: 'text', act: () => void loadInstalled() },
    ];
    case 'tweaks': return [
      { label: 'Run tweaks', variant: 'filled', icon: 'play_arrow', disabled: true, title: 'Unavailable until the reviewed tweak adapter is installed', act: () => undefined },
      { label: 'Undo selected', variant: 'outlined', icon: 'undo', disabled: true, title: 'Unavailable until the reviewed tweak adapter is installed', act: () => undefined },
      { label: t('clear'), variant: 'text', icon: 'deselect', act: () => { state.selected.clear(); state.rowColors = {}; render(); } },
      { label: t('installed'), variant: 'text', icon: 'fact_check', act: () => void loadInstalled() },
    ];
    case 'config': return [
      { label: 'Apply selected', variant: 'filled', icon: 'play_arrow', disabled: true, title: 'Unavailable until the reviewed feature adapter is installed', act: () => undefined },
      { label: 'Undo selected', variant: 'outlined', icon: 'undo', disabled: true, title: 'Unavailable until the reviewed feature adapter is installed', act: () => undefined },
      { label: t('clear'), variant: 'text', icon: 'deselect', act: () => { state.selected.clear(); state.rowColors = {}; render(); } },
      { label: 'Select every category', variant: 'text', icon: 'select_all', act: () => { allIdsInView().forEach((id) => { state.selected.add(id); state.rowColors[id] = state.selectionColor; }); maybeDimSum(); render(); } },
    ];
    case 'history': return [];
    default: return [];
  }
}

function statusLine(): string {
  switch (state.view) {
    case 'install': return t('installCount', { visible: visibleApps().length, total: state.catalog.apps.length, selected: state.selected.size });
    case 'tweaks': return `${tweakGroups(state.catalog.tweaks).reduce((n, g) => n + g.items.length, 0)} of ${state.catalog.tweaks.length} · ${state.selected.size} selected`;
    case 'config': return `${tweakGroups(state.catalog.features).reduce((n, g) => n + g.items.length, 0)} of ${state.catalog.features.length} · ${state.selected.size} selected`;
    case 'history': return `${filteredHistory().length} Git-backed revisions`;
    default: return '';
  }
}

function allIdsInView(): string[] {
  switch (state.view) {
    case 'install': return visibleApps().map((a) => a.id);
    case 'tweaks': return tweakGroups(state.catalog.tweaks).flatMap((g) => g.items.map((i) => i.id));
    case 'config': return tweakGroups(state.catalog.features).flatMap((g) => g.items.map((i) => i.id));
    case 'history': return filteredHistory().map((e) => e.commit);
    default: return [];
  }
}

function sideRail(): HTMLElement {
  const items: Array<[string, string, () => void, boolean]> = [
    ['bolt', 'Command palette (Ctrl+Shift+F)', () => openDialog('palette'), state.dialog === 'palette'],
    ['data_object', 'Regex builder', () => { state.regexDraft.target = 'main'; openDialog('regex'); }, state.dialog === 'regex'],
    ['tab_group', 'Tab manager', () => openDialog('tabs'), state.dialog === 'tabs'],
    ['palette', 'Appearance editor', () => openAppearance('app-root', 'Application root'), state.dialog === 'appearance'],
    ['lock', 'Locks', () => openDialog('lock'), state.dialog === 'lock'],
    ['pin', 'Authenticator', () => openDialog('auth'), state.dialog === 'auth'],
    ['inbox', 'Notification centre', () => openDialog('notifications'), state.dialog === 'notifications'],
  ];
  const rail = h('aside', {
    class: 'siderail',
    oncontextmenu: ctx('siderail', () => items.map(([ic, title, act]) => ({ icon: ic, label: title, act })), 'Tools'),
  });
  items.forEach(([ic, title, act, active], i) => {
    rail.appendChild(h('button', {
      class: `icon-btn${active ? ' active' : ''}`, title, onclick: act,
      oncontextmenu: ctx(`rail-${ic}`, () => [
        { icon: ic, label: title, act },
        { icon: 'palette', label: 'Edit this button’s appearance…', act: () => openAppearance(`rail-${ic}`, title) },
        { icon: 'lock', label: `Lock ${title}…`, act: () => openLockWizard(`rail-${ic}`, title) },
      ], title),
    }, icon(ic)));
    if (i === 2 || i === 5) rail.appendChild(h('div', { class: 'sep' }));
  });
  rail.appendChild(h('div', { style: 'flex:1' }));
  rail.appendChild(h('button', { class: 'icon-btn', title: 'About', onclick: () => openDialog('about') }, icon('info')));
  return rail;
}

/* ----------------------------------------------------------------- panes -- */

function pane(): HTMLElement {
  if (state.reading) return readingPane();
  switch (state.view) {
    case 'install': return installPane();
    case 'tweaks': return checklistPane(state.catalog.tweaks, true);
    case 'config': return checklistPane(state.catalog.features, false);
    case 'updates': return updatesPane();
    case 'iso': return isoPane();
    case 'history': return historyPane();
    case 'docs': return docsPane();
    case 'settings': return settingsPane();
  }
}

function docsPane(): HTMLElement {
  const titleSearch = docsSearchMatcher(sq('docs-title'));
  const bodySearch = docsSearchMatcher(sq('docs-body'));
  const articles = state.offlineDocs?.articles ?? [];
  const found = titleSearch.valid && bodySearch.valid
    ? articles.filter((article) => titleSearch.match(article.title) && bodySearch.match(article.bodyText)) : [];
  const sections = [...new Set(found.map((article) => article.category))];
  const pane = h('div', { class: 'pane' },
    h('div', { class: 'pane-head docs-searches' },
      h('div', { class: 'docs-bundle-status', role: 'status' }, state.offlineDocs
        ? `${articles.length} bundled articles · manifest and SHA-256 hashes verified before display`
        : state.offlineDocsError || 'Loading the verified offline documentation bundle…'),
      searchLine('docs-title', 'Search documentation titles'),
      titleSearch.error ? h('div', { class: 'feedback error', role: 'alert' }, `Title search: ${titleSearch.error}`) : null,
      searchLine('docs-body', 'Search documentation article bodies'),
      bodySearch.error ? h('div', { class: 'feedback error', role: 'alert' }, `Body search: ${bodySearch.error}`) : null));
  if (!state.offlineDocs) { pane.appendChild(emptyState(state.offlineDocsError || 'Loading offline documentation…')); return pane; }
  if (!found.length) { pane.appendChild(emptyState('No bundled article matches both title and body searches.')); return pane; }
  for (const section of sections) {
    pane.appendChild(h('div', { class: 'group-head' },
      h('div', { class: 'group-toggle' }, icon('bookmark'), h('b', {}, section))));
    const list = h('div', { class: 'rowlist' });
    for (const article of found.filter((item) => item.category === section)) {
      list.appendChild(rowNode({
        id: article.path, primary: article.title, snippet: article.bodyText.split('\n').find((line) => line.trim() && line.trim() !== article.title) ?? 'Bundled article', meta: article.category,
        lead: 'article', selectable: false,
        onOpen: () => openOfflineArticle(article.path),
      }));
    }
    pane.appendChild(list);
  }
  return pane;
}

function docsSearchMatcher(search: SearchState): { valid: boolean; error: string; match: (value: string) => boolean } {
  const query = search.text.trim();
  if (!query) return { valid: true, error: '', match: () => true };
  if (query.length > 512) return { valid: false, error: 'Search text exceeds the 512-character limit.', match: () => false };
  if (!search.regex) {
    const needle = query.toLocaleLowerCase('en-US');
    return { valid: true, error: '', match: (value) => value.toLocaleLowerCase('en-US').includes(needle) };
  }
  if (!/^(?!.*(.).*\1)[imsu]*$/u.test(search.flags)) return { valid: false, error: 'Regex flags must be unique and limited to i, m, s, and u.', match: () => false };
  if (/\\[1-9]|\\k<|\([^)]*[+*][^)]*\)[+*{]/u.test(query)) return { valid: false, error: 'Potentially unsafe backreferences or nested repeated quantifiers are not supported.', match: () => false };
  try {
    const expression = new RegExp(query, search.flags);
    return { valid: true, error: '', match: (value) => { expression.lastIndex = 0; return expression.test(value); } };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'The regular expression is invalid.', match: () => false };
  }
}

function rowNode(opts: {
  id: string; primary: string; snippet: string; meta: string; lead?: string; chip?: string;
  selectable?: boolean; onOpen?: () => void; actions?: Array<[string, string, () => void]>;
}): HTMLElement {
  const on = state.selected.has(opts.id);
  const tint = on ? state.rowColors[opts.id] ?? state.selectionColor : '';
  const row = h('div', {
    class: `row${on ? ' selected' : ''}`,
    style: tint ? `--tint:${tint}` : '',
    role: 'group', tabindex: '0', 'aria-label': `${opts.primary}. ${opts.snippet}`,
    onclick: () => { opts.onOpen ? opts.onOpen() : toggleSelect(opts.id); },
    onkeydown: (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); opts.onOpen ? opts.onOpen() : toggleSelect(opts.id); }
      if (e.key === ' ' && opts.selectable !== false) { e.preventDefault(); toggleSelect(opts.id); }
    },
    oncontextmenu: ctx(`row-${opts.id}`, () => [
      { section: 'This row' },
      { icon: on ? 'check_box_outline_blank' : 'check_box', label: on ? 'Deselect this row' : 'Select this row', act: () => toggleSelect(opts.id) },
      ...(opts.onOpen ? [{ icon: 'open_in_full', label: 'Open details', act: opts.onOpen }] : []),
      ...(opts.actions ?? []).map(([ic, label, act]) => ({ icon: ic, label, act })),
      { icon: 'content_copy', label: 'Copy the row id', act: () => { void navigator.clipboard?.writeText(opts.id); snack(`Copied ${opts.id}`); } },
      { section: 'Appearance' },
      { icon: 'colorize', label: 'Colour this row…', act: () => openColorPicker(`row:${opts.id}`, opts.primary) },
      { icon: 'palette', label: 'Edit this row’s appearance…', act: () => openAppearance(`row-${opts.id}`, opts.primary) },
      { icon: 'lock', label: 'Lock this row…', act: () => openLockWizard(`row-${opts.id}`, opts.primary) },
      ...bulkItems(allIdsInView(), 'row(s)'),
    ], opts.primary),
  });
  if (opts.selectable !== false) {
    row.appendChild(h('span', {
      class: 'cb', role: 'checkbox', tabindex: '0', 'aria-label': `Select ${opts.primary}`,
      'aria-checked': on ? 'true' : 'false',
      onclick: (e: MouseEvent) => { e.stopPropagation(); toggleSelect(opts.id); },
      onkeydown: (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleSelect(opts.id); }
      },
    }, on ? icon('check') : null));
  }
  if (opts.lead) row.appendChild(h('span', { class: 'lead' }, icon(opts.lead)));
  row.appendChild(h('span', { class: 'primary' }, opts.primary));
  if (opts.chip) row.appendChild(h('span', { class: 'chip-inline' }, opts.chip));
  row.appendChild(h('span', { class: 'snippet' }, opts.snippet));
  row.appendChild(h('span', { class: 'meta' }, opts.meta));
  const actions = h('span', { class: 'row-actions' });
  for (const [ic, title, act] of opts.actions ?? []) {
    actions.appendChild(h('button', { class: 'icon-btn small', title, onclick: (e: MouseEvent) => { e.stopPropagation(); act(); } }, icon(ic)));
  }
  actions.appendChild(h('button', {
    class: 'icon-btn small', title: t('editAppearance'),
    onclick: (e: MouseEvent) => { e.stopPropagation(); openAppearance(`row-${opts.id}`, opts.primary); },
  }, icon('palette')));
  row.appendChild(actions);
  return row;
}

function installPane(): HTMLElement {
  const chipMatch = makeMatcher(sq('install-cats'));
  const list = h('div', { class: 'rowlist' });
  const apps = visibleApps();
  if (!apps.length) list.appendChild(emptyState(t('noApplications')));
  for (const app of apps) {
    const installed = state.installedIds.has(app.id);
    list.appendChild(rowNode({
      id: app.id, primary: app.name, snippet: app.desc, meta: app.winget || app.choco,
      chip: installed ? t('installedChip') : app.foss ? 'FOSS' : undefined, lead: 'inventory_2',
      onOpen: () => openDetail(app.name, `catalogue/${app.id}`, `${app.desc}\n\nCategory   ${app.cat}\nwinget     ${app.winget || '—'}\nchoco      ${app.choco || '—'}\nLicence    ${app.foss ? 'FOSS' : 'proprietary'}\nHomepage   ${app.link}\n\nInstalling this entry runs winget silently with the ids above. The homepage is shown for reference only — this app never opens a browser.`),
      actions: [
        ['info', t('showEntry'), () => openDetail(app.name, `catalogue/${app.id}`, `${app.desc}\n\nCategory   ${app.cat}\nwinget     ${app.winget || '—'}\nchoco      ${app.choco || '—'}\nHomepage   ${app.link}`)],
        ['content_copy', t('copyWinget'), () => { void navigator.clipboard?.writeText(app.winget); snack(t('copiedWinget', { id: app.winget })); }],
        ['download', t('installOne'), () => gate(t('installPackage', { name: app.name }), 'install', [app.id])],
      ],
    }));
  }
  return h('div', { class: 'pane' },
    h('div', { class: 'pane-head' },
      searchLine('install-cats', t('searchCategories')),
      h('div', { class: 'chips' },
        ...APP_CATS.filter(chipMatch).map((c) => h('button', {
          class: `chip${state.chips.has(c) ? ' on' : ''}`,
          title: t('chipHint'),
          onclick: (e: MouseEvent) => toggleChip(c, e.ctrlKey || e.metaKey),
          oncontextmenu: ctx(`chip-${c}`, () => [
            { icon: 'filter_alt', label: t('filterOnly', { category: categoryLabel(c) }), act: () => toggleChip(c, false) },
            { icon: 'add', label: t('addFilter', { category: categoryLabel(c) }), act: () => toggleChip(c, true) },
            { icon: 'select_all', label: t('selectCategory', { category: categoryLabel(c) }), act: () => { state.catalog.apps.filter((a) => c === 'All' || a.cat === c).forEach((a) => state.selected.add(a.id)); } },
            { icon: 'download', label: t('installCategory', { category: categoryLabel(c) }), act: () => { const ids = selectedPackageIds(); if (!ids.length) snack(t('nothingSelected')); else gate(t('installPackages', { count: ids.length }), 'install', ids); } },
            'divider',
            { icon: 'palette', label: t('editChip'), act: () => openAppearance(`chip-${c}`, `Chip · ${c}`) },
            { icon: 'lock', label: t('lockFilter', { category: categoryLabel(c) }), act: () => openLockWizard(`chip-${c}`, `Filter chip · ${c}`) },
          ], c),
        }, state.chips.has(c) ? icon('check') : null, categoryLabel(c))))),
    list);
}

function checklistPane(source: WinutilTweak[], showPresets: boolean): HTMLElement {
  const pane = h('div', { class: 'pane' });
  if (showPresets) {
    pane.appendChild(h('div', { class: 'notice', style: 'margin:14px 16px 0' }, icon('info'),
      h('span', {}, 'Hover any row for its exact effect. Many of these tweaks heavily modify your system — recommended selections are for normal users, and if you are unsure do not check anything else.')));
    const presetRow = h('div', { class: 'chips' });
    for (const name of Object.keys(state.catalog.presets)) {
      const size = (state.catalog.presets[name] ?? []).length;
      presetRow.appendChild(h('button', {
        class: 'btn tonal', title: `${size} tweak(s)`,
        onclick: () => applyPreset(name),
        oncontextmenu: ctx(`preset-${name}`, () => [
          { icon: 'checklist', label: `Select the ${size} rows in ${name}`, act: () => applyPreset(name) },
          { icon: 'add', label: `Add ${name} to the current selection`, act: () => { (state.catalog.presets[name] ?? []).forEach((id) => { state.selected.add(id); state.rowColors[id] = state.selectionColor; }); maybeDimSum(); } },
          { icon: 'remove', label: `Subtract ${name} from the selection`, act: () => (state.catalog.presets[name] ?? []).forEach((id) => { state.selected.delete(id); delete state.rowColors[id]; }) },
          'divider',
          { icon: 'warning', label: `Run ${name} — unavailable in this build`, act: () => snack('The reviewed tweak adapter is not installed in this build.') },
          { icon: 'bookmark_add', label: 'Save as a selection profile…', act: () => { applyPreset(name); openDialog('saveselection'); } },
          { icon: 'lock', label: `Lock the ${name} preset…`, act: () => openLockWizard(`preset-${name}`, `Preset · ${name}`) },
          { icon: 'palette', label: 'Edit this button’s appearance…', act: () => openAppearance(`preset-${name}`, `Preset · ${name}`) },
        ], name),
      }, icon('checklist'), h('span', {}, name),
        h('span', { class: 'chip-inline' }, String(size))));
    }
    presetRow.appendChild(h('button', {
      class: 'btn outlined', disabled: true, title: 'Unavailable until the reviewed AppX adapter is installed',
    }, icon('delete_sweep'), h('span', {}, 'AppX Removal')));
    pane.appendChild(h('div', { class: 'preset-bar' },
      h('div', { class: 'preset-label' }, icon('recommend'), h('b', {}, 'Recommended selections')),
      presetRow));
  }
  const groupSearch = sq('groups');
  const groupMatch = makeMatcher(groupSearch);
  pane.appendChild(h('div', { class: 'pane-head' }, searchLine('groups', 'Search categories')));
  const groups = tweakGroups(source).filter((g) => groupMatch(g.name));
  if (!groups.length) pane.appendChild(emptyState('Nothing matches this search.'));
  for (const group of groups) {
    const collapsed = state.collapsedGroups.has(group.name);
    const key = `group:${group.name}`;
    const inner = makeMatcher(sq(key));
    const items = group.items.filter((i) => inner(`${i.name} ${i.desc} ${i.id}`));
    pane.appendChild(h('div', {
      class: 'group-head',
      oncontextmenu: ctx(`grouphead-${group.name}`, () => [
        { icon: collapsed ? 'expand_more' : 'expand_less', label: collapsed ? 'Expand this category' : 'Collapse this category', act: () => { collapsed ? state.collapsedGroups.delete(group.name) : state.collapsedGroups.add(group.name); } },
        { icon: 'done_all', label: `Select all ${items.length} rows here`, act: () => items.forEach((i) => state.selected.add(i.id)) },
        { icon: 'deselect', label: 'Deselect the rows here', act: () => items.forEach((i) => state.selected.delete(i.id)) },
        { icon: 'warning', label: 'Run selected rows — unavailable in this build', act: () => snack('The reviewed system adapter is not installed in this build.') },
        'divider',
        { icon: 'palette', label: 'Edit this header’s appearance…', act: () => openAppearance(`group-${group.name}`, group.name) },
        { icon: 'lock', label: 'Lock this category…', act: () => openLockWizard(`group-${group.name}`, `Category · ${group.name.replace(/^z__/, '')}`) },
        { icon: 'download', label: 'Export this category', act: () => openDialog('export') },
      ], group.name.replace(/^z__/, '')),
    },
      h('button', {
        class: 'group-toggle',
        onclick: () => { collapsed ? state.collapsedGroups.delete(group.name) : state.collapsedGroups.add(group.name); render(); },
      }, icon(CAT_ICONS[group.name] ?? 'folder'), h('b', {}, group.name.replace(/^z__/, '')),
        h('span', { class: 'nav-count' }, `${items.length}/${group.items.length}`), icon(collapsed ? 'expand_more' : 'expand_less')),
      searchLine(key, `Search ${group.name.replace(/^z__/, '').toLowerCase()}`),
      h('button', {
        class: 'icon-btn small', title: 'Select every row in this category',
        onclick: () => { items.forEach((i) => state.selected.add(i.id)); render(); },
      }, icon('done_all')),
      h('button', {
        class: 'icon-btn small', title: 'Lock this category',
        onclick: () => openLockWizard(`group-${group.name}`, `Category · ${group.name.replace(/^z__/, '')}`),
      }, icon('lock_open'))));
    if (collapsed) continue;
    const list = h('div', { class: 'rowlist' });
    if (!items.length) list.appendChild(emptyState('No row in this category matches its search.'));
    for (const item of items) {
      list.appendChild(rowNode({
        id: item.id, primary: item.name, snippet: item.desc, meta: item.id,
        lead: item.type === 'Button' ? 'play_circle' : undefined,
        chip: item.type === 'Button' ? 'ACTION' : undefined,
        actions: [
          ['menu_book', 'Open the built-in reference', () => { go('docs'); openDetail(item.name, `docs/${item.id}`, `${item.desc}\n\nId        ${item.id}\nCategory  ${item.cat}\nType      ${item.type ?? 'Checkbox'}\n\nThis catalogue row is read-only in the current build because its reviewed system adapter is not installed.`); }],
        ],
      }));
    }
    pane.appendChild(list);
  }
  return pane;
}

function updatesPane(): HTMLElement {
  const match = makeMatcher(sq('updates'));
  const cards = h('div', { class: 'cards' });
  const u = state.update;
  cards.appendChild(h('article', { class: 'card full update-status', role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'card-head' }, h('div', {},
      h('p', { class: 'eyebrow' }, 'Application updates'),
      h('h2', {}, u.state === 'ready' ? `Version ${u.updateVersion || 'new'} is ready` : `Current version ${u.currentVersion}`))),
    h('p', {}, u.message),
    h('div', { class: 'notice warn' }, icon('warning'), h('span', {}, 'Updates are transported over HTTPS and checked with Squirrel package hashes, but every installer is unsigned and may show an unknown-publisher warning.')),
    h('div', { class: 'btnrow' },
      h('button', { class: 'btn tonal', disabled: u.state === 'checking', onclick: () => { void bridge().checkForUpdates().then((status) => { state.update = status; render(); }); } }, u.state === 'checking' ? 'Checking…' : 'Check for updates'),
      u.state === 'ready' ? h('button', { class: 'btn filled', onclick: () => bridge().restartToUpdate() }, 'Restart to install update') : null,
      u.state === 'ready' ? h('button', { class: 'btn text', onclick: () => snack('The update remains ready. Restart when your work is saved.') }, 'Later') : null)));
  for (const p of UPDATE_PROFILES.filter((p) => match(`${p.title} ${p.subtitle} ${p.bullets.join(' ')}`))) {
    cards.appendChild(h('article', { class: 'card', style: 'min-height:340px' },
      h('div', { class: 'card-head' }, h('div', {},
        h('h2', { style: `font-size:20px;${p.danger ? 'color:var(--md-sys-color-error)' : ''}` }, p.title),
        h('p', { style: p.danger ? 'color:var(--md-sys-color-error);font-weight:500' : '' }, p.subtitle)),
        h('button', { class: 'icon-btn small', title: 'Lock this profile', onclick: () => openLockWizard(`profile-${p.key}`, `Update profile · ${p.title}`) },
          icon('lock_open'))),
      h('ul', { style: 'margin:6px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px' },
        ...p.bullets.map((b) => h('li', { style: 'display:flex;gap:9px;font-size:13px;line-height:1.45' },
          icon('chevron_right', ''), h('span', {}, b)))),
      h('p', { style: 'font-style:italic;font-size:11.5px' }, p.note),
      h('div', { style: 'flex:1' }),
      h('button', {
        class: `btn ${p.variant}`, style: 'height:44px;justify-content:center', disabled: true,
        title: 'Unavailable until the reviewed Windows Update adapter is installed',
        'aria-describedby': `update-profile-note-${p.key}`,
      }, p.button),
      h('p', { id: `update-profile-note-${p.key}`, class: 'unavailable-note' }, 'Unavailable in this build: the reviewed Windows Update adapter is not installed.')));
  }
  cards.appendChild(h('div', { class: 'card full', style: 'text-align:center' },
    h('p', {}, 'These profiles are documented previews. This build does not apply Windows Update policies.')));
  return h('div', { class: 'pane padded' },
    h('div', { style: 'margin-bottom:16px;max-width:520px' }, searchLine('updates', 'Search update profiles and their effects')),
    cards);
}

function isoPane(): HTMLElement {
  const cards = h('div', { class: 'cards' });
  for (const s of ISO_STEPS) {
    const card = h('article', { class: 'card wide' },
      h('div', { class: 'card-head' },
        h('div', { style: 'display:flex;align-items:center;gap:10px' },
          h('span', { style: 'width:28px;height:28px;border-radius:50%;background:var(--md-sys-color-primary-container);color:var(--md-sys-color-on-primary-container);display:grid;place-items:center;font-weight:700;font-size:13px' }, String(s.n)),
          h('h2', {}, s.title))),
      h('p', {}, s.body));
    if (s.warn) card.appendChild(h('div', { class: 'notice warn' }, icon('warning'), h('span', {}, s.warn)));
    if (s.field) {
      card.appendChild(h('div', { style: 'display:flex;gap:8px' },
        h('div', { class: 'feedback', style: 'flex:1' }, s.field),
        h('button', { class: 'btn tonal', disabled: true, title: 'Unavailable until the reviewed ISO adapter is installed' }, s.button)));
    }
    for (const o of s.options) {
      card.appendChild(h('button', {
        class: 'row', style: 'background:var(--md-sys-color-surface-container-lowest);opacity:.65',
        disabled: true, title: 'Unavailable until the reviewed ISO adapter is installed',
      }, h('span', { class: 'lead' }, icon(o.icon)), h('span', { class: 'snippet' }, o.label), icon('chevron_right')));
    }
    cards.appendChild(card);
  }
  cards.appendChild(h('div', { class: 'card full' },
    h('div', { class: 'card-head' }, h('div', {}, h('p', { class: 'eyebrow' }, 'Build log'), h('h2', {}, 'DISM and oscdimg output')),
      h('button', { class: 'icon-btn small', title: 'Clear the log', onclick: () => { state.isoLog = '[00:00:00] Log cleared.'; render(); } }, icon('clear_all'))),
    searchLine('iso-log', 'Search the build log'),
    h('pre', { class: 'block' }, state.isoLog.split('\n').filter(makeMatcher(sq('iso-log'))).join('\n'))));
  return h('div', { class: 'pane padded' },
    h('div', { class: 'notice warn', style: 'margin-bottom:16px' }, icon('info'), h('span', {}, 'ISO customization is a documented preview in this build. No ISO is selected, mounted, modified, or queued.')),
    h('div', { style: 'margin-bottom:16px;max-width:520px' }, searchLine('iso', 'Search image customization steps')),
    cards);
}

function filteredHistory(): GitHistoryEntry[] { return state.gitHistory; }

function historyQuery(): { query?: string; regex?: { source: string; flags: string }; actions?: string[]; from?: string; to?: string; limit: number } {
  const search = sq('history');
  return {
    ...(search.text ? { query: search.regex ? undefined : search.text, regex: search.regex ? { source: search.text, flags: search.flags } : undefined } : {}),
    ...(state.historyFilter.action === 'all' ? {} : { actions: [state.historyFilter.action] }),
    ...(state.historyFilter.from ? { from: `${state.historyFilter.from}T00:00:00.000Z` } : {}),
    ...(state.historyFilter.to ? { to: `${state.historyFilter.to}T23:59:59.999Z` } : {}),
    limit: 500,
  };
}

async function refreshGitHistory(): Promise<void> {
  try {
    const result = await bridge().historyBrowse(historyQuery());
    state.gitHistory = result.entries;
    state.historyCounts = result.actionCounts;
    state.historyMessage = '';
  } catch (error) { state.historyMessage = error instanceof Error ? error.message : 'Local Git history is unavailable.'; }
  render();
}

async function refreshHistoryAccess(): Promise<void> {
  try { state.historyAccess = { ...state.historyAccess, ...await bridge().historyAccess(), password: '' }; }
  catch (error) { state.historyMessage = error instanceof Error ? error.message : 'History access is unavailable.'; }
  render();
}

async function submitHistoryCredential(): Promise<void> {
  const password = state.historyAccess.password;
  try {
    const access = state.historyAccess.configured
      ? await bridge().historyUnlock(password)
      : await bridge().historyConfigureCredential(password);
    state.historyAccess = { ...access, password: '' };
    await refreshGitHistory();
  } catch (error) { state.historyAccess.password = ''; state.historyMessage = error instanceof Error ? error.message : 'History access failed.'; render(); }
}

function historyPane(): HTMLElement {
  if (!state.historyAccess.unlocked) {
    return h('div', { class: 'pane padded' },
      h('div', { class: 'card wide history-unlock' },
        h('div', { class: 'card-head' }, h('div', {}, h('p', { class: 'eyebrow' }, 'Local credential route'), h('h2', {}, state.historyAccess.configured ? 'Unlock Git-backed history' : 'Configure Git-backed history'))),
        h('p', {}, state.historyAccess.configured
          ? 'Enter the local history password. Successful access lasts 15 minutes or until you lock it again.'
          : 'Create a local password before opening history. It is stored only in Windows Credential Manager and never enters Git, exports, logs, or renderer persistence.'),
        h('label', { class: 'field' }, 'HISTORY PASSWORD', h('input', { type: 'password', value: state.historyAccess.password, autocomplete: state.historyAccess.configured ? 'current-password' : 'new-password', oninput: (event: Event) => { state.historyAccess.password = (event.target as HTMLInputElement).value; } })),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn filled', onclick: () => void submitHistoryCredential() }, state.historyAccess.configured ? 'Unlock history' : 'Configure and unlock')),
        state.historyMessage ? h('p', { class: 'feedback error', role: 'alert' }, state.historyMessage) : null));
  }
  const actions = ['all', ...state.historyCounts.map((entry) => entry.action)];
  const filters = h('div', { class: 'grid2', style: 'padding:14px 16px 4px' },
    h('label', { class: 'field' }, 'FROM', h('input', {
      type: 'date', value: state.historyFilter.from,
      onchange: (e: Event) => { state.historyFilter.from = (e.target as HTMLInputElement).value; void refreshGitHistory(); },
    })),
    h('label', { class: 'field' }, 'TO', h('input', {
      type: 'date', value: state.historyFilter.to,
      onchange: (e: Event) => { state.historyFilter.to = (e.target as HTMLInputElement).value; void refreshGitHistory(); },
    })),
    selectField('Action', actions, state.historyFilter.action, (v) => { state.historyFilter.action = v; void refreshGitHistory(); }));
  const list = h('div', { class: 'rowlist' });
  const found = filteredHistory();
  if (!found.length) list.appendChild(emptyState('No local revision matches the current text, date, and action filters.'));
  for (const e of found) {
    list.appendChild(rowNode({
      id: e.commit, primary: e.label ? `${e.action} · ${e.label}` : e.action,
      snippet: `${e.revisionId}${e.restoredFrom ? ` · restored from ${e.restoredFrom.slice(0, 12)}` : ''}`,
      meta: relTime(e.recordedAt), lead: 'commit',
      onOpen: () => openDetail(e.action, e.commit, `Recorded ${new Date(e.recordedAt).toLocaleString()}\nAction   ${e.action}\nCommit   ${e.commit}\nRecord   ${e.revisionId}`),
      actions: [
        ['Label revision', 'Add a bounded local label', () => { const value = window.prompt('Revision label'); if (value) void bridge().historyLabel(e.commit, value).then(() => refreshGitHistory()).catch((error) => snack(String(error))); }],
        ['Restore revision', 'Append the snapshot as a new revision', () => { void bridge().historyRestore(e.commit).then(() => refreshGitHistory()).catch((error) => snack(String(error))); }],
        ['Diff revision', 'Compare with the previously selected revision', () => { const previous = state.historySelected.at(-1); if (!previous) { state.historySelected = [e.commit]; snack('Selected the first revision. Choose another revision to diff.'); } else void bridge().historyDiff(previous, e.commit).then((changes) => openDetail('Redacted revision diff', e.commit, JSON.stringify(changes, null, 2))).catch((error) => snack(String(error))); }],
      ],
    }));
  }
  return h('div', { class: 'pane' },
    h('div', { class: 'pane-head' }, searchLine('history', 'Search Git-backed revision metadata')),
    filters, list,
    h('div', { class: 'dialog-actions history-actions' },
      h('button', { class: 'btn outlined', onclick: () => void refreshGitHistory() }, 'Refresh'),
      h('button', { class: 'btn tonal', onclick: () => void bridge().historyExport(historyQuery()).then((result) => snack(result.status === 'saved' ? 'Redacted history export saved.' : 'Export cancelled.')) }, 'Export filtered metadata'),
      h('button', { class: 'btn text', onclick: () => void bridge().historyPrune(100).then(() => refreshGitHistory()) }, 'Record retention: keep 100'),
      h('button', { class: 'btn text', onclick: () => void bridge().historyLock().then((access) => { state.historyAccess = { ...access, password: '' }; state.gitHistory = []; render(); }) }, 'Lock history')),
    h('div', { style: 'padding:12px 20px' }, h('p', { class: state.historyMessage ? 'feedback error' : 'feedback', role: 'status' },
      state.historyMessage || 'Local Git-backed history is append-only. Browse, date/action filtering, redacted diff, restore-as-new-revision, labels, retention decisions, and redacted export are available. Snapshot contents and credentials are omitted from exports.')));
}

const SCHEDULE_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function newScheduledRule(): ScheduledRule {
  const id = `rule-${Date.now().toString(36)}`;
  return {
    id, label: 'New schedule', enabled: true, priority: 0, startTime: '09:00', endTime: '17:00',
    weekdays: 'every-day', settings: { theme: state.prefs.theme }, source: { kind: 'local' },
  };
}

function editScheduledRule(rule: ScheduledRule): void {
  state.schedule.selectedId = rule.id;
  state.schedule.draft = structuredClone(rule);
  state.schedule.tab = 'editor';
  state.schedule.error = '';
  render();
}

async function persistScheduledDocument(document: ScheduledSettingsState['document']): Promise<void> {
  state.schedule.busy = true; state.schedule.error = ''; render();
  try { acceptScheduledSettings(await bridge().saveScheduledSettings(document)); snack(settingsCopy('Schedule saved.', '排程已儲存。')); }
  catch (error) { state.schedule.error = error instanceof Error ? error.message : settingsCopy('The schedule is invalid.', '排程無效。'); }
  finally { state.schedule.busy = false; render(); }
}

function scheduleSettingEditor(draft: ScheduledRule): HTMLElement {
  const setting = (label: string, key: string, control: HTMLElement): HTMLElement => h('div', { class: 'schedule-setting' }, control,
    h('button', { class: 'btn text compact', disabled: draft.settings[key] === undefined, onclick: () => { delete draft.settings[key]; render(); } }, `Clear ${label}`));
  const stringSelect = (label: string, key: string, options: string[], fallback: string): HTMLElement => setting(label, key,
    selectField(label, options, String(draft.settings[key] ?? fallback), (value) => { draft.settings[key] = value; }));
  return h('div', { class: 'grid2 schedule-values' },
    stringSelect('Language', 'language', ['English', 'Yue', 'Bilingual'], state.prefs.language),
    stringSelect('Theme', 'theme', ['dark', 'light'], state.prefs.theme),
    stringSelect('Density', 'density', ['comfortable', 'compact'], state.prefs.density),
    setting('Accent color', 'accent', colorField('Accent color', String(draft.settings.accent ?? state.prefs.accent), (value) => { draft.settings.accent = value; })),
    setting('Font family', 'font', h('label', { class: 'field' }, 'FONT FAMILY', h('input', { value: String(draft.settings.font ?? state.prefs.font), maxlength: '120', oninput: (e: Event) => { draft.settings.font = (e.target as HTMLInputElement).value; } }))),
    setting('Font scale', 'scale', rangeField('Font scale', .5, 3, .05, Number(draft.settings.scale ?? state.prefs.scale), (value) => { draft.settings.scale = value; })),
    setting('Font weight', 'weight', rangeField('Font weight', 100, 1000, 100, Number(draft.settings.weight ?? state.prefs.weight), (value) => { draft.settings.weight = value; })),
    setting('Corner radius', 'radius', rangeField('Corner radius', 0, 64, 1, Number(draft.settings.radius ?? state.prefs.radius), (value) => { draft.settings.radius = value; })),
    setting('Motion', 'reducedMotion', switchField('Reduce motion', draft.settings.reducedMotion === true, () => { draft.settings.reducedMotion = draft.settings.reducedMotion !== true; render(); })),
    setting('Display name', 'displayName', h('label', { class: 'field' }, 'DISPLAY NAME', h('input', { value: String(draft.settings.displayName ?? scheduledDisplayName()), maxlength: '80', oninput: (e: Event) => { draft.settings.displayName = (e.target as HTMLInputElement).value; } }))));
}

function scheduledEditor(): HTMLElement {
  const draft = state.schedule.draft;
  if (!draft) return emptyState(settingsCopy('Choose a rule to edit.', '揀一條規則先可以編輯。'));
  const source = draft.source ?? { kind: 'local' as const };
  const dateField = (label: string, key: 'startDate' | 'endDate'): HTMLElement => h('label', { class: 'field' }, label,
    h('input', { type: 'date', value: draft[key] ?? '', oninput: (e: Event) => {
      const value = (e.target as HTMLInputElement).value; if (value) draft[key] = value; else delete draft[key];
    } }));
  const timeField = (label: string, key: 'startTime' | 'endTime'): HTMLElement => h('label', { class: 'field' }, label,
    h('input', { type: 'time', value: draft[key], required: true, oninput: (e: Event) => { draft[key] = (e.target as HTMLInputElement).value; } }));
  const weekdays = draft.weekdays === 'every-day' ? new Set<number>([0, 1, 2, 3, 4, 5, 6]) : new Set(draft.weekdays);
  const sourceFields = source.kind === 'json-api' ? h('div', { class: 'grid2' },
    h('label', { class: 'field' }, 'HTTPS OR LOOPBACK URL', h('input', { type: 'url', value: source.url, maxlength: '2048', oninput: (e: Event) => { source.url = (e.target as HTMLInputElement).value; } })),
    numberField('Refresh minutes', 1, 1440, source.refreshMinutes, (value) => { source.refreshMinutes = value; }),
    switchField('Allow explicit loopback HTTP for development', source.allowLoopbackHttpForDevelopment, () => { source.allowLoopbackHttpForDevelopment = !source.allowLoopbackHttpForDevelopment; render(); }))
    : source.kind === 'home-assistant' ? h('div', { class: 'grid2' },
      h('label', { class: 'field' }, 'HOME ASSISTANT BASE URL', h('input', { type: 'url', value: source.baseUrl, maxlength: '2048', oninput: (e: Event) => { source.baseUrl = (e.target as HTMLInputElement).value; } })),
      h('label', { class: 'field' }, 'BOOLEAN ENTITY', h('input', { value: source.entityId, maxlength: '270', placeholder: 'input_boolean.evening_mode', oninput: (e: Event) => { source.entityId = (e.target as HTMLInputElement).value; } })),
      numberField('Refresh minutes', 1, 1440, source.refreshMinutes, (value) => { source.refreshMinutes = value; })) : null;
  return h('div', { class: 'schedule-editor' },
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, 'RULE LABEL', h('input', { value: draft.label, maxlength: '120', oninput: (e: Event) => { draft.label = (e.target as HTMLInputElement).value; } })),
      numberField('Priority', -1000, 1000, draft.priority, (value) => { draft.priority = value; }),
      dateField('OPTIONAL START DATE', 'startDate'), dateField('OPTIONAL END DATE', 'endDate'),
      timeField('START TIME', 'startTime'), timeField('END TIME', 'endTime'),
      switchField('Rule enabled', draft.enabled, () => { draft.enabled = !draft.enabled; render(); })),
    h('fieldset', { class: 'weekday-fieldset' }, h('legend', {}, 'Weekdays'),
      h('label', { class: 'check-row' }, h('input', { type: 'checkbox', checked: draft.weekdays === 'every-day', onchange: () => { draft.weekdays = 'every-day'; render(); } }), 'Every day'),
      ...SCHEDULE_WEEKDAYS.map((day, index) => h('label', { class: 'check-row' }, h('input', { type: 'checkbox', checked: weekdays.has(index), onchange: () => {
        const next = new Set(weekdays); if (next.has(index)) next.delete(index); else next.add(index); draft.weekdays = [...next].sort(); render();
      } }), day))),
    h('div', { class: 'notice' }, `Times use ${state.schedule.data?.timezone ?? 'the local system timezone'}. Daylight-saving changes follow the operating system. Cross-midnight windows belong to the day they start; equal start and end times are inactive. Start is inclusive and end is exclusive.`),
    selectField('Activation source', ['Local schedule', 'JSON API', 'Home Assistant boolean'], source.kind === 'local' ? 'Local schedule' : source.kind === 'json-api' ? 'JSON API' : 'Home Assistant boolean', (value) => {
      draft.source = value === 'JSON API' ? { kind: 'json-api', url: 'https://', refreshMinutes: 15, allowLoopbackHttpForDevelopment: false }
        : value === 'Home Assistant boolean' ? { kind: 'home-assistant', baseUrl: 'https://', entityId: 'input_boolean.schedule', refreshMinutes: 5 }
          : { kind: 'local' }; render();
    }), sourceFields,
    h('h3', {}, settingsCopy('Scheduled values', '排程值')), scheduleSettingEditor(draft),
    h('div', { class: 'btnrow' },
      h('button', { class: 'btn filled', disabled: state.schedule.busy, onclick: () => {
        const data = state.schedule.data; if (!data) return;
        const rules = data.document.rules.filter(({ id }) => id !== draft.id); rules.push(structuredClone(draft));
        void persistScheduledDocument({ schemaVersion: 1, rules });
      } }, settingsCopy('Save rule', '儲存規則')),
      h('button', { class: 'btn outlined', onclick: () => { state.schedule.tab = 'rules'; render(); } }, settingsCopy('Back to rules', '返回規則'))));
}

function scheduledSources(): HTMLElement {
  const data = state.schedule.data;
  if (!data) return emptyState(settingsCopy('Scheduled settings are unavailable.', '排程設定暫時不可用。'));
  const external = data.document.rules.filter(({ source }) => source && source.kind !== 'local');
  if (!external.length) return emptyState(settingsCopy('No external sources are configured.', '未有設定外部來源。'));
  return h('div', { class: 'schedule-source-list' }, ...external.map((rule) => {
    const status = data.sourceStatuses.find(({ ruleId }) => ruleId === rule.id);
    const isHa = rule.source?.kind === 'home-assistant';
    return card(rule.label, 'External source', [
      h('p', { class: `feedback ${status?.state === 'error' || status?.state === 'missing-token' ? 'bad' : ''}`, role: 'status' },
        `State: ${status?.state ?? 'pending'}${status?.code ? ` (${status.code})` : ''}. Last checked: ${status?.checkedAt ? new Date(status.checkedAt).toLocaleString() : 'not yet'}.`),
      isHa ? h('label', { class: 'field' }, 'HOME ASSISTANT ACCESS TOKEN', h('input', { type: 'password', value: state.schedule.token, autocomplete: 'off', maxlength: '4096', oninput: (e: Event) => { state.schedule.token = (e.target as HTMLInputElement).value; } })) : null,
      h('div', { class: 'btnrow' },
        isHa ? h('button', { class: 'btn tonal', disabled: !state.schedule.token, onclick: async () => {
          const bytes = new TextEncoder().encode(state.schedule.token); state.schedule.token = '';
          try { acceptScheduledSettings(await bridge().setScheduledHomeAssistantToken(rule.id, bytes)); snack('Home Assistant token stored in the operating-system credential vault.'); }
          catch { state.schedule.error = 'The Home Assistant token could not be stored or verified.'; }
          finally { bytes.fill(0); render(); }
        } }, 'Store token') : null,
        isHa ? h('button', { class: 'btn outlined', onclick: () => void bridge().clearScheduledHomeAssistantToken(rule.id).then((next) => { acceptScheduledSettings(next); render(); }) }, 'Clear token') : null,
        h('button', { class: 'btn outlined', onclick: () => void bridge().refreshScheduledSettings().then((next) => { acceptScheduledSettings(next); render(); }) }, 'Retry now')),
      h('p', { class: 'feedback' }, 'Failures keep the last valid external value only until the rule is evaluated again; otherwise the local base setting remains in effect. Redirects, credentials in URLs, private targets, oversized payloads, and invalid schemas are rejected.'),
    ], 'wide');
  }));
}

function scheduledSettingsSurface(): HTMLElement {
  const data = state.schedule.data;
  const tabs: Array<['rules' | 'editor' | 'sources', string]> = [['rules', 'Rules'], ['editor', 'Editor'], ['sources', 'Sources']];
  const tablist = h('div', { class: 'settings-subtabs', role: 'tablist', 'aria-label': 'Scheduled settings sections' }, ...tabs.map(([id, label]) => h('button', {
    role: 'tab', 'aria-selected': state.schedule.tab === id ? 'true' : 'false', tabindex: state.schedule.tab === id ? '0' : '-1',
    onclick: () => { state.schedule.tab = id; render(); },
  }, label)));
  let panel: HTMLElement;
  if (state.schedule.tab === 'editor') panel = scheduledEditor();
  else if (state.schedule.tab === 'sources') panel = scheduledSources();
  else if (!data || !data.document.rules.length) panel = emptyState(settingsCopy('No schedule rules yet. Add one to begin.', '未有排程規則；新增一條開始。'));
  else panel = h('div', { class: 'schedule-rule-list' }, ...data.document.rules.map((rule) => {
    const status = data.sourceStatuses.find(({ ruleId }) => ruleId === rule.id);
    return h('div', { class: 'schedule-rule-row' },
      h('div', {}, h('strong', {}, rule.label), h('p', {}, `${rule.startTime}–${rule.endTime} · priority ${rule.priority} · ${status?.state ?? 'pending'}${data.activeRuleIds.includes(rule.id) ? ' · active now' : ''}`)),
      switchField(`Enable ${rule.label}`, rule.enabled, () => { void persistScheduledDocument({ schemaVersion: 1, rules: data.document.rules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item) }); }),
      h('button', { class: 'btn tonal', onclick: () => editScheduledRule(rule) }, 'Edit'),
      h('button', { class: 'btn text', onclick: () => gate(`Delete schedule ${rule.label}`, undefined, undefined, () => { void persistScheduledDocument({ schemaVersion: 1, rules: data.document.rules.filter(({ id }) => id !== rule.id) }); }) }, 'Delete'));
  }));
  return h('section', { class: 'schedule-surface', 'aria-labelledby': 'scheduled-settings-heading' },
    h('div', { class: 'section-title' }, h('div', {}, h('h2', { id: 'scheduled-settings-heading' }, settingsCopy('Scheduled settings', '排程設定')),
      h('p', {}, settingsCopy('Temporarily override language, theme, density, accent, font, display name, and motion without overwriting your base choices.', '暫時覆蓋語言、主題、密度、強調色、字型、顯示名稱同動態，而唔會改寫基本選擇。')))),
    tablist,
    h('div', { role: 'tabpanel', class: 'schedule-panel' }, panel),
    state.schedule.error ? h('p', { class: 'feedback bad', role: 'alert' }, state.schedule.error) : null,
    h('div', { class: 'btnrow' }, h('button', { class: 'btn filled', onclick: () => editScheduledRule(newScheduledRule()) }, 'Add rule'),
      h('button', { class: 'btn outlined', onclick: () => void bridge().refreshScheduledSettings().then((next) => { acceptScheduledSettings(next); render(); }) }, 'Refresh evaluation')),
    h('p', { class: 'feedback' }, `Timezone: ${data?.timezone ?? 'loading'} · Evaluated: ${data ? new Date(data.evaluatedAt).toLocaleString() : 'not yet'}. Higher priority wins; ties use the lexicographically smaller stable rule ID. When an override ends, the saved base value returns.`));
}

function settingsPane(): HTMLElement {
  const p = state.prefs;
  const match = makeMatcher(sq('settings'));
  const show = (label: string): boolean => match(label);
  const cards = h('div', { class: 'cards' });

  const surface = state.settingsSurface;
  const school = schoolModeReady();
  if (show('Scheduled settings schedule external source Home Assistant JSON API timezone daylight saving cross-midnight precedence fallback language theme density accent font display name motion')) {
    cards.appendChild(scheduledSettingsSurface());
  }
  if (show(`Application display name rename reset title about notifications ${surface?.displayName.displayName ?? ''}`)) {
    const displayInput = h('input', {
      value: state.settingsDraft.displayName, maxlength: '80', autocomplete: 'off',
      'aria-label': settingsCopy('Application display name', '應用程式顯示名稱'),
      oninput: (event: Event) => { state.settingsDraft.displayName = (event.target as HTMLInputElement).value; },
    });
    cards.appendChild(card(settingsCopy('Application display name', '應用程式顯示名稱'), '', [
      h('p', {}, settingsCopy(
        'Changes the title bar, About heading, and app-authored notifications. Package, data-directory, and update identities stay unchanged.',
        '會改標題列、關於標題同應用程式通知；套件、資料目錄同更新識別保持不變。')),
      h('label', { class: 'field' }, settingsCopy('DISPLAY NAME', '顯示名稱'), displayInput),
      h('div', { class: 'btnrow' },
        h('button', { class: 'btn filled', onclick: async () => {
          state.settingsDraft.busy = true; state.settingsDraft.error = ''; render();
          try { acceptSettingsSurface(await bridge().renameDisplayName(state.settingsDraft.displayName)); snack(settingsCopy('Display name saved.', '顯示名稱已儲存。')); }
          catch { state.settingsDraft.error = settingsCopy('Enter a valid single-line display name.', '請輸入有效嘅單行顯示名稱。'); }
          finally { state.settingsDraft.busy = false; render(); }
        } }, settingsCopy('Save name', '儲存名稱')),
        h('button', { class: 'btn outlined', onclick: async () => { acceptSettingsSurface(await bridge().resetDisplayName()); render(); } }, settingsCopy('Reset name', '重設名稱'))),
      state.settingsDraft.error ? h('p', { class: 'feedback bad', role: 'alert' }, state.settingsDraft.error) : null,
    ], 'wide'));
  }

  if (surface && !schoolModeRestrictsPersonalization() && show('Show emojis in dialogs and message boxes decorative semantic accessible')) {
    cards.appendChild(card(settingsCopy('Dialog and message-box emoji', '對話框同訊息框 Emoji'), '', [
      h('p', {}, settingsCopy(
        'Optional emoji are separate presentation-only marks. Buttons, field labels, control text, and accessible names never include them.',
        'Emoji 只係獨立裝飾；按鈕、欄位標籤、控制文字同無障礙名稱永遠唔會包含佢哋。')),
      switchField(settingsCopy('Show emojis in dialogs and message boxes', '喺對話框同訊息框顯示 Emoji'),
        surface.dialogEmoji.showEmojisInDialogsAndMessageBoxes,
        () => { void bridge().setDialogEmojis(!surface.dialogEmoji.showEmojisInDialogsAndMessageBoxes).then((next) => { acceptSettingsSurface(next); render(); }); }),
    ], 'wide'));
  }

  if (show(`${school?.state.displayLabel ?? 'School mode'} shared live English credential password rename`)) {
    const unavailable = !school;
    const label = school?.state.displayLabel ?? settingsCopy('Shared mode unavailable', '共享模式暫時不可用');
    const labelInput = h('input', {
      value: state.settingsDraft.schoolLabel, maxlength: '80', disabled: unavailable,
      'aria-label': settingsCopy('Shared mode display label', '共享模式顯示名稱'),
      oninput: (event: Event) => { state.settingsDraft.schoolLabel = (event.target as HTMLInputElement).value; },
    });
    const passwordInput = h('input', {
      type: 'password', value: state.settingsDraft.password, autocomplete: 'new-password', maxlength: '256', disabled: unavailable,
      'aria-label': settingsCopy('New local unlock password', '新本機解鎖密碼'),
      oninput: (event: Event) => { state.settingsDraft.password = (event.target as HTMLInputElement).value; },
    });
    const confirmInput = h('input', {
      type: 'password', value: state.settingsDraft.confirmPassword, autocomplete: 'new-password', maxlength: '256', disabled: unavailable,
      'aria-label': settingsCopy('Confirm local unlock password', '確認本機解鎖密碼'),
      oninput: (event: Event) => { state.settingsDraft.confirmPassword = (event.target as HTMLInputElement).value; },
    });
    cards.appendChild(card(label, '', [
      h('p', {}, unavailable
        ? settingsCopy('The shared local record could not be read or watched. Its state is unavailable rather than assumed off.', '共享本機紀錄讀取或監察失敗；依家顯示不可用，唔會當佢係關閉。')
        : settingsCopy('This is a user-experience lock, not a security boundary. When enabled, the app is English-only and removes Cantonese, bilingual, funny-level, personal-vocabulary, dialog-emoji, and dim-sum surfaces.', '呢個係使用體驗鎖，唔係安全邊界。啟用時只用英文，並移除粵語、雙語、搞笑級別、個人詞彙、對話 Emoji 同點心畫面。')),
      switchField(label, school?.effective.enabled ?? false, () => {
        if (!school) return;
        if (school.effective.enabled) openDialog('school-unlock');
        else void bridge().setSchoolModeEnabled(true).then((result) => {
          if (result.ok) void bridge().settingsSurfaceState().then((next) => { acceptSettingsSurface(next); render(); });
          else { state.settingsDraft.error = settingsCopy('Set a local unlock password before enabling this mode.', '啟用呢個模式之前，請先設定本機解鎖密碼。'); render(); }
        });
      }),
      h('div', { class: 'grid2' },
        h('label', { class: 'field' }, settingsCopy('MODE NAME', '模式名稱'), labelInput),
        h('div', { class: 'field' }, h('span', {}, settingsCopy('CREDENTIAL', '憑證')), h('span', { class: 'feedback' }, school?.state.credential.method === 'password' ? settingsCopy('Local password configured', '已設定本機密碼') : settingsCopy('No password configured', '未設定密碼'))),
        h('label', { class: 'field' }, settingsCopy('NEW PASSWORD', '新密碼'), passwordInput),
        h('label', { class: 'field' }, settingsCopy('CONFIRM PASSWORD', '確認密碼'), confirmInput)),
      h('div', { class: 'btnrow' },
        h('button', { class: 'btn tonal', disabled: unavailable, onclick: async () => { acceptSettingsSurface(await bridge().renameSchoolMode(state.settingsDraft.schoolLabel)); render(); } }, settingsCopy('Save mode name', '儲存模式名稱')),
        h('button', { class: 'btn filled', disabled: unavailable, onclick: async () => {
          if (!state.settingsDraft.password || state.settingsDraft.password !== state.settingsDraft.confirmPassword) {
            state.settingsDraft.error = settingsCopy('Passwords must match.', '兩次密碼必須相同。'); render(); return;
          }
          try { acceptSettingsSurface(await bridge().configureSchoolModePassword(state.settingsDraft.password)); state.settingsDraft.password = ''; state.settingsDraft.confirmPassword = ''; state.settingsDraft.error = ''; snack(settingsCopy('Local unlock password saved.', '本機解鎖密碼已儲存。')); }
          catch { state.settingsDraft.error = settingsCopy('The password could not be stored in the operating-system credential vault.', '密碼未能儲存到作業系統憑證庫。'); }
          render();
        } }, settingsCopy('Set password', '設定密碼')),
        h('button', { class: 'btn outlined', disabled: unavailable || school?.state.credential.method === 'none', onclick: async () => { acceptSettingsSurface(await bridge().resetSchoolModeCredential()); render(); } }, settingsCopy('Reset credential', '重設憑證'))),
      state.settingsDraft.error ? h('p', { class: 'feedback bad', role: 'alert' }, state.settingsDraft.error) : null,
    ], 'wide'));
  }

  const lang = h('div', { class: 'grid2' },
    selectField(narratorText('displayLanguage'), ['English', 'Yue', 'Bilingual'], p.language, (v) => { p.language = v as LanguageMode; render(); }),
    selectField(narratorText('language'), ['English', 'Yue', 'Both'], p.narrator, (v) => { p.narrator = v as Prefs['narrator']; applyPrefs(); render(); narrateFact('settings', NARRATOR_COPY.English.settings, NARRATOR_COPY.Yue.settings); }),
    rangeField(narratorText('englishFunny'), 1, 5, 1, p.enFunny, (v) => { p.enFunny = v; applyPrefs(); }),
    rangeField(narratorText('cantoneseFunny'), 1, 5, 1, p.yueFunny, (v) => { p.yueFunny = v; applyPrefs(); }),
    switchField(narratorText('enabled'), p.narratorEnabled, () => { p.narratorEnabled = !p.narratorEnabled; applyPrefs(); render(); if (p.narratorEnabled) narrateFact('settings', NARRATOR_COPY.English.settings, NARRATOR_COPY.Yue.settings); else void bridge().stopNarration(); }),
    switchField(narratorText('quiet'), p.narratorQuiet, () => { p.narratorQuiet = !p.narratorQuiet; applyPrefs(); render(); }),
    switchField(narratorText('reducedSound'), p.narratorReducedSound, () => { p.narratorReducedSound = !p.narratorReducedSound; applyPrefs(); render(); }),
    h('p', {}, narratorText('disclosure')),
    h('p', { class: 'feedback', role: 'status' }, state.narration.screenReaderActive ? narratorText('screenReader')
      : !state.narration.platformSpeechAvailable ? narratorText('unavailable')
        : p.narratorEnabled ? narratorText('active') : narratorText('off')));
  if (!schoolModeRestrictsPersonalization() && show(`${NARRATOR_COPY.English.section} ${NARRATOR_COPY.Yue.section}`)) cards.appendChild(card(narratorText('section'), '', [lang], 'wide'));

  const vocabulary = state.vocabulary;
  const vocabularyStatus = vocabulary.loading ? vocabularyCopy('loading')
    : vocabulary.status === 'invalid' ? vocabularyCopy('invalid')
      : vocabulary.data.state === 'loaded' ? vocabularyCopy('loaded', vocabulary.data.entryCount) : vocabularyCopy('empty');
  if (!schoolModeRestrictsPersonalization() && show(`Personal vocabulary ${vocabularyStatus} local JSON replace clear reset privacy`)) {
    const vocabularyStatusId = 'personal-vocabulary-status';
    const upload = h('input', {
      type: 'file', accept: 'application/json,.json', 'data-vocabulary-upload': 'true',
      'aria-label': vocabulary.data.state === 'loaded' ? vocabularyCopy('replace') : vocabularyCopy('choose'),
      'aria-describedby': vocabularyStatusId,
      disabled: vocabulary.loading,
      onchange: (event: Event) => {
        const input = event.target as HTMLInputElement;
        const file = input.files?.item(0);
        input.value = '';
        if (file) void uploadPersonalVocabulary(file);
      },
    });
    cards.appendChild(card(vocabularyCopy('title'), '', [
      h('p', {}, vocabularyCopy('description')),
      h('div', {
        id: vocabularyStatusId,
        class: `feedback${vocabulary.status === 'invalid' ? ' bad' : ''}`,
        role: vocabulary.status === 'invalid' ? 'alert' : 'status', 'aria-live': 'polite',
      }, vocabularyStatus),
      h('p', { class: 'vocabulary-privacy' }, vocabularyCopy('privacy')),
      h('div', { class: 'vocabulary-controls' },
        h('label', { class: 'field vocabulary-picker' },
          (vocabulary.data.state === 'loaded' ? vocabularyCopy('replace') : vocabularyCopy('choose')).toUpperCase(), upload),
        h('button', {
          class: 'btn outlined', disabled: vocabulary.loading || vocabulary.data.state === 'empty',
          title: vocabulary.data.state === 'empty' ? vocabularyCopy('empty') : vocabularyCopy('clear'),
          onclick: () => void clearPersonalVocabulary(),
        }, vocabularyCopy('clear'))),
    ], 'wide'));
  }

  const appearance = h('div', { class: 'grid2' },
    selectField('Theme', ['dark', 'light'], p.theme, (v) => { p.theme = v as ThemeMode; render(); }),
    selectField('Density', ['comfortable', 'compact'], p.density, (v) => { p.density = v as Density; render(); }),
    colorField('Accent color', p.accent, (v) => { p.accent = v; render(); }),
    selectField('Font family', ['Segoe UI Variable', 'Segoe UI', 'Arial', 'Consolas', 'Georgia'], p.font, (v) => { p.font = v; render(); }),
    rangeField('Font scale', 0.9, 1.25, 0.05, p.scale, (v) => { p.scale = v; applyPrefs(); }),
    rangeField('Font weight', 300, 700, 100, p.weight, (v) => { p.weight = v; applyPrefs(); }),
    rangeField('Corner radius', 8, 28, 1, p.radius, (v) => { p.radius = v; applyPrefs(); }),
    switchField('Reduce motion', p.reducedMotion, () => { p.reducedMotion = !p.reducedMotion; render(); }));
  if (show('Appearance')) cards.appendChild(card('Appearance', '', [appearance,
    h('div', { class: 'btnrow' },
      h('button', { class: 'btn tonal', onclick: () => openDialog('export') }, 'Export settings'),
      h('button', { class: 'btn outlined', onclick: () => gate('Reset every setting to its default', undefined, undefined, () => { state.prefs = { ...DEFAULT_PREFS }; applyPrefs(); render(); snack('Settings reset to their shipped defaults.'); }) }, 'Reset settings'))], 'wide'));

  if (show('Every surface')) cards.appendChild(card('Every surface', '', [
    h('p', {}, 'Search fields, tabs, cards, menus, notifications, the command palette, and per-element appearance editors keep their state local to this profile.'),
    h('span', { class: 'tag' }, 'Persisted locally')]));

  if (show('Data sources')) cards.appendChild(card('Data sources', '', [
    listBox([
      ['config/applications.json', `${state.catalog.apps.length} entries`, () => go('install')],
      ['config/tweaks.json', `${state.catalog.tweaks.length} entries`, () => go('tweaks')],
      ['config/feature.json', `${state.catalog.features.length} entries`, () => go('config')],
      ['config/preset.json', `${Object.keys(state.catalog.presets).length} presets`, () => go('tweaks')],
      ['config/dns.json', `${Object.keys(state.catalog.dns).length} providers`, () => go('config')],
    ])]));

  return h('div', { class: 'pane padded' },
    h('div', { style: 'margin-bottom:16px;max-width:520px' }, searchLine('settings', 'Search settings, descriptions and current values')),
    cards);
}

function readingPane(): HTMLElement {
  const r = state.reading!;
  if (r.article) return offlineArticlePane(r.article);
  return h('div', { class: 'pane' }, h('article', { class: 'reader' },
    h('h1', {}, r.title), h('div', { class: 'path' }, r.path), h('div', { class: 'body' }, r.body)));
}

function offlineHeadingId(nodes: readonly OfflineDocInlineNode[]): string {
  const text = nodes.map((node) => node.type === 'text' || node.type === 'code' ? node.value : offlineHeadingId(node.children)).join('');
  return text.toLocaleLowerCase('en-US').normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 96);
}

function normalizeOfflineFragment(fragment: string): string {
  return fragment.toLocaleLowerCase('en-US').normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 96);
}

function offlineInlineNodes(article: OfflineDocArticle, nodes: readonly OfflineDocInlineNode[]): Node[] {
  return nodes.map((node): Node => {
    if (node.type === 'text') return document.createTextNode(node.value);
    if (node.type === 'code') return h('code', {}, node.value);
    if (node.type === 'emphasis') return h('em', {}, ...offlineInlineNodes(article, node.children));
    if (node.type === 'strong') return h('strong', {}, ...offlineInlineNodes(article, node.children));
    const link = article.links[node.link];
    const children = offlineInlineNodes(article, node.children);
    if (!link) return h('span', { class: 'doc-link unsafe', title: 'Link metadata is missing.' }, ...children);
    if (link.kind === 'internal') return h('button', {
      class: 'doc-link internal', title: `Open bundled article ${link.articlePath}`,
      onclick: () => openOfflineArticle(link.articlePath, link.fragment),
    }, ...children);
    if (link.kind === 'external') return h('button', {
      class: 'doc-link external', title: `Open external ${link.protocol} link: ${link.href}`,
      onclick: async () => {
        const result = await bridge().openExternal(link.href);
        snack(result.ok ? 'External link opened in the default application.' : result.error ?? 'The external link was not opened.');
      },
    }, ...children, icon('open_in_new'));
    const detail = link.kind === 'unsafe' ? `Blocked unsafe link: ${link.reason}` : `Bundled local resource: ${link.resourcePath}`;
    return h('span', { class: `doc-link ${link.kind}`, title: detail, 'aria-label': detail }, ...children);
  });
}

function offlineArticlePane(article: OfflineDocArticle): HTMLElement {
  const blocks = article.ast.map((block): Node => {
    if (block.type === 'heading') {
      const level = Math.min(6, Math.max(1, block.level));
      return h(`h${level}`, { id: offlineHeadingId(block.children) }, ...offlineInlineNodes(article, block.children));
    }
    if (block.type === 'paragraph') return h('p', {}, ...offlineInlineNodes(article, block.children));
    if (block.type === 'code') return h('pre', { class: 'doc-code', 'data-language': block.language ?? 'text' }, h('code', {}, block.value));
    const list = h(block.ordered ? 'ol' : 'ul', block.ordered && block.start !== null ? { start: String(block.start) } : {});
    block.items.forEach((item) => list.appendChild(h('li', {}, ...offlineInlineNodes(article, item))));
    return list;
  });
  return h('div', { class: 'pane' }, h('article', { class: 'reader offline-doc-reader' },
    h('div', { class: 'path' }, `${article.path} · SHA-256 ${article.hash}`),
    ...blocks,
    article.suggestedArticles.length ? h('nav', { class: 'doc-suggestions', 'aria-label': 'Suggested bundled articles' },
      h('h2', {}, 'Suggested bundled articles'),
      ...article.suggestedArticles.map((suggestion) => h('button', { class: 'btn tonal', onclick: () => openOfflineArticle(suggestion.articlePath) }, suggestion.title))) : null));
}

/* --------------------------------------------------------- small pieces -- */

function card(title: string, eyebrow: string, kids: Array<Node | null>, cls = ''): HTMLElement {
  return h('article', {
    class: `card ${cls}`.trim(),
    oncontextmenu: ctx(`card-${title}`, () => [
      { icon: 'palette', label: 'Edit this card’s appearance…', act: () => openAppearance(`card-${title}`, title) },
      { icon: 'lock', label: 'Lock this card…', act: () => openLockWizard(`card-${title}`, `Card · ${title}`) },
      { icon: 'download', label: 'Export this view', act: () => openDialog('export') },
      { icon: 'refresh', label: 'Refresh', act: () => void refresh() },
    ], title),
  },
    h('div', { class: 'card-head' },
      h('div', {}, eyebrow ? h('p', { class: 'eyebrow' }, eyebrow) : null, h('h2', {}, title)),
      h('button', {
        class: 'icon-btn small', title: 'Edit appearance',
        onclick: () => openAppearance(`card-${title}`, title),
      }, icon('palette'))),
    ...kids.filter(Boolean) as Node[]);
}

function listBox(rows: Array<[string, string, () => void] | [string, string, () => void, string]>): HTMLElement {
  return h('div', { class: 'listbox' }, ...rows.map(([label, sub, act, tag]) =>
    h('button', { class: 'row', style: 'width:100%', onclick: act },
      h('span', { class: 'primary' }, label),
      h('span', { class: 'snippet' }, sub),
      tag ? h('span', { class: 'chip-inline' }, tag) : icon('chevron_right'))));
}

const emptyState = (msg: string): HTMLElement => h('div', { class: 'empty' }, icon('search_off'), h('span', {}, msg));

/** MD3 menu-button select. Every dropdown carries its own search field and its
 *  own anchored regex builder — no menu is exempt for being short. */
function selectField(label: string, options: string[], value: string, onChange: (v: string) => void): HTMLElement {
  const key = `select:${state.dialog ?? state.view}:${label}`;
  const listboxId = `select-listbox-${key.replace(/[^A-Za-z0-9_-]/gu, '-').slice(0, 80)}`;
  const open = (button: HTMLButtonElement, preferred: 'first' | 'last' | 'selected' = 'selected'): void => {
    const rect = button.getBoundingClientRect();
    button.setAttribute('aria-expanded', 'true');
    openMenu(rect.left, rect.bottom + 4, key, options, (v) => { onChange(v); }, Math.max(rect.width, 240), value, () => {
      button.setAttribute('aria-expanded', 'false');
      window.setTimeout(() => [...document.querySelectorAll<HTMLButtonElement>('[data-select-key]')].find((candidate) => candidate.dataset.selectKey === key)?.focus(), 0);
    }, listboxId, preferred);
  };
  const button = h('button', {
      class: 'select-button', 'data-select-key': key, 'aria-label': `${label}: ${value}`,
      'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': listboxId,
      onclick: (e: MouseEvent) => {
        e.stopPropagation();
        open(e.currentTarget as HTMLButtonElement);
      },
      onkeydown: (e: KeyboardEvent) => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault(); e.stopPropagation();
        open(e.currentTarget as HTMLButtonElement, e.key === 'ArrowUp' || e.key === 'End' ? 'last' : 'first');
      },
    }, h('span', {}, value), icon('arrow_drop_down'));
  return h('div', { class: 'field' }, label.toUpperCase(), button);
}

function openMenu(x: number, y: number, key: string, options: string[], pick: (v: string) => void, width = 260, selected = '', onClose?: () => void, listboxId = `select-listbox-${key.replace(/[^A-Za-z0-9_-]/gu, '-').slice(0, 80)}`, preferred: 'first' | 'last' | 'selected' = 'selected'): void {
  document.querySelector('.menu')?.remove();
  const s = sq(key);
  const menu = h('div', {
    class: 'menu', style: `left:${Math.min(x, window.innerWidth - width - 12)}px;top:${Math.min(y, window.innerHeight - 320)}px;min-width:${width}px`,
    onkeydown: (event: KeyboardEvent) => {
      const buttons = [...menu.querySelectorAll<HTMLButtonElement>('[role="option"]')];
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (s.text) { s.text = ''; input.value = ''; paint(); input.focus(); }
        else close();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !buttons.length) return;
      event.preventDefault(); event.stopPropagation();
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : event.key === 'ArrowDown' ? (current < 0 ? 0 : (current + 1) % buttons.length)
          : (current < 0 ? buttons.length - 1 : (current - 1 + buttons.length) % buttons.length);
      buttons[next].focus();
    },
  });
  const close = (): void => { menu.remove(); document.removeEventListener('click', close); onClose?.(); };
  const paint = (): void => {
    const match = makeMatcher(s);
    const listWrap = menu.querySelector('.menu-list');
    if (!listWrap) return;
    listWrap.replaceChildren(...(() => {
      const found = options.filter(match);
      if (!found.length) return [h('div', { class: 'menu-empty' }, 'Nothing matches this filter.')];
      return found.map((o, index) => h('button', {
        role: 'option', 'aria-selected': o === selected ? 'true' : 'false',
        id: `${listboxId}-option-${index}`, class: o === selected ? 'menu-selected' : '', tabindex: o === selected ? '0' : '-1',
        onclick: () => { pick(o); close(); render(); },
      }, icon('check', o === selected ? '' : 'hidden'), h('span', {}, o)));
    })());
  };
  const input = h('input', {
    placeholder: 'Filter this menu', 'aria-label': 'Filter this dropdown menu', value: s.text, spellcheck: 'false',
    oninput: (e: Event) => { s.text = (e.target as HTMLInputElement).value; paint(); },
    onclick: (e: MouseEvent) => e.stopPropagation(),
  }) as HTMLInputElement;
  menu.appendChild(h('div', { class: 'menu-search', onclick: (e: MouseEvent) => e.stopPropagation() },
    icon('search', 'lead'), input,
    h('button', {
      class: `regex-btn${s.regex ? ' on' : ''}`, title: 'Regex builder for this menu',
      onclick: () => { state.regexDraft.target = key; close(); openDialog('regex'); },
    }, '.*')));
  menu.appendChild(h('div', { id: listboxId, class: 'menu-list', role: 'listbox', 'aria-label': key.replace(/^select:/, ''), 'aria-live': 'polite' }));
  document.body.appendChild(menu);
  paint();
  if (preferred === 'selected') input.focus();
  else {
    const buttons = [...menu.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    (preferred === 'last' ? buttons.at(-1) : buttons[0])?.focus();
  }
  window.setTimeout(() => document.addEventListener('click', close), 0);
}

/** Ranges update their readout in place. Calling render() from oninput would replace
 *  the input element mid-drag and the browser would drop pointer capture. */
function rangeField(label: string, min: number, max: number, step: number, value: number, onChange: (v: number) => void): HTMLElement {
  const readout = h('b', { class: 'mono' }, String(value));
  return h('label', { class: 'field' },
    h('span', { style: 'display:flex;justify-content:space-between' }, h('span', {}, label.toUpperCase()), readout),
    h('input', {
      type: 'range', min: String(min), max: String(max), step: String(step), value: String(value),
      style: 'height:44px;border:0;background:none;padding:0',
      oninput: (e: Event) => {
        const v = Number((e.target as HTMLInputElement).value);
        readout.textContent = String(v);
        onChange(v);
      },
    }));
}

function numberField(label: string, min: number, max: number, value: number, onChange: (v: number) => void): HTMLElement {
  return h('label', { class: 'field' }, label.toUpperCase(), h('input', {
    type: 'number', min: String(min), max: String(max), step: '1', value: String(value),
    oninput: (event: Event) => {
      const next = Number((event.target as HTMLInputElement).value);
      if (Number.isInteger(next) && next >= min && next <= max) onChange(next);
    },
  }));
}

function colorField(label: string, value: string, onChange: (v: string) => void): HTMLElement {
  return h('label', { class: 'field' }, label.toUpperCase(),
    h('input', { type: 'color', value, oninput: (e: Event) => onChange((e.target as HTMLInputElement).value) }));
}

function switchField(label: string, on: boolean, toggle: () => void): HTMLElement {
  return h('div', { class: 'switch-row', style: 'align-self:end;padding:6px 0' },
    h('button', { class: `switch${on ? ' on' : ''}`, role: 'switch', 'aria-label': label, 'aria-checked': on ? 'true' : 'false', onclick: toggle }, h('i', {})), h('span', {}, label));
}

/* --------------------------------------------------------------- actions -- */

function go(view: ViewId): void {
  state.view = view;
  state.reading = null;
  const existing = state.tabs.find((t) => t.view === view);
  if (existing) state.activeTab = existing.id;
  else {
    const tab: WorkspaceTab = { id: `t-${Date.now()}`, view, pinned: false, group: isSystemView(view) ? 'System' : 'Maintenance', locked: false };
    state.tabs = [...state.tabs, tab];
    if (tab.group && !state.groups.includes(tab.group)) state.groups.push(tab.group);
    state.activeTab = tab.id;
  }
  persistWorkspace();
  render();
  narrateFact('navigation', NARRATOR_COPY.English.navigation.replace('{view}', VIEW_META[view].title), NARRATOR_COPY.Yue.navigation.replace('{view}', categoryLabel(VIEW_META[view].title)));
}

function toggleSelect(id: string): void {
  if (state.selected.has(id)) {
    state.selected.delete(id);
    delete state.rowColors[id];
  } else {
    state.selected.add(id);
    state.rowColors[id] = state.selectionColor;
    maybeDimSum();
  }
  render();
}

/** One in ten chance, once the selection passes ten rows. Purely for fun. */
function maybeDimSum(): void {
  if (schoolModeRestrictsPersonalization()) return;
  if (state.selected.size <= 10) return;
  if (state.dimSumSeen > Date.now() - 60000) return;
  if (Math.random() >= 0.1) return;
  state.dimSumSeen = Date.now();
  state.dialogArg = String(Math.floor(Math.random() * DIM_SUM.length));
  window.setTimeout(() => { state.dialog = 'dimsum'; render(); }, 120);
}

function toggleChip(cat: string, additive: boolean): void {
  if (cat === 'All' || !additive) { state.chips = new Set([cat]); state.cat = cat; }
  else {
    state.chips.delete('All');
    state.chips.has(cat) ? state.chips.delete(cat) : state.chips.add(cat);
    if (!state.chips.size) state.chips.add('All');
    state.cat = 'All';
  }
  render();
}

function applyPreset(name: string): void {
  const ids = state.catalog.presets[name] ?? [];
  state.selected = new Set(ids);
  state.rowColors = {};
  ids.forEach((id) => { state.rowColors[id] = state.selectionColor; });
  record('preset', `Applied the ${name} tweak preset (${ids.length} items)`);
  maybeDimSum();
  snack(`${name} preset selected — ${ids.length} tweaks.`);
}

function primaryAction(): void {
  if (!state.selected.size) { snack('Nothing is selected.'); return; }
  if (state.view !== 'install') { snack('This operation is unavailable until its reviewed system adapter is installed.'); return; }
  const ids = selectedPackageIds();
  gate(`Install ${ids.length} selected package(s)`, 'install', ids);
}

async function runNow(kind: RunKind, ids: string[]): Promise<void> {
  if (kind !== 'upgrade' && !ids.length) { snack('Nothing is selected.'); return; }
  const total = kind === 'upgrade' ? 1 : ids.length;
  try {
    await ensureDeps();
    state.queue = { active: true, index: 0, total, current: ids[0] ?? 'all installed packages', log: [] };
    render();
    const res = await bridge().run(kind, ids);
    state.runOutput = `$ winutil ${kind} ×${total}\n${res.stdout}${res.stderr ? `\n${res.stderr}` : ''}\nexit ${res.code}`;
    record(kind, `${kind} completed for ${total} item(s), exit ${res.code}`);
    state.notifications = [{
      id: `n-${Date.now()}`, icon: res.ok ? 'download_done' : 'error',
      title: res.ok ? `${kind} finished` : `${kind} failed (exit ${res.code})`,
      detail: `${total} item(s) processed automatically · no prompts`, read: false,
    }, ...state.notifications];
    snack(res.ok ? `${kind}: ${total} item(s) completed automatically.` : `${kind} failed with exit ${res.code}. See the output.`);
    if (res.ok) narrateFact('operation', NARRATOR_COPY.English.operationDone.replace('{kind}', kind).replace('{count}', String(total)).replace('{code}', String(res.code)), NARRATOR_COPY.Yue.operationDone.replace('{kind}', kind).replace('{count}', String(total)).replace('{code}', String(res.code)));
    else narrateFact('operation', NARRATOR_COPY.English.operationFailed.replace('{kind}', kind).replace('{count}', String(total)).replace('{code}', String(res.code)), NARRATOR_COPY.Yue.operationFailed.replace('{kind}', kind).replace('{count}', String(total)).replace('{code}', String(res.code)), 'error');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    state.runOutput = `$ winutil ${kind} ×${total}\n${detail}\nrequest failed`;
    state.notifications = [{ id: `n-${Date.now()}`, icon: 'error', title: `${kind} could not start`, detail, read: false }, ...state.notifications];
    snack(`${kind} could not start. See the output for the exact reason.`);
    narrateFact('operation', NARRATOR_COPY.English.operationStartFailed.replace('{kind}', kind).replace('{detail}', detail), NARRATOR_COPY.Yue.operationStartFailed.replace('{kind}', kind).replace('{detail}', detail), 'error');
  } finally {
    state.queue.active = false;
    render();
  }
}

function selectedPackageIds(): string[] {
  const selected = state.selected;
  return state.catalog.apps.filter((app) => selected.has(app.id) && app.winget).map((app) => app.id);
}

/** Prerequisites install themselves; the user is never sent to a browser. */
async function ensureDeps(): Promise<void> {
  if (state.deps.length && state.deps.every((d) => d.present || d.installed)) return;
  state.deps = await bridge().ensureDeps();
  const fixed = state.deps.filter((d) => d.installed);
  const failed = state.deps.filter((d) => !d.present && !d.installed);
  if (fixed.length) snack(`Installed ${fixed.map((d) => d.name).join(', ')} automatically.`);
  if (failed.length) {
    state.notifications = [{
      id: `n-${Date.now()}`, icon: 'error', title: 'A prerequisite could not be installed',
      detail: failed.map((d) => `${d.name}: ${d.detail}`).join(' · '), read: false,
    }, ...state.notifications];
  }
}

async function loadInstalled(): Promise<void> {
  const ids = await bridge().installed();
  state.installedIds = new Set(ids);
  snack(`${ids.length} package(s) already installed are marked.`);
}

async function refresh(): Promise<void> {
  await loadInstalled();
}

function openDetail(title: string, path: string, body: string): void {
  state.reading = { title, path, body };
  render();
}

function openOfflineArticle(articlePath: string, fragment?: string | null): void {
  const article = state.offlineDocs?.articles.find((candidate) => candidate.path === articlePath);
  if (!article) { snack(`Bundled article is unavailable: ${articlePath}`); return; }
  state.reading = { title: article.title, path: article.path, body: article.bodyText, article };
  render();
  if (fragment) window.setTimeout(() => document.getElementById(normalizeOfflineFragment(fragment))?.scrollIntoView({ block: 'start' }), 0);
}

/* ------------------------------------------------------------------ tabs -- */

function newTab(): void {
  const tab: WorkspaceTab = { id: `t-${Date.now()}`, view: state.view, pinned: false, group: null, locked: false };
  state.tabs = [...state.tabs, tab];
  state.activeTab = tab.id;
  persistWorkspace();
  render();
}

function closeTab(id: string): void {
  const tab = state.tabs.find((t) => t.id === id);
  if (!tab) return;
  if (tab.locked) { snack('This tab is locked. Unlock it from the Locks panel first.'); return; }
  if (tab.pinned) { snack('This tab is pinned. Unpin it before closing.'); return; }
  state.tabs = state.tabs.filter((t) => t.id !== id);
  if (state.activeTab === id && state.tabs.length) {
    state.activeTab = state.tabs[0].id;
    state.view = state.tabs[0].view;
  }
  persistWorkspace();
  render();
}

type MenuItem =
  | { icon: string; label: string; act: () => void; danger?: boolean }
  | { section: string }
  | 'divider';

const isAction = (i: MenuItem): i is { icon: string; label: string; act: () => void; danger?: boolean } =>
  typeof i !== 'string' && 'label' in i;

/** Every context menu in the app is built here, so every one of them gets its own
 *  filter field and its own anchored regex builder. Actions are grouped into named
 *  sections; a section disappears when the filter empties it. */
function contextMenu(key: string, x: number, y: number, items: MenuItem[], title = ''): void {
  document.querySelector('.menu')?.remove();
  const s = sq(`menu:${key}`);
  const width = 264;
  const menu = h('div', {
    class: 'menu',
    style: `left:${Math.min(x, window.innerWidth - width - 12)}px;top:${Math.min(y, window.innerHeight - 400)}px;min-width:${width}px`,
  });
  const close = (): void => { menu.remove(); document.removeEventListener('click', close); };
  const list = h('div', { class: 'menu-list' });
  const paint = (): void => {
    const match = makeMatcher(s);
    const out: HTMLElement[] = [];
    let pendingSection: string | null = null;
    let shown = 0;
    for (const item of items) {
      if (item === 'divider') continue;
      if ('section' in item) { pendingSection = item.section; continue; }
      if (!match(item.label)) continue;
      if (pendingSection) { out.push(h('div', { class: 'menu-section' }, pendingSection)); pendingSection = null; }
      shown += 1;
      out.push(h('button', {
        class: item.danger ? 'menu-danger' : '',
        onclick: () => { item.act(); close(); render(); },
      }, icon(item.icon), h('span', {}, item.label)));
    }
    list.replaceChildren(...(shown ? out : [h('div', { class: 'menu-empty' }, 'Nothing in this menu matches the filter.')]));
  };
  const input = h('input', {
    placeholder: 'Filter this menu', 'aria-label': `Filter ${title || 'context menu'}`, value: s.text, spellcheck: 'false',
    oninput: (e: Event) => { s.text = (e.target as HTMLInputElement).value; paint(); },
    onclick: (e: MouseEvent) => e.stopPropagation(),
  });
  if (title) menu.appendChild(h('div', { class: 'menu-title' }, title));
  menu.appendChild(h('div', { class: 'menu-search', onclick: (e: MouseEvent) => e.stopPropagation() },
    icon('search', 'lead'), input,
    h('button', {
      class: `regex-btn${s.regex ? ' on' : ''}`, title: 'Regex builder for this menu',
      onclick: () => { state.regexDraft.target = `menu:${key}`; close(); openDialog('regex'); },
    }, '.*')));
  menu.appendChild(list);
  document.body.appendChild(menu);
  paint();
  input.focus();
  window.setTimeout(() => document.addEventListener('click', close), 0);
}

/** Right-click handler factory — attach to any element. */
const ctx = (key: string, items: () => MenuItem[], title = ''): ((e: MouseEvent) => void) =>
  (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); contextMenu(key, e.clientX, e.clientY, items(), title); };

const bulkItems = (ids: string[], label: string): MenuItem[] => [
  { section: 'Selection' },
  { icon: 'select_all', label: `Select all ${ids.length} in view`, act: () => { ids.forEach((i) => { state.selected.add(i); state.rowColors[i] = state.selectionColor; }); maybeDimSum(); } },
  { icon: 'deselect', label: 'Clear the selection', act: () => { state.selected.clear(); state.rowColors = {}; } },
  { icon: 'flip_to_front', label: 'Invert the selection', act: () => { ids.forEach((i) => (state.selected.has(i) ? state.selected.delete(i) : (state.selected.add(i), state.rowColors[i] = state.selectionColor))); maybeDimSum(); } },
  { icon: 'data_object', label: 'Select by regex…', act: () => openBulkRegex('select') },
  { icon: 'backspace', label: 'Deselect by regex…', act: () => openBulkRegex('deselect') },
  { section: 'Colour' },
  { icon: 'palette', label: 'Recolour the selection…', act: () => openColorPicker('selection', `Selection · ${state.selected.size} ${label}`) },
  { section: 'Profiles' },
  { icon: 'bookmark_add', label: 'Save this selection as a profile…', act: () => openDialog('saveselection') },
  { icon: 'bookmarks', label: 'Open selection profiles', act: () => openDialog('profiles') },
  { section: 'Act on the selection' },
  { icon: 'play_arrow', label: `Run ${state.selected.size} selected ${label}`, act: () => primaryAction() },
  { icon: 'download', label: `Export ${state.selected.size} selected`, act: () => openDialog('export') },
  { icon: 'lock', label: 'Lock the current selection…', act: () => openLockWizard(`selection-${state.view}`, `Selection · ${state.selected.size} ${label}`) },
];

function tabMenu(tab: WorkspaceTab, x: number, y: number): void {
  contextMenu(`tab-${tab.id}`, x, y, [
    { section: 'This tab' },
    { icon: tab.pinned ? 'keep_off' : 'push_pin', label: tab.pinned ? 'Unpin tab' : 'Pin tab', act: () => { tab.pinned = !tab.pinned; } },
    { icon: 'lock', label: tab.locked ? 'Unlock this tab…' : 'Lock this tab…', act: () => openLockWizard(`tab-${tab.id}`, `Tab · ${viewTitle(tab.view)}`, tab.locked ? 'unlock' : 'set') },
    { icon: 'content_copy', label: 'Duplicate tab', act: () => { state.tabs = [...state.tabs, { ...tab, id: `t-${Date.now()}`, pinned: false }]; } },
    { section: 'Groups' },
    { icon: 'drive_file_move', label: tab.group ? `Move out of ${tab.group}` : `Move into ${state.selectedGroup}`, act: () => moveTabToGroup(tab, tab.group ? null : state.selectedGroup) },
    { icon: 'tab_group', label: 'Open the tab manager', act: () => openDialog('tabs') },
    { section: 'Appearance' },
    { icon: 'palette', label: 'Edit tab appearance…', act: () => openAppearance(`tab-${tab.id}`, VIEW_META[tab.view].title) },
    { section: 'Close' },
    { icon: 'close_fullscreen', label: 'Close every other tab', act: () => { state.tabs.filter((o) => o.id !== tab.id).forEach((o) => closeTab(o.id)); } },
    { icon: 'close', label: 'Close tab', act: () => closeTab(tab.id), danger: true },
  ], VIEW_META[tab.view].title);
}

function previewTabClose(inverse: boolean): void {
  const search = tabSearch(inverse ? 'closeNot' : 'closeContaining');
  const validation = searchValidation(search);
  if (!validation.valid) {
    state.tabClosePreview = [];
    snack(validation.message);
    render();
    return;
  }
  state.tabClosePreview = state.tabs
    .filter((t) => (state.tabIncludePinned || !t.pinned) && !t.locked)
    .filter((t) => (inverse ? !validation.match(VIEW_META[t.view].title) : validation.match(VIEW_META[t.view].title)))
    .map((t) => t.id);
  if (!state.tabClosePreview.length) snack('No closable tab matches this preview. Pinned and locked tabs stay excluded.');
  render();
}

/* --------------------------------------------------------------- dialogs -- */

function openDialog(id: DialogId, arg = ''): void {
  dialogReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  state.dialog = id;
  state.dialogArg = arg;
  state.dialogSearch.text = '';
  render();
  if (id === 'auth') void loadAuthenticatorEntries();
  if (id === 'lock') void refreshLocks();
  window.setTimeout(() => {
    const firstInput = $<HTMLInputElement>('.dialog input');
    const dialog = $<HTMLElement>('.dialog');
    (firstInput ?? dialog)?.focus();
  }, 20);
}

const closeDialog = (): void => {
  if (state.dialog === 'auth') { stopAuthenticatorRefresh(); invalidateAuthenticatorRegistration(); }
  state.dialog = null;
  render();
  window.setTimeout(() => dialogReturnFocus?.focus(), 0);
};

function openAppearance(id: string, label: string): void {
  state.appearanceTarget = { id, label };
  state.appearanceOverrides[id] = state.appearanceOverrides[id] ?? {
    accent: state.prefs.accent, font: state.prefs.font, radius: state.prefs.radius,
    scale: state.prefs.scale, weight: state.prefs.weight,
  };
  openDialog('appearance');
}

function gate(action: string, kind?: RunKind, ids?: string[], after?: () => void): void {
  state.gate = { left: false, right: false, slider: 0, action, kind: kind ?? null, ids: ids ?? null, after: after ?? null };
  openDialog('gate');
}

function dialogLayer(): HTMLElement {
  const body = ((): HTMLElement => {
    switch (state.dialog) {
      case 'palette': return paletteDialog();
      case 'regex': return regexDialog();
      case 'tabs': return tabsDialog();
      case 'appearance': return appearanceDialog();
      case 'lock': return lockDialog();
      case 'auth': return authDialog();
      case 'notifications': return notificationsDialog();
      case 'export': return exportDialog();
      case 'gate': return gateDialog();
      case 'about': return aboutDialog();
      case 'profiles': return profilesDialog();
      case 'saveselection': return saveSelectionDialog();
      case 'dimsum': return dimSumDialog();
      case 'color': return colorDialog();
      case 'school-unlock': return schoolUnlockDialog();
      default: return h('div');
    }
  })();
  return h('div', {
    class: 'scrim',
    onclick: (e: MouseEvent) => { if (e.target === e.currentTarget) closeDialog(); },
    onkeydown: (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = [...body.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    },
  }, body);
}

function dialogShell(eyebrow: string, title: string, kids: Array<Node | null>, actions: Array<Node | null>, wide = false): HTMLElement {
  const titleId = `dialog-title-${String(state.dialog ?? 'surface')}`;
  const category: DialogEmojiCategory = state.dialog === 'gate' ? 'destructive'
    : state.dialog === 'lock' || state.dialog === 'auth' || state.dialog === 'school-unlock' ? 'security'
      : state.dialog === 'notifications' ? 'information'
        : state.dialog === 'dimsum' ? 'success' : 'information';
  const decoration = state.settingsSurface?.dialogDecorations[category] ?? null;
  return h('div', { class: `dialog${wide ? ' wide' : ''}`, role: 'dialog', tabindex: '-1', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div', { class: 'dialog-head' },
      decoration ? h('span', { class: 'dialog-emoji-decoration', role: 'presentation', 'aria-hidden': 'true' }, decoration) : null,
      h('div', {}, h('p', { class: 'eyebrow' }, eyebrow), h('h2', { id: titleId }, title)),
      h('button', { class: 'icon-btn', 'aria-label': 'Close dialog', onclick: closeDialog }, icon('close'))),
    ...kids.filter(Boolean) as Node[],
    h('div', { class: 'dialog-actions' }, ...actions.filter(Boolean) as Node[]));
}

function schoolUnlockDialog(): HTMLElement {
  const school = schoolModeReady();
  const label = school?.state.displayLabel ?? 'School mode';
  const password = h('input', {
    type: 'password', autocomplete: 'current-password', maxlength: '256',
    'aria-label': `Password for ${label}`,
    oninput: (event: Event) => { state.settingsDraft.password = (event.target as HTMLInputElement).value; },
  });
  return dialogShell('Local unlock', `Turn off ${label}`, [
    h('p', {}, 'Enter the local password to restore the stored language, funny-level, personal-vocabulary, dialog-emoji, and dim-sum preferences.'),
    h('p', {}, 'This is a user-experience lock, not a security boundary. Resetting the credential from the settings surface removes this speed bump.'),
    h('label', { class: 'field' }, 'PASSWORD', password),
    state.settingsDraft.error ? h('p', { class: 'feedback bad', role: 'alert' }, state.settingsDraft.error) : null,
  ], [
    h('button', { class: 'btn outlined', onclick: closeDialog }, 'Cancel'),
    h('button', { class: 'btn filled', onclick: async () => {
      const result = await bridge().setSchoolModeEnabled(false, state.settingsDraft.password);
      state.settingsDraft.password = '';
      if (!result.ok) { state.settingsDraft.error = result.code === 'credential-rejected' ? 'The password did not match.' : 'The credential vault is unavailable.'; render(); return; }
      state.settingsDraft.error = ''; acceptSettingsSurface(await bridge().settingsSurfaceState()); closeDialog(); render();
    } }, 'Unlock and turn off'),
  ]);
}

function dialogSearchLine(placeholder: string, onInput?: () => void): HTMLElement {
  return h('div', { class: 'searchbar', style: 'max-width:none;margin-bottom:14px' },
    icon('search', ''),
    h('input', {
      value: state.dialogSearch.text, placeholder, 'aria-label': placeholder,
      oninput: (e: Event) => { state.dialogSearch.text = (e.target as HTMLInputElement).value; onInput ? onInput() : render(); const i = $<HTMLInputElement>('.dialog input'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); },
    }),
    h('button', {
      class: `regex-btn${state.dialogSearch.regex ? ' on' : ''}`, title: 'Open the regex builder',
      onclick: () => { state.regexDraft.target = 'dialog'; openDialog('regex'); },
    }, '.*'));
}

function paletteDialog(): HTMLElement {
  const match = makeMatcher(state.dialogSearch);
  type Cmd = { label: string; sub: string; icon: string; act: () => void };
  const cmds: Cmd[] = [
    ...NAV.filter((n): n is { id: ViewId; label: string; icon: string } => 'id' in n)
      .map((n) => ({ label: `Go to ${n.label}`, sub: 'Navigation', icon: n.icon, act: () => { closeDialog(); go(n.id); } })),
    { label: 'Toggle theme', sub: `Currently ${state.prefs.theme}`, icon: 'contrast', act: () => { state.prefs.theme = state.prefs.theme === 'dark' ? 'light' : 'dark'; closeDialog(); } },
    { label: 'Toggle density', sub: `Currently ${state.prefs.density}`, icon: 'density_medium', act: () => { state.prefs.density = state.prefs.density === 'compact' ? 'comfortable' : 'compact'; closeDialog(); } },
    ...(schoolModeRestrictsPersonalization() ? [] : [{ label: 'Cycle language mode', sub: `Currently ${state.prefs.language}`, icon: 'translate', act: () => { const o: LanguageMode[] = ['English', 'Yue', 'Bilingual']; state.prefs.language = o[(o.indexOf(state.prefs.language) + 1) % 3]; closeDialog(); } }]),
    { label: 'Manage application display name', sub: state.settingsSurface?.displayName.displayName ?? 'Material System Utility', icon: 'edit', act: () => { closeDialog(); go('settings'); state.searches.settings = { text: 'Application display name', regex: false, flags: 'iu' }; render(); } },
    { label: schoolModeReady()?.state.displayLabel ?? 'Shared mode status', sub: schoolModeReady() ? (schoolModeEnabled() ? 'Enabled' : 'Disabled') : 'Shared record unavailable', icon: 'security', act: () => { closeDialog(); go('settings'); state.searches.settings = { text: schoolModeReady()?.state.displayLabel ?? 'shared mode', regex: false, flags: 'iu' }; render(); } },
    { label: 'Open the regex builder', sub: 'Search tool', icon: 'data_object', act: () => { state.regexDraft.target = 'main'; openDialog('regex'); } },
    { label: 'Open the tab manager', sub: 'Groups, pins and safe closing', icon: 'tab_group', act: () => openDialog('tabs') },
    { label: 'Edit appearance of the app root', sub: 'Per-element appearance', icon: 'palette', act: () => openAppearance('app-root', 'Application root') },
    { label: 'Open the authenticator', sub: 'Vault-backed local RFC 6238 codes', icon: 'pin', act: () => openDialog('auth') },
    ...(!schoolModeRestrictsPersonalization() ? [{ label: 'Manage personal vocabulary', sub: 'Local JSON upload, replace, status, and clear controls', icon: 'translate', act: () => {
      closeDialog(); go('settings'); state.searches.settings = { text: 'Personal vocabulary', regex: false, flags: 'iu' };
      render(); window.setTimeout(() => document.querySelector<HTMLInputElement>('[data-vocabulary-upload="true"]')?.focus(), 0);
    } }] : []),
    { label: 'Export this view', sub: '17 formats', icon: 'download', act: () => openDialog('export') },
    { label: 'Mark already-installed packages', sub: 'Queries winget', icon: 'fact_check', act: () => { closeDialog(); void loadInstalled(); } },
    { label: 'Apply the Standard tweak preset', sub: 'Balanced defaults for most users', icon: 'verified', act: () => { closeDialog(); go('tweaks'); applyPreset('Standard'); } },
  ];
  const found = cmds.filter((c) => match(`${c.label} ${c.sub}`));
  return dialogShell('Keyboard route', 'Command palette', [
    dialogSearchLine('Search commands, settings and destinations'),
    h('div', { class: 'listbox' }, ...(found.length ? found.map((c) =>
      h('button', { class: 'row', onclick: c.act }, h('span', { class: 'lead' }, icon(c.icon)),
        h('span', { class: 'primary' }, c.label), h('span', { class: 'snippet' }, c.sub), icon('chevron_right')))
      : [emptyState('No command matches.')])),
  ], [h('button', { class: 'btn text', onclick: closeDialog }, 'Close')], true);
}

const REGEX_FLAGS: Array<[string, string, string]> = [
  ['i', 'Ignore case', 'Match regardless of letter case'],
  ['g', 'Global', 'Find every match, not just the first'],
  ['m', 'Multiline', '^ and $ match at each line break'],
  ['s', 'Dot all', '. also matches a newline'],
  ['u', 'Unicode', 'Treat the pattern as Unicode code points'],
  ['y', 'Sticky', 'Match only from lastIndex'],
];

const REGEX_TOKENS: Array<[string, Array<[string, string]>]> = [
  ['Characters', [['.', 'any character'], ['\\d', 'digit'], ['\\D', 'non-digit'], ['\\w', 'word character'], ['\\W', 'non-word'], ['\\s', 'whitespace'], ['\\S', 'non-whitespace'], ['[abc]', 'one listed character'], ['[^abc]', 'anything but these'], ['[a-z]', 'range']]],
  ['Anchors', [['^', 'start'], ['$', 'end'], ['\\b', 'word boundary'], ['\\B', 'not a word boundary']]],
  ['Quantifiers', [['*', '0 or more'], ['+', '1 or more'], ['?', 'optional'], ['{2,4}', 'between 2 and 4'], ['{3}', 'exactly 3'], ['+?', 'lazy 1 or more']]],
  ['Groups', [['(…)', 'capture'], ['(?:…)', 'group without capturing'], ['(?<name>…)', 'named capture'], ['a|b', 'alternation'], ['\\1', 'backreference'], ['\\k<name>', 'named backreference']]],
  ['Lookaround', [['(?=…)', 'followed by'], ['(?!…)', 'not followed by'], ['(?<=…)', 'preceded by'], ['(?<!…)', 'not preceded by']]],
  ['Unicode', [['\\p{L}', 'any letter'], ['\\p{Lu}', 'uppercase letter'], ['\\p{N}', 'any number'], ['\\p{Script=Han}', 'Han script']]],
];

const REGEX_LIBRARY: Array<[string, string, string]> = [
  ['winget package id', '^[\\w.-]+\\.[\\w.-]+$', 'Publisher.Package form used by the catalogue'],
  ['WinUtil tweak id', '^WPFTweaks[A-Za-z0-9]+$', 'Matches the tweak keys in tweaks.json'],
  ['WinUtil feature id', '^WPF(Features|Fixes|Feature)[A-Za-z0-9]+$', 'Matches the feature and fix keys'],
  ['Registry path', '^HK(LM|CU|CR|U|CC):\\\\[^\\n]+$', 'Fully qualified PowerShell registry path'],
  ['Windows path', '^[A-Za-z]:\\\\(?:[^\\\\/:*?"<>|\\r\\n]+\\\\)*[^\\\\/:*?"<>|\\r\\n]*$', 'Absolute drive-letter path'],
  ['Semantic version', '^v?(\\d+)\\.(\\d+)\\.(\\d+)(?:-([\\w.]+))?$', 'Optional leading v and prerelease'],
  ['GUID', '^\\{?[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\\}?$', 'With or without braces'],
  ['IPv4 address', '\\b(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\b', 'Bounded octets'],
  ['Hex colour', '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$', 'Three or six digits'],
  ['URL', 'https?://[^\\s"\'<>]+', 'Bare http or https URL'],
  ['Email address', '[\\w.+-]+@[\\w-]+\\.[\\w.-]+', 'Pragmatic, not RFC-exhaustive'],
  ['Trailing whitespace', '[ \\t]+$', 'Use with the multiline flag'],
];

/** Human-readable breakdown of a pattern, token by token. */
function explainPattern(pattern: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const lookup = new Map(REGEX_TOKENS.flatMap(([, list]) => list));
  let i = 0;
  let group = 0;
  while (i < pattern.length) {
    const two = pattern.slice(i, i + 2);
    const rest = pattern.slice(i);
    let named: RegExpMatchArray | null;
    if ((named = rest.match(/^\(\?<([A-Za-z_$][\w$]*)>/))) { out.push([named[0], `start of the named capture group “${named[1]}”`]); i += named[0].length; continue; }
    if (rest.startsWith('(?:')) { out.push(['(?:', 'start of a group that does not capture']); i += 3; continue; }
    if (rest.startsWith('(?=')) { out.push(['(?=', 'lookahead: what follows must match']); i += 3; continue; }
    if (rest.startsWith('(?!')) { out.push(['(?!', 'negative lookahead: what follows must not match']); i += 3; continue; }
    if (rest.startsWith('(?<=')) { out.push(['(?<=', 'lookbehind: what precedes must match']); i += 4; continue; }
    if (rest.startsWith('(?<!')) { out.push(['(?<!', 'negative lookbehind: what precedes must not match']); i += 4; continue; }
    if (two.startsWith('\\') && lookup.has(two)) { out.push([two, lookup.get(two)!]); i += 2; continue; }
    if (two === '\\p' || two === '\\P') {
      const m = rest.match(/^\\[pP]\{[^}]*\}/);
      if (m) { out.push([m[0], `${two === '\\p' ? 'matches' : 'does not match'} the Unicode property ${m[0].slice(3, -1)}`]); i += m[0].length; continue; }
    }
    if (two[0] === '\\') { out.push([two, `a literal “${two[1]}”`]); i += 2; continue; }
    const ch = pattern[i];
    if (ch === '(') { group += 1; out.push(['(', `start of capture group ${group}`]); i += 1; continue; }
    if (ch === ')') { out.push([')', 'end of the group']); i += 1; continue; }
    if (ch === '[') {
      const end = pattern.indexOf(']', i + 1);
      const cls = end === -1 ? rest : pattern.slice(i, end + 1);
      out.push([cls, cls.startsWith('[^') ? 'any character NOT in this set' : 'any one character from this set']);
      i += cls.length; continue;
    }
    if (ch === '{') {
      const end = pattern.indexOf('}', i);
      const q = end === -1 ? rest : pattern.slice(i, end + 1);
      out.push([q, `repeated ${q.slice(1, -1).replace(',', ' to ')} time(s)`]);
      i += q.length; continue;
    }
    if (lookup.has(ch)) { out.push([ch, lookup.get(ch)!]); i += 1; continue; }
    if (ch === '|') { out.push(['|', 'either the left side or the right side']); i += 1; continue; }
    out.push([ch, `the literal character “${ch}”`]);
    i += 1;
  }
  return out;
}

function regexDialog(): HTMLElement {
  const d = state.regexDraft;
  const flagSet = new Set(d.flags.split(''));
  const targetLabel = d.target === 'main' ? 'the main search'
    : d.target === 'bulk:select' ? 'BULK SELECT in the current view'
      : d.target === 'bulk:deselect' ? 'BULK DESELECT in the current view'
        : d.target === 'dialog' ? 'the dialog search'
          : d.target.startsWith('tabs:') ? `the “${d.target.slice(5)}” tab-manager search`
            : d.target.startsWith('menu:') ? `the “${d.target.slice(5)}” menu`
            : `the “${d.target}” field`;

  let error = '';
  let re: RegExp | null = null;
  try { re = new RegExp(d.pattern, flagSet.has('g') ? d.flags : `${d.flags}g`); }
  catch (err) { error = (err as Error).message; }

  const lines = d.sample.split('\n');
  const tabs: Array<[typeof d.tab, string, string]> = [
    ['match', 'Matches', 'target'],
    ['replace', 'Replace', 'find_replace'],
    ['explain', 'Explain', 'psychology'],
    ['library', 'Library', 'book'],
  ];

  const body: Array<Node | null> = [
    h('div', { class: 'field-row', style: 'align-items:flex-end' },
      h('label', { class: 'field', style: 'flex:1' }, `PATTERN — APPLIES TO ${targetLabel.toUpperCase()}`,
        h('input', {
          class: 'mono', value: d.pattern, maxlength: '500', spellcheck: 'false', autofocus: 'autofocus',
          oninput: (e: Event) => {
            const el = e.target as HTMLInputElement;
            d.pattern = el.value; d.cursor = el.selectionStart ?? el.value.length;
            render();
            const next = document.querySelector<HTMLInputElement>('.dialog .field input.mono');
            if (next) { next.focus(); next.setSelectionRange(d.cursor, d.cursor); }
          },
        })),
      h('button', { class: 'btn outlined', title: 'Clear the pattern', onclick: () => { d.pattern = ''; render(); } }, 'Clear')),

    h('div', { class: 'flagrow' }, ...REGEX_FLAGS.map(([f, label, help]) => h('button', {
      class: `chip${flagSet.has(f) ? ' on' : ''}`, title: help,
      onclick: () => {
        flagSet.has(f) ? flagSet.delete(f) : flagSet.add(f);
        d.flags = [...flagSet].join('');
        render();
      },
    }, h('code', {}, f), h('span', {}, label)))),

    error
      ? h('div', { class: 'feedback bad' }, `Invalid pattern: ${error}`)
      : h('div', { class: 'feedback' }, `Valid · /${d.pattern}/${d.flags} · ${lines.reduce((n, l) => n + [...l.matchAll(re!)].length, 0)} match(es) across ${lines.length} sample line(s)`),

    h('div', { class: 'tabrow' }, ...tabs.map(([id, label, ic]) => h('button', {
      class: `seg${d.tab === id ? ' on' : ''}`, onclick: () => { d.tab = id; render(); },
    }, icon(ic), h('span', {}, label)))),
  ];

  if (d.tab === 'library') {
    const match = makeMatcher(sq('regexlib'));
    body.push(searchLine('regexlib', 'Search the pattern library'));
    body.push(h('div', { class: 'listbox' }, ...REGEX_LIBRARY
      .filter(([name, pat, note]) => match(`${name} ${pat} ${note}`))
      .map(([name, pat, note]) => h('button', {
        class: 'row', onclick: () => { d.pattern = pat; d.tab = 'match'; render(); },
      }, h('span', { class: 'lead' }, icon('bookmark')),
        h('span', { class: 'primary' }, name),
        h('span', { class: 'snippet mono' }, pat),
        h('span', { class: 'chip-inline' }, note)))));
  } else if (d.tab === 'explain') {
    const parts = error ? [] : explainPattern(d.pattern);
    body.push(h('div', { class: 'listbox' }, ...(parts.length
      ? parts.map(([tok, meaning]) => h('div', { class: 'row' },
        h('code', { class: 'primary' }, tok), h('span', { class: 'snippet' }, meaning)))
      : [emptyState('Enter a valid pattern to see it explained token by token.')])));
  } else if (d.tab === 'replace') {
    body.push(h('label', { class: 'field' }, 'REPLACEMENT — $& WHOLE MATCH, $1 GROUP, $<name> NAMED GROUP',
      h('input', {
        class: 'mono', value: d.replace,
        oninput: (e: Event) => { d.replace = (e.target as HTMLInputElement).value; render(); },
      })));
    body.push(h('label', { class: 'field' }, 'SAMPLE TEXT', h('textarea', {
      rows: '5', class: 'mono',
      oninput: (e: Event) => { d.sample = (e.target as HTMLTextAreaElement).value; render(); },
    }, d.sample)));
    let preview = d.sample;
    try { if (re) preview = d.sample.replace(re, d.replace); } catch { /* shown by the error banner */ }
    body.push(h('pre', { class: 'block' }, preview));
  } else {
    body.push(h('label', { class: 'field' }, 'SAMPLE TEXT — ONE CANDIDATE PER LINE', h('textarea', {
      rows: '5', class: 'mono',
      oninput: (e: Event) => { d.sample = (e.target as HTMLTextAreaElement).value; render(); },
    }, d.sample)));
    const rows: HTMLElement[] = [];
    if (re && !error) {
      lines.forEach((line, li) => {
        const hits = [...line.matchAll(re!)];
        if (!hits.length) return;
        hits.forEach((m) => {
          const groups = m.slice(1).map((g, gi) => `$${gi + 1}=${g ?? '∅'}`).join('  ');
          const named = m.groups ? Object.entries(m.groups).map(([k, v]) => `$<${k}>=${v ?? '∅'}`).join('  ') : '';
          rows.push(h('div', { class: 'row' },
            h('span', { class: 'lead mono' }, `L${li + 1}`),
            h('code', { class: 'primary' }, m[0]),
            h('span', { class: 'snippet mono' }, [groups, named].filter(Boolean).join('  ') || 'no capture groups'),
            h('span', { class: 'chip-inline' }, `@${m.index}`)));
        });
      });
    }
    body.push(h('div', { class: 'listbox' }, ...(rows.length ? rows : [emptyState('No match in the sample yet.')])));
  }

  body.push(h('div', { class: 'tokenwrap' }, ...REGEX_TOKENS.map(([group, list]) => h('div', { class: 'tokengroup' },
    h('b', {}, group),
    h('div', { class: 'chips' }, ...list.map(([tok, meaning]) => h('button', {
      class: 'chip token', title: meaning,
      onclick: () => { d.pattern = `${d.pattern}${tok.replace('…', '')}`; render(); },
    }, tok)))))));

  if (d.history.length) {
    body.push(h('div', { class: 'field' }, 'RECENT PATTERNS',
      h('div', { class: 'chips' }, ...d.history.slice(0, 8).map((p) => h('button', {
        class: 'chip token', onclick: () => { d.pattern = p; render(); },
      }, p)))));
  }

  const rowsInView = allIdsInView();
  return dialogShell('Search tool', 'Regex builder', body, [
    h('button', { class: 'btn text', onclick: closeDialog }, 'Cancel'),
    h('button', {
      class: 'btn outlined', disabled: Boolean(error),
      onclick: () => {
        const hits = rowsInView.filter((id) => { re!.lastIndex = 0; return re!.test(id); }).length;
        snack(`${hits} of ${rowsInView.length} row(s) in ${VIEW_META[state.view].title} match this pattern.`);
      },
    }, `Test against ${VIEW_META[state.view].title}`),
    h('button', { class: 'btn tonal', onclick: () => applyRegex(false) }, d.target.startsWith('bulk:') ? 'Apply as plain text' : 'Use as plain text'),
    h('button', {
      class: 'btn filled', disabled: Boolean(error),
      onclick: () => { d.history = [d.pattern, ...d.history.filter((p) => p !== d.pattern)].slice(0, 12); applyRegex(true); },
    }, d.target.startsWith('bulk:') ? `${d.target === 'bulk:select' ? 'Select' : 'Deselect'} matching rows` : 'Apply pattern'),
  ], true);
}

function applyRegex(asRegex: boolean): void {
  const key = state.regexDraft.target;
  if (key === 'bulk:select' || key === 'bulk:deselect') {
    const re = (() => { try { return new RegExp(state.regexDraft.pattern, state.regexDraft.flags); } catch { return null; } })();
    if (!re) { snack('That pattern is not valid.'); return; }
    const rows = searchableRows();
    let n = 0;
    for (const [id, text] of rows) {
      const hit = asRegex ? re.test(text) : text.toLowerCase().includes(state.regexDraft.pattern.toLowerCase());
      if (!hit) continue;
      n += 1;
      key === 'bulk:select' ? state.selected.add(id) : state.selected.delete(id);
    }
    state.dialog = null;
    render();
    snack(`${key === 'bulk:select' ? 'Selected' : 'Deselected'} ${n} of ${rows.length} row(s) by pattern.`);
    return;
  }
  const target = key === 'main' ? state.search : key === 'dialog' ? state.dialogSearch : sq(key);
  target.text = state.regexDraft.pattern;
  target.regex = asRegex;
  target.flags = state.regexDraft.flags;
  state.dialog = key === 'dialog' || key.startsWith('tabs:') ? 'tabs' : null;
  render();
  snack(asRegex ? 'Regex applied to that search field.' : 'Pattern applied as plain text.');
}

function openBulkRegex(mode: 'select' | 'deselect'): void {
  state.regexDraft.target = `bulk:${mode}`;
  state.regexDraft.sample = searchableRows().slice(0, 12).map(([, text]) => text.slice(0, 90)).join('\n');
  openDialog('regex');
}

/** Every row in the current view as [id, searchable text] — what bulk regex runs against. */
function searchableRows(): Array<[string, string]> {
  switch (state.view) {
    case 'install': return visibleApps().map((a) => [a.id, `${a.name} ${a.desc} ${a.winget} ${a.choco} ${a.cat}`]);
    case 'tweaks': return tweakGroups(state.catalog.tweaks).flatMap((g) => g.items.map((i) => [i.id, `${i.name} ${i.desc} ${i.cat} ${i.id}`] as [string, string]));
    case 'config': return tweakGroups(state.catalog.features).flatMap((g) => g.items.map((i) => [i.id, `${i.name} ${i.desc} ${i.cat} ${i.id}`] as [string, string]));
    case 'history': return filteredHistory().map((e) => [e.commit, `${e.action} ${e.label ?? ''} ${e.revisionId}`]);
    case 'docs': return (state.offlineDocs?.articles ?? []).map((article) => [article.path, `${article.title} ${article.category} ${article.bodyText}`]);
    default: return [];
  }
}

function tabsDialog(): HTMLElement {
  const groupFilter = searchValidation(tabSearch('groupNames'));
  const groups = state.groups.filter((group) => !tabSearch('groupNames').text.trim() || (groupFilter.valid && groupFilter.match(group)));
  const currentFilter = searchValidation(tabSearch('current'));
  const masterFilter = searchValidation(tabSearch('master'));
  const inGroupFilter = searchValidation(tabSearch('inGroup'));
  const currentTabs = state.tabs.filter((tab) => !tabSearch('current').text.trim() || (currentFilter.valid && currentFilter.match(`${VIEW_META[tab.view].title} ${tab.group ?? 'Ungrouped'}`)));
  const masterTabs = currentTabs.filter((tab) => !tabSearch('master').text.trim() || (masterFilter.valid && masterFilter.match(`${VIEW_META[tab.view].title} ${tab.group ?? 'Ungrouped'}`)));
  const foundTabs = masterTabs.filter((tab) => {
    if (!tabSearch('inGroup').text.trim()) return true;
    return tab.group === state.selectedGroup && inGroupFilter.valid && inGroupFilter.match(VIEW_META[tab.view].title);
  });

  const managerSearch = (label: string, key: TabSearchKey, placeholder: string): HTMLElement => {
    const search = tabSearch(key);
    const validation = searchValidation(search);
    return h('label', { class: 'field tab-manager-search', 'data-search': `tabs:${key}` }, label.toUpperCase(),
      h('div', { class: 'field-row' },
        h('input', {
          value: search.text, placeholder, 'aria-label': label, spellcheck: 'false',
          oninput: (e: Event) => { search.text = (e.target as HTMLInputElement).value; state.tabClosePreview = []; render(); },
        }),
        h('button', {
          class: `regex-btn${search.regex ? ' on' : ''}`, title: `Open the regex builder for ${label}`,
          onclick: () => { state.regexDraft.target = `tabs:${key}`; state.regexDraft.pattern = search.text || state.regexDraft.pattern; openDialog('regex'); },
        }, '.*')),
      search.text ? h('span', { class: `search-validation${validation.valid ? '' : ' invalid'}` }, validation.message) : null);
  };

  const list = h('div', { class: 'listbox', 'aria-label': 'Filtered workspace tabs' }, ...(foundTabs.length ? foundTabs.map((tab) =>
    h('div', { class: `row${state.tabClosePreview.includes(tab.id) ? ' selected' : ''}` },
      h('span', { class: 'lead' }, icon(tab.pinned ? 'push_pin' : tab.locked ? 'lock' : 'tab')),
      h('span', { class: 'primary' }, VIEW_META[tab.view].title),
      h('span', { class: 'snippet' }, tab.group ? `Group: ${tab.group}${state.collapsedGroups.has(tab.group) ? ' · collapsed' : ''}` : 'Ungrouped'),
      h('span', { class: 'row-actions', style: 'display:flex' },
        h('button', { class: 'icon-btn', title: tab.pinned ? 'Unpin tab' : 'Pin tab', onclick: () => { tab.pinned = !tab.pinned; persistWorkspace(); render(); } }, icon('push_pin')),
        h('button', {
          class: 'icon-btn', title: tab.group === state.selectedGroup ? 'Move out of the selected group' : 'Move into the selected group',
          onclick: () => moveTabToGroup(tab, tab.group === state.selectedGroup ? null : state.selectedGroup),
        }, icon('drive_file_move')),
        h('button', { class: 'icon-btn', title: tab.locked ? 'Unlock this tab' : 'Lock this tab', onclick: () => openLockWizard(`tab-${tab.id}`, `Tab · ${VIEW_META[tab.view].title}`, tab.locked ? 'unlock' : 'set') }, icon(tab.locked ? 'lock_open' : 'lock')),
        h('button', { class: 'icon-btn', title: 'Close tab', onclick: () => closeTab(tab.id) }, icon('close')))))
    : [emptyState('No workspace tab matches all active tab-manager filters.')]));

  const createGroup = (): void => {
    const input = $<HTMLInputElement>('#new-group-name');
    const name = normalizeGroupName(input?.value ?? '');
    if (!name) { snack('Enter a group name before creating it.'); return; }
    if (!state.groups.includes(name)) state.groups.push(name);
    state.selectedGroup = name;
    persistWorkspace();
    render();
    snack(`Group “${name}” created.`);
  };
  const renameGroup = (): void => {
    const input = $<HTMLInputElement>('#rename-group-name');
    const next = normalizeGroupName(input?.value ?? '');
    const previous = state.selectedGroup;
    if (!previous || previous === 'Ungrouped') { snack('Select a named group before renaming it.'); return; }
    if (!next) { snack('Enter a replacement group name.'); return; }
    if (state.groups.includes(next) && next !== previous) { snack(`A group named “${next}” already exists.`); return; }
    state.groups = state.groups.map((group) => group === previous ? next : group);
    state.tabs.forEach((tab) => { if (tab.group === previous) tab.group = next; });
    if (state.collapsedGroups.delete(previous)) state.collapsedGroups.add(next);
    state.selectedGroup = next;
    persistWorkspace();
    render();
    snack(`Group renamed from “${previous}” to “${next}”.`);
  };
  const toggleGroup = (): void => {
    const group = state.selectedGroup;
    if (!state.groups.includes(group)) { snack('Select a named group before changing its collapsed state.'); return; }
    state.collapsedGroups.has(group) ? state.collapsedGroups.delete(group) : state.collapsedGroups.add(group);
    persistWorkspace();
    render();
    snack(`Group “${group}” ${state.collapsedGroups.has(group) ? 'collapsed' : 'expanded'}.`);
  };

  return dialogShell('Workspace navigation', 'Tabs, groups, and safe closing', [
    h('div', { class: 'grid2' },
      managerSearch('Current strip search', 'current', 'Search this strip'),
      managerSearch('Group name search', 'groupNames', 'Search groups'),
      managerSearch('Master tab search', 'master', 'Search every tab'),
      managerSearch('Group tab search', 'inGroup', 'Search the selected group')),
    h('div', { style: 'height:14px' }),
    h('div', { class: 'grid2' },
      selectField('Selected group', groups.length ? groups : ['Ungrouped'], state.selectedGroup, (v) => { state.selectedGroup = v; persistWorkspace(); }),
      h('label', { class: 'field' }, 'NEW GROUP', h('input', { placeholder: 'Group name', id: 'new-group-name' }))),
    h('div', { class: 'btnrow', style: 'margin:12px 0' },
      h('button', { class: 'btn tonal', onclick: createGroup }, 'Create group'),
      h('label', { class: 'field inline-field' }, 'RENAME SELECTED GROUP', h('input', { placeholder: 'Replacement name', id: 'rename-group-name' })),
      h('button', { class: 'btn outlined', onclick: renameGroup }, 'Rename group'),
      h('button', { class: 'btn outlined', onclick: toggleGroup }, state.collapsedGroups.has(state.selectedGroup) ? 'Expand group' : 'Collapse group')),
    h('div', { class: 'group-membership', 'aria-label': 'Filtered group membership' },
      ...groups.map((group) => h('div', { class: 'membership-row' },
        h('button', {
          class: 'btn text', onclick: () => { state.selectedGroup = group; persistWorkspace(); render(); },
          'aria-pressed': state.selectedGroup === group ? 'true' : 'false',
        }, state.collapsedGroups.has(group) ? icon('expand_more') : icon('expand_less'), group),
        h('span', {}, `${state.tabs.filter((tab) => tab.group === group).length} tab(s)`)))),
    list,
    h('div', { style: 'height:14px' }),
    h('div', { class: 'grid2' },
      managerSearch('Close tabs containing text', 'closeContaining', 'Visible label text'),
      managerSearch('Close tabs not containing text', 'closeNot', 'Visible label text')),
    h('div', { class: 'switch-row', style: 'margin:12px 0' },
      h('button', { class: `switch${state.tabIncludePinned ? ' on' : ''}`, role: 'switch', 'aria-checked': state.tabIncludePinned ? 'true' : 'false', 'aria-label': 'Include pinned tabs after preview', onclick: () => { state.tabIncludePinned = !state.tabIncludePinned; state.tabClosePreview = []; render(); } }, h('i', {})),
      h('span', {}, 'Include pinned tabs after preview')),
    h('div', { class: 'feedback' }, state.tabClosePreview.length
      ? `${state.tabClosePreview.length} tab(s) match. Authorize to close them.`
      : 'Enter one close query, then preview the exact visible-label match set.'),
  ], [
    h('button', { class: 'btn text', onclick: closeDialog }, 'Cancel'),
    h('button', { class: 'btn tonal', onclick: () => previewTabClose(false) }, 'Preview “containing”'),
    h('button', { class: 'btn tonal', onclick: () => previewTabClose(true) }, 'Preview “not containing”'),
    h('button', {
      class: 'btn filled', disabled: !state.tabClosePreview.length,
      onclick: () => {
        const ids = state.tabClosePreview.filter((id) => {
          const tab = state.tabs.find((candidate) => candidate.id === id);
          return Boolean(tab) && !tab!.locked && (state.tabIncludePinned || !tab!.pinned);
        });
        state.tabClosePreview = [];
        ids.forEach(closeTab);
        snack(`Closed ${ids.length} tab(s) from the reviewed preview.`);
      },
    }, 'Authorize previewed close'),
  ], true);
}

function appearanceDialog(): HTMLElement {
  const target = state.appearanceTarget;
  const o = state.appearanceOverrides[target.id];
  return dialogShell('Element appearance', 'Edit appearance', [
    h('p', { style: 'font-size:12.5px;color:var(--md-sys-color-on-surface-variant);margin-bottom:14px' },
      `Target: ${target.label} · id ${target.id}. Shift+right-click any tab or group header reaches this editor directly.`),
    h('div', { class: 'grid2' },
      colorField('Accent color', o.accent, (v) => { o.accent = v; }),
      selectField('Font family', ['Segoe UI Variable', 'Segoe UI', 'Arial', 'Consolas', 'Georgia'], o.font, (v) => { o.font = v; }),
      rangeField('Corner radius', 8, 32, 1, o.radius, (v) => { o.radius = v; }),
      rangeField('Font scale', 0.9, 1.3, 0.05, o.scale, (v) => { o.scale = v; }),
      rangeField('Font weight', 300, 700, 100, o.weight, (v) => { o.weight = v; })),
  ], [
    h('button', { class: 'btn text', onclick: closeDialog }, 'Cancel'),
    h('button', { class: 'btn outlined', onclick: () => { delete state.appearanceOverrides[target.id]; closeDialog(); snack('Element reset to the inherited appearance.'); } }, 'Reset element'),
    h('button', { class: 'btn tonal', disabled: true, title: 'Named-theme storage is not installed in this build' }, 'Save named theme'),
    h('button', {
      class: 'btn filled',
      onclick: () => { if (target.id === 'app-root') { state.prefs.accent = o.accent; state.prefs.font = o.font; state.prefs.radius = o.radius; state.prefs.scale = o.scale; state.prefs.weight = o.weight; } closeDialog(); snack('Appearance applied and persisted.'); },
    }, 'Apply appearance'),
  ]);
}

function lockTarget(id: string, label: string): { kind: LockTargetKind; id: string; label: string } {
  if (id.startsWith('tab-')) return { kind: 'tab', id: id.slice(4), label };
  if (id.startsWith('group-')) return { kind: 'group', id: id.slice(6), label };
  return { kind: 'appearance-property', id: id.replace(/[^A-Za-z0-9._:/-]/gu, '-').slice(0, 128), label };
}

function syncWorkspaceLockState(): void {
  const lockedTabs = new Set(state.locks.data.locks
    .filter((entry) => entry.locked && entry.record.target.kind === 'tab')
    .map((entry) => entry.record.target.id));
  let changed = false;
  state.tabs.forEach((tab) => {
    const next = lockedTabs.has(tab.id);
    if (tab.locked !== next) { tab.locked = next; changed = true; }
  });
  if (changed) persistWorkspace();
}

async function refreshLocks(): Promise<void> {
  state.locks.loading = true;
  try {
    state.locks.data = await bridge().lockState('main');
    state.locks.error = '';
    syncWorkspaceLockState();
  } catch (error) {
    state.locks.error = error instanceof Error ? error.message : 'Locks could not be loaded.';
  } finally {
    state.locks.loading = false;
    render();
  }
}

function resetLockDraft(): void {
  state.locks.credential = '';
  state.locks.confirmCredential = '';
  state.locks.totpCode = '';
  state.locks.preparedTotp = null;
  state.locks.revealTotpSecret = false;
  state.locks.error = '';
}

async function prepareCurrentLockTotp(): Promise<void> {
  const lock = state.locks;
  lock.loading = true; lock.error = ''; render();
  try {
    lock.preparedTotp = await bridge().lockPrepareTotp(lock.target.label, lock.target.id);
    lock.credential = lock.preparedTotp.manualSecret;
    lock.confirmCredential = lock.preparedTotp.manualSecret;
    lock.revealTotpSecret = false;
  } catch (error) { lock.error = error instanceof Error ? error.message : 'The local TOTP registration could not be prepared.'; }
  finally { lock.loading = false; render(); }
}

async function createCurrentLock(): Promise<void> {
  const draft = state.locks;
  if (!draft.credential || draft.credential !== draft.confirmCredential) {
    draft.error = draft.method === 'password' ? 'Enter the same password in both fields.' : 'Enter the same Base32 secret in both fields.';
    render(); return;
  }
  if (draft.method === 'totp' && !/^\d{6,8}$/u.test(draft.totpCode)) {
    draft.error = 'Confirm the TOTP pairing with the current 6–8 digit code.';
    render(); return;
  }
  draft.loading = true; draft.error = ''; render();
  try {
    const unlockDuration: LockDuration = draft.duration === 'minutes'
      ? { kind: 'minutes', minutes: draft.minutes }
      : { kind: draft.duration, minutes: null };
    state.locks.data = await bridge().lockCreate({
      target: { kind: draft.target.kind, id: draft.target.id }, label: draft.target.label,
      credential: { method: draft.method, credential: draft.credential, ...(draft.method === 'totp' ? { confirmationCode: draft.totpCode } : {}) },
      unlockDuration,
    });
    syncWorkspaceLockState();
    resetLockDraft();
    draft.phase = 'list';
    snack(`Locked ${draft.target.label}. This is a for-fun speed bump, not security.`);
  } catch (error) { draft.error = error instanceof Error ? error.message : 'The lock was not created.'; }
  finally { draft.loading = false; render(); }
}

async function unlockCurrentLock(): Promise<void> {
  const draft = state.locks;
  if (!draft.selectedId || !draft.credential) { draft.error = 'Enter this lock’s credential.'; render(); return; }
  draft.loading = true; draft.error = ''; render();
  try {
    const result = await bridge().lockUnlock(draft.selectedId, draft.credential, 'main');
    draft.credential = '';
    if (!result.ok) {
      draft.error = result.code === 'credential-rejected' ? 'The value did not match. Nothing was changed.'
        : result.code === 'rate-limited' ? `Too many attempts. Try again after ${new Date(result.retryAtMs ?? Date.now()).toLocaleTimeString()}.`
          : 'The operating-system credential vault is unavailable.';
    } else {
      state.locks.data = await bridge().lockState('main');
      syncWorkspaceLockState();
      draft.phase = 'list';
      snack('Lock opened for the selected duration. Use Lock again to end it early.');
    }
  } catch (error) { draft.error = error instanceof Error ? error.message : 'The lock could not be opened.'; }
  finally { draft.loading = false; render(); }
}

async function relock(lockId: string): Promise<void> {
  state.locks.data = await bridge().lockRelock(lockId);
  syncWorkspaceLockState();
  render();
  snack('Locked again.');
}

async function removeLock(lockId: string): Promise<void> {
  try {
    state.locks.data = await bridge().lockRemove(lockId);
    syncWorkspaceLockState();
    state.locks.phase = 'list';
    render();
    snack('The lock and its independent vault credential were removed.');
  } catch (error) { state.locks.error = error instanceof Error ? error.message : 'The lock was not removed.'; render(); }
}

async function loadLockRecovery(phase: 'recovery' | 'support'): Promise<void> {
  state.locks.phase = phase;
  state.locks.error = '';
  try { state.locks.recovery = await bridge().lockRecovery(); }
  catch (error) { state.locks.error = error instanceof Error ? error.message : 'Recovery details are unavailable.'; }
  render();
}

function supportTicketSurface(): HTMLElement[] {
  const lock = state.locks;
  const search = sq('lock-support-tickets');
  const match = makeMatcher(search);
  const tickets = lock.tickets.filter((ticket) => match(`${ticket.id} ${ticket.category} ${ticket.description} ${ticket.status}`));
  const createTicket = (): void => {
    const description = lock.ticketDescription.trim();
    if (!description) { lock.error = 'Describe what happened before creating the local ticket.'; render(); return; }
    const ticket = { id: `LOCAL-${String(Date.now()).slice(-8)}`, category: lock.ticketCategory, description: description.slice(0, 1000), status: 'Resolved: open the application-data folder and delete it yourself', createdAt: new Date().toISOString() };
    lock.tickets = [ticket, ...lock.tickets];
    lock.ticketDescription = '';
    try { localStorage.setItem('material-system-utility.support-tickets.v1', JSON.stringify(lock.tickets)); } catch { /* retain live tickets */ }
    snack(`Local ticket ${ticket.id} created. Nobody was paged; the filing cabinet remains dramatically local.`);
    render();
  };
  return [
    h('div', { class: 'notice lock-disclosure', role: 'note' }, 'Nothing is sent anywhere. No ticket exists outside this machine, no network request is made, no data is collected, and nobody is reading it.'),
    searchLine('lock-support-tickets', 'Search local ticket number, category, description, or status'),
    h('div', { class: 'grid2' },
      selectField('Ticket category', ['Forgotten lock credential', 'Lost authenticator', 'Vault unavailable', 'Other local melodrama'], lock.ticketCategory, (value) => { lock.ticketCategory = value; }),
      h('label', { class: 'field' }, 'DESCRIPTION', h('textarea', { maxlength: '1000', rows: '4', value: lock.ticketDescription, oninput: (event: Event) => { lock.ticketDescription = (event.target as HTMLTextAreaElement).value; } }))),
    h('button', { class: 'btn filled', onclick: createTicket }, 'Create local ticket'),
    h('div', { class: 'listbox lock-ticket-list', 'aria-label': 'Local support tickets' }, ...(tickets.length ? tickets.map((ticket) =>
      h('div', { class: 'row' }, h('span', { class: 'lead' }, icon('fact_check')), h('span', { class: 'primary' }, ticket.id), h('span', { class: 'snippet' }, `${ticket.category} · ${ticket.status}`))) : [emptyState('No local ticket matches this search.')])),
  ];
}

function lockDialog(): HTMLElement {
  const lock = state.locks;
  if (lock.phase === 'support') {
    return dialogShell('Entirely local fictional support desk', 'Support Tickets', supportTicketSurface(), [
      h('button', { class: 'btn text', onclick: () => { lock.phase = 'recovery'; render(); } }, 'Back'),
      h('button', { class: 'btn tonal', onclick: async () => { try { await bridge().lockOpenRecoveryFolder(); snack('Opened the application-data folder. The app did not delete anything.'); } catch (error) { lock.error = error instanceof Error ? error.message : 'The folder could not be opened.'; render(); } } }, 'Open application-data folder'),
      h('button', { class: 'btn filled', onclick: closeDialog }, 'Close'),
    ], true);
  }
  if (lock.phase === 'recovery') {
    const recovery = lock.recovery;
    return dialogShell('Self-service recovery', 'Forgotten your credential?', [
      h('div', { class: 'notice lock-disclosure', role: 'note' }, recovery?.disclosure ?? 'This is a user-experience lock, not a security boundary.'),
      h('p', {}, recovery?.resetInstruction ?? 'Loading the exact application-data folder…'),
      recovery ? h('pre', { class: 'block lock-folder-path' }, recovery.appDataFolder) : null,
      h('p', {}, 'The app only opens this folder. It never deletes anything for you.'),
      lock.error ? h('div', { class: 'feedback error' }, lock.error) : null,
    ], [
      h('button', { class: 'btn text', onclick: () => { lock.phase = 'list'; render(); } }, 'Back to locks'),
      h('button', { class: 'btn outlined', onclick: () => { void navigator.clipboard?.writeText(recovery?.appDataFolder ?? ''); snack('Application-data folder path copied.'); } }, 'Copy path'),
      h('button', { class: 'btn tonal', onclick: () => { void loadLockRecovery('support'); } }, 'Support Tickets'),
      h('button', { class: 'btn filled', onclick: async () => { try { await bridge().lockOpenRecoveryFolder(); snack('Opened the application-data folder. The app did not delete anything.'); } catch (error) { lock.error = error instanceof Error ? error.message : 'The folder could not be opened.'; render(); } } }, 'Open folder'),
    ], true);
  }
  if (lock.phase === 'set') {
    const existing = lock.data.locks.find((entry) => entry.record.target.kind === lock.target.kind && entry.record.target.id === lock.target.id);
    if (existing) { lock.selectedId = existing.record.id; lock.phase = existing.locked ? 'unlock' : 'list'; return lockDialog(); }
    return dialogShell('Independent local credential', `Lock ${lock.target.label}`, [
      h('div', { class: 'notice lock-disclosure', role: 'note' }, 'This is a user-experience lock, not a security boundary. Deleting the application-data folder resets it.'),
      h('p', {}, `Target: ${lock.target.kind} · ${lock.target.id}. This credential belongs only to this target; there is no master unlock or inheritance.`),
      h('div', { class: 'grid2' },
        selectField('Lock method', ['Password', 'TOTP'], lock.method === 'password' ? 'Password' : 'TOTP', (value) => { lock.method = value === 'TOTP' ? 'totp' : 'password'; resetLockDraft(); render(); }),
        selectField('Unlock duration', ['This surface', '15 minutes', 'Until app closes'], lock.duration === 'surface' ? 'This surface' : lock.duration === 'minutes' ? '15 minutes' : 'Until app closes', (value) => { lock.duration = value === 'This surface' ? 'surface' : value === '15 minutes' ? 'minutes' : 'until-close'; })),
      lock.method === 'totp' && !lock.preparedTotp ? h('div', { class: 'notice' },
        h('p', {}, 'Generate a fresh TOTP registration locally. The QR and one-time manual secret stay in this dialog and nothing is sent over the network.'),
        h('button', { class: 'btn tonal', disabled: lock.loading, onclick: () => void prepareCurrentLockTotp() }, lock.loading ? 'Preparing…' : 'Generate local QR registration')) : null,
      lock.method === 'totp' && lock.preparedTotp ? h('div', { class: 'auth-registration lock-totp-registration' },
        h('img', { class: 'auth-qr', src: lock.preparedTotp.qrDataUrl, alt: `QR code for lock ${lock.target.label}, account ${lock.target.id}` }),
        h('div', { class: 'auth-registration-details' },
          h('h3', {}, lock.target.label),
          h('p', {}, 'SHA1 · 6 digits · 30 seconds · local only'),
          h('button', { class: 'btn outlined', 'aria-expanded': lock.revealTotpSecret ? 'true' : 'false', onclick: () => { lock.revealTotpSecret = !lock.revealTotpSecret; render(); } }, lock.revealTotpSecret ? 'Hide manual secret' : 'Reveal manual secret'),
          lock.revealTotpSecret ? h('div', { class: 'auth-secret' }, h('code', {}, lock.preparedTotp.manualSecret.replace(/(.{4})/gu, '$1 ').trim()), h('button', { class: 'btn tonal', onclick: () => { void navigator.clipboard?.writeText(lock.preparedTotp?.manualSecret ?? ''); snack('One-time manual secret copied.'); } }, 'Copy manual secret')) : null)) : null,
      lock.method === 'password' ? h('div', { class: 'grid2' },
        h('label', { class: 'field' }, lock.method === 'password' ? 'PASSWORD' : 'BASE32 TOTP SECRET', h('input', { class: 'mono', type: 'password', maxlength: lock.method === 'password' ? '256' : '4096', value: lock.credential, autocomplete: 'new-password', oninput: (event: Event) => { lock.credential = (event.target as HTMLInputElement).value; } })),
        h('label', { class: 'field' }, 'CONFIRM PASSWORD', h('input', { class: 'mono', type: 'password', maxlength: '256', value: lock.confirmCredential, autocomplete: 'new-password', oninput: (event: Event) => { lock.confirmCredential = (event.target as HTMLInputElement).value; } }))) : null,
      lock.method === 'totp' ? h('label', { class: 'field' }, 'CURRENT TOTP CODE — PAIRING CONFIRMATION', h('input', { class: 'mono', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '8', value: lock.totpCode, oninput: (event: Event) => { lock.totpCode = (event.target as HTMLInputElement).value.replace(/\D/gu, '').slice(0, 8); } })) : null,
      lock.error ? h('div', { class: 'feedback error', role: 'alert' }, lock.error) : null,
    ], [
      h('button', { class: 'btn text', onclick: () => { resetLockDraft(); lock.phase = 'list'; render(); } }, 'Cancel'),
      h('button', { class: 'btn tonal', onclick: () => { void loadLockRecovery('recovery'); } }, 'Forgotten your credential?'),
      h('button', { class: 'btn filled', disabled: lock.loading, onclick: () => void createCurrentLock() }, lock.loading ? 'Creating…' : 'Create lock'),
    ], true);
  }
  if (lock.phase === 'unlock') {
    const entry = lock.data.locks.find((candidate) => candidate.record.id === lock.selectedId);
    if (!entry) { lock.phase = 'list'; return lockDialog(); }
    return dialogShell('Local verification', `Unlock ${entry.record.label}`, [
      h('div', { class: 'notice lock-disclosure', role: 'note' }, 'This is a user-experience lock, not a security boundary.'),
      h('p', {}, `${entry.record.credential.method === 'totp' ? 'Enter the current TOTP code.' : 'Enter this lock’s password.'} Wrong attempts are rate-limited and never delete content.`),
      h('label', { class: 'field' }, entry.record.credential.method === 'totp' ? 'CURRENT CODE' : 'PASSWORD', h('input', { class: 'mono', type: 'password', maxlength: '256', value: lock.credential, autocomplete: 'current-password', oninput: (event: Event) => { lock.credential = (event.target as HTMLInputElement).value; } })),
      lock.error ? h('div', { class: 'feedback error', role: 'alert' }, lock.error) : null,
    ], [
      h('button', { class: 'btn text', onclick: () => { resetLockDraft(); lock.phase = 'list'; render(); } }, 'Cancel'),
      h('button', { class: 'btn tonal', onclick: () => { void loadLockRecovery('recovery'); } }, 'Forgotten your credential?'),
      h('button', { class: 'btn filled', disabled: lock.loading, onclick: () => void unlockCurrentLock() }, lock.loading ? 'Checking…' : 'Unlock'),
    ]);
  }

  const query = sq('locks');
  const match = makeMatcher(query);
  const entries = lock.data.locks.filter((entry) => match(`${entry.record.label} ${entry.record.target.kind} ${entry.record.target.id} ${entry.locked ? 'locked' : 'unlocked'}`));
  return dialogShell('For-fun local speed bumps', 'Locks', [
    h('div', { class: 'notice lock-disclosure', role: 'note' }, 'This is a user-experience lock, not a security boundary. Every lock has its own credential in the operating-system vault.'),
    searchLine('locks', 'Search lock label, target, or state'),
    lock.loading ? h('div', { class: 'auth-state', role: 'status' }, 'Loading locks…') : null,
    lock.error ? h('div', { class: 'feedback error', role: 'alert' }, lock.error) : null,
    h('div', { class: 'listbox lock-list', 'aria-label': 'Filtered local locks' }, ...(entries.length ? entries.map((entry) =>
      h('div', { class: 'row lock-manager-row' },
        h('span', { class: 'lead' }, icon(entry.locked ? 'lock' : 'lock_open')),
        h('span', { class: 'primary' }, entry.record.label),
        h('span', { class: 'snippet' }, `${entry.record.target.kind} · ${entry.record.target.id} · ${entry.record.credential.method === 'totp' ? 'TOTP' : 'Password'} · ${entry.locked ? 'Locked' : 'Unlocked'}`),
        h('span', { class: 'row-actions' },
          entry.locked ? h('button', { class: 'btn tonal', onclick: () => { lock.selectedId = entry.record.id; lock.phase = 'unlock'; resetLockDraft(); render(); } }, 'Unlock')
            : h('button', { class: 'btn tonal', onclick: () => void relock(entry.record.id) }, 'Lock again'),
          h('button', { class: 'icon-btn', title: `Remove ${entry.record.label}`, onclick: () => gate(`Remove lock “${entry.record.label}” and its independent vault credential`, undefined, undefined, () => { void removeLock(entry.record.id); }) }, icon('delete')))))
      : [emptyState(query.text ? 'No lock matches this search.' : 'No locks yet. Open a tab or element menu and choose its Lock action.')])),
  ], [
    h('button', { class: 'btn text', onclick: closeDialog }, 'Close'),
    h('button', { class: 'btn outlined', onclick: () => { void refreshLocks(); } }, 'Refresh'),
    h('button', { class: 'btn tonal', onclick: () => { void loadLockRecovery('recovery'); } }, 'Recovery and Support Tickets'),
  ], true);
}

function openLockWizard(id: string, label: string, mode: 'set' | 'unlock' = 'set'): void {
  state.locks.target = lockTarget(id, label);
  const existing = state.locks.data.locks.find((entry) => entry.record.target.kind === state.locks.target.kind && entry.record.target.id === state.locks.target.id);
  state.locks.selectedId = existing?.record.id ?? '';
  state.locks.phase = existing ? (existing.locked || mode === 'unlock' ? 'unlock' : 'list') : 'set';
  resetLockDraft();
  openDialog('lock');
  void refreshLocks();
}

const AUTH_COPY = {
  English: {
    eyebrow: 'Local RFC 6238 codes', title: 'Authenticator', search: 'Search issuer, account, or label',
    empty: 'No authenticator entries yet. Generate a local secret or import an otpauth URI to begin.',
    generate: 'Generate registration', import: 'Import otpauth URI', refresh: 'Refresh codes', close: 'Close',
    importPng: 'Choose QR PNG', importClipboard: 'Read QR PNG from clipboard', cameraUnavailable: 'Camera scanning needs camera hardware and permission, so it is unavailable in this build.',
    loading: 'Loading authenticator entries…', current: 'Current code', next: 'Next code', seconds: 'seconds remaining',
    copy: 'Copy', remove: 'Remove entry', reveal: 'Reveal manual secret', hide: 'Hide manual secret',
    registration: 'Pair this registration', confirm: 'Confirm pairing', back: 'Back to entries',
    localGenerate: 'The secret and QR are created locally. Nothing is sent to a server.',
    localImport: 'The URI is parsed locally. Its parameters are preserved and it is never logged.',
    issuer: 'Issuer', account: 'Account', displayLabel: 'Display label', algorithm: 'Algorithm', digits: 'Digits', period: 'Period (seconds)', uri: 'otpauth URI',
    working: 'Working…', preparing: 'Preparing the registration locally…', prepared: 'Registration prepared. Confirm one current code before it is saved.',
    accountRequired: 'Enter the account name before generating a registration.', uriRequired: 'Enter a valid otpauth://totp/ URI.',
    pairHint: 'Scan the QR with another authenticator, or explicitly reveal and copy the manual base32 secret. Confirm one current code before this entry becomes active.',
    noIssuer: 'No issuer', manualSecret: 'manual secret', pairedCode: 'Current code from the paired authenticator',
    expires: 'Registration expires', expiryNote: 'The secret disappears after successful confirmation.', expired: 'Registration expired. Start again to create a fresh QR and secret.',
    cancelRegistration: 'Cancel registration', checking: 'Checking…', invalidCode: 'Enter the 6–8 digit code shown by the paired authenticator.',
    localVault: 'Codes are generated locally from secrets stored in the operating-system credential vault. Ordinary exports omit every secret.',
    entriesLoaded: 'authenticator entries loaded', noMatch: 'No authenticator entry matches this search.', entries: 'Authenticator entries', codesFor: 'Codes for',
    loadingCode: 'Loading code…', unavailableCode: 'Code unavailable', afterPeriod: 'After this period', waitingCode: 'Waiting for current code',
    copiedManual: 'Manual secret copied for this one-time registration.', copiedCurrent: 'Current code copied.', copiedNext: 'Next code copied.', clipboardRefused: 'Clipboard access was refused.',
    paired: 'is paired. The one-time secret is no longer displayed.', removed: 'Removed', removeFailed: 'The authenticator entry was not removed.', operationFailed: 'Authenticator operation failed',
    invalidMatch: 'The confirmation code did not match.', waitRetry: 'Wait briefly before trying another confirmation code.', tooManyAttempts: 'Too many confirmation attempts; start registration again.', vaultUnavailable: 'The operating-system credential vault is unavailable.',
    qrAlt: 'QR code for', qrAccount: 'account', removeAction: 'Remove authenticator entry',
  },
  Yue: {
    eyebrow: '本機 RFC 6238 驗證碼', title: '驗證器', search: '搜尋發行者、帳戶或者標籤',
    empty: '未有驗證器項目。可以喺本機產生密鑰，或者匯入 otpauth URI。',
    generate: '產生配對資料', import: '匯入 otpauth URI', refresh: '重新整理驗證碼', close: '關閉',
    importPng: '揀 QR PNG', importClipboard: '由剪貼簿讀取 QR PNG', cameraUnavailable: '相機掃描需要相機硬件同權限，所以呢個版本未提供。',
    loading: '載入緊驗證器項目…', current: '目前驗證碼', next: '下一個驗證碼', seconds: '秒後更新',
    copy: '複製', remove: '移除項目', reveal: '顯示手動密鑰', hide: '收起手動密鑰',
    registration: '配對呢個項目', confirm: '確認配對', back: '返去項目列表',
    localGenerate: '密鑰同 QR 只會喺本機產生，唔會傳去伺服器。',
    localImport: 'URI 只會喺本機解析；所有參數都會保留，亦唔會寫入記錄。',
    issuer: '發行者', account: '帳戶', displayLabel: '顯示標籤', algorithm: '演算法', digits: '位數', period: '週期（秒）', uri: 'otpauth URI',
    working: '處理緊…', preparing: '喺本機準備緊配對資料…', prepared: '配對資料準備好；儲存之前請輸入一個目前驗證碼確認。',
    accountRequired: '產生配對資料之前，請先輸入帳戶名稱。', uriRequired: '請輸入有效嘅 otpauth://totp/ URI。',
    pairHint: '請用另一個驗證器掃描 QR，或者明確顯示並複製手動 Base32 密鑰。項目啟用之前，要輸入一個目前驗證碼確認。',
    noIssuer: '冇發行者', manualSecret: '手動密鑰', pairedCode: '已配對驗證器顯示嘅目前驗證碼',
    expires: '配對資料到期時間', expiryNote: '成功確認之後，密鑰就唔會再顯示。', expired: '配對資料已到期。請重新開始，建立新 QR 同密鑰。',
    cancelRegistration: '取消配對', checking: '核對緊…', invalidCode: '請輸入已配對驗證器顯示嘅 6 至 8 位數驗證碼。',
    localVault: '驗證碼由作業系統認證資料庫內嘅密鑰喺本機產生。一般匯出會略過所有密鑰。',
    entriesLoaded: '個驗證器項目已載入', noMatch: '冇驗證器項目符合呢個搜尋。', entries: '驗證器項目', codesFor: '驗證碼：',
    loadingCode: '載入緊驗證碼…', unavailableCode: '驗證碼暫時不可用', afterPeriod: '呢個週期之後', waitingCode: '等緊目前驗證碼',
    copiedManual: '今次配對用嘅手動密鑰已複製。', copiedCurrent: '目前驗證碼已複製。', copiedNext: '下一個驗證碼已複製。', clipboardRefused: '剪貼簿存取被拒絕。',
    paired: '已配對；一次性密鑰唔會再顯示。', removed: '已移除', removeFailed: '驗證器項目未能移除。', operationFailed: '驗證器操作失敗',
    invalidMatch: '確認驗證碼唔吻合。', waitRetry: '請等一陣先再試另一個確認驗證碼。', tooManyAttempts: '確認次數太多；請重新開始配對。', vaultUnavailable: '作業系統認證資料庫暫時不可用。',
    qrAlt: '配對 QR：', qrAccount: '帳戶', removeAction: '移除驗證器項目',
  },
} as const;

function authText(key: keyof typeof AUTH_COPY.English): string {
  const en = AUTH_COPY.English[key];
  const yue = AUTH_COPY.Yue[key];
  return effectiveLanguage() === 'English' ? en : effectiveLanguage() === 'Yue' ? yue : `${en} · ${yue}`;
}

const NARRATOR_COPY = {
  English: {
    section: 'Language and voice', displayLanguage: 'Display language', englishFunny: 'English funny level', cantoneseFunny: 'Cantonese funny level',
    enabled: 'Spoken narrator', language: 'Narrator language', quiet: 'Quiet hours (mute narration)',
    reducedSound: 'Reduce sound (mute narration)', active: 'Narration is ready and uses local platform speech.',
    disclosure: 'Funny levels style every spoken event, including errors and warnings. Exact facts and recovery steps are never removed.',
    off: 'Narration is off by default. Turn it on only when you want app events spoken.',
    screenReader: 'Narration is yielding because assistive technology is active.', unavailable: 'Platform speech synthesis is unavailable in this runtime.',
    failedTitle: 'Narration could not speak', failedBody: 'The platform speech engine did not complete the request.',
    startup: 'The app is ready.', settings: 'Narrator settings were updated.', navigation: 'Opened {view}.',
    operationDone: '{kind} completed for {count} item(s), exit {code}.',
    operationFailed: '{kind} failed for {count} item(s), exit {code}. See the exact output.',
    operationStartFailed: '{kind} could not start: {detail}',
  },
  Yue: {
    section: '語言同語音', displayLanguage: '顯示語言', englishFunny: '英文幽默程度', cantoneseFunny: '粵語幽默程度',
    enabled: '語音旁述', language: '旁述語言', quiet: '靜音時段（停止旁述）',
    reducedSound: '減少聲音（停止旁述）', active: '旁述已準備好，會使用本機平台語音。',
    disclosure: '幽默程度會調整所有旁述，包括錯誤同警告；準確事實同復原步驟永遠唔會刪走。',
    off: '旁述預設關閉。只喺你想聽到應用程式事件時先開啟。',
    screenReader: '偵測到輔助技術，旁述而家會讓路。', unavailable: '呢個執行環境未有平台語音合成功能。',
    failedTitle: '旁述未能讀出', failedBody: '平台語音引擎未能完成要求。',
    startup: '應用程式已準備好。', settings: '旁述設定已更新。', navigation: '已開啟 {view}。',
    operationDone: '{kind} 已處理 {count} 個項目，結束碼 {code}。',
    operationFailed: '{kind} 處理 {count} 個項目時失敗，結束碼 {code}。請查看完整輸出。',
    operationStartFailed: '{kind} 未能開始：{detail}',
  },
} as const;

function narratorText(key: keyof typeof NARRATOR_COPY.English, values: Record<string, string | number> = {}): string {
  const fill = (source: string): string => Object.entries(values).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), source);
  const en = fill(NARRATOR_COPY.English[key]);
  const yue = fill(NARRATOR_COPY.Yue[key]);
  return effectiveLanguage() === 'English' ? en : effectiveLanguage() === 'Yue' ? yue : `${en} · ${yue}`;
}

function authErrorText(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  if (/did not match/i.test(detail)) return authText('invalidMatch');
  if (/wait briefly/i.test(detail)) return authText('waitRetry');
  if (/too many confirmation/i.test(detail)) return authText('tooManyAttempts');
  if (/credential.*unavailable|credential vault/i.test(detail)) return authText('vaultUnavailable');
  if (/expired|not found/i.test(detail)) return authText('expired');
  return `${authText('operationFailed')}: ${detail}`;
}

function stopAuthenticatorRefresh(): void {
  if (authenticatorRefreshTimer) window.clearTimeout(authenticatorRefreshTimer);
  authenticatorRefreshTimer = 0;
  authenticatorRefreshBusy = false;
}

function stopAuthenticatorExpiry(): void {
  if (authenticatorExpiryTimer) window.clearTimeout(authenticatorExpiryTimer);
  authenticatorExpiryTimer = 0;
}

function renderAuthenticatorFocus(selector = '.dialog input, .dialog button'): void {
  render();
  window.setTimeout(() => document.querySelector<HTMLElement>(selector)?.focus(), 0);
}

function purgePendingAuthenticatorRegistration(): void {
  state.auth.registration = null; state.auth.revealSecret = false; state.auth.phase = 'list';
  state.auth.draft.uri = ''; state.auth.draft.code = '';
}

function invalidateAuthenticatorRegistration(): void {
  authenticatorOperationGeneration += 1;
  stopAuthenticatorExpiry();
  const registrationId = state.auth.registration?.registrationId;
  state.auth.loading = false;
  purgePendingAuthenticatorRegistration();
  if (registrationId) void bridge().authenticatorCancel(registrationId).catch(() => undefined);
}

function scheduleAuthenticatorExpiry(registration: AuthenticatorRegistration, generation: number): void {
  stopAuthenticatorExpiry();
  const remaining = Math.max(0, Date.parse(registration.expiresAt) - Date.now());
  authenticatorExpiryTimer = window.setTimeout(() => {
    if (generation !== authenticatorOperationGeneration || state.auth.registration?.registrationId !== registration.registrationId) return;
    invalidateAuthenticatorRegistration();
    state.auth.error = authText('expired');
    state.auth.status = authText('expired');
    if (state.dialog === 'auth') renderAuthenticatorFocus('[data-search="auth-entries"] input, .auth-create-actions button');
  }, remaining);
}

function scheduleAuthenticatorRefresh(delay = 1000): void {
  stopAuthenticatorRefresh();
  if (state.dialog !== 'auth' || !state.auth.selectedId) return;
  authenticatorRefreshTimer = window.setTimeout(() => void refreshAuthenticatorCodes(), delay);
}

function updateAuthenticatorCodeDom(): void {
  const codes = state.auth.codes;
  const grouped = (value: string): string => value.replace(/(\d{3,4})(?=\d)/g, '$1 ');
  const current = document.querySelector<HTMLElement>('[data-auth-code="current"]');
  const next = document.querySelector<HTMLElement>('[data-auth-code="next"]');
  const countdown = document.querySelector<HTMLElement>('[data-auth-countdown]');
  if (current) current.textContent = codes ? grouped(codes.current) : '—';
  if (next) next.textContent = codes ? grouped(codes.next) : '—';
  if (countdown) countdown.textContent = codes ? `${codes.secondsRemaining} ${authText('seconds')}` : 'Code unavailable';
  document.querySelectorAll<HTMLButtonElement>('[data-auth-copy]').forEach((button) => { button.disabled = !codes; });
}

function updateAuthenticatorFeedbackDom(): void {
  const feedback = document.querySelector<HTMLElement>('[data-auth-feedback]');
  if (!feedback) return;
  feedback.textContent = state.auth.error;
  feedback.hidden = !state.auth.error;
}

async function loadAuthenticatorEntries(): Promise<void> {
  if (state.auth.loading) return;
  state.auth.loading = true; state.auth.error = ''; state.auth.status = authText('loading'); render();
  try {
    const entries = await bridge().authenticatorList();
    if (state.auth.fixtureMode) return;
    state.auth.entries = entries;
    if (state.auth.selectedId && !state.auth.entries.some((entry) => entry.id === state.auth.selectedId)) {
      state.auth.selectedId = ''; state.auth.codes = null;
    }
    state.auth.status = `${state.auth.entries.length} ${authText('entriesLoaded')}.`;
  } catch (error) {
    state.auth.error = authErrorText(error);
  } finally {
    state.auth.loading = false; renderAuthenticatorFocus('[data-search="auth-entries"] input, .auth-create-actions button');
  }
  if (state.auth.selectedId) void refreshAuthenticatorCodes();
}

async function refreshAuthenticatorCodes(): Promise<void> {
  if (authenticatorRefreshBusy || state.dialog !== 'auth' || !state.auth.selectedId) return;
  const requestedId = state.auth.selectedId;
  authenticatorRefreshBusy = true;
  try {
    const codes = await bridge().authenticatorCodes(requestedId);
    if (state.auth.fixtureMode || state.auth.selectedId !== requestedId) return;
    state.auth.codes = codes;
    state.auth.error = '';
  } catch (error) {
    state.auth.codes = null;
    state.auth.error = authErrorText(error);
  } finally {
    authenticatorRefreshBusy = false;
    if (state.dialog === 'auth' && state.auth.phase === 'list') {
      updateAuthenticatorCodeDom();
      updateAuthenticatorFeedbackDom();
    }
    scheduleAuthenticatorRefresh();
  }
}

function resetAuthenticatorRegistration(): void {
  invalidateAuthenticatorRegistration(); state.auth.error = '';
  renderAuthenticatorFocus('[data-search="auth-entries"] input, .auth-create-actions button');
}

async function beginAuthenticatorRegistration(mode: 'generate' | 'import'): Promise<void> {
  if (state.auth.loading) return;
  const d = state.auth.draft;
  if (mode === 'generate' && !d.account.trim()) { state.auth.error = authText('accountRequired'); render(); return; }
  if (mode === 'import' && !d.uri.trim().toLowerCase().startsWith('otpauth://totp/')) { state.auth.error = authText('uriRequired'); render(); return; }
  const generation = ++authenticatorOperationGeneration;
  state.auth.loading = true; state.auth.error = ''; state.auth.status = authText('preparing'); render();
  try {
    const registration = await bridge().authenticatorBegin(mode === 'generate'
      ? { mode, account: d.account.trim(), issuer: d.issuer.trim() || undefined, label: d.label.trim() || undefined, algorithm: d.algorithm, digits: d.digits, period: d.period }
      : { mode, uri: d.uri.trim() });
    acceptAuthenticatorRegistration(registration, generation);
  } catch (error) {
    if (generation === authenticatorOperationGeneration) state.auth.error = authErrorText(error);
  } finally {
    if (generation === authenticatorOperationGeneration) {
      state.auth.loading = false;
      if (state.dialog === 'auth') renderAuthenticatorFocus(state.auth.phase === 'confirm' ? '#auth-confirm-code' : '#auth-account, .dialog textarea');
    }
  }
}

function acceptAuthenticatorRegistration(registration: AuthenticatorRegistration, generation: number): void {
  if (generation !== authenticatorOperationGeneration || state.dialog !== 'auth') {
    void bridge().authenticatorCancel(registration.registrationId).catch(() => undefined);
    return;
  }
  state.auth.registration = registration;
  scheduleAuthenticatorExpiry(registration, generation);
  state.auth.draft.uri = '';
  state.auth.phase = 'confirm'; state.auth.revealSecret = false;
  state.auth.status = authText('prepared');
}

async function importAuthenticatorPng(source: 'file' | 'clipboard'): Promise<void> {
  if (state.auth.loading) return;
  const generation = ++authenticatorOperationGeneration;
  state.auth.loading = true; state.auth.error = ''; state.auth.status = authText('preparing'); render();
  try {
    const registration = source === 'file'
      ? await bridge().authenticatorImportPngFile()
      : await bridge().authenticatorImportClipboardPng();
    if (registration) acceptAuthenticatorRegistration(registration, generation);
  } catch (error) {
    if (generation === authenticatorOperationGeneration) state.auth.error = authErrorText(error);
  } finally {
    if (generation === authenticatorOperationGeneration) {
      state.auth.loading = false;
      if (state.dialog === 'auth') renderAuthenticatorFocus(state.auth.phase === 'confirm' ? '#auth-confirm-code' : '.auth-create-actions button');
    }
  }
}

async function confirmAuthenticatorRegistration(): Promise<void> {
  const registration = state.auth.registration;
  const code = state.auth.draft.code.replace(/[\s-]/g, '');
  if (!registration || Date.now() >= Date.parse(registration.expiresAt)) { invalidateAuthenticatorRegistration(); state.auth.error = authText('expired'); render(); return; }
  if (!/^\d{6,8}$/u.test(code)) { state.auth.error = authText('invalidCode'); render(); return; }
  const generation = authenticatorOperationGeneration;
  state.auth.loading = true; state.auth.error = ''; render();
  try {
    const entry = await bridge().authenticatorConfirm(registration.registrationId, code);
    if (generation !== authenticatorOperationGeneration || state.dialog !== 'auth') return;
    state.auth.entries = [...state.auth.entries.filter((candidate) => candidate.id !== entry.id), entry];
    state.auth.selectedId = entry.id; state.auth.registration = null; state.auth.revealSecret = false;
    stopAuthenticatorExpiry();
    state.auth.draft.code = ''; state.auth.draft.uri = ''; state.auth.phase = 'list'; state.auth.status = `“${entry.label}” ${authText('paired')}`;
    await refreshAuthenticatorCodes();
  } catch (error) {
    if (generation === authenticatorOperationGeneration) state.auth.error = authErrorText(error);
  } finally {
    if (generation === authenticatorOperationGeneration) {
      state.auth.loading = false;
      if (state.dialog === 'auth') renderAuthenticatorFocus(state.auth.phase === 'list' ? '.auth-entry.selected, [data-search="auth-entries"] input' : '#auth-confirm-code');
    }
  }
}

function copyAuthenticatorValue(value: string, message: string): void {
  void navigator.clipboard?.writeText(value).then(() => snack(message)).catch(() => { state.auth.error = authText('clipboardRefused'); render(); });
}

function removeAuthenticatorEntry(entry: AuthenticatorEntry): void {
  gate(`${authText('removeAction')} “${entry.label}”`, undefined, undefined, () => {
    void (async () => {
      try {
        const removed = await bridge().authenticatorRemove(entry.id);
        if (!removed) throw new Error(authText('removeFailed'));
        state.auth.entries = state.auth.entries.filter((candidate) => candidate.id !== entry.id);
        if (state.auth.selectedId === entry.id) { state.auth.selectedId = ''; state.auth.codes = null; stopAuthenticatorRefresh(); }
        state.auth.status = `${authText('removed')} “${entry.label}”.`; openDialog('auth');
      } catch (error) { state.auth.error = authErrorText(error); openDialog('auth'); }
    })();
  });
}

function authDialog(): HTMLElement {
  const a = state.auth;
  if (a.phase === 'generate' || a.phase === 'import') {
    const generate = a.phase === 'generate';
    return dialogShell(authText('eyebrow'), generate ? authText('generate') : authText('import'), [
      h('p', { class: 'auth-hint' }, authText(generate ? 'localGenerate' : 'localImport')),
      generate ? h('div', { class: 'grid2 auth-form' },
        h('label', { class: 'field' }, authText('issuer').toUpperCase(), h('input', { id: 'auth-issuer', value: a.draft.issuer, maxlength: '128', oninput: (e: Event) => { a.draft.issuer = (e.target as HTMLInputElement).value; } })),
        h('label', { class: 'field' }, authText('account').toUpperCase(), h('input', { id: 'auth-account', value: a.draft.account, maxlength: '256', required: 'true', autocomplete: 'off', oninput: (e: Event) => { a.draft.account = (e.target as HTMLInputElement).value; } })),
        h('label', { class: 'field' }, authText('displayLabel').toUpperCase(), h('input', { id: 'auth-label', value: a.draft.label, maxlength: '256', oninput: (e: Event) => { a.draft.label = (e.target as HTMLInputElement).value; } })),
        selectField(authText('algorithm'), ['SHA1', 'SHA256', 'SHA512'], a.draft.algorithm, (value) => { a.draft.algorithm = value as TotpAlgorithm; }),
        selectField(authText('digits'), ['6', '7', '8'], String(a.draft.digits), (value) => { a.draft.digits = Number(value); }),
        h('label', { class: 'field' }, authText('period').toUpperCase(), h('input', { type: 'number', min: '5', max: '300', value: String(a.draft.period), oninput: (e: Event) => { a.draft.period = Number((e.target as HTMLInputElement).value); } })))
        : h('label', { class: 'field' }, authText('uri').toUpperCase(), h('textarea', { class: 'mono', rows: '5', maxlength: '4096', value: a.draft.uri, autocomplete: 'off', spellcheck: 'false', oninput: (e: Event) => { a.draft.uri = (e.target as HTMLTextAreaElement).value; } }, a.draft.uri)),
      a.error ? h('div', { class: 'feedback bad', role: 'alert' }, a.error) : null,
    ], [
      h('button', { class: 'btn text', onclick: resetAuthenticatorRegistration }, authText('back')),
      h('button', { class: 'btn filled', disabled: a.loading, onclick: () => void beginAuthenticatorRegistration(a.phase as 'generate' | 'import') }, a.loading ? authText('working') : authText('registration')),
    ], true);
  }

  if (a.phase === 'confirm' && a.registration) {
    const registration = a.registration;
    const grouped = registration.manualSecret.replace(/(.{4})/g, '$1 ').trim();
    return dialogShell(authText('eyebrow'), authText('registration'), [
      h('p', { class: 'auth-hint' }, authText('pairHint')),
      h('div', { class: 'auth-registration' },
        h('img', { class: 'auth-qr', src: registration.qrDataUrl, alt: `${authText('qrAlt')} ${registration.entry.label}, ${authText('qrAccount')} ${registration.entry.account}` }),
        h('div', { class: 'auth-registration-details' },
          h('h3', {}, registration.entry.label),
          h('p', {}, `${registration.entry.issuer || authText('noIssuer')} · ${registration.entry.account}`),
          h('dl', { class: 'auth-params' },
            h('div', {}, h('dt', {}, authText('algorithm')), h('dd', {}, registration.entry.algorithm)),
            h('div', {}, h('dt', {}, authText('digits')), h('dd', {}, String(registration.entry.digits))),
            h('div', {}, h('dt', {}, authText('period')), h('dd', {}, `${registration.entry.period} ${authText('seconds')}`))),
          h('button', { class: 'btn outlined', 'data-auth-reveal': 'true', 'aria-expanded': a.revealSecret ? 'true' : 'false', onclick: () => { a.revealSecret = !a.revealSecret; renderAuthenticatorFocus('[data-auth-reveal]'); } }, a.revealSecret ? authText('hide') : authText('reveal')),
          a.revealSecret ? h('div', { class: 'auth-secret' },
            h('code', {}, grouped),
            h('button', { class: 'btn tonal', onclick: () => copyAuthenticatorValue(registration.manualSecret, authText('copiedManual')) }, `${authText('copy')} ${authText('manualSecret')}`)) : null)),
      h('label', { class: 'field auth-confirm' }, authText('pairedCode').toUpperCase(), h('input', {
        id: 'auth-confirm-code', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '9', autocomplete: 'one-time-code', value: a.draft.code,
        oninput: (e: Event) => { a.draft.code = (e.target as HTMLInputElement).value; },
      })),
      a.error ? h('div', { class: 'feedback bad', role: 'alert' }, a.error) : null,
      h('p', { class: 'auth-expiry' }, `${authText('expires')} ${new Date(registration.expiresAt).toLocaleTimeString()}. ${authText('expiryNote')}`),
    ], [
      h('button', { class: 'btn text', onclick: resetAuthenticatorRegistration }, authText('cancelRegistration')),
      h('button', { class: 'btn filled', disabled: a.loading, onclick: () => void confirmAuthenticatorRegistration() }, a.loading ? authText('checking') : authText('confirm')),
    ], true);
  }

  const match = makeMatcher(sq('auth-entries'));
  const entries = a.entries.filter((entry) => match(`${entry.label} ${entry.account} ${entry.issuer ?? ''}`));
  const selected = a.entries.find((entry) => entry.id === a.selectedId);
  const code = (value: string): string => value.replace(/(\d{3,4})(?=\d)/g, '$1 ');
  return dialogShell(authText('eyebrow'), authText('title'), [
    h('p', { class: 'auth-hint' }, authText('localVault')),
    h('div', { class: 'btnrow auth-create-actions' },
      h('button', { class: 'btn filled', onclick: () => { a.phase = 'generate'; a.error = ''; renderAuthenticatorFocus('#auth-issuer'); } }, icon('add'), authText('generate')),
      h('button', { class: 'btn outlined', onclick: () => { a.phase = 'import'; a.error = ''; renderAuthenticatorFocus('.dialog textarea'); } }, icon('download'), authText('import')),
      h('button', { class: 'btn outlined', disabled: a.loading, onclick: () => void importAuthenticatorPng('file') }, icon('image'), authText('importPng')),
      h('button', { class: 'btn outlined', disabled: a.loading, onclick: () => void importAuthenticatorPng('clipboard') }, icon('content_paste'), authText('importClipboard'))),
    h('p', { class: 'auth-hint' }, authText('cameraUnavailable')),
    searchLine('auth-entries', authText('search')),
    a.loading ? h('div', { class: 'auth-state', role: 'status' }, authText('loading')) : null,
    h('div', { class: 'feedback bad', role: 'alert', 'data-auth-feedback': 'true', hidden: !a.error }, a.error),
    !a.loading && !entries.length ? h('div', { class: 'auth-state' }, emptyState(sq('auth-entries').text ? authText('noMatch') : authText('empty'))) : null,
    entries.length ? h('div', { class: 'listbox auth-entry-list', 'aria-label': authText('entries') }, ...entries.map((entry) =>
      h('button', {
        class: `auth-entry${entry.id === a.selectedId ? ' selected' : ''}`, 'aria-pressed': entry.id === a.selectedId ? 'true' : 'false',
        onclick: () => { a.selectedId = entry.id; a.codes = null; renderAuthenticatorFocus('.auth-entry.selected'); void refreshAuthenticatorCodes(); },
      }, h('span', { class: 'lead' }, icon('pin')), h('span', { class: 'auth-entry-text' }, h('b', {}, entry.label), h('small', {}, `${entry.issuer || authText('noIssuer')} · ${entry.account}`)), h('span', { class: 'auth-entry-meta' }, `${entry.algorithm} · ${entry.digits}/${entry.period}`)))) : null,
    selected ? h('section', { class: 'auth-codes', 'aria-label': `${authText('codesFor')} ${selected.label}` },
      h('div', { class: 'auth-code-card current' }, h('span', {}, authText('current')), h('strong', { 'data-auth-code': 'current' }, a.codes ? code(a.codes.current) : '—'),
        h('small', { 'data-auth-countdown': 'true' }, a.codes ? `${a.codes.secondsRemaining} ${authText('seconds')}` : authText('loadingCode')),
        h('button', { class: 'btn tonal', 'data-auth-copy': 'current', disabled: !a.codes, onclick: () => a.codes && copyAuthenticatorValue(a.codes.current, authText('copiedCurrent')) }, `${authText('copy')} ${authText('current')}`)),
      h('div', { class: 'auth-code-card' }, h('span', {}, authText('next')), h('strong', { 'data-auth-code': 'next' }, a.codes ? code(a.codes.next) : '—'),
        h('small', {}, a.codes ? `${authText('afterPeriod')} · ${a.codes.period} ${authText('seconds')}` : authText('waitingCode')),
        h('button', { class: 'btn outlined', 'data-auth-copy': 'next', disabled: !a.codes, onclick: () => a.codes && copyAuthenticatorValue(a.codes.next, authText('copiedNext')) }, `${authText('copy')} ${authText('next')}`)),
      h('div', { class: 'auth-entry-actions' },
        h('button', { class: 'btn text', onclick: () => void refreshAuthenticatorCodes() }, icon('refresh'), authText('refresh')),
        h('button', { class: 'btn danger', onclick: () => removeAuthenticatorEntry(selected) }, icon('delete'), authText('remove')))) : null,
    a.status ? h('p', { class: 'auth-status', role: 'status', 'aria-live': 'polite' }, a.status) : null,
  ], [h('button', { class: 'btn filled', onclick: closeDialog }, authText('close'))], true);
}

function notificationsDialog(): HTMLElement {
  const match = makeMatcher(sq('notifications'));
  const found = state.notifications.filter((n) => match(`${n.title} ${n.detail}`));
  const picked = state.dlgSelected;
  const every = found.length > 0 && found.every((n) => picked.has(n.id));
  const bulk = (fn: (n: NotificationEntry) => void, msg: string): void => {
    const targets = state.notifications.filter((n) => picked.has(n.id));
    if (!targets.length) { snack('Select at least one notification.'); return; }
    targets.forEach(fn);
    snack(`${msg} · ${targets.length} notification(s).`);
    render();
  };
  const displayName = scheduledDisplayName();
  return dialogShell(`Reviewable local notices · ${displayName}`, `${displayName} notification centre`, [
    searchLine('notifications', 'Search notifications'),
    h('div', { class: 'bulkbar' },
      h('button', {
        class: 'icon-btn small', title: every ? 'Deselect all' : 'Select all',
        onclick: () => { every ? found.forEach((n) => picked.delete(n.id)) : found.forEach((n) => picked.add(n.id)); render(); },
      }, icon(every ? 'check_box' : picked.size ? 'indeterminate_check_box' : 'check_box_outline_blank')),
      h('span', { class: 'count' }, `${picked.size} of ${found.length} selected`),
      h('div', { style: 'flex:1' }),
      h('button', { class: 'btn text', onclick: () => bulk((n) => { n.read = true; }, 'Marked read') }, 'Mark read'),
      h('button', { class: 'btn text', onclick: () => bulk((n) => { n.read = false; }, 'Marked unread') }, 'Mark unread'),
      h('button', {
        class: 'btn text', onclick: () => {
          if (!picked.size) { snack('Select at least one notification.'); return; }
          const n = picked.size;
          state.notifications = state.notifications.filter((x) => !picked.has(x.id));
          picked.clear(); render(); snack(`Deleted ${n} notification(s).`);
        },
      }, 'Delete'),
      h('button', { class: 'btn text', onclick: () => openDialog('export') }, 'Export selected')),
    h('div', { class: 'listbox' }, ...(found.length ? found.map((n) => {
      const on = picked.has(n.id);
      return h('div', {
        class: `row${on ? ' selected' : ''}`,
        onclick: () => { on ? picked.delete(n.id) : picked.add(n.id); render(); },
        oncontextmenu: ctx(`notif-${n.id}`, () => [
          { icon: n.read ? 'mark_email_unread' : 'mark_email_read', label: n.read ? 'Mark unread' : 'Mark read', act: () => { n.read = !n.read; } },
          { icon: 'select_all', label: 'Select every notification', act: () => found.forEach((x) => picked.add(x.id)) },
          { icon: 'deselect', label: 'Clear the selection', act: () => picked.clear() },
          { icon: 'delete', label: 'Delete this notification', act: () => { state.notifications = state.notifications.filter((x) => x.id !== n.id); }, danger: true },
        ], n.title),
      },
        h('span', { class: 'cb' }, on ? icon('check') : null),
        h('span', { class: 'lead' }, icon(n.icon)),
        h('span', { class: 'primary', style: n.read ? 'font-weight:400' : '' }, n.title),
        h('span', { class: 'snippet' }, n.detail),
        n.read ? null : h('span', { class: 'chip-inline' }, 'NEW'));
    }) : [emptyState('No notification matches.')])),
  ], [
    h('button', { class: 'btn outlined', onclick: () => { state.notifications = []; state.dlgSelected.clear(); render(); } }, 'Clear history'),
    h('button', { class: 'btn tonal', onclick: () => { state.notifications.forEach((n) => { n.read = true; }); render(); } }, 'Mark all read'),
    h('button', { class: 'btn filled', onclick: closeDialog }, 'Close'),
  ], true);
}

function buildExport(format: string): string {
  const rows = allIdsInView();
  const view = state.view;
  const header = `WinUtil · ${VIEW_META[view].title} · ${rows.length} row(s) · exported ${new Date().toISOString()}`;
  const note = 'Authenticator secrets, lock credentials, and personal-vocabulary data and file metadata are deliberately omitted from this export.';
  switch (format) {
    case 'json': return JSON.stringify({ view, exportedAt: new Date().toISOString(), note, rows }, null, 2);
    case 'jsonl': return rows.map((r) => JSON.stringify({ view, id: r })).join('\n');
    case 'csv': return `view,id\n${rows.map((r) => `${view},${r}`).join('\n')}`;
    case 'tsv': return `view\tid\n${rows.map((r) => `${view}\t${r}`).join('\n')}`;
    case 'yaml': return `view: ${view}\nnote: ${note}\nrows:\n${rows.map((r) => `  - ${r}`).join('\n')}`;
    case 'toml': return `view = "${view}"\nnote = "${note}"\nrows = [${rows.map((r) => `"${r}"`).join(', ')}]`;
    case 'xml': return `<export view="${view}">\n${rows.map((r) => `  <row id="${r}"/>`).join('\n')}\n</export>`;
    case 'html': return `<h1>${header}</h1><ul>${rows.map((r) => `<li>${r}</li>`).join('')}</ul>`;
    case 'sql': return rows.map((r) => `INSERT INTO winutil_export (view, id) VALUES ('${view}', '${r}');`).join('\n');
    case 'ts': return `export const ${view}Export: string[] = [\n${rows.map((r) => `  '${r}',`).join('\n')}\n];`;
    case 'py': return `${view}_export = [\n${rows.map((r) => `    "${r}",`).join('\n')}\n]`;
    case 'go': return `var ${view}Export = []string{\n${rows.map((r) => `\t"${r}",`).join('\n')}\n}`;
    case 'rs': return `pub const ${view.toUpperCase()}_EXPORT: &[&str] = &[\n${rows.map((r) => `    "${r}",`).join('\n')}\n];`;
    case 'proto': return `message ${view}Export {\n  repeated string id = 1;\n}`;
    case 'schema.json': return JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', title: `${view} export`, type: 'object', properties: { rows: { type: 'array', items: { type: 'string' } } } }, null, 2);
    case 'txt': return `${header}\n${note}\n\n${rows.join('\n')}`;
    default: return `# ${header}\n\n> ${note}\n\n${rows.map((r) => `- \`${r}\``).join('\n')}`;
  }
}

function exportRecords(): Array<Record<string, unknown>> {
  const selected = allIdsInView().filter((id) => state.selected.has(id));
  const ids = selected.length ? selected : allIdsInView();
  if (state.view === 'install') return ids.map((id) => {
    const item = state.catalog.apps.find((entry) => entry.id === id);
    return item ? { id: item.id, name: item.name, category: item.cat, description: item.desc, packageId: item.winget, sourceUrl: item.link, openSource: item.foss } : { id };
  });
  if (state.view === 'tweaks' || state.view === 'config') {
    const source = state.view === 'tweaks' ? state.catalog.tweaks : state.catalog.features;
    return ids.map((id) => { const item = source.find((entry) => entry.id === id); return item ? { id: item.id, name: item.name, category: item.cat, description: item.desc, panel: item.panel ?? '', type: item.type ?? '' } : { id }; });
  }
  if (state.view === 'history') return state.gitHistory.map((entry) => ({ ...entry }));
  if (state.view === 'settings') return [{ theme: state.prefs.theme, density: state.prefs.density, language: state.prefs.language, accent: state.prefs.accent, font: state.prefs.font, scale: state.prefs.scale, weight: state.prefs.weight, radius: state.prefs.radius, reducedMotion: state.prefs.reducedMotion }];
  return ids.map((id) => ({ id, view: state.view }));
}

function exportCoreFormat(value: string): string {
  return ({ md: 'markdown', ts: 'typescript', js: 'javascript', py: 'python', rs: 'rust', proto: 'protobuf', 'schema.json': 'json-schema' } as Record<string, string>)[value] ?? value;
}

function exportDialog(): HTMLElement {
  const format = state.prefs.exportFormat;
  const draft = state.exportDraft;
  const records = exportRecords();
  const selectedCount = allIdsInView().filter((id) => state.selected.has(id)).length;
  const scope = selectedCount ? 'selection' : (state.search.text || (state.view === 'history' && (state.historyFilter.action !== 'all' || state.historyFilter.from || state.historyFilter.to))) ? 'filtered-view' : 'all';
  const preview = `${records.length} structured record(s) · ${scope}\nUTF-8 ${draft.lineEnding.toUpperCase()} · private vocabulary and TOTP/authenticator secrets are always omitted.\n${draft.archive === 'none' ? 'A plain file will be saved.' : `${draft.archive.toUpperCase()} archive · ${draft.level} compression.`}`;
  return dialogShell('Multi-format export', `Export ${VIEW_META[state.view].title}`, [
    h('div', { class: 'grid2' },
      selectField('Format', EXPORT_FORMATS.map(([v]) => v), format, (v) => { state.prefs.exportFormat = v; render(); }),
      selectField('Line ending', ['lf', 'crlf'], draft.lineEnding, (v) => { draft.lineEnding = v; render(); }),
      selectField('Archive', ['none', 'zip', '7z'], draft.archive, (v) => { draft.archive = v; render(); }),
      draft.archive === 'none' ? null : selectField('Compression level', ['store', 'fastest', 'fast', 'normal', 'maximum', 'ultra'], draft.level, (v) => { draft.level = v; render(); })),
    draft.archive === '7z' ? h('div', { class: 'grid2 archive-options' },
      selectField('Method', ['LZMA2', 'LZMA', 'PPMd', 'BZip2', 'Deflate'], draft.method, (v) => { draft.method = v; render(); }),
      numberField('Dictionary MiB', 1, 4_096, draft.dictionary, (v) => { draft.dictionary = v; }),
      numberField('Word size', 5, 273, draft.word, (v) => { draft.word = v; }),
      numberField('Solid block MiB', 1, 65_536, draft.solidBlock, (v) => { draft.solidBlock = v; }),
      numberField('Threads', 1, 128, draft.threads, (v) => { draft.threads = v; }),
      numberField('Split volume MiB (0 off)', 0, 1_048_576, draft.split, (v) => { draft.split = v; }),
      switchField('Solid archive', draft.solid, () => { draft.solid = !draft.solid; render(); }),
      switchField('AES-256 content encryption', draft.encryption, () => { draft.encryption = !draft.encryption; render(); }),
      draft.encryption ? switchField('Encrypt headers (hide filenames)', draft.encryptHeaders, () => { draft.encryptHeaders = !draft.encryptHeaders; render(); }) : null,
      draft.encryption ? h('label', { class: 'field' }, 'ARCHIVE PASSWORD', h('input', { type: 'password', value: draft.password, autocomplete: 'new-password', 'aria-describedby': 'archive-password-note', oninput: (event: Event) => { draft.password = (event.target as HTMLInputElement).value; } })) : null,
    ) : null,
    draft.archive === '7z' && draft.encryption && !draft.encryptHeaders
      ? h('div', { class: 'notice warn', role: 'alert' }, icon('warning'), h('span', {}, 'Contents use AES-256, but filenames remain visible because header encryption is off.')) : null,
    draft.encryption ? h('p', { id: 'archive-password-note', class: 'feedback' }, 'The password is passed directly to the local archive process, never stored, logged, exported, or added to history. Ordinary exports cannot contain secrets; a separate super-confirmed secret-export flow is not provided here.') : null,
    h('div', { style: 'height:12px' }),
    h('pre', { class: 'block' }, preview),
    draft.savedPath ? h('div', { class: 'notice success', role: 'status' }, icon('check_circle'), h('span', {}, `Saved ${draft.savedPath}`)) : null,
  ], [
    h('button', { class: 'btn text', onclick: closeDialog }, 'Cancel'),
    draft.savedPath ? h('button', { class: 'btn tonal', onclick: () => void bridge().openExportInVSCode(draft.savedPath).then((result) => snack(result.ok ? 'Opened the export in Visual Studio Code.' : result.error ?? 'Visual Studio Code is unavailable.')) }, 'Open in VS Code') : null,
    h('button', {
      class: 'btn filled',
      disabled: draft.archive === '7z' && draft.encryption && draft.password.length < 8,
      onclick: () => { void bridge().exportView({
        view: state.view, format: exportCoreFormat(format), records,
        scope: { kind: scope, detail: `${scope} from ${VIEW_META[state.view].title}; source ${allIdsInView().length}, exported ${records.length}`, sourceCount: allIdsInView().length, exportedCount: records.length },
        lineEnding: draft.lineEnding as 'lf' | 'crlf',
        ...(draft.archive === 'none' ? {} : { archive: { format: draft.archive, compressionLevel: draft.level,
          ...(draft.archive === '7z' ? { method: draft.method, dictionarySizeMiB: draft.dictionary, wordSize: draft.word, solid: draft.solid, solidBlockSizeMiB: draft.solidBlock, threads: draft.threads, ...(draft.split ? { splitVolumeSizeMiB: draft.split } : {}), encryption: { enabled: draft.encryption, encryptHeaders: draft.encryptHeaders, ...(draft.encryption ? { password: draft.password } : {}) } } : {}) } }),
      }).then((result) => { draft.password = ''; if (result.status === 'saved' && result.filePath) { draft.savedPath = result.filePath; snack(`Written to ${result.filePath}${result.warnings.length ? ` · ${result.warnings.join(' ')}` : ''}`); render(); } else snack('Export cancelled.'); }).catch((error) => { draft.password = ''; snack(error instanceof Error ? error.message : 'Export failed.'); }); },
    }, 'Save file'),
  ], true);
}

function saveSelectionDialog(): HTMLElement {
  const d = state.profileDraft;
  return dialogShell('Selection profile', 'Save this selection', [
    h('p', { style: 'font-size:13px;color:var(--md-sys-color-on-surface-variant)' },
      `${state.selected.size} row(s) from ${VIEW_META[state.view].title}. Profiles are unlimited and stored locally.`),
    h('label', { class: 'field' }, 'PROFILE NAME', h('input', {
      value: d.name, placeholder: 'e.g. New laptop baseline', autofocus: 'autofocus',
      oninput: (e: Event) => { d.name = (e.target as HTMLInputElement).value; },
    })),
    h('div', { class: 'field' }, 'COLOUR', h('div', { class: 'chips' },
      h('button', {
        class: 'swatch', style: `--sw:${d.color}`, title: 'Open the infinite colour picker',
        onclick: () => { closeDialog(); openColorPicker('selection', 'New profile'); },
      }, icon('colorize')),
      ...SELECTION_COLORS.map(([name, hex]) => h('button', {
        class: `swatch${d.color === hex ? ' on' : ''}`, title: name, style: `--sw:${hex}`,
        onclick: () => { d.color = hex; render(); },
      }, d.color === hex ? icon('check') : null)))),
  ], [
    h('button', { class: 'btn text', onclick: closeDialog }, 'Cancel'),
    h('button', {
      class: 'btn filled', disabled: !state.selected.size,
      onclick: () => {
        const name = d.name.trim() || `${VIEW_META[state.view].title} ${state.profiles.length + 1}`;
        state.profiles = [...state.profiles, { id: `p-${Date.now()}`, name, color: d.color, view: state.view, ids: [...state.selected] }];
        state.selectionColor = d.color;
        state.selected.forEach((i) => { state.rowColors[i] = d.color; });
        record('profile', `Saved the selection profile “${name}” with ${state.selected.size} row(s)`);
        d.name = '';
        closeDialog();
        snack(`Saved “${name}”. Profiles are unlimited.`);
      },
    }, 'Save profile'),
  ]);
}

function profilesDialog(): HTMLElement {
  const match = makeMatcher(sq('profiles'));
  const found = state.profiles.filter((p) => match(`${p.name} ${p.view} ${p.ids.join(' ')}`));
  const picked = state.dlgSelected;
  const apply = (p: typeof state.profiles[number], mode: 'replace' | 'add' | 'subtract'): void => {
    if (mode === 'replace') { state.selected.clear(); state.rowColors = {}; }
    p.ids.forEach((id) => {
      if (mode === 'subtract') { state.selected.delete(id); delete state.rowColors[id]; }
      else { state.selected.add(id); state.rowColors[id] = p.color; }
    });
    if (mode !== 'subtract') state.selectionColor = p.color;
    go(p.view);
    snack(`${mode === 'subtract' ? 'Subtracted' : mode === 'add' ? 'Merged' : 'Applied'} “${p.name}” · ${p.ids.length} row(s).`);
  };
  return dialogShell('Unlimited, local, colour coded', 'Selection profiles', [
    searchLine('profiles', 'Search saved selections'),
    h('div', { class: 'bulkbar' },
      h('span', { class: 'count' }, `${state.profiles.length} profile(s) · ${picked.size} selected`),
      h('div', { style: 'flex:1' }),
      h('button', { class: 'btn text', onclick: () => { found.forEach((p) => picked.add(p.id)); render(); } }, 'Select all'),
      h('button', { class: 'btn text', onclick: () => { picked.clear(); render(); } }, 'Clear'),
      h('button', {
        class: 'btn text', onclick: () => {
          const targets = state.profiles.filter((p) => picked.has(p.id));
          if (!targets.length) { snack('Select at least one profile.'); return; }
          state.selected.clear(); state.rowColors = {};
          targets.forEach((p) => p.ids.forEach((id) => { state.selected.add(id); state.rowColors[id] = p.color; }));
          render(); snack(`Merged ${targets.length} profile(s) into the selection.`);
        },
      }, 'Merge selected'),
      h('button', {
        class: 'btn text', onclick: () => {
          if (!picked.size) { snack('Select at least one profile.'); return; }
          const n = picked.size;
          state.profiles = state.profiles.filter((p) => !picked.has(p.id));
          picked.clear(); render(); snack(`Deleted ${n} profile(s).`);
        },
      }, 'Delete selected')),
    h('div', { class: 'listbox' }, ...(found.length ? found.map((p) => {
      const on = picked.has(p.id);
      const locked = false;
      return h('div', {
        class: `row${on ? ' selected' : ''}`, style: `--tint:${p.color}`,
        onclick: () => { on ? picked.delete(p.id) : picked.add(p.id); render(); },
        oncontextmenu: ctx(`profile-${p.id}`, () => [
          { section: 'Apply' },
          { icon: 'play_arrow', label: 'Apply, replacing the selection', act: () => apply(p, 'replace') },
          { icon: 'add', label: 'Merge into the selection', act: () => apply(p, 'add') },
          { icon: 'remove', label: 'Subtract from the selection', act: () => apply(p, 'subtract') },
          { section: 'Appearance' },
          { icon: 'colorize', label: 'Recolour this profile…', act: () => openColorPicker(`profile:${p.id}`, `Profile · ${p.name}`) },
          { icon: 'edit', label: 'Rename this profile', act: () => { const n = window.prompt('New name', p.name); if (n) p.name = n; } },
          { section: 'Manage' },
          { icon: locked ? 'lock_open' : 'lock', label: locked ? 'Unlock this profile…' : 'Lock this profile…', act: () => openLockWizard(`profile-sel-${p.id}`, `Selection profile · ${p.name}`, locked ? 'unlock' : 'set') },
          { icon: 'download', label: 'Export this profile', act: () => openDialog('export') },
          { icon: 'delete', label: 'Delete this profile', act: () => { state.profiles = state.profiles.filter((x) => x.id !== p.id); }, danger: true },
        ], p.name),
      },
        h('span', { class: 'cb' }, on ? icon('check') : null),
        h('span', { class: 'swatch dot', style: `--sw:${p.color}` }),
        h('span', { class: 'primary' }, p.name),
        h('span', { class: 'snippet' }, `${VIEW_META[p.view].title} · ${p.ids.length} row(s)`),
        locked ? h('span', { class: 'chip-inline' }, 'LOCKED') : null,
        h('button', { class: 'btn text', onclick: (e: MouseEvent) => { e.stopPropagation(); apply(p, 'replace'); closeDialog(); } }, 'Apply'));
    }) : [emptyState(state.profiles.length ? 'No profile matches this search.' : 'No profile saved yet. Select rows, then use Save selection.')])),
  ], [
    h('button', { class: 'btn tonal', onclick: () => { closeDialog(); openDialog('saveselection'); } }, 'Save the current selection…'),
    h('button', { class: 'btn filled', onclick: closeDialog }, 'Close'),
  ], true);
}

function dimSumDialog(): HTMLElement {
  const [name, note] = DIM_SUM[Number(state.dialogArg) || 0];
  return dialogShell('One in ten, past ten rows', 'Dim sum surprise', [
    h('div', { class: 'dimsum' },
      h('div', { class: 'dimsum-mark' }, icon('restaurant')),
      h('div', {},
        h('h3', { style: 'margin:0 0 4px;font-size:22px;font-weight:400' }, name),
        h('p', {}, note))),
    h('p', { style: 'font-size:12.5px' },
      `You have ${state.selected.size} rows selected. Nothing has run yet — the surprise is decorative and changes no state.`),
  ], [
    h('button', { class: 'btn tonal', onclick: () => { state.dialogArg = String(Math.floor(Math.random() * DIM_SUM.length)); render(); } }, 'Another one'),
    h('button', { class: 'btn filled', onclick: closeDialog }, 'Back to work'),
  ]);
}

/* ---------------------------------------------------------- colour picker -- */

const hslToHex = (hu: number, sa: number, li: number): string => {
  const s = sa / 100;
  const l = li / 100;
  const k = (n: number): number => (n + hu / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
};

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hu = 0;
  if (d !== 0) {
    if (max === r) hu = ((g - b) / d) % 6;
    else if (max === g) hu = (b - r) / d + 2;
    else hu = (r - g) / d + 4;
  }
  return { h: Math.round(((hu * 60) + 360) % 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

const APPEARANCE_COLOR_SPACES: readonly AppearanceColorSpace[] = Object.freeze([
  'hex', 'rgb', 'hsl', 'hsv', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'cmyk',
]);
const COLOR_TRANSLATOR_INPUT_LIMIT = 512;

function appearanceColorRuntime(): AppearanceColorRuntime {
  const runtime = (window as unknown as { appearanceColor?: AppearanceColorRuntime }).appearanceColor;
  if (!runtime) throw new Error('The appearance colour translator is unavailable.');
  return runtime;
}

function pickerColor(): AppearanceColorValue {
  return { space: 'hsl', h: state.picker.h, s: state.picker.s / 100, l: state.picker.l / 100, alpha: state.picker.alpha };
}

function formatColorValue(value: AppearanceColorValue): string {
  return value.space === 'hex' ? String(value.value).toUpperCase() : JSON.stringify(value);
}

function parseColorRepresentation(space: AppearanceColorSpace, input: string): AppearanceColorValue {
  if (Array.from(input).length > COLOR_TRANSLATOR_INPUT_LIMIT) throw new TypeError(`Input must be ${COLOR_TRANSLATOR_INPUT_LIMIT} characters or fewer.`);
  if (space === 'hex') return { space, value: input.trim() };
  let parsed: unknown;
  try { parsed = JSON.parse(input); } catch { throw new TypeError(`Enter ${space.toUpperCase()} as a valid JSON object.`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || (parsed as { space?: unknown }).space !== space) {
    throw new TypeError(`The JSON object must use "space":"${space}".`);
  }
  return parsed as AppearanceColorValue;
}

/** target: 'selection' | 'row:<id>' | 'profile:<id>' */
function openColorPicker(target: string, label: string): void {
  const current = target.startsWith('row:')
    ? state.rowColors[target.slice(4)] ?? state.selectionColor
    : state.selectionColor;
  const converted = appearanceColorRuntime().convertColor({ space: 'hex', value: current }, 'hsl');
  const hsl = converted.value as AppearanceColorValue;
  state.picker = {
    ...state.picker, target, label,
    h: Number(hsl.h), s: Number(hsl.s) * 100, l: Number(hsl.l) * 100,
    alpha: Number(hsl.alpha ?? 1), error: '',
  };
  openDialog('color');
}

function applyPickedColor(hex: string): void {
  const p = state.picker;
  p.recents = [hex, ...p.recents.filter((c) => c !== hex)].slice(0, 12);
  if (p.target.startsWith('row:')) {
    const id = p.target.slice(4);
    state.selected.add(id);
    state.rowColors[id] = hex;
  } else if (p.target.startsWith('profile:')) {
    const profile = state.profiles.find((x) => x.id === p.target.slice(8));
    if (profile) profile.color = hex;
  } else {
    state.selectionColor = hex;
    state.selected.forEach((id) => { state.rowColors[id] = hex; });
  }
  closeDialog();
  snack(`${p.label} coloured ${hex}.`);
}

function colorDialog(): HTMLElement {
  const p = state.picker;
  const runtime = appearanceColorRuntime();
  const chip = h('div', { class: 'picker-chip' });
  const hexLabel = h('div', { class: 'mono', style: 'font-size:20px' });
  const hslLabel = h('div', { style: 'font-size:12px;color:var(--md-sys-color-on-surface-variant)' });
  const representationInput = h('textarea', { class: 'mono color-representation-input', maxlength: String(COLOR_TRANSLATOR_INPUT_LIMIT), rows: '3', spellcheck: 'false' }) as HTMLTextAreaElement;
  const nativeInput = h('input', { type: 'color' }) as HTMLInputElement;
  const contrastInput = h('input', { class: 'mono', maxlength: '9', value: p.contrastBackground, spellcheck: 'false' }) as HTMLInputElement;
  const errorFeedback = h('div', { class: 'feedback error color-feedback', role: 'alert', hidden: true });
  const gamutFeedback = h('div', { class: 'feedback color-feedback', role: 'status', 'aria-live': 'polite' });
  const contrastFeedback = h('div', { class: 'feedback color-feedback', role: 'status', 'aria-live': 'polite' });
  const readouts = { h: h('b', { class: 'mono' }), s: h('b', { class: 'mono' }), l: h('b', { class: 'mono' }), alpha: h('b', { class: 'mono' }) };
  const tracks = {} as Record<'h' | 's' | 'l' | 'alpha', HTMLInputElement>;

  const showError = (message = ''): void => {
    p.error = message;
    errorFeedback.hidden = !message;
    errorFeedback.textContent = message;
  };

  const contrastSummary = (foreground: AppearanceColorValue): void => {
    try {
      const contrast = runtime.contrastRatio(foreground, { space: 'hex', value: p.contrastBackground });
      contrastInput.setAttribute('aria-invalid', 'false');
      contrastFeedback.textContent = `${contrast.ratio.toFixed(2)}:1 against ${p.contrastBackground.toUpperCase()} · normal text AA ${contrast.normalTextAA ? 'passes' : 'fails'}, AAA ${contrast.normalTextAAA ? 'passes' : 'fails'} · large text AA ${contrast.largeTextAA ? 'passes' : 'fails'}, AAA ${contrast.largeTextAAA ? 'passes' : 'fails'}.`;
    } catch {
      contrastInput.setAttribute('aria-invalid', 'true');
      contrastFeedback.textContent = 'Enter a valid HEX or HEX8 background to calculate WCAG contrast.';
    }
  };

  /** Repaint every dependent node in place. Re-rendering would replace the range
   *  input mid-drag and the browser would drop pointer capture. */
  const sync = (from = '', reported?: AppearanceColorConversion): void => {
    const current = pickerColor();
    const hexConversion = runtime.convertColor(current, 'hex');
    const hex = String(hexConversion.value.value);
    chip.style.setProperty('--pick', hex);
    hexLabel.textContent = hex.toUpperCase();
    hslLabel.textContent = `hsl(${Math.round(p.h)} ${Math.round(p.s)}% ${Math.round(p.l)}% / ${Math.round(p.alpha * 100)}%)`;
    readouts.h.textContent = `${Math.round(p.h)}\u00b0`;
    readouts.s.textContent = `${Math.round(p.s)}%`;
    readouts.l.textContent = `${Math.round(p.l)}%`;
    readouts.alpha.textContent = `${Math.round(p.alpha * 100)}%`;
    tracks.s.style.setProperty('--track', `linear-gradient(90deg,${hslToHex(p.h, 0, p.l)},${hslToHex(p.h, 100, p.l)})`);
    tracks.l.style.setProperty('--track', `linear-gradient(90deg,#000,${hslToHex(p.h, p.s, 50)},#fff)`);
    tracks.alpha.style.setProperty('--track', `linear-gradient(90deg,transparent,${hex.slice(0, 7)})`);
    (['h', 's', 'l'] as const).forEach((key) => { if (from !== key) tracks[key].value = String(Math.round(p[key])); });
    if (from !== 'alpha') tracks.alpha.value = String(Math.round(p.alpha * 100));
    if (from !== 'representation') {
      const conversion = runtime.convertColor(current, p.representation);
      p.representationInput = formatColorValue(conversion.value);
      representationInput.value = p.representationInput;
    }
    const gamut = reported ?? runtime.convertColor(current, p.representation);
    gamutFeedback.classList.toggle('bad', gamut.clipped);
    gamutFeedback.textContent = gamut.clipped
      ? `Outside sRGB gamut. The ${gamut.clippedChannels.join(', ')} channel${gamut.clippedChannels.length === 1 ? ' was' : 's were'} clipped for display.`
      : `In sRGB gamut · ${p.representation.toUpperCase()} conversion can be displayed without clipping.`;
    nativeInput.value = hex.slice(0, 7);
    contrastSummary(current);
  };

  const slider = (label: string, key: 'h' | 's' | 'l' | 'alpha', max: number, track: string): HTMLElement => {
    const input = h('input', {
      type: 'range', min: '0', max: String(max), step: '1', value: String(Math.round(key === 'alpha' ? p.alpha * 100 : p[key])),
      class: 'gradient', style: `--track:${track};height:44px;border:0;background:none;padding:0`,
      oninput: (e: Event) => { const value = Number((e.target as HTMLInputElement).value); if (key === 'alpha') p.alpha = value / 100; else p[key] = value; showError(); sync(key); },
    }) as HTMLInputElement;
    tracks[key] = input;
    return h('label', { class: 'field' },
      h('span', { style: 'display:flex;justify-content:space-between' }, h('span', {}, label.toUpperCase()), readouts[key]),
      input);
  };

  representationInput.addEventListener('input', () => {
    p.representationInput = representationInput.value;
    try {
      const parsed = parseColorRepresentation(p.representation, representationInput.value);
      const conversion = runtime.convertColor(parsed, 'hsl');
      const hsl = conversion.value;
      p.h = Number(hsl.h); p.s = Number(hsl.s) * 100; p.l = Number(hsl.l) * 100; p.alpha = Number(hsl.alpha ?? 1);
      representationInput.setAttribute('aria-invalid', 'false');
      showError(); sync('representation', conversion);
    } catch (error) {
      representationInput.setAttribute('aria-invalid', 'true');
      showError(error instanceof Error ? error.message : 'The colour representation is invalid.');
    }
  });
  nativeInput.addEventListener('input', () => {
    const conversion = runtime.convertColor({ space: 'hex', value: nativeInput.value }, 'hsl');
    const hsl = conversion.value;
    p.h = Number(hsl.h); p.s = Number(hsl.s) * 100; p.l = Number(hsl.l) * 100;
    showError(); sync();
  });
  contrastInput.addEventListener('input', () => { p.contrastBackground = contrastInput.value.slice(0, 9); contrastSummary(pickerColor()); });
  const jump = (hex: string): void => {
    const conversion = runtime.convertColor({ space: 'hex', value: hex }, 'hsl');
    const hsl = conversion.value;
    p.h = Number(hsl.h); p.s = Number(hsl.s) * 100; p.l = Number(hsl.l) * 100; p.alpha = Number(hsl.alpha ?? 1);
    showError(); sync();
  };

  const representationTabs = h('div', { class: 'color-space-tabs', role: 'tablist', 'aria-label': 'Colour representation' },
    ...APPEARANCE_COLOR_SPACES.map((space) => h('button', {
      class: `chip${p.representation === space ? ' active' : ''}`, role: 'tab', 'aria-selected': String(p.representation === space),
      onclick: () => { p.representation = space; showError(); render(); },
    }, space.toUpperCase())));

  const dialog = dialogShell(`Colour \u00b7 ${p.label}`, 'Infinite colour picker', [
    h('div', { class: 'picker-preview' }, chip, h('div', { style: 'flex:1;min-width:0' }, hexLabel, hslLabel)),
    h('div', { class: 'grid2' },
      slider('Hue', 'h', 360, 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)'),
      slider('Saturation', 's', 100, 'linear-gradient(90deg,#888,#888)'),
      slider('Lightness', 'l', 100, 'linear-gradient(90deg,#000,#888,#fff)'),
      slider('Alpha', 'alpha', 100, 'linear-gradient(90deg,transparent,#000)')),
    h('div', { class: 'field color-translator' }, 'COLOUR TRANSLATOR', representationTabs,
      h('label', { class: 'field' }, `${p.representation.toUpperCase()} VALUE · MAXIMUM ${COLOR_TRANSLATOR_INPUT_LIMIT} CHARACTERS`, representationInput)),
    errorFeedback,
    gamutFeedback,
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, 'SYSTEM PICKER \u2014 FULL SPECTRUM', nativeInput),
      h('label', { class: 'field' }, 'CONTRAST BACKGROUND \u2014 HEX OR HEX8', contrastInput)),
    contrastFeedback,
    h('div', { class: 'field' }, 'PRESET STARTING POINTS \u2014 NOT A LIMIT',
      h('div', { class: 'chips' }, ...SELECTION_COLORS.map(([name, sw]) => h('button', {
        class: 'swatch', title: name, style: `--sw:${sw}`, onclick: () => jump(sw),
      })))),
    p.recents.length
      ? h('div', { class: 'field' }, 'RECENT',
        h('div', { class: 'chips' }, ...p.recents.map((c) => h('button', {
          class: 'swatch', title: c, style: `--sw:${c}`, onclick: () => jump(c),
        }))))
      : null,
  ], [
    h('button', { class: 'btn text', onclick: closeDialog }, 'Cancel'),
    h('button', { class: 'btn tonal', onclick: () => { const value = formatColorValue(runtime.convertColor(pickerColor(), p.representation).value); void navigator.clipboard?.writeText(value); snack(`Copied the ${p.representation.toUpperCase()} value.`); } }, `Copy ${p.representation.toUpperCase()}`),
    h('button', { class: 'btn filled', onclick: () => applyPickedColor(String(runtime.convertColor(pickerColor(), 'hex').value.value)) }, 'Apply colour'),
  ], true);

  sync();
  return dialog;
}

function gateDialog(): HTMLElement {
  const g = state.gate;
  const armed = g.left && g.right;
  const fill = h('i', { style: `width:${g.slider}%` });
  const authorize = h('button', {
    class: 'btn danger', disabled: !(armed && g.slider >= 100),
    onclick: () => { record('authorized', g.action); if (g.kind) void runNow(g.kind, g.ids ?? [...state.selected]); else g.after?.(); closeDialog(); },
  }, 'Authorize');
  const hint = h('p', { style: 'font-size:12px;color:var(--md-sys-color-on-surface-variant);margin:0' },
    armed ? 'Both keys are held. Drag the slider the whole way.' : 'Hold both keys to arm the slider.');
  const slider = h('input', {
    type: 'range', min: '0', max: '100', value: String(g.slider), disabled: !armed, style: 'width:100%',
    // Updated in place: re-rendering here would replace the input mid-drag.
    oninput: (e: Event) => {
      g.slider = Number((e.target as HTMLInputElement).value);
      fill.style.width = `${g.slider}%`;
      const ready = g.left && g.right && g.slider >= 100;
      (authorize as HTMLButtonElement).disabled = !ready;
      hint.textContent = ready ? 'Released at the far end. Authorize is live.' : 'Keep dragging to the far end.';
    },
  });
  const key = (side: 'left' | 'right', label: string): HTMLElement => {
    const btn = h('button', { class: g[side] ? 'armed' : '' }, label);
    btn.addEventListener('click', () => {
      g[side] = !g[side];
      btn.className = g[side] ? 'armed' : '';
      const nowArmed = g.left && g.right;
      (slider as HTMLInputElement).disabled = !nowArmed;
      if (!nowArmed) { g.slider = 0; (slider as HTMLInputElement).value = '0'; fill.style.width = '0%'; }
      (authorize as HTMLButtonElement).disabled = !(nowArmed && g.slider >= 100);
      hint.textContent = nowArmed ? 'Both keys are held. Drag the slider the whole way.' : 'Hold both keys to arm the slider.';
    });
    return btn;
  };
  return dialogShell('Safety gate', g.action, [
    h('p', { style: 'font-size:13px;color:var(--md-sys-color-on-surface-variant)' },
      'This action changes system state. Hold both keys, then drag the slider the whole way. The emergency exit always cancels.'),
    h('div', { class: 'keyrow' }, key('left', 'Press A'), key('right', 'Press L')),
    slider,
    h('div', { class: 'gate-track' }, fill),
    hint,
  ], [
    h('button', { class: 'btn outlined', onclick: closeDialog }, 'Emergency exit'),
    authorize,
  ]);
}

function aboutDialog(): HTMLElement {
  const displayName = scheduledDisplayName();
  return dialogShell('Pure Electron · TypeScript · Material 3', `About ${displayName}`, [
    h('p', {}, 'A Material Design 3 desktop interface for the open-source WinUtil catalogue. Package actions use exact WinGet identifiers; higher-risk operations remain unavailable until their verified adapter is installed.'),
    h('div', { class: 'listbox', style: 'margin-top:14px' },
      h('div', { class: 'row' }, h('span', { class: 'primary' }, 'Applications'), h('span', { class: 'snippet' }, `${state.catalog.apps.length} from config/applications.json`)),
      h('div', { class: 'row' }, h('span', { class: 'primary' }, 'Tweaks'), h('span', { class: 'snippet' }, `${state.catalog.tweaks.length} from config/tweaks.json`)),
      h('div', { class: 'row' }, h('span', { class: 'primary' }, 'Features'), h('span', { class: 'snippet' }, `${state.catalog.features.length} from config/feature.json`)),
      h('div', { class: 'row' }, h('span', { class: 'primary' }, 'Runtime'), h('span', { class: 'snippet' }, `Electron · ${bridge().platform}`))),
    h('p', { style: 'margin-top:14px' }, 'The app launches without administrator rights. Windows may request elevation only when a selected package operation requires it.'),
  ], [h('button', { class: 'btn filled', onclick: closeDialog }, 'Close')]);
}

/* ------------------------------------------------------------------ boot -- */

function bindShortcuts(): void {
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'f' && e.shiftKey && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openDialog('palette'); }
    else if (e.key.toLowerCase() === 'f' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $<HTMLInputElement>('.searchbar input')?.focus(); }
    else if (e.key === 'Escape') { if (state.dialog) closeDialog(); else if (state.search.text) { state.search.text = ''; render(); } }
  });
  window.addEventListener('contextmenu', (e) => {
    if (!e.shiftKey) return;
    const tab = (e.target as HTMLElement).closest('.wtab');
    if (!tab) return;
    e.preventDefault();
    openAppearance('tab-direct', 'Tab (Shift+right-click)');
  });
}

async function boot(): Promise<void> {
  const saved = await bridge().readPrefs();
  state.prefs = { ...DEFAULT_PREFS, ...saved };
  try { acceptSettingsSurface(await bridge().settingsSurfaceState()); }
  catch {
    state.settingsSurface = {
      displayName: { schemaVersion: 1, displayName: 'Material System Utility' },
      dialogEmoji: { schemaVersion: 1, showEmojisInDialogsAndMessageBoxes: true },
      dialogDecorations: { information: null, success: null, warning: null, error: null, destructive: null, security: null },
      schoolMode: { status: 'unavailable', code: 'shared-store-unavailable', cause: 'read-failed', eventGeneration: 0, recordGeneration: null },
    };
  }
  bridge().onSettingsSurfaceState((next) => { acceptSettingsSurface(next); render(); });
  try { acceptScheduledSettings(await bridge().scheduledSettingsState()); }
  catch { state.schedule.error = 'Scheduled settings could not be loaded.'; }
  bridge().onScheduledSettingsState((next) => { acceptScheduledSettings(next); render(); });
  bindPlatformNarration();
  try { state.narration = { ...state.narration, ...await bridge().narrationState() }; } catch { state.narration.platformSpeechAvailable = false; }
  await loadPersonalVocabulary();
  try { state.profiles = JSON.parse(localStorage.getItem('winutil.profiles') ?? '[]'); } catch { state.profiles = []; }
  loadWorkspace();
  workspaceReady = true;
  try {
    state.locks.tickets = JSON.parse(localStorage.getItem('material-system-utility.support-tickets.v1') ?? '[]') as typeof state.locks.tickets;
  } catch { state.locks.tickets = []; }
  try {
    state.locks.data = await bridge().lockState('main');
    syncWorkspaceLockState();
  } catch (error) { state.locks.error = error instanceof Error ? error.message : 'Locks could not be loaded.'; }
  bindShortcuts();
  bridge().onProgress((p) => {
    state.queue = { active: p.state !== 'done', index: p.index, total: p.total, current: p.detail || p.id, log: state.queue.log };
    render();
  });
  bridge().onUpdateStatus((status) => {
    state.update = status;
    render();
    narrateFact('update', `Update status ${status.state}: ${status.message}`, `更新狀態 ${status.state}：${status.message}`, status.state === 'error' ? 'error' : 'event');
  });
  render();
  try {
    state.catalog = await bridge().loadCatalog();
  } catch {
    snack('Could not load the WinUtil configuration.');
  }
  try { state.offlineDocs = await bridge().loadOfflineDocs(); }
  catch (error) { state.offlineDocsError = error instanceof Error ? error.message : 'The offline documentation bundle could not be verified.'; }
  try { state.update = await bridge().updateStatus(); } catch { /* development/browser preview */ }
  try { state.history = (await bridge().history()).reverse(); } catch { state.history = []; }
  await refreshHistoryAccess();
  if (state.historyAccess.unlocked) await refreshGitHistory();
  render();
  narrateFact('startup', NARRATOR_COPY.English.startup, NARRATOR_COPY.Yue.startup);
}

void boot();
