import { app, autoUpdater, BrowserWindow, ipcMain, dialog, nativeTheme, session } from 'electron';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import squirrelStartup from 'electron-squirrel-startup';
import type {
  CommandResult, ExportFormat, HistoryEntry, Preferences, RunKind, UpdateStatus, WinutilCatalog,
} from '../shared/types';
import { resolvePackageRequest, validateCatalog, wingetArgs } from './package-policy';

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
const UPDATE_FEED = 'https://github.com/Ding-Ding-Projects/material-winutil/releases/latest/download/';
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_TEXT_PAYLOAD = 2 * 1024 * 1024;
const MAX_HISTORY_FIELD = 4096;
const MAX_HISTORY_BYTES = 2 * 1024 * 1024;
const MAX_HISTORY_ENTRIES = 500;
const EXPORT_EXTENSIONS: Record<ExportFormat, string> = {
  md: 'md', txt: 'txt', json: 'json', jsonl: 'jsonl', yaml: 'yaml', toml: 'toml', xml: 'xml',
  csv: 'csv', tsv: 'tsv', html: 'html', sql: 'sql', ts: 'ts', py: 'py', go: 'go', rs: 'rs',
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
    || !isNumber('enFunny', 1, 5) || !isNumber('yueFunny', 1, 5)
    || typeof input.accent !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(input.accent)
    || typeof input.font !== 'string' || input.font.length < 1 || input.font.length > 120 || /[\u0000-\u001F\u007F]/.test(input.font)
    || !isNumber('scale', 0.5, 3) || !isNumber('weight', 100, 1000) || !isNumber('radius', 0, 64)
    || typeof input.reducedMotion !== 'boolean'
    || typeof input.exportFormat !== 'string' || !(input.exportFormat in EXPORT_EXTENSIONS)) return null;
  return {
    theme: input.theme as Preferences['theme'], density: input.density as Preferences['density'],
    language: input.language as Preferences['language'], narrator: input.narrator as Preferences['narrator'],
    narratorEnabled: input.narratorEnabled, enFunny: Number(input.enFunny), yueFunny: Number(input.yueFunny),
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

ipcMain.handle('view:export', async (_e, payload: { view: string; format: ExportFormat; body: string }): Promise<string> => {
  if (!trustedSender(_e)) throw new Error('The export request did not originate from the application renderer.');
  if (!payload || typeof payload.view !== 'string' || !EXPORT_VIEWS.has(payload.view)
    || typeof payload.format !== 'string' || !(payload.format in EXPORT_EXTENSIONS)
    || typeof payload.body !== 'string' || Buffer.byteLength(payload.body, 'utf8') > MAX_TEXT_PAYLOAD) throw new Error('The export payload is invalid or too large.');
  const extension = EXPORT_EXTENSIONS[payload.format as ExportFormat];
  const basename = payload.view.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80);
  const res = await dialog.showSaveDialog({
    title: 'Export view',
    defaultPath: path.join(app.getPath('downloads'), `${basename}.${extension}`),
  });
  if (res.canceled || !res.filePath) return '';
  await fs.writeFile(res.filePath, payload.body, 'utf8');
  return res.filePath;
});

ipcMain.handle('prefs:read', async (event): Promise<Partial<Preferences>> => {
  requireTrustedSender(event);
  try { return projectPreferences(JSON.parse(await fs.readFile(PREFS_FILE(), 'utf8')) as unknown) ?? {}; }
  catch { return {}; }
});

ipcMain.handle('prefs:write', async (_e, prefs: Preferences): Promise<void> => {
  if (!trustedSender(_e)) throw new Error('The preferences request did not originate from the application renderer.');
  const projected = projectPreferences(prefs);
  if (!projected) throw new Error('Preferences did not pass validation.');
  await fs.mkdir(USER_DIR(), { recursive: true });
  await atomicWrite(PREFS_FILE(), JSON.stringify(projected, null, 2));
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
  return full;
});

ipcMain.handle('update:status', (event): UpdateStatus => { requireTrustedSender(event); return updateStatus; });
ipcMain.handle('update:check', async (event): Promise<UpdateStatus> => { requireTrustedSender(event); return checkForUpdates(); });
ipcMain.on('update:restart', (event) => { if (trustedSender(event) && updateStatus.state === 'ready') autoUpdater.quitAndInstall(); });

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  createWindow();
  configureUpdater();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
