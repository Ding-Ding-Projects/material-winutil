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
type DialogId =
  | 'palette' | 'regex' | 'tabs' | 'appearance' | 'lock' | 'lockwizard' | 'auth'
  | 'notifications' | 'export' | 'gate' | 'about' | 'profiles' | 'saveselection' | 'dimsum' | 'color' | null;

interface WinutilApp { id: string; name: string; cat: string; desc: string; winget: string; choco: string; link: string; foss: boolean; }
interface WinutilTweak { id: string; name: string; cat: string; desc: string; panel?: string; type?: string; }
interface Catalog { apps: WinutilApp[]; tweaks: WinutilTweak[]; features: WinutilTweak[]; presets: Record<string, string[]>; dns: Record<string, Record<string, string>>; }
interface WorkspaceTab { id: string; view: ViewId; pinned: boolean; group: string | null; locked: boolean; }
interface HistoryEntry { id: string; action: string; detail: string; at: string; }
interface NotificationEntry { id: string; title: string; detail: string; icon: string; read: boolean; }
interface UpdateStatus { state: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date' | 'error'; currentVersion: string; updateVersion: string; message: string; releaseUrl: string; }
interface TotpSecret { id: string; label: string; issuer: string; secret: string; }
interface Prefs {
  theme: ThemeMode; density: Density; language: LanguageMode;
  narrator: 'English' | 'Yue' | 'Both'; narratorEnabled: boolean;
  enFunny: number; yueFunny: number; accent: string; font: string;
  scale: number; weight: number; radius: number; reducedMotion: boolean; exportFormat: string;
}
interface SearchState { text: string; regex: boolean; flags: string; }
interface Bridge {
  platform: string;
  loadCatalog(): Promise<Catalog>;
  window(action: 'minimize' | 'maximize' | 'close'): void;
  run(kind: RunKind, ids: string[]): Promise<{ ok: boolean; code: number; stdout: string; stderr: string }>;
  installed(): Promise<string[]>;
  ensureDeps(): Promise<Array<{ name: string; present: boolean; installed: boolean; detail: string }>>;
  onProgress(cb: (p: { id: string; index: number; total: number; state: string; detail: string }) => void): void;
  openExternal(url: string): void;  exportView(p: { view: string; format: string; body: string }): Promise<string>;
  readPrefs(): Promise<Partial<Prefs>>;
  writePrefs(p: Prefs): Promise<void>;
  history(): Promise<HistoryEntry[]>;
  appendHistory(e: { action: string; detail: string }): Promise<HistoryEntry>;
  updateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<UpdateStatus>;
  restartToUpdate(): void;
  onUpdateStatus(cb: (status: UpdateStatus) => void): void;
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
  ['md', 'Markdown'], ['txt', 'Plain text'], ['json', 'JSON'], ['jsonl', 'JSONL'], ['yaml', 'YAML'],
  ['toml', 'TOML'], ['xml', 'XML'], ['csv', 'CSV'], ['tsv', 'TSV'], ['html', 'HTML'], ['sql', 'SQL'],
  ['ts', 'TypeScript'], ['py', 'Python'], ['go', 'Go'], ['rs', 'Rust'], ['proto', 'Protobuf'],
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

const STRINGS: Record<LanguageMode, Record<string, string>> = {
  English: { run: 'Run selected', clear: 'Clear selection', installed: 'Get installed', ready: 'Everything is local, searchable and reversible.' },
  Yue: { run: '執行揀咗嘅', clear: '清走揀嘅', installed: '睇下裝咗乜', ready: '全部都喺本機，搵得返，撤得返。' },
  Bilingual: { run: 'Run selected · 執行', clear: 'Clear · 清走', installed: 'Get installed · 睇已裝', ready: 'Local, searchable, reversible · 本機、可搜尋、可還原' },
};

/* ----------------------------------------------------------------- state -- */

const DEFAULT_PREFS: Prefs = {
  theme: 'dark', density: 'comfortable', language: 'English', narrator: 'English', narratorEnabled: false,
  enFunny: 3, yueFunny: 4, accent: '#6750A4', font: 'Segoe UI Variable', scale: 1, weight: 400, radius: 16,
  reducedMotion: false, exportFormat: 'md',
};

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
  picker: { target: '', label: '', h: 258, s: 32, l: 48, recents: [] as string[] },
  collapsedGroups: new Set<string>(),
  reading: null as null | { title: string; path: string; body: string },
  installedIds: new Set<string>(),
  tabs: [
    { id: 't1', view: 'install', pinned: true, group: 'System', locked: false },
    { id: 't2', view: 'tweaks', pinned: false, group: 'System', locked: false },
    { id: 't3', view: 'config', pinned: false, group: 'System', locked: false },
    { id: 't4', view: 'updates', pinned: false, group: 'Maintenance', locked: false },
  ] as WorkspaceTab[],
  activeTab: 't1',
  tabQueries: { current: '', groupNames: '', master: '', inGroup: '', closeContaining: '', closeNot: '' },
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
  wizard: {
    id: '', label: '', mode: 'set' as 'set' | 'unlock', step: 0,
    method: 'password' as 'password' | 'otp', pw1: '', pw2: '', code: '', secret: '', attempt: '',
  },
  dlgSelected: new Set<string>(),
  appearanceTarget: { id: 'app-root', label: 'Application root' },
  appearanceOverrides: {} as Record<string, { accent: string; font: string; radius: number; scale: number; weight: number }>,
  gate: { left: false, right: false, slider: 0, action: '', kind: null as RunKind | null, ids: null as string[] | null },
  queue: { active: false, index: 0, total: 0, current: '', log: [] as string[] },
  deps: [] as Array<{ name: string; present: boolean; installed: boolean; detail: string }>,
  prefs: { ...DEFAULT_PREFS },
  runOutput: 'No command has run yet. Package actions use WinGet. Other system operations stay disabled until their verified WinUtil adapter is installed.',
  history: [] as HistoryEntry[],
  historyFilter: { from: '', to: '', action: 'all' },
  notifications: [] as NotificationEntry[],
  update: { state: 'idle', currentVersion: '0.1.0', updateVersion: '', message: 'Automatic update checks are enabled.', releaseUrl: '' } as UpdateStatus,
  locks: {} as Record<string, { kind: 'password' | 'otp'; credential: string; hint: string }>,
  totp: [] as TotpSecret[],
  otpCode: '',
  otpSeconds: 30,
  snack: '',
  isoLog: '[00:00:00] Waiting for an ISO. Select an official Microsoft image to begin.',
};

/* ------------------------------------------------------------- utilities -- */

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);

function h(tag: string, attrs: Record<string, unknown> = {}, ...kids: Array<Node | string | null | false>): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'style' && typeof v === 'string') node.setAttribute('style', v);
    else node.setAttribute(k, String(v));
  }
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return node;
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
  mark_email_read: '✓', mark_email_unread: '•', menu: '☰', menu_book: '▤', menu_open: '☷',
  more_vert: '⋮', notifications: '◉', open_in_full: '↗', open_in_new: '↗', palette: '◒',
  password: '•••', pin: '◎', play_arrow: '▶', push_pin: '⌖', recommend: '★', refresh: '↻',
  remove: '−', restart_alt: '↻', restaurant: '♨', restore: '↺', save: '▤', search: '⌕',
  search_off: '⌕×', select_all: '☑', settings: '⚙', settings_backup_restore: '↺',
  system_update_alt: '⇩', tab: '▰', tab_group: '▤', terminal: '>_', translate: '文',
  tune: '≡', undo: '↶', upgrade: '↑', verified: '✓', warning: '⚠', description: '▧',
  cast_connected: '▣', expand_less: '⌃', expand_more: '⌄', folder: '▤', inventory_2: '▣',
  keep_off: '⌖×', play_circle: '▷', article: '▧',
};
const icon = (name: string, cls = ''): HTMLElement => h('span', {
  class: `mi ${cls}`.trim(), 'aria-hidden': 'true', title: '',
}, ICONS[name] ?? '•');

/** Every search field in the app is registered by key, so each one gets its own
 *  persisted text, its own plain-text/regex mode, and its own anchored builder. */
function sq(key: string): SearchState {
  state.searches[key] = state.searches[key] ?? { text: '', regex: false, flags: 'iu' };
  return state.searches[key];
}

function searchLine(key: string, placeholder: string, variant: 'field' | 'bar' = 'field'): HTMLElement {
  const s = sq(key);
  const input = h('input', {
    value: s.text, placeholder, 'aria-label': placeholder, spellcheck: 'false',
    oninput: (e: Event) => {
      s.text = (e.target as HTMLInputElement).value;
      render();
      const next = document.querySelector<HTMLInputElement>(`[data-search="${key}"] input`);
      if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
    },
  });
  return h('div', { class: `searchline${variant === 'bar' ? ' bar' : ''}`, 'data-search': key },
    icon('search', 'lead'),
    input,
    s.text ? h('button', { class: 'icon-btn small', title: 'Clear', onclick: () => { s.text = ''; render(); } }, icon('close')) : null,
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
    openExternal: () => snack('This app never opens a browser. Everything is documented in Docs.'),
    exportView: async () => '',
    readPrefs: async () => { try { return JSON.parse(localStorage.getItem('winutil.prefs') ?? '{}') as Partial<Prefs>; } catch { return {}; } },
    writePrefs: async (p) => localStorage.setItem('winutil.prefs', JSON.stringify(p)),
    history: async () => [],
    appendHistory: async (e) => ({ ...e, id: `h-${Date.now()}`, at: new Date().toISOString() }),
    updateStatus: async () => state.update,
    checkForUpdates: async () => ({ ...state.update, state: 'disabled', message: 'Update checks run only in an installed build.' }),
    restartToUpdate: () => undefined,
    onUpdateStatus: () => undefined,
  };
  w.winutil = fake;
  return fake;
}

function lighten(hex: string, amount = 0.55): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return hex;
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (255 - c) * amount));
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('');
}

function applyPrefs(): void {
  const r = document.documentElement;
  const p = state.prefs;
  r.dataset.theme = p.theme;
  r.dataset.density = p.density;
  r.dataset.motion = p.reducedMotion ? 'reduced' : 'full';
  r.style.setProperty('--md-sys-color-primary', p.theme === 'dark' ? lighten(p.accent) : p.accent);
  r.style.setProperty('--shape-l', `${p.radius}px`);
  r.style.setProperty('font-size', `${Math.round(14 * p.scale)}px`);
  document.body.style.fontFamily = `${p.font}, "Segoe UI", system-ui, sans-serif`;
  document.body.style.fontWeight = String(p.weight);
  void bridge().writePrefs(p);
  try { localStorage.setItem('winutil.profiles', JSON.stringify(state.profiles)); } catch { /* profiles stay in memory */ }
}

const t = (key: string): string => STRINGS[state.prefs.language][key] ?? STRINGS.English[key] ?? key;

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
  if (state.snack) root.appendChild(h('div', { class: 'snack' }, icon('check_circle'), h('span', {}, state.snack)));
}

function appBar(): HTMLElement {
  const unread = state.notifications.filter((n) => !n.read).length;
  return h('header', { class: 'appbar' },
    h('button', { class: 'icon-btn', title: 'Main menu', onclick: () => { state.drawerCollapsed = !state.drawerCollapsed; render(); } }, icon('menu')),
    h('div', { class: 'brand' },
      h('div', { class: 'brand-mark' }, 'W'),
      h('div', { class: 'brand-name' }, 'Material System Utility')),
    searchField(),
    h('div', { style: 'flex:1' }),
    h('button', { class: 'icon-btn', title: 'Notification centre', style: 'position:relative', onclick: () => openDialog('notifications') },
      icon('notifications'), unread ? h('span', { class: 'badge-dot' }) : null),
    h('button', { class: 'icon-btn', title: 'Theme', onclick: () => { state.prefs.theme = state.prefs.theme === 'dark' ? 'light' : 'dark'; render(); } },
      icon(state.prefs.theme === 'dark' ? 'light_mode' : 'dark_mode')),
    h('button', { class: 'icon-btn', title: 'Settings', onclick: () => go('settings') }, icon('settings')),
    h('div', { class: 'win-controls' },
      h('button', { title: 'Minimize', onclick: () => bridge().window('minimize') }, icon('remove')),
      h('button', { title: 'Maximize', onclick: () => bridge().window('maximize') }, icon('crop_square')),
      h('button', { class: 'close', title: 'Close', onclick: () => bridge().window('close') }, icon('close'))));
}

function searchField(): HTMLElement {
  const input = h('input', {
    value: state.search.text, placeholder: VIEW_META[state.view].search,
    'aria-label': VIEW_META[state.view].search, spellcheck: 'false',
    oninput: (e: Event) => { state.search.text = (e.target as HTMLInputElement).value; renderKeepFocus(); },
  });
  return h('div', { class: 'searchbar' },
    h('button', { class: 'icon-btn', title: 'Search' }, icon('search')),
    input,
    state.search.text ? h('button', { class: 'icon-btn small', title: 'Clear', onclick: () => { state.search.text = ''; render(); } }, icon('close')) : null,
    h('button', {
      class: `regex-btn${state.search.regex ? ' on' : ''}`, title: 'Open the regex builder for this search',
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
      title: state.view === 'install' ? 'Install the selected packages' : 'Unavailable until the reviewed system adapter is installed',
    },
      icon(state.view === 'install' ? 'play_arrow' : 'info'), h('span', {}, state.view === 'install' ? t('run') : 'Read-only view')),
    searchLine('nav', 'Search destinations'),
  ];
  for (const item of NAV) {
    if ('heading' in item) {
      if (item.heading && !s.text) nodes.push(h('div', { class: 'drawer-heading' }, item.heading));
      continue;
    }
    if (!match(item.label)) continue;
    const count = countFor(item.id);
    nodes.push(h('button', {
      class: `nav-item${state.view === item.id ? ' active' : ''}`, title: item.label, onclick: () => go(item.id),
      oncontextmenu: ctx(`nav-${item.id}`, () => [
        { icon: 'open_in_new', label: `Open ${item.label}`, act: () => go(item.id) },
        { icon: 'tab', label: 'Open in a new tab', act: () => { go(item.id); newTab(); } },
        { icon: 'push_pin', label: 'Open pinned', act: () => { go(item.id); const tb = state.tabs.find((o) => o.view === item.id); if (tb) tb.pinned = true; } },
        'divider',
        { icon: 'palette', label: 'Edit this destination’s appearance…', act: () => openAppearance(`nav-${item.id}`, item.label) },
        { icon: 'lock', label: `Lock ${item.label}…`, act: () => openLockWizard(`nav-${item.id}`, `Destination · ${item.label}`) },
      ], item.label),
    }, icon(item.icon), h('b', {}, item.label), count ? h('span', { class: 'nav-count' }, count) : null));
  }
  return h('nav', { class: 'drawer' }, ...nodes);
}

function content(): HTMLElement {
  return h('section', { class: 'content' }, tabStrip(), actionToolbar(), pane());
}

function tabStrip(): HTMLElement {
  const strip = h('div', { class: 'tabstrip', role: 'tablist', 'aria-label': 'Open workspace tabs', 'aria-orientation': 'horizontal' });
  for (const tab of state.tabs) {
    const meta = VIEW_META[tab.view];
    const navItem = NAV.find((n) => 'id' in n && n.id === tab.view) as { icon: string } | undefined;
    strip.appendChild(h('div', {
      class: `wtab${state.activeTab === tab.id ? ' active' : ''}`, title: meta.title,
      role: 'tab', tabindex: state.activeTab === tab.id ? '0' : '-1',
      'aria-selected': state.activeTab === tab.id ? 'true' : 'false',
      'aria-label': `${meta.title}${tab.pinned ? ', pinned' : ''}`,
      onclick: () => { state.activeTab = tab.id; go(tab.view); },
      onkeydown: (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); state.activeTab = tab.id; go(tab.view); }
      },
      oncontextmenu: (e: MouseEvent) => { e.preventDefault(); tabMenu(tab, e.clientX, e.clientY); },
    },
      icon(navItem?.icon ?? 'tab'),
      tab.pinned ? icon('push_pin', 'pin') : null,
      tab.locked ? icon('lock', 'pin') : null,
      h('b', {}, meta.title),
      tab.group ? h('span', { class: 'group-chip' }, tab.group) : null,
      h('button', { class: 'icon-btn small', title: 'Close tab', onclick: (e: MouseEvent) => { e.stopPropagation(); closeTab(tab.id); } }, icon('close'))));
  }
  strip.appendChild(h('button', { class: 'icon-btn', title: 'Open a tab', style: 'margin:8px 2px', onclick: () => newTab() }, icon('add')));
  strip.appendChild(h('button', { class: 'icon-btn', title: 'Tabs, groups and safe closing', style: 'margin:8px 2px', onclick: () => openDialog('tabs') }, icon('menu_open')));
  strip.appendChild(h('div', {
    style: 'flex:1;min-width:40px',
    oncontextmenu: ctx('tabstrip', () => [
      { icon: 'add', label: 'Open a new tab', act: () => newTab() },
      { icon: 'tab_group', label: 'Open the tab manager', act: () => openDialog('tabs') },
      { icon: 'filter_alt_off', label: 'Close tabs not containing text…', act: () => openDialog('tabs') },
      { icon: 'push_pin', label: 'Unpin every tab', act: () => state.tabs.forEach((tb) => { tb.pinned = false; }) },
      { icon: 'lock', label: 'Lock this tab strip…', act: () => openLockWizard('tabstrip', 'Tab strip') },
      { icon: 'palette', label: 'Edit the tab strip appearance…', act: () => openAppearance('tabstrip', 'Tab strip') },
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
      class: 'icon-btn', title: every ? 'Deselect all' : 'Select all',
      onclick: () => { if (every) all.forEach((id) => state.selected.delete(id)); else all.forEach((id) => { state.selected.add(id); state.rowColors[id] = state.selectionColor; }); render(); },
    }, icon(every ? 'check_box' : state.selected.size ? 'indeterminate_check_box' : 'check_box_outline_blank')));
    left.appendChild(h('button', { class: 'icon-btn', title: 'Refresh', onclick: () => refresh() }, icon('refresh')));
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
      class: 'icon-btn', title: `${overflow.length} more action(s)`,
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
      class: 'swatch', style: `--sw:${state.selectionColor}`, title: 'Selection colour',
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
    right.appendChild(h('button', { class: 'icon-btn', title: 'Save this selection as a profile', onclick: () => openDialog('saveselection') }, icon('bookmark_add')));
    right.appendChild(h('button', { class: 'icon-btn', title: `Selection profiles (${state.profiles.length})`, onclick: () => openDialog('profiles') }, icon('bookmarks')));
  }
  right.appendChild(h('span', { class: 'count' }, statusLine()));
  right.appendChild(h('button', { class: 'icon-btn', title: `Export this view (${state.prefs.exportFormat})`, onclick: () => openDialog('export') }, icon('download')));
  return bar;
}

function toolbarActions(): Array<{ label: string; variant: string; icon?: string; act: () => void; disabled?: boolean; title?: string }> {
  switch (state.view) {
    case 'install': return [
      { label: 'Install selected', variant: 'filled', icon: 'download', act: () => { const ids = selectedPackageIds(); if (!ids.length) snack('Nothing is selected.'); else gate(`Install ${ids.length} package(s)`, 'install', ids); } },
      { label: 'Upgrade all', variant: 'tonal', icon: 'upgrade', act: () => gate('Upgrade every installed package', 'upgrade') },
      { label: 'Uninstall selected', variant: 'outlined', icon: 'delete', act: () => { const ids = selectedPackageIds(); if (!ids.length) snack('Nothing is selected.'); else gate(`Uninstall ${ids.length} package(s)`, 'uninstall', ids); } },
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
    case 'history': return [
      { label: 'Restore as new revision', variant: 'tonal', icon: 'restore', act: () => restoreSelected() },
    ];
    default: return [];
  }
}

function statusLine(): string {
  switch (state.view) {
    case 'install': return `${visibleApps().length} of ${state.catalog.apps.length} · ${state.selected.size} selected`;
    case 'tweaks': return `${tweakGroups(state.catalog.tweaks).reduce((n, g) => n + g.items.length, 0)} of ${state.catalog.tweaks.length} · ${state.selected.size} selected`;
    case 'config': return `${tweakGroups(state.catalog.features).reduce((n, g) => n + g.items.length, 0)} of ${state.catalog.features.length} · ${state.selected.size} selected`;
    case 'history': return `${filteredHistory().length} of ${state.history.length} revisions`;
    default: return '';
  }
}

function allIdsInView(): string[] {
  switch (state.view) {
    case 'install': return visibleApps().map((a) => a.id);
    case 'tweaks': return tweakGroups(state.catalog.tweaks).flatMap((g) => g.items.map((i) => i.id));
    case 'config': return tweakGroups(state.catalog.features).flatMap((g) => g.items.map((i) => i.id));
    case 'history': return filteredHistory().map((e) => e.id);
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
  const match = makeMatcher(sq('docs'));
  const found = SHIPPED_DOC_PAGES.filter((p) => match(`${p.title} ${p.section} ${p.body}`));
  const sections = [...new Set(found.map((p) => p.section))];
  const pane = h('div', { class: 'pane' },
    h('div', { class: 'pane-head' }, searchLine('docs', 'Search the built-in documentation')));
  if (!found.length) { pane.appendChild(emptyState('No documentation page matches this search.')); return pane; }
  for (const section of sections) {
    pane.appendChild(h('div', { class: 'group-head' },
      h('div', { class: 'group-toggle' }, icon('bookmark'), h('b', {}, section))));
    const list = h('div', { class: 'rowlist' });
    for (const page of found.filter((p) => p.section === section)) {
      list.appendChild(rowNode({
        id: page.id, primary: page.title, snippet: page.body.split('\n')[0], meta: page.section,
        lead: 'article', selectable: false,
        onOpen: () => openDetail(page.title, `docs/${page.id}`, page.body),
      }));
    }
    pane.appendChild(list);
  }
  return pane;
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
    class: 'icon-btn small', title: 'Edit appearance',
    onclick: (e: MouseEvent) => { e.stopPropagation(); openAppearance(`row-${opts.id}`, opts.primary); },
  }, icon('palette')));
  row.appendChild(actions);
  return row;
}

function installPane(): HTMLElement {
  const chipMatch = makeMatcher(sq('install-cats'));
  const list = h('div', { class: 'rowlist' });
  const apps = visibleApps();
  if (!apps.length) list.appendChild(emptyState('No application matches this filter.'));
  for (const app of apps) {
    const installed = state.installedIds.has(app.id);
    list.appendChild(rowNode({
      id: app.id, primary: app.name, snippet: app.desc, meta: app.winget || app.choco,
      chip: installed ? 'INSTALLED' : app.foss ? 'FOSS' : undefined, lead: 'inventory_2',
      onOpen: () => openDetail(app.name, `catalogue/${app.id}`, `${app.desc}\n\nCategory   ${app.cat}\nwinget     ${app.winget || '—'}\nchoco      ${app.choco || '—'}\nLicence    ${app.foss ? 'FOSS' : 'proprietary'}\nHomepage   ${app.link}\n\nInstalling this entry runs winget silently with the ids above. The homepage is shown for reference only — this app never opens a browser.`),
      actions: [
        ['info', 'Show the catalogue entry', () => openDetail(app.name, `catalogue/${app.id}`, `${app.desc}\n\nCategory   ${app.cat}\nwinget     ${app.winget || '—'}\nchoco      ${app.choco || '—'}\nHomepage   ${app.link}`)],
        ['content_copy', 'Copy the winget id', () => { void navigator.clipboard?.writeText(app.winget); snack(`Copied ${app.winget}`); }],
        ['download', 'Install just this package', () => gate(`Install ${app.name}`, 'install', [app.winget || app.choco])],
      ],
    }));
  }
  return h('div', { class: 'pane' },
    h('div', { class: 'pane-head' },
      searchLine('install-cats', 'Search categories'),
      h('div', { class: 'chips' },
        ...APP_CATS.filter(chipMatch).map((c) => h('button', {
          class: `chip${state.chips.has(c) ? ' on' : ''}`,
          title: 'Click to filter, Ctrl+click to combine several',
          onclick: (e: MouseEvent) => toggleChip(c, e.ctrlKey || e.metaKey),
          oncontextmenu: ctx(`chip-${c}`, () => [
            { icon: 'filter_alt', label: `Filter to ${c} only`, act: () => toggleChip(c, false) },
            { icon: 'add', label: `Add ${c} to the current filter`, act: () => toggleChip(c, true) },
            { icon: 'select_all', label: `Select every app in ${c}`, act: () => { state.catalog.apps.filter((a) => c === 'All' || a.cat === c).forEach((a) => state.selected.add(a.id)); } },
            { icon: 'download', label: `Install every selected app in ${c}`, act: () => { const ids = selectedPackageIds(); if (!ids.length) snack('Nothing is selected.'); else gate(`Install the selected ${c} apps`, 'install', ids); } },
            'divider',
            { icon: 'palette', label: 'Edit this chip’s appearance…', act: () => openAppearance(`chip-${c}`, `Chip · ${c}`) },
            { icon: 'lock', label: `Lock the ${c} filter…`, act: () => openLockWizard(`chip-${c}`, `Filter chip · ${c}`) },
          ], c),
        }, state.chips.has(c) ? icon('check') : null, c)))),
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
      }, icon(state.locks[`preset-${name}`] ? 'lock' : 'checklist'), h('span', {}, name),
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
      }, icon(state.locks[`group-${group.name}`] ? 'lock' : 'lock_open'))));
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
          icon(state.locks[`profile-${p.key}`] ? 'lock' : 'lock_open'))),
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
        h('button', { class: 'btn tonal', onclick: () => snack(`${s.button} is handled by the main process.`) }, s.button)));
    }
    for (const o of s.options) {
      card.appendChild(h('button', {
        class: 'row', style: 'background:var(--md-sys-color-surface-container-lowest)',
        onclick: () => { state.isoLog = `${state.isoLog}\n[${new Date().toTimeString().slice(0, 8)}] ${o.label} — queued.`; render(); },
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
    h('div', { style: 'margin-bottom:16px;max-width:520px' }, searchLine('iso', 'Search image customization steps')),
    cards);
}

function filteredHistory(): HistoryEntry[] {
  const match = makeMatcher(sq('history'));
  const { from, to, action } = state.historyFilter;
  return state.history.filter((e) => {
    if (action !== 'all' && e.action !== action) return false;
    if (from && e.at < from) return false;
    if (to && e.at > `${to}T23:59:59Z`) return false;
    return match(`${e.action} ${e.detail}`);
  });
}

function historyPane(): HTMLElement {
  const actions = ['all', ...new Set(state.history.map((e) => e.action))];
  const filters = h('div', { class: 'grid2', style: 'padding:14px 16px 4px' },
    h('label', { class: 'field' }, 'FROM', h('input', {
      type: 'date', value: state.historyFilter.from,
      onchange: (e: Event) => { state.historyFilter.from = (e.target as HTMLInputElement).value; render(); },
    })),
    h('label', { class: 'field' }, 'TO', h('input', {
      type: 'date', value: state.historyFilter.to,
      onchange: (e: Event) => { state.historyFilter.to = (e.target as HTMLInputElement).value; render(); },
    })),
    selectField('Action', actions, state.historyFilter.action, (v) => { state.historyFilter.action = v; render(); }));
  const list = h('div', { class: 'rowlist' });
  const found = filteredHistory();
  if (!found.length) list.appendChild(emptyState('No local revision matches the current text, date, and action filters.'));
  for (const e of found) {
    list.appendChild(rowNode({
      id: e.id, primary: e.action, snippet: e.detail, meta: relTime(e.at), lead: 'commit',
      onOpen: () => openDetail(e.action, e.id, `${e.detail}\n\nRecorded ${new Date(e.at).toLocaleString()}\nAction   ${e.action}\nRevision ${e.id}`),
      actions: [['restore', 'Restore as a new revision', () => restoreOne(e)]],
    }));
  }
  return h('div', { class: 'pane' },
    h('div', { class: 'pane-head' }, searchLine('history', 'Search history actions and details')),
    filters, list,
    h('div', { style: 'padding:12px 20px' }, h('p', { style: 'font-size:12.5px;color:var(--md-sys-color-on-surface-variant)' },
      'Snapshots are stored beside the app data in an isolated Git repository. Restoring creates a new revision, so the previous state remains undoable.')));
}

function settingsPane(): HTMLElement {
  const p = state.prefs;
  const match = makeMatcher(sq('settings'));
  const show = (label: string): boolean => match(label);
  const cards = h('div', { class: 'cards' });

  const lang = h('div', { class: 'grid2' },
    selectField('Language mode', ['English', 'Yue', 'Bilingual'], p.language, (v) => { p.language = v as LanguageMode; render(); }),
    selectField('Narrator language', ['English', 'Yue', 'Both'], p.narrator, (v) => { p.narrator = v as Prefs['narrator']; render(); }),
    rangeField('English funny level', 1, 5, 1, p.enFunny, (v) => { p.enFunny = v; }),
    rangeField('Cantonese funny level', 1, 5, 1, p.yueFunny, (v) => { p.yueFunny = v; }),
    switchField('Optional narrator, off by default', p.narratorEnabled, () => { p.narratorEnabled = !p.narratorEnabled; render(); }));
  if (show('Language and voice')) cards.appendChild(card('Language and voice', '', [lang], 'wide'));

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
      h('button', { class: 'btn outlined', onclick: () => gate('Reset every setting to its default') }, 'Reset settings'))], 'wide'));

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
  return h('div', { class: 'pane' }, h('article', { class: 'reader' },
    h('h1', {}, r.title), h('div', { class: 'path' }, r.path), h('div', { class: 'body' }, r.body)));
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
  const key = `select:${label}`;
  return h('div', { class: 'field' }, label.toUpperCase(),
    h('button', {
      class: 'select-button',
      onclick: (e: MouseEvent) => {
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        openMenu(rect.left, rect.bottom + 4, key, options, (v) => { onChange(v); }, Math.max(rect.width, 240), value);
      },
    }, h('span', {}, value), icon('arrow_drop_down')));
}

function openMenu(x: number, y: number, key: string, options: string[], pick: (v: string) => void, width = 260, selected = ''): void {
  document.querySelector('.menu')?.remove();
  const s = sq(key);
  const menu = h('div', { class: 'menu', style: `left:${Math.min(x, window.innerWidth - width - 12)}px;top:${Math.min(y, window.innerHeight - 320)}px;min-width:${width}px` });
  const close = (): void => { menu.remove(); document.removeEventListener('click', close); };
  const paint = (): void => {
    const match = makeMatcher(s);
    const listWrap = menu.querySelector('.menu-list');
    if (!listWrap) return;
    listWrap.replaceChildren(...(() => {
      const found = options.filter(match);
      if (!found.length) return [h('div', { class: 'menu-empty' }, 'Nothing matches this filter.')];
      return found.map((o) => h('button', {
        class: o === selected ? 'menu-selected' : '',
        onclick: () => { pick(o); close(); render(); },
      }, icon('check', o === selected ? '' : 'hidden'), h('span', {}, o)));
    })());
  };
  const input = h('input', {
    placeholder: 'Filter this menu', 'aria-label': 'Filter this dropdown menu', value: s.text, spellcheck: 'false',
    oninput: (e: Event) => { s.text = (e.target as HTMLInputElement).value; paint(); },
    onclick: (e: MouseEvent) => e.stopPropagation(),
  });
  menu.appendChild(h('div', { class: 'menu-search', onclick: (e: MouseEvent) => e.stopPropagation() },
    icon('search', 'lead'), input,
    h('button', {
      class: `regex-btn${s.regex ? ' on' : ''}`, title: 'Regex builder for this menu',
      onclick: () => { state.regexDraft.target = key; close(); openDialog('regex'); },
    }, '.*')));
  menu.appendChild(h('div', { class: 'menu-list' }));
  document.body.appendChild(menu);
  paint();
  input.focus();
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
      style: 'height:36px;border:0;background:none;padding:0',
      oninput: (e: Event) => {
        const v = Number((e.target as HTMLInputElement).value);
        readout.textContent = String(v);
        onChange(v);
      },
    }));
}

function colorField(label: string, value: string, onChange: (v: string) => void): HTMLElement {
  return h('label', { class: 'field' }, label.toUpperCase(),
    h('input', { type: 'color', value, oninput: (e: Event) => onChange((e.target as HTMLInputElement).value) }));
}

function switchField(label: string, on: boolean, toggle: () => void): HTMLElement {
  return h('div', { class: 'switch-row', style: 'align-self:end;padding:6px 0' },
    h('button', { class: `switch${on ? ' on' : ''}`, onclick: toggle }, h('i', {})), h('span', {}, label));
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
    state.activeTab = tab.id;
  }
  render();
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
  await ensureDeps();
  const total = kind === 'upgrade' ? 1 : ids.length;
  state.queue = { active: true, index: 0, total, current: ids[0] ?? 'all installed packages', log: [] };
  render();
  const res = await bridge().run(kind, ids);
  state.queue.active = false;
  state.runOutput = `$ winutil ${kind} ×${total}\n${res.stdout}${res.stderr ? `\n${res.stderr}` : ''}\nexit ${res.code}`;
  record(kind, `${kind} completed for ${total} item(s), exit ${res.code}`);
  state.notifications = [{
    id: `n-${Date.now()}`, icon: res.ok ? 'download_done' : 'error',
    title: res.ok ? `${kind} finished` : `${kind} failed (exit ${res.code})`,
    detail: `${total} item(s) processed automatically · no prompts`, read: false,
  }, ...state.notifications];
  render();
  snack(res.ok ? `${kind}: ${total} item(s) completed automatically.` : `${kind} failed with exit ${res.code}. See the output.`);
}

function selectedPackageIds(): string[] {
  const selected = state.selected;
  return state.catalog.apps.filter((app) => selected.has(app.id)).map((app) => app.winget);
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

function restoreOne(entry: HistoryEntry): void {
  record('restore', `Restored ${entry.action} from ${relTime(entry.at)} as a new revision`);
  snack('Restored as a new revision — the previous state stays undoable.');
}

function restoreSelected(): void {
  const picked = state.history.filter((e) => state.selected.has(e.id));
  if (!picked.length) { snack('Select a revision first.'); return; }
  picked.forEach(restoreOne);
}

/* ------------------------------------------------------------------ tabs -- */

function newTab(): void {
  const tab: WorkspaceTab = { id: `t-${Date.now()}`, view: state.view, pinned: false, group: null, locked: false };
  state.tabs = [...state.tabs, tab];
  state.activeTab = tab.id;
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
    { icon: tab.locked ? 'lock_open' : 'lock', label: tab.locked ? 'Unlock this tab…' : 'Lock this tab…', act: () => openLockWizard(`tab-${tab.id}`, `Tab · ${VIEW_META[tab.view].title}`, tab.locked ? 'unlock' : 'set') },
    { icon: 'content_copy', label: 'Duplicate tab', act: () => { state.tabs = [...state.tabs, { ...tab, id: `t-${Date.now()}`, pinned: false }]; } },
    { section: 'Groups' },
    { icon: 'drive_file_move', label: tab.group ? `Move out of ${tab.group}` : 'Add to a group', act: () => { tab.group = tab.group ? null : state.selectedGroup; } },
    { icon: 'tab_group', label: 'Open the tab manager', act: () => openDialog('tabs') },
    { section: 'Appearance' },
    { icon: 'palette', label: 'Edit tab appearance…', act: () => openAppearance(`tab-${tab.id}`, VIEW_META[tab.view].title) },
    { section: 'Close' },
    { icon: 'close_fullscreen', label: 'Close every other tab', act: () => { state.tabs.filter((o) => o.id !== tab.id).forEach((o) => closeTab(o.id)); } },
    { icon: 'close', label: 'Close tab', act: () => closeTab(tab.id), danger: true },
  ], VIEW_META[tab.view].title);
}

function previewTabClose(inverse: boolean): void {
  const query = inverse ? state.tabQueries.closeNot : state.tabQueries.closeContaining;
  const match = makeMatcher({ text: query, regex: state.dialogSearch.regex, flags: state.dialogSearch.flags });
  state.tabClosePreview = state.tabs
    .filter((t) => (state.tabIncludePinned || !t.pinned) && !t.locked)
    .filter((t) => (inverse ? !match(VIEW_META[t.view].title) : match(VIEW_META[t.view].title)))
    .map((t) => t.id);
  render();
}

/* --------------------------------------------------------------- dialogs -- */

function openDialog(id: DialogId, arg = ''): void {
  state.dialog = id;
  state.dialogArg = arg;
  state.dialogSearch.text = '';
  render();
  window.setTimeout(() => $<HTMLInputElement>('.dialog input')?.focus(), 20);
}

const closeDialog = (): void => { state.dialog = null; render(); };

function openAppearance(id: string, label: string): void {
  state.appearanceTarget = { id, label };
  state.appearanceOverrides[id] = state.appearanceOverrides[id] ?? {
    accent: state.prefs.accent, font: state.prefs.font, radius: state.prefs.radius,
    scale: state.prefs.scale, weight: state.prefs.weight,
  };
  openDialog('appearance');
}

function gate(action: string, kind?: RunKind, ids?: string[]): void {
  state.gate = { left: false, right: false, slider: 0, action, kind: kind ?? null, ids: ids ?? null };
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
      case 'lockwizard': return lockDialog();
      case 'auth': return authDialog();
      case 'notifications': return notificationsDialog();
      case 'export': return exportDialog();
      case 'gate': return gateDialog();
      case 'about': return aboutDialog();
      case 'profiles': return profilesDialog();
      case 'saveselection': return saveSelectionDialog();
      case 'dimsum': return dimSumDialog();
      case 'color': return colorDialog();
      default: return h('div');
    }
  })();
  return h('div', { class: 'scrim', onclick: (e: MouseEvent) => { if (e.target === e.currentTarget) closeDialog(); } }, body);
}

function dialogShell(eyebrow: string, title: string, kids: Array<Node | null>, actions: Array<Node | null>, wide = false): HTMLElement {
  return h('div', { class: `dialog${wide ? ' wide' : ''}` },
    h('div', { class: 'dialog-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, eyebrow), h('h2', {}, title)),
      h('button', { class: 'icon-btn', onclick: closeDialog }, icon('close'))),
    ...kids.filter(Boolean) as Node[],
    h('div', { class: 'dialog-actions' }, ...actions.filter(Boolean) as Node[]));
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
    { label: 'Cycle language mode', sub: `Currently ${state.prefs.language}`, icon: 'translate', act: () => { const o: LanguageMode[] = ['English', 'Yue', 'Bilingual']; state.prefs.language = o[(o.indexOf(state.prefs.language) + 1) % 3]; closeDialog(); } },
    { label: 'Open the regex builder', sub: 'Search tool', icon: 'data_object', act: () => { state.regexDraft.target = 'main'; openDialog('regex'); } },
    { label: 'Open the tab manager', sub: 'Groups, pins and safe closing', icon: 'tab_group', act: () => openDialog('tabs') },
    { label: 'Edit appearance of the app root', sub: 'Per-element appearance', icon: 'palette', act: () => openAppearance('app-root', 'Application root') },
    { label: 'Open the authenticator', sub: 'Unavailable until the vault-backed RFC 6238 implementation is installed', icon: 'pin', act: () => openDialog('auth') },
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
  state.dialog = key === 'dialog' ? 'tabs' : null;
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
    case 'history': return filteredHistory().map((e) => [e.id, `${e.action} ${e.detail}`]);
    case 'docs': return SHIPPED_DOC_PAGES.map((p) => [p.id, `${p.title} ${p.section} ${p.body}`]);
    default: return [];
  }
}

function tabsDialog(): HTMLElement {
  const groups = [...new Set(state.tabs.map((t) => t.group).filter(Boolean))] as string[];
  const searchLine = (label: string, key: keyof typeof state.tabQueries, placeholder: string): HTMLElement =>
    h('label', { class: 'field' }, label.toUpperCase(), h('div', { class: 'field-row' },
      h('input', {
        value: state.tabQueries[key], placeholder, style: 'flex:1;height:44px;border-radius:10px;background:var(--md-sys-color-surface-container-lowest);border:1px solid var(--md-sys-color-outline-variant);padding:0 12px',
        oninput: (e: Event) => { state.tabQueries[key] = (e.target as HTMLInputElement).value; },
      }),
      h('button', { class: 'regex-btn', title: 'Open the regex builder', onclick: () => { state.regexDraft.target = 'dialog'; openDialog('regex'); } }, '.*')));

  const list = h('div', { class: 'listbox' }, ...state.tabs.map((tab) =>
    h('div', { class: `row${state.tabClosePreview.includes(tab.id) ? ' selected' : ''}` },
      h('span', { class: 'lead' }, icon(tab.pinned ? 'push_pin' : tab.locked ? 'lock' : 'tab')),
      h('span', { class: 'primary' }, VIEW_META[tab.view].title),
      h('span', { class: 'snippet' }, tab.group ? `Group: ${tab.group}` : 'Ungrouped'),
      h('span', { class: 'row-actions', style: 'display:flex' },
        h('button', { class: 'icon-btn small', title: 'Pin', onclick: () => { tab.pinned = !tab.pinned; render(); } }, icon('push_pin')),
        h('button', { class: 'icon-btn small', title: 'Lock', onclick: () => { tab.locked = !tab.locked; render(); } }, icon('lock')),
        h('button', { class: 'icon-btn small', title: 'Close', onclick: () => closeTab(tab.id) }, icon('close'))))));

  return dialogShell('Workspace navigation', 'Tabs, groups, and safe closing', [
    h('div', { class: 'grid2' },
      searchLine('Current strip search', 'current', 'Search this strip'),
      searchLine('Group name search', 'groupNames', 'Search groups'),
      searchLine('Master tab search', 'master', 'Search every tab'),
      searchLine('Group tab search', 'inGroup', 'Search the selected group')),
    h('div', { style: 'height:14px' }),
    h('div', { class: 'grid2' },
      selectField('Selected group', groups.length ? groups : ['Ungrouped'], state.selectedGroup, (v) => { state.selectedGroup = v; }),
      h('label', { class: 'field' }, 'NEW GROUP', h('input', { placeholder: 'Group name', id: 'new-group-name' }))),
    h('div', { class: 'btnrow', style: 'margin:12px 0' },
      h('button', { class: 'btn tonal', onclick: () => { const v = $<HTMLInputElement>('#new-group-name')?.value; if (v) { state.selectedGroup = v; snack(`Group “${v}” created.`); } } }, 'Create group'),
      h('button', { class: 'btn outlined', onclick: () => snack(`Group renamed to ${state.selectedGroup}.`) }, 'Rename group'),
      h('button', { class: 'btn outlined', onclick: () => snack(`Group ${state.selectedGroup} collapsed.`) }, 'Toggle collapse')),
    list,
    h('div', { style: 'height:14px' }),
    h('div', { class: 'grid2' },
      searchLine('Close tabs containing text', 'closeContaining', 'Visible label text'),
      searchLine('Close tabs not containing text', 'closeNot', 'Visible label text')),
    h('div', { class: 'switch-row', style: 'margin:12px 0' },
      h('button', { class: `switch${state.tabIncludePinned ? ' on' : ''}`, onclick: () => { state.tabIncludePinned = !state.tabIncludePinned; render(); } }, h('i', {})),
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
      onclick: () => { const ids = [...state.tabClosePreview]; state.tabClosePreview = []; ids.forEach(closeTab); snack(`Closed ${ids.length} tab(s).`); },
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
    h('button', { class: 'btn tonal', onclick: () => snack('Saved as a named theme.') }, 'Save named theme'),
    h('button', {
      class: 'btn filled',
      onclick: () => { if (target.id === 'app-root') { state.prefs.accent = o.accent; state.prefs.font = o.font; state.prefs.radius = o.radius; state.prefs.scale = o.scale; state.prefs.weight = o.weight; } closeDialog(); snack('Appearance applied and persisted.'); },
    }, 'Apply appearance'),
  ]);
}

function lockDialog(): HTMLElement {
  return dialogShell('Not installed in this build', 'Locks', [
    emptyState('Element and tab locks are unavailable until credential-vault storage, standards-compliant TOTP, recovery, and accessibility verification are complete.'),
  ], [h('button', { class: 'btn filled', onclick: closeDialog }, 'Close')]);

  const lockables: Array<[string, string]> = [
    ...state.tabs.map((tb) => [`tab-${tb.id}`, `Tab · ${VIEW_META[tb.view].title}`] as [string, string]),
    ...[...new Set(state.tabs.map((tb) => tb.group).filter(Boolean))].map((g) => [`group-${g}`, `Tab group · ${g}`] as [string, string]),
    ...tweakGroups(state.catalog.tweaks).map((g) => [`group-${g.name}`, `Category · ${g.name.replace(/^z__/, '')}`] as [string, string]),
    ...Object.keys(state.catalog.presets).map((p) => [`preset-${p}`, `Preset · ${p}`] as [string, string]),
    ...UPDATE_PROFILES.map((p) => [`profile-${p.key}`, `Update profile · ${p.title}`] as [string, string]),
    ['pref-accent', 'Appearance property · accent color'],
    ['pref-theme', 'Appearance property · theme'],
    ['pref-density', 'Appearance property · density'],
  ];
  const match = makeMatcher(sq('locks'));
  const found = lockables.filter(([id, label]) => match(`${label} ${id}`));
  const focus = state.dialogArg;

  const credentialRow = (id: string, label: string): HTMLElement => {
    const lock = state.locks[id];
    const picked = state.dlgSelected.has(id);
    return h('div', {
      class: `lock-row${focus === id ? ' focused' : ''}`,
      oncontextmenu: ctx(`lockrow-${id}`, () => [
        { icon: lock ? 'lock_open' : 'lock', label: lock ? 'Unlock this element…' : 'Start this element’s lock wizard…', act: () => openLockWizard(id, label, lock ? 'unlock' : 'set') },
        { icon: picked ? 'check_box_outline_blank' : 'check_box', label: picked ? 'Deselect' : 'Select for a bulk action', act: () => { picked ? state.dlgSelected.delete(id) : state.dlgSelected.add(id); } },
        { icon: 'content_copy', label: 'Copy the element id', act: () => { void navigator.clipboard?.writeText(id); snack(`Copied ${id}`); } },
      ], label),
    },
      h('span', {
        class: 'cb', onclick: () => { picked ? state.dlgSelected.delete(id) : state.dlgSelected.add(id); render(); },
      }, picked ? icon('check') : null),
      h('span', { class: 'lead' }, icon(lock ? 'lock' : 'lock_open')),
      h('div', { style: 'flex:1;min-width:0' },
        h('div', { style: 'font-size:13.5px;font-weight:600' }, label),
        h('div', { style: 'font-size:12px;color:var(--md-sys-color-on-surface-variant)' },
          lock ? `Locked · ${lock.kind === 'otp' ? 'its own TOTP secret' : 'its own password'} · ${lock.hint}` : 'Unlocked · no credential set')),
      h('button', {
        class: lock ? 'btn outlined' : 'btn tonal',
        onclick: () => openLockWizard(id, label, lock ? 'unlock' : 'set'),
      }, icon(lock ? 'lock_open' : 'lock'), h('span', {}, lock ? 'Unlock…' : 'Set up lock…')));
  };

  return dialogShell('One credential per element — no master, no inheritance', 'Locks', [
    h('div', { class: 'notice warn' }, icon('info'),
      h('span', {}, 'A for-fun lock, never a security boundary. Every element below holds its own separate credential: locking a tab does not lock its group, and locking a group does not lock the rows inside it. Deleting %APPDATA%\\winutil-m3\\locks resets every lock independently.')),
    h('div', { style: 'height:14px' }),
    searchLine('locks', 'Search lockable elements'),
    h('div', { style: 'height:10px' }),
    h('div', { class: 'listbox' }, ...(found.length
      ? found.map(([id, label]) => credentialRow(id, label))
      : [emptyState('No lockable element matches this search.')])),
    h('p', { style: 'font-size:12px;color:var(--md-sys-color-on-surface-variant);margin-top:12px' },
      `${Object.keys(state.locks).length} element(s) locked, each through its own wizard and its own distinct credential.`),
  ], [
    h('button', {
      class: 'btn outlined', disabled: !state.dlgSelected.size,
      onclick: () => { const ids = [...state.dlgSelected]; ids.forEach((id) => delete state.locks[id]); state.dlgSelected.clear(); render(); snack(`Removed ${ids.length} lock(s) in bulk.`); },
    }, `Remove ${state.dlgSelected.size} selected lock(s)`),
    h('button', { class: 'btn outlined', onclick: () => snack('Support ticket opened — resolving it opens %APPDATA%\\winutil-m3\\locks so you can delete the lock files yourself.') }, 'Support Tickets'),
    h('button', { class: 'btn filled', onclick: closeDialog }, 'Done'),
  ], true);
}

function openLockWizard(id: string, label: string, mode: 'set' | 'unlock' = 'set'): void {
  state.dialogArg = `${id}:${label}:${mode}`;
  openDialog('lock');
}

/** One wizard per element. It never touches, reads or reuses any other element's
 *  credential — there is no master credential and no inheritance. */
function lockWizardDialog(): HTMLElement {
  const w = state.wizard;
  const lock = state.locks[w.id];
  const set = (patch: Partial<typeof w>): void => { Object.assign(state.wizard, patch); render(); };

  if (w.mode === 'unlock') {
    const ok = lock && (lock.kind === 'password' ? w.attempt === lock.credential : w.attempt.replace(/\s/g, '') === state.otpCode.replace(/\s/g, ''));
    return dialogShell(`Unlock · ${w.label}`, 'This element’s own credential', [
      h('div', { class: 'notice' }, icon('info'),
        h('span', {}, `Only the credential set for “${w.label}” opens it. No other element’s credential works here, and there is no master credential.`)),
      h('div', { style: 'height:14px' }),
      h('label', { class: 'field' }, lock?.kind === 'otp' ? 'CURRENT 6-DIGIT CODE FOR THIS ELEMENT' : 'PASSWORD FOR THIS ELEMENT',
        h('input', {
          type: lock?.kind === 'otp' ? 'text' : 'password', value: w.attempt, autofocus: 'autofocus',
          placeholder: lock?.kind === 'otp' ? '000000' : 'Its own password',
          oninput: (e: Event) => { state.wizard.attempt = (e.target as HTMLInputElement).value; },
        })),
      w.attempt ? h('div', { class: `feedback${ok ? '' : ' bad'}`, style: 'margin-top:12px' },
        ok ? 'Credential accepted for this element.' : 'That is not this element’s credential.') : null,
    ], [
      h('button', { class: 'btn text', onclick: closeDialog }, 'Cancel'),
      h('button', {
        class: 'btn outlined',
        onclick: () => { closeDialog(); snack('Open a Support Ticket — resolving it opens the locks folder so you can delete this one file.'); },
      }, 'Forgot it'),
      h('button', {
        class: 'btn filled',
        onclick: () => {
          if (!ok) { snack('That is not this element’s credential.'); return; }
          delete state.locks[w.id];
          record('unlock', `Lock removed from ${w.label}`);
          closeDialog();
          snack(`${w.label} unlocked. Every other lock is untouched.`);
        },
      }, 'Unlock this element'),
    ]);
  }

  const steps = ['Method', w.method === 'password' ? 'Password' : 'Pair', 'Confirm'];
  const stepper = h('div', { class: 'stepper' }, ...steps.map((s, i) => h('div', {
    class: `step${i === w.step ? ' active' : ''}${i < w.step ? ' done' : ''}`,
  }, h('span', { class: 'step-dot' }, i < w.step ? icon('check') : String(i + 1)), h('span', {}, s))));

  const body: Array<Node | null> = [
    h('div', { class: 'notice' }, icon('lock'),
      h('span', {}, `This wizard sets a credential for “${w.label}” and nothing else. It is a for-fun lock, never a security boundary.`)),
    stepper,
  ];

  if (w.step === 0) {
    body.push(h('div', { class: 'listbox' },
      h('button', {
        class: `row${w.method === 'password' ? ' selected' : ''}`, onclick: () => set({ method: 'password' }),
      }, h('span', { class: 'lead' }, icon('password')),
        h('span', { class: 'primary' }, 'Its own password'),
        h('span', { class: 'snippet' }, 'A password used by this element alone')),
      h('button', {
        class: `row${w.method === 'otp' ? ' selected' : ''}`, onclick: () => set({ method: 'otp' }),
      }, h('span', { class: 'lead' }, icon('pin')),
        h('span', { class: 'primary' }, 'Its own TOTP secret'),
        h('span', { class: 'snippet' }, 'A second factor generated for this element alone'))));
  } else if (w.step === 1 && w.method === 'password') {
    const mismatch = Boolean(w.pw2) && w.pw1 !== w.pw2;
    body.push(h('div', { class: 'grid2' },
      h('label', { class: 'field' }, 'PASSWORD FOR THIS ELEMENT', h('input', {
        type: 'password', value: w.pw1, autofocus: 'autofocus',
        oninput: (e: Event) => { state.wizard.pw1 = (e.target as HTMLInputElement).value; },
      })),
      h('label', { class: 'field' }, 'REPEAT IT', h('input', {
        type: 'password', value: w.pw2,
        oninput: (e: Event) => { state.wizard.pw2 = (e.target as HTMLInputElement).value; render(); },
      }))));
    if (mismatch) body.push(h('div', { class: 'feedback bad' }, 'The two entries do not match.'));
  } else if (w.step === 1) {
    const uri = `otpauth://totp/WinUtil:${encodeURIComponent(w.label)}?secret=${w.secret}&issuer=WinUtil&algorithm=SHA1&digits=6&period=30`;
    body.push(h('div', { style: 'display:flex;gap:18px;flex-wrap:wrap;align-items:center;padding:16px;border-radius:16px;background:var(--md-sys-color-surface-container-lowest)' },
      h('canvas', { id: 'qr', width: '160', height: '160', style: 'width:160px;height:160px;border-radius:12px;background:#fff' }),
      h('div', { style: 'flex:1;min-width:220px;display:flex;flex-direction:column;gap:8px' },
        h('p', { style: 'font-size:12.5px;color:var(--md-sys-color-on-surface-variant)' },
          'Drawn locally from the otpauth URI — never through a third-party QR service. This secret belongs to this element only.'),
        h('code', { style: 'font-size:11px;word-break:break-all' }, uri),
        h('label', { class: 'field' }, 'MANUAL BASE32 KEY', h('input', { value: w.secret, readonly: 'readonly' })),
        h('label', { class: 'field' }, 'CONFIRM ONE CODE', h('input', {
          value: w.code, placeholder: '000000', maxlength: '6', inputmode: 'numeric',
          oninput: (e: Event) => { state.wizard.code = (e.target as HTMLInputElement).value; render(); },
        })))));
  } else {
    body.push(h('div', { class: 'listbox' },
      h('div', { class: 'row' }, h('span', { class: 'primary' }, 'Element'), h('span', { class: 'snippet' }, w.label)),
      h('div', { class: 'row' }, h('span', { class: 'primary' }, 'Element id'), h('span', { class: 'snippet mono' }, w.id)),
      h('div', { class: 'row' }, h('span', { class: 'primary' }, 'Credential'), h('span', { class: 'snippet' }, w.method === 'otp' ? 'Its own TOTP secret' : 'Its own password')),
      h('div', { class: 'row' }, h('span', { class: 'primary' }, 'Shared with'), h('span', { class: 'snippet' }, 'Nothing — no master credential, no inheritance'))));
    body.push(h('p', { style: 'font-size:12px;color:var(--md-sys-color-on-surface-variant)' },
      'Locks are not a security boundary. Deleting %APPDATA%\\winutil-m3\\locks removes this one lock file without affecting the others, and the Support Tickets desk opens that folder for you.'));
  }

  const canAdvance = w.step === 0
    || (w.step === 1 && w.method === 'password' && Boolean(w.pw1) && w.pw1 === w.pw2)
    || (w.step === 1 && w.method === 'otp' && w.code.length === 6);

  return dialogShell(`Lock wizard · ${w.label}`, `Step ${w.step + 1} of 3 · ${steps[w.step]}`, body, [
    h('button', { class: 'btn text', onclick: closeDialog }, 'Cancel'),
    w.step > 0 ? h('button', { class: 'btn outlined', onclick: () => set({ step: w.step - 1 }) }, 'Back') : null,
    w.step < 2
      ? h('button', { class: 'btn filled', disabled: !canAdvance, onclick: () => set({ step: w.step + 1 }) }, 'Next')
      : h('button', {
        class: 'btn filled',
        onclick: () => {
          state.locks[w.id] = {
            kind: w.method,
            credential: w.method === 'password' ? w.pw1 : w.secret,
            hint: w.method === 'password' ? `set ${new Date().toLocaleDateString()}` : 'paired in the authenticator',
          };
          if (w.method === 'otp') state.totp = [...state.totp, { id: w.id, label: w.label, issuer: 'WinUtil', secret: w.secret }];
          record('lock', `${w.method === 'otp' ? 'TOTP' : 'Password'} lock set on ${w.label}`);
          closeDialog();
          snack(`${w.label} now has its own credential.`);
        },
      }, 'Finish this element’s lock'),
  ]);
}

function authDialog(): HTMLElement {
  return dialogShell('Not installed in this build', 'Authenticator', [
    emptyState('The authenticator is unavailable until a standards-compliant QR encoder, RFC 6238 implementation, and operating-system vault adapter have passed local verification.'),
  ], [h('button', { class: 'btn filled', onclick: closeDialog }, 'Close')]);
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
  return dialogShell('Reviewable local notices', 'Notification centre', [
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
  const note = 'Authenticator secrets and lock credentials are deliberately omitted from this export.';
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

function exportDialog(): HTMLElement {
  const format = state.prefs.exportFormat;
  return dialogShell('Multi-format export', `Export ${VIEW_META[state.view].title}`, [
    h('div', { class: 'grid2' },
      selectField('Format', EXPORT_FORMATS.map(([v]) => v), format, (v) => { state.prefs.exportFormat = v; render(); }),
      h('label', { class: 'field' }, 'ROWS', h('input', { value: String(allIdsInView().length), readonly: 'readonly' }))),
    h('div', { style: 'height:12px' }),
    h('pre', { class: 'block' }, buildExport(format)),
  ], [
    h('button', { class: 'btn text', onclick: closeDialog }, 'Cancel'),
    h('button', { class: 'btn tonal', onclick: () => { void navigator.clipboard?.writeText(buildExport(format)); snack('Export copied to the clipboard.'); } }, 'Copy'),
    h('button', {
      class: 'btn filled',
      onclick: () => { void bridge().exportView({ view: state.view, format, body: buildExport(format) }).then((p) => snack(p ? `Written to ${p}` : 'Export cancelled.')); closeDialog(); },
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
    if (state.locks[`profile-sel-${p.id}`]) { openLockWizard(`profile-sel-${p.id}`, `Selection profile · ${p.name}`, 'unlock'); return; }
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
      const locked = Boolean(state.locks[`profile-sel-${p.id}`]);
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

/** target: 'selection' | 'row:<id>' | 'profile:<id>' */
function openColorPicker(target: string, label: string): void {
  const current = target.startsWith('row:')
    ? state.rowColors[target.slice(4)] ?? state.selectionColor
    : state.selectionColor;
  const hsl = hexToHsl(current) ?? { h: 258, s: 32, l: 48 };
  state.picker = { ...state.picker, target, label, ...hsl };
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
  const chip = h('div', { class: 'picker-chip' });
  const hexLabel = h('div', { class: 'mono', style: 'font-size:20px' });
  const hslLabel = h('div', { style: 'font-size:12px;color:var(--md-sys-color-on-surface-variant)' });
  const hexInput = h('input', { class: 'mono' }) as HTMLInputElement;
  const nativeInput = h('input', { type: 'color' }) as HTMLInputElement;
  const readouts = { h: h('b', { class: 'mono' }), s: h('b', { class: 'mono' }), l: h('b', { class: 'mono' }) };
  const tracks = {} as Record<'h' | 's' | 'l', HTMLInputElement>;

  /** Repaint every dependent node in place. Re-rendering would replace the range
   *  input mid-drag and the browser would drop pointer capture. */
  const sync = (from = ''): void => {
    const hex = hslToHex(p.h, p.s, p.l);
    chip.style.setProperty('--pick', hex);
    hexLabel.textContent = hex.toUpperCase();
    hslLabel.textContent = `hsl(${Math.round(p.h)} ${Math.round(p.s)}% ${Math.round(p.l)}%)`;
    readouts.h.textContent = `${Math.round(p.h)}\u00b0`;
    readouts.s.textContent = `${Math.round(p.s)}%`;
    readouts.l.textContent = `${Math.round(p.l)}%`;
    tracks.s.style.setProperty('--track', `linear-gradient(90deg,${hslToHex(p.h, 0, p.l)},${hslToHex(p.h, 100, p.l)})`);
    tracks.l.style.setProperty('--track', `linear-gradient(90deg,#000,${hslToHex(p.h, p.s, 50)},#fff)`);
    (['h', 's', 'l'] as const).forEach((k) => { if (from !== k) tracks[k].value = String(Math.round(p[k])); });
    if (from !== 'hex') hexInput.value = hex;
    nativeInput.value = hex;
  };

  const slider = (label: string, key: 'h' | 's' | 'l', max: number, track: string): HTMLElement => {
    const input = h('input', {
      type: 'range', min: '0', max: String(max), step: '1', value: String(Math.round(p[key])),
      class: 'gradient', style: `--track:${track};height:34px;border:0;background:none;padding:0`,
      oninput: (e: Event) => { p[key] = Number((e.target as HTMLInputElement).value); sync(key); },
    }) as HTMLInputElement;
    tracks[key] = input;
    return h('label', { class: 'field' },
      h('span', { style: 'display:flex;justify-content:space-between' }, h('span', {}, label.toUpperCase()), readouts[key]),
      input);
  };

  hexInput.addEventListener('input', () => {
    const parsed = hexToHsl(hexInput.value);
    if (parsed) { Object.assign(p, parsed); sync('hex'); }
  });
  nativeInput.addEventListener('input', () => {
    const parsed = hexToHsl(nativeInput.value);
    if (parsed) { Object.assign(p, parsed); sync(); }
  });
  const jump = (hex: string): void => { const parsed = hexToHsl(hex); if (parsed) { Object.assign(p, parsed); sync(); } };

  const dialog = dialogShell(`Colour \u00b7 ${p.label}`, 'Infinite colour picker', [
    h('div', { class: 'picker-preview' }, chip, h('div', { style: 'flex:1;min-width:0' }, hexLabel, hslLabel)),
    h('div', { class: 'grid2' },
      slider('Hue', 'h', 360, 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)'),
      slider('Saturation', 's', 100, 'linear-gradient(90deg,#888,#888)'),
      slider('Lightness', 'l', 100, 'linear-gradient(90deg,#000,#888,#fff)')),
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, 'HEX \u2014 TYPE ANY VALUE', hexInput),
      h('label', { class: 'field' }, 'SYSTEM PICKER \u2014 FULL SPECTRUM', nativeInput)),
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
    h('button', { class: 'btn tonal', onclick: () => { void navigator.clipboard?.writeText(hslToHex(p.h, p.s, p.l)); snack('Copied the hex value.'); } }, 'Copy hex'),
    h('button', { class: 'btn filled', onclick: () => applyPickedColor(hslToHex(p.h, p.s, p.l)) }, 'Apply colour'),
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
    onclick: () => { record('authorized', g.action); if (g.kind) void runNow(g.kind, g.ids ?? [...state.selected]); closeDialog(); },
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
  return dialogShell('Pure Electron · TypeScript · Material 3', 'About Material System Utility', [
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
  window.setInterval(() => {
    state.otpSeconds -= 1;
    if (state.otpSeconds <= 0) {
      state.otpSeconds = 30;
      state.otpCode = String(Math.floor(100000 + Math.random() * 899999)).replace(/(\d{3})(\d{3})/, '$1 $2');
    }
    // Patch the two live nodes only. A full render would blow away the dialog's
    // focus and any half-typed confirmation code every second.
    const codeNode = document.getElementById('otp-code');
    const secNode = document.getElementById('otp-seconds');
    if (codeNode) codeNode.textContent = state.otpCode;
    if (secNode) secNode.textContent = `${state.otpSeconds}s`;
  }, 1000);
}

async function boot(): Promise<void> {
  const saved = await bridge().readPrefs();
  state.prefs = { ...DEFAULT_PREFS, ...saved };
  try { state.profiles = JSON.parse(localStorage.getItem('winutil.profiles') ?? '[]'); } catch { state.profiles = []; }
  bindShortcuts();
  bridge().onProgress((p) => {
    state.queue = { active: p.state !== 'done', index: p.index, total: p.total, current: p.detail || p.id, log: state.queue.log };
    render();
  });
  bridge().onUpdateStatus((status) => { state.update = status; render(); });
  render();
  try {
    state.catalog = await bridge().loadCatalog();
  } catch {
    snack('Could not load the WinUtil configuration.');
  }
  try { state.update = await bridge().updateStatus(); } catch { /* development/browser preview */ }
  render();
  void ensureDeps();
}

void boot();
