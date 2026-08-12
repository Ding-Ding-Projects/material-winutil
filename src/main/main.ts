import { app, autoUpdater, BrowserWindow, ipcMain, dialog, nativeTheme, session } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import squirrelStartup from 'electron-squirrel-startup';
import type {
  AuthenticatorBeginRequest, AuthenticatorCodes, AuthenticatorEntry, AuthenticatorRegistration,
  CommandResult, ExportFormat, HistoryBrowseResult, HistoryEntry, HistoryQuery, NarrationClientResult, NarrationEvent, NarrationRuntimeState,
  PersonalVocabularyState, PersonalVocabularyUploadResult, Preferences, RunKind, SchoolModeChangeResult,
  SettingsSurfaceState, StructuredExportRequest, StructuredExportSaveResult, UpdateStatus, WinutilCatalog,
} from '../shared/types';
import { resolvePackageRequest, validateCatalog, wingetArgs } from './package-policy';
import { AuthenticatorService } from './authenticator-service';
import { PersonalVocabularyStore } from './personal-vocabulary-store';
import { PERSONAL_VOCABULARY_LIMITS } from '../shared/personal-vocabulary';
import { IpcNarrationTransport, NarratorRuntime } from './narrator-runtime';
import { SettingsSurfaceService } from './settings-surface-service';
import { deleteCredential, readCredential, writeCredential } from './credential-vault';
import { exportStructuredRecords } from '../shared/export-formats';
import { buildSevenZipCommand, createArchiveListFile, createArchiveManifest } from '../shared/archive-export';
import { detectExternalEditors, openExportInVSCode } from './external-editor';
import { LocalHistory, LOCAL_HISTORY_ACTIONS, type JsonValue, type LocalHistoryAction } from './local-history';
import { LockService, type LockCreateRequest, type LockSearchRequest, type LockUpdateRequest } from './lock-service';

const ROOT = path.join(__dirname, '..', '..');
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const USER_DIR = () => app.getPath('userData');
const PREFS_FILE = () => path.join(USER_DIR(), 'preferences.json');
const HISTORY_FILE = () => path.join(USER_DIR(), 'history.jsonl');
const RENDERER_FILE = path.join(__dirname, '..', 'renderer', 'index.html');
const RENDERER_URL = pathToFileURL(RENDERER_FILE).href;

let win: BrowserWindow | null = null;
let catalogCache: WinutilCatalog | null = null;
let packageMutationActive = false;
let historyWriteQueue: Promise<void> = Promise.resolve();
let authenticatorService: AuthenticatorService | null = null;
let personalVocabularyStore: PersonalVocabularyStore | null = null;
let settingsSurfaceService: SettingsSurfaceService | null = null;
let localHistoryService: LocalHistory | null = null;
let lockService: LockService | null = null;
let lastExportPath = '';
let historyUnlockedUntil = 0;
const HISTORY_CREDENTIAL_TARGET = 'history-manager-primary';
const HISTORY_CREDENTIAL_ACCOUNT = 'local-user';
const narrationTransport = new IpcNarrationTransport(() => {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return undefined;
  return win.webContents;
});
const narratorRuntime = new NarratorRuntime(narrationTransport);
let currentNarratorPreferences: Preferences | null = null;
const UPDATE_FEED = 'https://github.com/Ding-Ding-Projects/material-winutil/releases/latest/download/';
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_TEXT_PAYLOAD = 2 * 1024 * 1024;
const MAX_HISTORY_FIELD = 4096;
const MAX_HISTORY_BYTES = 2 * 1024 * 1024;
const MAX_HISTORY_ENTRIES = 500;
const SCHOOL_MODE_PASSWORD_MAX_CODE_POINTS = 256;
const EXPORT_EXTENSIONS: Record<ExportFormat, string> = {
  md: 'md', json: 'json', jsonl: 'jsonl', yaml: 'yaml', toml: 'toml', xml: 'xml',
  csv: 'csv', tsv: 'tsv', html: 'html', sql: 'sql', ts: 'ts', js: 'js', py: 'py', go: 'go', rs: 'rs',
  proto: 'proto', 'schema.json': 'schema.json',
};
const EXPORT_VIEWS = new Set([
  'install', 'tweaks', 'config', 'updates', 'iso', 'overview', 'sync', 'skills', 'memory',
  'history', 'changelog', 'operations', 'security', 'settings', 'docs',
]);
let updateStatus: UpdateStatus = {
  state: app.isPackaged ? 'idle' : 'disabled', currentVersion: app.getVersion(), updateVersion: '',
  message: app.isPackaged ? 'Automatic update checks are enabled.' : 'Update checks run only in an installed build.',
  releaseUrl: 'https://github.com/Ding-Ding-Projects/material-winutil/releases/latest',
};

if (squirrelStartup) app.quit();

function setUpdateStatus(patch: Partial<UpdateStatus>): UpdateStatus {
  updateStatus = { ...updateStatus, ...patch };
  win?.webContents.send('update:status', updateStatus);
  return updateStatus;
}

async function loadCatalog(): Promise<WinutilCatalog> {
  if (catalogCache) return catalogCache;
  const raw = await fs.readFile(path.join(CONFIG_DIR, 'winutil.json'), 'utf8');
  catalogCache = validateCatalog(JSON.parse(raw) as unknown);
  return catalogCache;
}

function trustedSender(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): boolean {
  if (!win || win.isDestroyed() || event.sender.isDestroyed() || event.sender !== win.webContents) return false;
  const frame = event.senderFrame;
  return Boolean(frame && frame === event.sender.mainFrame && frame.url === RENDERER_URL);
}

function requireTrustedSender(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): void {
  if (!trustedSender(event)) throw new Error('The request did not originate from the application renderer.');
}

async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) return updateStatus;
  setUpdateStatus({ state: 'checking', message: 'Checking the unsigned HTTPS update feed…' });
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    setUpdateStatus({ state: 'error', message: error instanceof Error ? error.message : String(error) });
  }
  return updateStatus;
}

function configureUpdater(): void {
  if (!app.isPackaged || process.platform !== 'win32') return;
  autoUpdater.setFeedURL({ url: UPDATE_FEED });
  autoUpdater.on('checking-for-update', () => setUpdateStatus({ state: 'checking', message: 'Checking the unsigned HTTPS update feed…' }));
  autoUpdater.on('update-available', () => setUpdateStatus({
    state: 'available', message: 'An update is available and will download in the background.',
  }));
  autoUpdater.on('update-not-available', () => setUpdateStatus({ state: 'up-to-date', updateVersion: '', message: 'This is the latest published version.' }));
  autoUpdater.on('error', (error) => setUpdateStatus({ state: 'error', message: error.message }));
  autoUpdater.on('update-downloaded', (_event, releaseNotes, releaseName) => setUpdateStatus({
    state: 'ready', updateVersion: String(releaseName ?? '').replace(/^v/, ''),
    message: typeof releaseNotes === 'string' ? releaseNotes.slice(0, 240) : 'The update is ready to install.',
  }));
  setTimeout(() => { void checkForUpdates(); }, 15_000);
  setInterval(() => { void checkForUpdates(); }, 4 * 60 * 60 * 1000);
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 360,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141218' : '#FEF7FF',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win?.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== RENDERER_URL) event.preventDefault();
  });
  void win.loadFile(RENDERER_FILE);
  win.on('closed', () => { win = null; });
}

function defaultSchoolPreferences(preferences?: Preferences): import('../shared/school-mode').SchoolModePreferences {
  return {
    language: preferences?.language ?? 'English',
    englishFunnyLevel: preferences?.enFunny ?? 3,
    cantoneseFunnyLevel: preferences?.yueFunny ?? 4,
    personalVocabularyEnabled: true,
    dimSumEnabled: true,
  };
}

function effectiveNarratorPreferences(preferences: Preferences): Preferences {
  const school = settingsSurfaceService?.snapshot().schoolMode;
  return school?.status === 'ready' && school.effective.enabled
    ? { ...preferences, language: 'English', narrator: 'English', enFunny: 1 }
    : preferences;
}

function sharedAppDataDirectory(): string {
  const local = process.env.LOCALAPPDATA;
  const base = local && path.win32.isAbsolute(local) && !/[\u0000-\u001f"]/u.test(local)
    ? path.win32.normalize(local)
    : app.getPath('appData');
  return path.join(base, 'DingDingProjects', 'shared-settings');
}

function settingsSurface(): SettingsSurfaceService {
  if (!settingsSurfaceService) throw new Error('The settings surface is unavailable.');
  return settingsSurfaceService;
}

function validatePasswordInput(password: unknown, optional = false): string | undefined {
  if (optional && password === undefined) return undefined;
  if (typeof password !== 'string' || password.length === 0 || Array.from(password).length > SCHOOL_MODE_PASSWORD_MAX_CODE_POINTS
    || /[\u0000-\u001f\u007f]/u.test(password)) throw new Error('The School mode password did not pass validation.');
  return password;
}

function broadcastSettingsSurface(state: SettingsSurfaceState): void {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  win.setTitle(state.displayName.displayName);
  win.webContents.send('settings-surface:state', state);
  if (state.schoolMode.status === 'ready' && state.schoolMode.effective.enabled && currentNarratorPreferences) {
    void narratorRuntime.stop();
    narrationTransport.stop();
    narratorRuntime.configure({ ...currentNarratorPreferences, language: 'English', narrator: 'English', enFunny: 1 }, app.isAccessibilitySupportEnabled());
  } else if (state.schoolMode.status === 'ready' && currentNarratorPreferences) {
    narratorRuntime.configure(currentNarratorPreferences, app.isAccessibilitySupportEnabled());
  }
}

/** Run a native command and always resolve with the real exit code, stdout and stderr. */
function run(file: string, args: string[], cwd = ROOT): Promise<CommandResult> {
  return new Promise((resolve) => {
    let timedOut = false;
    const child = execFile(file, args, { cwd, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({ ok: false, code: 124, stdout: String(stdout ?? ''), stderr: `The command exceeded ${COMMAND_TIMEOUT_MS / 60000} minutes and was terminated.` });
        return;
      }
      const code = err && typeof (err as NodeJS.ErrnoException & { code?: number }).code === 'number'
        ? Number((err as unknown as { code: number }).code)
        : err ? 1 : 0;
      resolve({ ok: code === 0, code, stdout: String(stdout ?? ''), stderr: String(stderr ?? (err?.message ?? '')) });
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, COMMAND_TIMEOUT_MS);
    timer.unref();
  });
}

function windowsSystemRoot(): string {
  const root = process.env.SystemRoot ?? process.env.WINDIR;
  if (!root || !path.win32.isAbsolute(root)) throw new Error('The Windows system root is unavailable.');
  return path.win32.normalize(root);
}

function trustedPowerShell(): string | null {
  if (process.platform !== 'win32') return null;
  return path.win32.join(windowsSystemRoot(), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

async function trustedWinget(): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  const local = process.env.LOCALAPPDATA;
  if (!local || !path.win32.isAbsolute(local)) return null;
  const candidate = path.win32.join(local, 'Microsoft', 'WindowsApps', 'winget.exe');
  try {
    await fs.access(candidate, fs.constants.X_OK);
    return candidate;
  } catch {
    return null;
  }
}

function projectPreferences(value: unknown): Preferences | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const isNumber = (key: string, min: number, max: number): boolean =>
    typeof input[key] === 'number' && Number.isFinite(input[key]) && Number(input[key]) >= min && Number(input[key]) <= max;
  if (!['light', 'dark'].includes(String(input.theme))
    || !['comfortable', 'compact'].includes(String(input.density))
    || !['English', 'Yue', 'Bilingual'].includes(String(input.language))
    || !['English', 'Yue', 'Both'].includes(String(input.narrator))
    || typeof input.narratorEnabled !== 'boolean'
    || (input.narratorQuiet !== undefined && typeof input.narratorQuiet !== 'boolean')
    || (input.narratorReducedSound !== undefined && typeof input.narratorReducedSound !== 'boolean')
    || !isNumber('enFunny', 1, 5) || !isNumber('yueFunny', 1, 5)
    || typeof input.accent !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(input.accent)
    || typeof input.font !== 'string' || input.font.length < 1 || input.font.length > 120 || /[\u0000-\u001F\u007F]/.test(input.font)
    || !isNumber('scale', 0.5, 3) || !isNumber('weight', 100, 1000) || !isNumber('radius', 0, 64)
    || typeof input.reducedMotion !== 'boolean'
    || typeof input.exportFormat !== 'string' || !(input.exportFormat in EXPORT_EXTENSIONS)) return null;
  return {
    theme: input.theme as Preferences['theme'], density: input.density as Preferences['density'],
    language: input.language as Preferences['language'], narrator: input.narrator as Preferences['narrator'],
    narratorEnabled: input.narratorEnabled, narratorQuiet: input.narratorQuiet === true,
    narratorReducedSound: input.narratorReducedSound === true,
    enFunny: Number(input.enFunny), yueFunny: Number(input.yueFunny),
    accent: input.accent, font: input.font, scale: Number(input.scale), weight: Number(input.weight),
    radius: Number(input.radius), reducedMotion: input.reducedMotion, exportFormat: input.exportFormat as ExportFormat,
  };
}

async function atomicWrite(file: string, body: string): Promise<void> {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, body, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try {
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

function projectHistoryEntry(value: unknown): HistoryEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.id !== 'string' || !/^h-[A-Za-z0-9-]{1,80}$/.test(input.id)
    || typeof input.action !== 'string' || !input.action.trim() || input.action.length > 120
    || typeof input.detail !== 'string' || input.detail.length > MAX_HISTORY_FIELD
    || typeof input.at !== 'string' || !Number.isFinite(Date.parse(input.at))) return null;
  return { id: input.id, action: input.action, detail: input.detail, at: new Date(input.at).toISOString() };
}

async function readHistoryBounded(): Promise<HistoryEntry[]> {
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(HISTORY_FILE(), 'r');
    const stat = await handle.stat();
    const length = Math.min(stat.size, MAX_HISTORY_BYTES);
    const offset = Math.max(0, stat.size - length);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, offset);
    let text = buffer.toString('utf8');
    if (offset > 0) text = text.slice(Math.max(0, text.indexOf('\n') + 1));
    const entries: HistoryEntry[] = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line || Buffer.byteLength(line, 'utf8') > MAX_HISTORY_FIELD + 512) continue;
      try {
        const entry = projectHistoryEntry(JSON.parse(line) as unknown);
        if (entry) entries.push(entry);
      } catch { /* one malformed line must not hide the remaining valid history */ }
    }
    return entries.slice(-MAX_HISTORY_ENTRIES);
  } catch {
    return [];
  } finally {
    await handle?.close();
  }
}

function unsupported(kind: RunKind): CommandResult {
  return {
    ok: false,
    code: 78,
    stdout: '',
    stderr: `${kind} is not enabled in this build. The verified WinUtil automation adapter is not installed.`,
  };
}

function localHistory(): LocalHistory {
  if (!localHistoryService) localHistoryService = new LocalHistory({ appDataDirectory: USER_DIR() });
  return localHistoryService;
}

function validateHistoryPassword(value: unknown): string {
  if (typeof value !== 'string' || Array.from(value).length < 8 || Array.from(value).length > 256 || /[\x00-\x1f\x7f]/u.test(value)) {
    throw new Error('History password must contain 8 to 256 characters.');
  }
  return value;
}

async function historyAccessState(): Promise<{ configured: boolean; unlocked: boolean }> {
  const stored = await readCredential(HISTORY_CREDENTIAL_TARGET, HISTORY_CREDENTIAL_ACCOUNT);
  const configured = stored !== null;
  stored?.fill(0);
  return { configured, unlocked: configured && historyUnlockedUntil > Date.now() };
}

function createHistoryVerifier(password: string): Buffer {
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  try { return Buffer.from(JSON.stringify({ schemaVersion: 1, salt: salt.toString('base64'), digest: digest.toString('base64') }), 'utf8'); }
  finally { salt.fill(0); digest.fill(0); }
}

function verifyHistoryPassword(password: string, verifier: Buffer): boolean {
  let parsed: unknown;
  try { parsed = JSON.parse(verifier.toString('utf8')) as unknown; } catch { return false; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== 1 || typeof record.salt !== 'string' || typeof record.digest !== 'string') return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(record.salt, 'base64'); expected = Buffer.from(record.digest, 'base64');
    if (salt.length !== 16 || expected.length !== 32 || salt.toString('base64') !== record.salt || expected.toString('base64') !== record.digest) return false;
  } catch { return false; }
  const actual = scryptSync(password, salt, 32, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  try { return timingSafeEqual(actual, expected); }
  finally { salt.fill(0); expected.fill(0); actual.fill(0); }
}

async function requireHistoryAccess(): Promise<void> {
  const access = await historyAccessState();
  if (!access.configured) throw new Error('Configure a local history password before opening the history manager.');
  if (!access.unlocked) throw new Error('Unlock local history before using this action.');
}

async function detectedEditors() {
  const isFile = async (candidate: string): Promise<boolean> => {
    try { return (await fs.stat(candidate)).isFile(); } catch { return false; }
  };
  const findOnPath = async (command: string): Promise<readonly string[]> => {
    const result = await run(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'where.exe'), [command]);
    return result.ok ? result.stdout.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean).slice(0, 16) : [];
  };
  return detectExternalEditors({
    localAppData: process.env.LOCALAPPDATA,
    programFiles: process.env.ProgramFiles,
    programFilesX86: process.env['ProgramFiles(x86)'],
    portableRoots: [], configuredEditors: [],
  }, { isFile, findOnPath });
}

function exportBaseName(view: string): string {
  return view.replace(/[^A-Za-z0-9_-]/gu, '-').slice(0, 80) || 'export';
}

async function saveStructuredExport(payload: StructuredExportRequest): Promise<StructuredExportSaveResult> {
  if (!payload || typeof payload.view !== 'string' || !EXPORT_VIEWS.has(payload.view)) throw new Error('The export view is invalid.');
  const output = exportStructuredRecords({
    format: payload.format, records: payload.records, schema: { name: `material-winutil.${payload.view}`, version: 1 },
    scope: payload.scope, lineEnding: payload.lineEnding,
  });
  const archive = payload.archive;
  const extension = archive?.format ?? output.extension;
  const choice = await dialog.showSaveDialog({
    title: archive ? 'Export archive' : 'Export view',
    defaultPath: path.join(app.getPath('downloads'), `${exportBaseName(payload.view)}.${extension}`),
  });
  if (choice.canceled || !choice.filePath) return { status: 'cancelled', warnings: [] };
  if (await fs.stat(choice.filePath).then(() => true).catch(() => false)) {
    throw new Error('The selected export path already exists. Choose a new filename so no data is overwritten or appended.');
  }
  const warnings: string[] = [];
  if (!archive) {
    await fs.writeFile(choice.filePath, output.text, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  } else {
    const encryption = archive.encryption ?? { enabled: false, encryptHeaders: false };
    if (encryption.enabled && (!encryption.password || encryption.password.length < 8 || encryption.password.length > 512)) {
      throw new Error('Archive password must contain 8 to 512 characters.');
    }
    const manifest = createArchiveManifest({ schemaVersion: 1, entries: [{ path: `${exportBaseName(payload.view)}.${output.extension}`, bytes: output.byteLength }], options: {
      format: archive.format, compressionLevel: archive.compressionLevel,
      ...(archive.format === '7z' ? {
        method: archive.method, dictionarySizeMiB: archive.dictionarySizeMiB, wordSize: archive.wordSize,
        solid: archive.solid, solidBlockSizeMiB: archive.solidBlockSizeMiB, threads: archive.threads,
        splitVolumeSizeMiB: archive.splitVolumeSizeMiB,
        encryption: { enabled: encryption.enabled, encryptHeaders: encryption.encryptHeaders },
      } : {}),
    }});
    warnings.push(...manifest.warnings);
    const sevenZipCandidates = [
      path.join(process.env.ProgramFiles ?? '', '7-Zip', '7z.exe'),
      path.join(process.env['ProgramFiles(x86)'] ?? '', '7-Zip', '7z.exe'),
    ];
    const sevenZip = (await Promise.all(sevenZipCandidates.map(async (candidate) => ({ candidate, ok: await fs.stat(candidate).then((stat) => stat.isFile()).catch(() => false) })))).find((item) => item.ok)?.candidate;
    if (!sevenZip) throw new Error('7-Zip is not installed in a trusted application directory. The archive was not created.');
    const staging = await fs.mkdtemp(path.join(app.getPath('temp'), 'material-winutil-export-'));
    try {
      const sourceFile = path.join(staging, manifest.entries[0].path);
      const listFile = path.join(staging, 'entries.txt');
      await fs.writeFile(sourceFile, output.text, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await fs.writeFile(listFile, createArchiveListFile(manifest), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      const command = buildSevenZipCommand({ manifest, executable: { path: sevenZip, trusted: true }, sourceDirectory: staging, outputArchive: choice.filePath, listFile });
      await new Promise<void>((resolve, reject) => {
        const child = spawn(command.executable, command.args, { cwd: command.cwd, shell: false, windowsHide: true, stdio: command.stdin.kind === 'secret' ? ['pipe', 'ignore', 'ignore'] : ['ignore', 'ignore', 'ignore'] });
        child.once('error', () => reject(new Error('The archive tool could not start.')));
        child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`Archive creation failed with exit ${code ?? 'unknown'}.`)));
        if (command.stdin.kind === 'secret') {
          const secret = encryption.password ?? '';
          child.stdin?.end(`${secret}\n${secret}\n`, 'utf8');
        }
      });
    } finally {
      await fs.rm(staging, { recursive: true, force: true });
    }
  }
  lastExportPath = choice.filePath;
  const editors = await detectedEditors();
  return { status: 'saved', filePath: choice.filePath, manifest: output.manifest, warnings, vscode: {
    available: editors.some((editor) => editor.kind.startsWith('vscode-')),
    label: editors.find((editor) => editor.kind.startsWith('vscode-'))?.label,
  } };
}

ipcMain.handle('catalog:load', async (event): Promise<WinutilCatalog> => {
  requireTrustedSender(event);
  return loadCatalog();
});

ipcMain.handle('system:elevated', async (event): Promise<boolean> => {
  requireTrustedSender(event);
  if (process.platform !== 'win32') return false;
  const executable = trustedPowerShell();
  if (!executable) return false;
  const res = await run(executable, [
    '-NoProfile', '-Command',
    '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(544)',
  ]);
  return res.stdout.trim().toLowerCase() === 'true';
});

ipcMain.on('window:action', (_e, action: 'minimize' | 'maximize' | 'close') => {
  if (!win || !trustedSender(_e) || !['minimize', 'maximize', 'close'].includes(action)) return;
  if (action === 'minimize') win.minimize();
  else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  else win.close();
});

ipcMain.handle('winutil:run', async (e, kind: RunKind, ids: string[]): Promise<CommandResult> => {
  if (!trustedSender(e)) return { ok: false, code: 77, stdout: '', stderr: 'The request did not originate from the application renderer.' };
  if (!['install', 'upgrade', 'uninstall', 'tweak', 'undo', 'feature', 'update-profile'].includes(kind)) {
    return { ok: false, code: 64, stdout: '', stderr: 'Unknown operation.' };
  }
  if (!['install', 'upgrade', 'uninstall'].includes(kind)) return unsupported(kind);
  const catalog = await loadCatalog();
  const requestedIds: unknown = Array.isArray(ids) && ids.every((id) => typeof id === 'string')
    ? ids.map((id) => catalog.apps.find((item) => item.id === id || item.winget === id)?.id ?? id)
    : ids;
  const policy = resolvePackageRequest(catalog, kind, requestedIds);
  if (!policy.ok) return { ok: false, code: policy.code, stdout: '', stderr: policy.error };
  if (packageMutationActive) {
    return { ok: false, code: 75, stdout: '', stderr: 'Another package operation is already running.' };
  }
  packageMutationActive = true;
  try {
    const winget = await trustedWinget();
    if (!winget) return { ok: false, code: 69, stdout: '', stderr: 'Windows Package Manager is unavailable. Use the explicit repair action before retrying.' };
    // Package operations are queued one at a time so progress is real and nothing prompts.
    if (kind === 'install' || kind === 'uninstall') {
      const out: string[] = [];
      let worst = 0;
      for (let i = 0; i < policy.packages.length; i += 1) {
        const item = policy.packages[i];
        const catalogId = item.catalogId;
        e.sender.send('winutil:progress', { id: catalogId, index: i + 1, total: policy.packages.length, state: 'running', detail: catalogId });
        const res = await run(winget, wingetArgs(kind, item));
        out.push(`[${i + 1}/${policy.packages.length}] ${kind} ${catalogId} — exit ${res.code}\n${res.stdout || res.stderr}`.trim());
        if (res.code !== 0) worst = res.code;
      }
      e.sender.send('winutil:progress', { id: '', index: policy.packages.length, total: policy.packages.length, state: 'done', detail: '' });
      return { ok: worst === 0, code: worst, stdout: out.join('\n'), stderr: '' };
    }
    return await run(winget, [
      'upgrade', '--all', '--silent', '--disable-interactivity',
      '--accept-package-agreements', '--accept-source-agreements',
    ]);
  } finally {
    packageMutationActive = false;
  }
});

ipcMain.handle('winutil:installed', async (event): Promise<string[]> => {
  if (!trustedSender(event)) return [];
  const winget = await trustedWinget();
  if (!winget) return [];
  const res = await run(winget, ['list', '--disable-interactivity']);
  if (!res.ok) return [];
  const installed = new Set(res.stdout.split('\n').slice(2)
    .map((line) => line.trim().split(/\s{2,}/)[1] ?? '')
    .filter(Boolean));
  const catalog = await loadCatalog();
  return catalog.apps.filter((item) => {
    const packageId = item.winget.startsWith('msstore:') ? item.winget.slice('msstore:'.length) : item.winget;
    return packageId && installed.has(packageId);
  }).map((item) => item.id);
});

interface DepStatus { name: string; present: boolean; installed: boolean; detail: string }
let depsChecked: DepStatus[] | null = null;
let depsCheckActive: Promise<DepStatus[]> | null = null;

/**
 * This release uses the operating system's supported WinGet client. It never downloads
 * or executes a package-manager bootstrap script in the background.
 */
async function inspectDependencies(): Promise<DepStatus[]> {
  if (depsChecked) return depsChecked;
  if (depsCheckActive) return depsCheckActive;
  depsCheckActive = (async () => {
    const executable = await trustedWinget();
    if (!executable) return [{ name: 'winget', present: false, installed: false, detail: 'Windows Package Manager was not found in the trusted App Installer location. No repair was attempted.' }];
    const result = await run(executable, ['--version']);
    return [{ name: 'winget', present: result.ok, installed: false, detail: result.ok ? result.stdout.trim() : (result.stderr || `exit ${result.code}`) }];
  })();
  try {
    const result = await depsCheckActive;
    if (result.every((item) => item.present)) depsChecked = result;
    return result;
  } finally {
    depsCheckActive = null;
  }
}

ipcMain.handle('deps:ensure', async (event): Promise<DepStatus[]> => {
  requireTrustedSender(event);
  return inspectDependencies();
});

ipcMain.handle('view:export', async (event, payload: StructuredExportRequest): Promise<StructuredExportSaveResult> => {
  requireTrustedSender(event);
  return saveStructuredExport(payload);
});

ipcMain.handle('view:export-open-vscode', async (event, filePath: string) => {
  requireTrustedSender(event);
  if (filePath !== lastExportPath || !path.isAbsolute(filePath)) throw new Error('Only the most recently saved export can be opened.');
  return openExportInVSCode(filePath, await detectedEditors(), execFile);
});

ipcMain.handle('prefs:read', async (event): Promise<Partial<Preferences>> => {
  requireTrustedSender(event);
  try {
    const preferences = projectPreferences(JSON.parse(await fs.readFile(PREFS_FILE(), 'utf8')) as unknown);
    if (preferences) {
      currentNarratorPreferences = preferences;
      narratorRuntime.configure(effectiveNarratorPreferences(preferences), app.isAccessibilitySupportEnabled());
    }
    return preferences ?? {};
  }
  catch { return {}; }
});

ipcMain.handle('prefs:write', async (_e, prefs: Preferences): Promise<void> => {
  if (!trustedSender(_e)) throw new Error('The preferences request did not originate from the application renderer.');
  const projected = projectPreferences(prefs);
  if (!projected) throw new Error('Preferences did not pass validation.');
  currentNarratorPreferences = projected;
  narratorRuntime.configure(effectiveNarratorPreferences(projected), app.isAccessibilitySupportEnabled());
  await fs.mkdir(USER_DIR(), { recursive: true });
  await atomicWrite(PREFS_FILE(), JSON.stringify(projected, null, 2));
  await settingsSurface().updatePreferences(defaultSchoolPreferences(projected));
});

ipcMain.handle('settings-surface:state', (event): SettingsSurfaceState => {
  requireTrustedSender(event);
  return settingsSurface().snapshot();
});
ipcMain.handle('display-name:rename', async (event, displayName: unknown): Promise<SettingsSurfaceState> => {
  requireTrustedSender(event);
  if (typeof displayName !== 'string') throw new Error('The display name did not pass validation.');
  return settingsSurface().renameDisplayName(displayName);
});
ipcMain.handle('display-name:reset', async (event): Promise<SettingsSurfaceState> => {
  requireTrustedSender(event);
  return settingsSurface().resetDisplayName();
});
ipcMain.handle('dialog-emoji:set', async (event, enabled: unknown): Promise<SettingsSurfaceState> => {
  requireTrustedSender(event);
  if (typeof enabled !== 'boolean') throw new Error('The dialog emoji preference did not pass validation.');
  return settingsSurface().setDialogEmojis(enabled);
});
ipcMain.handle('school-mode:rename', async (event, displayLabel: unknown): Promise<SettingsSurfaceState> => {
  requireTrustedSender(event);
  if (typeof displayLabel !== 'string') throw new Error('The School mode label did not pass validation.');
  return settingsSurface().renameSchoolMode(displayLabel);
});
ipcMain.handle('school-mode:configure-password', async (event, password: unknown): Promise<SettingsSurfaceState> => {
  requireTrustedSender(event);
  return settingsSurface().configureSchoolModePassword(validatePasswordInput(password)!);
});
ipcMain.handle('school-mode:reset-credential', async (event): Promise<SettingsSurfaceState> => {
  requireTrustedSender(event);
  return settingsSurface().resetSchoolModeCredential();
});
ipcMain.handle('school-mode:set-enabled', async (event, enabled: unknown, password?: unknown): Promise<SchoolModeChangeResult> => {
  requireTrustedSender(event);
  if (typeof enabled !== 'boolean') throw new Error('The School mode state did not pass validation.');
  return settingsSurface().setSchoolModeEnabled(enabled, validatePasswordInput(password, true));
});

ipcMain.handle('history:read', async (event): Promise<HistoryEntry[]> => {
  requireTrustedSender(event);
  return readHistoryBounded();
});

ipcMain.handle('history:append', async (_e, entry: Omit<HistoryEntry, 'id' | 'at'>): Promise<HistoryEntry> => {
  if (!trustedSender(_e)) throw new Error('The history request did not originate from the application renderer.');
  if (!entry || typeof entry.action !== 'string' || typeof entry.detail !== 'string'
    || !entry.action.trim() || entry.action.length > 120 || entry.detail.length > MAX_HISTORY_FIELD) throw new Error('History entry did not pass validation.');
  const full: HistoryEntry = { action: entry.action.trim(), detail: entry.detail, id: `h-${Date.now()}-${randomUUID()}`, at: new Date().toISOString() };
  await fs.mkdir(USER_DIR(), { recursive: true });
  const line = JSON.stringify(full) + '\n';
  historyWriteQueue = historyWriteQueue.catch(() => undefined).then(async () => {
    await fs.appendFile(HISTORY_FILE(), line, { encoding: 'utf8', mode: 0o600 });
    const stat = await fs.stat(HISTORY_FILE());
    if (stat.size > MAX_HISTORY_BYTES * 2) {
      const retained = await readHistoryBounded();
      await atomicWrite(HISTORY_FILE(), retained.map((item) => JSON.stringify(item)).join('\n') + (retained.length ? '\n' : ''));
    }
  });
  await historyWriteQueue;
  await localHistory().recordRedactedSnapshot('updated', { action: full.action, detail: full.detail, recordedAt: full.at });
  return full;
});

ipcMain.handle('history:access', async (event) => { requireTrustedSender(event); return historyAccessState(); });
ipcMain.handle('history:configure-credential', async (event, password: unknown) => {
  requireTrustedSender(event);
  const value = createHistoryVerifier(validateHistoryPassword(password));
  try { await writeCredential(HISTORY_CREDENTIAL_TARGET, HISTORY_CREDENTIAL_ACCOUNT, value); }
  finally { value.fill(0); }
  historyUnlockedUntil = Date.now() + 15 * 60 * 1000;
  return historyAccessState();
});
ipcMain.handle('history:unlock', async (event, password: unknown) => {
  requireTrustedSender(event);
  const supplied = Buffer.from(validateHistoryPassword(password), 'utf8');
  const stored = await readCredential(HISTORY_CREDENTIAL_TARGET, HISTORY_CREDENTIAL_ACCOUNT);
  try {
    if (!stored || !verifyHistoryPassword(supplied.toString('utf8'), stored)) throw new Error('The history password did not match.');
    historyUnlockedUntil = Date.now() + 15 * 60 * 1000;
  } finally { supplied.fill(0); stored?.fill(0); }
  return historyAccessState();
});
ipcMain.handle('history:lock', async (event) => { requireTrustedSender(event); historyUnlockedUntil = 0; return historyAccessState(); });

function validatedHistoryQuery(query: HistoryQuery): HistoryQuery {
  if (!query || typeof query !== 'object' || Array.isArray(query)) throw new Error('History query must be an object.');
  if (query.actions?.some((action) => !LOCAL_HISTORY_ACTIONS.includes(action))) throw new Error('History action is unsupported.');
  return query;
}

ipcMain.handle('history:browse', async (event, query: HistoryQuery): Promise<HistoryBrowseResult> => {
  requireTrustedSender(event);
  await requireHistoryAccess();
  const requested = validatedHistoryQuery(query);
  const all = await localHistory().search({ limit: 500 });
  const entries = await localHistory().search({ ...requested, actions: requested.actions as LocalHistoryAction[] | undefined });
  return { entries, actionCounts: LOCAL_HISTORY_ACTIONS.map((action) => ({ action, count: all.filter((entry) => entry.action === action).length })).filter((item) => item.count > 0) };
});

ipcMain.handle('history:diff', async (event, left: string, right: string) => {
  requireTrustedSender(event);
  await requireHistoryAccess();
  const before = await localHistory().snapshot(left);
  const after = await localHistory().snapshot(right);
  const changes: Array<{ path: string; kind: string; before?: unknown; after?: unknown }> = [];
  const walk = (a: unknown, b: unknown, at = '$'): void => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) walk((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${at}.${key}`);
      return;
    }
    changes.push({ path: at, kind: a === undefined ? 'added' : b === undefined ? 'removed' : 'changed', ...(a === undefined ? {} : { before: a }), ...(b === undefined ? {} : { after: b }) });
  };
  walk(before, after);
  return changes.slice(0, 1_000);
});

ipcMain.handle('history:restore', async (event, revision: string) => { requireTrustedSender(event); await requireHistoryAccess(); return localHistory().restore(revision); });
ipcMain.handle('history:label', async (event, revision: string, label: string) => { requireTrustedSender(event); await requireHistoryAccess(); return localHistory().label(revision, label); });
ipcMain.handle('history:prune', async (event, keep: number) => { requireTrustedSender(event); await requireHistoryAccess(); return localHistory().prune(keep); });
ipcMain.handle('history:export', async (event, query: HistoryQuery): Promise<StructuredExportSaveResult> => {
  requireTrustedSender(event);
  await requireHistoryAccess();
  const result = await localHistory().search({ ...validatedHistoryQuery(query), actions: query.actions as LocalHistoryAction[] | undefined });
  return saveStructuredExport({ view: 'history', format: 'json', lineEnding: 'lf', records: result.map((entry) => ({ ...entry })), scope: {
    kind: query.query || query.regex || query.actions?.length || query.from || query.to ? 'filtered-view' : 'all',
    detail: 'Redacted history metadata only; snapshot contents, credentials, verifier proofs, and encryption keys are omitted.',
    sourceCount: (await localHistory().search({ limit: 500 })).length, exportedCount: result.length,
  } });
});

ipcMain.handle('update:status', (event): UpdateStatus => { requireTrustedSender(event); return updateStatus; });
ipcMain.handle('update:check', async (event): Promise<UpdateStatus> => { requireTrustedSender(event); return checkForUpdates(); });
ipcMain.on('update:restart', (event) => { if (trustedSender(event) && updateStatus.state === 'ready') autoUpdater.quitAndInstall(); });

function authenticator(): AuthenticatorService {
  if (!authenticatorService) authenticatorService = new AuthenticatorService({ appDataDirectory: USER_DIR() });
  return authenticatorService;
}

function locks(): LockService {
  if (!lockService) throw new Error('The lock service is unavailable.');
  return lockService;
}

ipcMain.handle('locks:state', async (event, surfaceId?: string) => {
  requireTrustedSender(event);
  return locks().state(surfaceId);
});
ipcMain.handle('locks:prepare-totp', async (event, label: string, account?: string) => {
  requireTrustedSender(event);
  return locks().prepareTotp(label, account);
});
ipcMain.handle('locks:create', async (event, request: LockCreateRequest) => {
  requireTrustedSender(event);
  await locks().create(request);
  return locks().state();
});
ipcMain.handle('locks:update', async (event, lockId: string, request: LockUpdateRequest) => {
  requireTrustedSender(event);
  await locks().update(lockId, request);
  return locks().state();
});
ipcMain.handle('locks:remove', async (event, lockId: string) => {
  requireTrustedSender(event);
  await locks().remove(lockId);
  return locks().state();
});
ipcMain.handle('locks:search', async (event, request: LockSearchRequest) => {
  requireTrustedSender(event);
  return locks().search(request);
});
ipcMain.handle('locks:unlock', async (event, lockId: string, credential: string, surfaceId?: string) => {
  requireTrustedSender(event);
  return locks().unlock(lockId, credential, surfaceId);
});
ipcMain.handle('locks:relock', async (event, lockId: string) => {
  requireTrustedSender(event);
  await locks().relock(lockId);
  return locks().state();
});
ipcMain.handle('locks:recovery', (event) => {
  requireTrustedSender(event);
  return locks().recovery();
});
ipcMain.handle('locks:open-recovery-folder', async (event) => {
  requireTrustedSender(event);
  await locks().openRecoveryFolder();
  return locks().recovery();
});

ipcMain.handle('authenticator:begin', async (event, request: AuthenticatorBeginRequest): Promise<AuthenticatorRegistration> => {
  requireTrustedSender(event);
  return authenticator().begin(request);
});
ipcMain.handle('authenticator:confirm', async (event, registrationId: string, code: string): Promise<AuthenticatorEntry> => {
  requireTrustedSender(event);
  return authenticator().confirm(registrationId, code);
});
ipcMain.handle('authenticator:cancel', async (event, registrationId: string): Promise<boolean> => {
  requireTrustedSender(event);
  return authenticator().cancel(registrationId);
});
ipcMain.handle('authenticator:list', async (event): Promise<AuthenticatorEntry[]> => {
  requireTrustedSender(event);
  return authenticator().list();
});
ipcMain.handle('authenticator:codes', async (event, id: string): Promise<AuthenticatorCodes> => {
  requireTrustedSender(event);
  return authenticator().codes(id);
});
ipcMain.handle('authenticator:remove', async (event, id: string): Promise<boolean> => {
  requireTrustedSender(event);
  return authenticator().remove(id);
});

function personalVocabulary(): PersonalVocabularyStore {
  if (!personalVocabularyStore) personalVocabularyStore = new PersonalVocabularyStore(USER_DIR());
  return personalVocabularyStore;
}

ipcMain.handle('personal-vocabulary:load', async (event): Promise<PersonalVocabularyState> => {
  requireTrustedSender(event);
  return personalVocabulary().load();
});
ipcMain.handle('personal-vocabulary:upload', async (event, payload: unknown): Promise<PersonalVocabularyUploadResult> => {
  requireTrustedSender(event);
  if (!(payload instanceof Uint8Array)) {
    return { ok: false, code: 'invalid-encoding', message: 'Personal vocabulary data is invalid.' };
  }
  const view = payload;
  if (view.byteLength > PERSONAL_VOCABULARY_LIMITS.maxPayloadBytes) {
    return { ok: false, code: 'payload-too-large', message: 'Personal vocabulary data is invalid.' };
  }
  return personalVocabulary().upload(Uint8Array.from(view));
});
ipcMain.handle('personal-vocabulary:clear', async (event): Promise<PersonalVocabularyState> => {
  requireTrustedSender(event);
  return personalVocabulary().clear();
});

function narrationState(): NarrationRuntimeState {
  return {
    platformSpeechAvailable: process.platform === 'win32',
    screenReaderActive: app.isAccessibilitySupportEnabled(),
  };
}

ipcMain.handle('narration:state', (event): NarrationRuntimeState => {
  requireTrustedSender(event);
  return narrationState();
});
ipcMain.handle('narration:enqueue', async (event, narration: NarrationEvent): Promise<NarrationClientResult> => {
  requireTrustedSender(event);
  if (!narration || typeof narration !== 'object') throw new Error('Narration event did not pass validation.');
  return narratorRuntime.narrate(narration);
});
ipcMain.handle('narration:stop', async (event): Promise<void> => {
  requireTrustedSender(event);
  await narratorRuntime.stop();
  narrationTransport.stop();
});
ipcMain.on('narration:speech-result', (event, id: number, ok: boolean, error?: string) => {
  if (!trustedSender(event) || !Number.isSafeInteger(id) || id < 1 || typeof ok !== 'boolean') return;
  narrationTransport.complete(id, ok, typeof error === 'string' ? error : undefined);
});

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  let persistedPreferences: Preferences | undefined;
  try { persistedPreferences = projectPreferences(JSON.parse(await fs.readFile(PREFS_FILE(), 'utf8')) as unknown) ?? undefined; }
  catch { persistedPreferences = undefined; }
  settingsSurfaceService = new SettingsSurfaceService({
    userDataDirectory: USER_DIR(), sharedAppDataDirectory: sharedAppDataDirectory(),
    vault: { write: writeCredential, read: readCredential, delete: deleteCredential },
  });
  lockService = new LockService({ appDataDirectory: USER_DIR() });
  await lockService.initialize();
  const initialSettings = await settingsSurfaceService.initialize(defaultSchoolPreferences(persistedPreferences));
  createWindow();
  win?.setTitle(initialSettings.displayName.displayName);
  settingsSurfaceService.startWatching(broadcastSettingsSurface);
  configureUpdater();
});
app.on('accessibility-support-changed', (_event, enabled) => {
  if (currentNarratorPreferences) narratorRuntime.configure(effectiveNarratorPreferences(currentNarratorPreferences), enabled);
  win?.webContents.send('narration:state', narrationState());
});
app.on('before-quit', () => { lockService?.closeApp(); settingsSurfaceService?.close(); narrationTransport.stop(); void narratorRuntime.stop(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
