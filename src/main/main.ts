import { app, BrowserWindow, ipcMain, dialog, nativeTheme } from 'electron';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type {
  CommandResult, ExportFormat, HistoryEntry, Preferences, RunKind, WinutilCatalog,
} from '../shared/types';

const ROOT = path.join(__dirname, '..', '..');
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const USER_DIR = () => app.getPath('userData');
const PREFS_FILE = () => path.join(USER_DIR(), 'preferences.json');
const HISTORY_FILE = () => path.join(USER_DIR(), 'history.jsonl');

let win: BrowserWindow | null = null;

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
      sandbox: false,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win?.show());
  void win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
}

/** Run a native command and always resolve with the real exit code, stdout and stderr. */
function run(file: string, args: string[], cwd = ROOT): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(file, args, { cwd, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err && typeof (err as NodeJS.ErrnoException & { code?: number }).code === 'number'
        ? Number((err as unknown as { code: number }).code)
        : err ? 1 : 0;
      resolve({ ok: code === 0, code, stdout: String(stdout ?? ''), stderr: String(stderr ?? (err?.message ?? '')) });
    });
  });
}

const PACKAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,199}$/;
const STORE_ID = /^[A-Za-z0-9]{1,32}$/;
const POWERSHELL = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';

function unsupported(kind: RunKind): CommandResult {
  return {
    ok: false,
    code: 78,
    stdout: '',
    stderr: `${kind} is not enabled in this build. The verified WinUtil automation adapter is not installed.`,
  };
}

function parsePackage(value: string): { id: string; source: 'winget' | 'msstore' } | null {
  if (value.startsWith('msstore:')) {
    const id = value.slice('msstore:'.length);
    return STORE_ID.test(id) ? { id, source: 'msstore' } : null;
  }
  return PACKAGE_ID.test(value) ? { id: value, source: 'winget' } : null;
}

ipcMain.handle('catalog:load', async (): Promise<WinutilCatalog> => {
  const raw = await fs.readFile(path.join(CONFIG_DIR, 'winutil.json'), 'utf8');
  return JSON.parse(raw) as WinutilCatalog;
});

ipcMain.handle('system:elevated', async (): Promise<boolean> => {
  if (process.platform !== 'win32') return false;
  const res = await run('powershell.exe', [
    '-NoProfile', '-Command',
    '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(544)',
  ]);
  return res.stdout.trim().toLowerCase() === 'true';
});

ipcMain.on('window:action', (_e, action: 'minimize' | 'maximize' | 'close') => {
  if (!win) return;
  if (action === 'minimize') win.minimize();
  else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  else win.close();
});

ipcMain.handle('winutil:run', async (e, kind: RunKind, ids: string[]): Promise<CommandResult> => {
  if (!['install', 'upgrade', 'uninstall', 'tweak', 'undo', 'feature', 'update-profile'].includes(kind)) {
    return { ok: false, code: 64, stdout: '', stderr: 'Unknown operation.' };
  }
  if (!['install', 'upgrade', 'uninstall'].includes(kind)) return unsupported(kind);
  await ensureDependencies();
  const packages = ids.map(parsePackage);
  if (packages.some((item) => item === null)) {
    return { ok: false, code: 64, stdout: '', stderr: 'A package identifier was invalid.' };
  }
  // Package operations are queued one at a time so progress is real and nothing prompts.
  if (kind === 'install' || kind === 'uninstall') {
    const out: string[] = [];
    let worst = 0;
    for (let i = 0; i < ids.length; i += 1) {
      const item = packages[i];
      if (!item) return { ok: false, code: 64, stdout: '', stderr: 'A package identifier was invalid.' };
      e.sender.send('winutil:progress', { id: ids[i], index: i + 1, total: ids.length, state: 'running', detail: ids[i] });
      const res = await run('winget', [
        kind, '--id', item.id, '--source', item.source, '--exact', '--silent', '--disable-interactivity',
        '--accept-package-agreements', '--accept-source-agreements',
      ]);
      out.push(`[${i + 1}/${ids.length}] ${kind} ${ids[i]} — exit ${res.code}\n${res.stdout || res.stderr}`.trim());
      if (res.code !== 0) worst = res.code;
    }
    e.sender.send('winutil:progress', { id: '', index: ids.length, total: ids.length, state: 'done', detail: '' });
    return { ok: worst === 0, code: worst, stdout: out.join('\n'), stderr: '' };
  }
  return run('winget', [
    'upgrade', '--all', '--silent', '--disable-interactivity',
    '--accept-package-agreements', '--accept-source-agreements',
  ]);
});

ipcMain.handle('winutil:installed', async (): Promise<string[]> => {
  const res = await run('winget', ['list', '--disable-interactivity']);
  if (!res.ok) return [];
  return res.stdout.split('\n').slice(2)
    .map((line) => line.trim().split(/\s{2,}/)[1] ?? '')
    .filter(Boolean);
});

interface DepStatus { name: string; present: boolean; installed: boolean; detail: string }
let depsChecked: DepStatus[] | null = null;

/**
 * This release uses the operating system's supported WinGet client. It never downloads
 * or executes a package-manager bootstrap script in the background.
 */
async function ensureDependencies(): Promise<DepStatus[]> {
  if (depsChecked) return depsChecked;
  const out: DepStatus[] = [];

  const winget = await run('winget', ['--version']);
  if (winget.ok) out.push({ name: 'winget', present: true, installed: false, detail: winget.stdout.trim() });
  else {
    const fix = await run(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      'Add-AppxPackage -RegisterByFamilyName -MainPackage Microsoft.DesktopAppInstaller_8wekyb3d8bbwe']);
    const recheck = await run('winget', ['--version']);
    out.push({ name: 'winget', present: false, installed: recheck.ok, detail: recheck.ok ? recheck.stdout.trim() : (fix.stderr || `exit ${fix.code}`) });
  }

  depsChecked = out;
  return out;
}

ipcMain.handle('deps:ensure', async (): Promise<DepStatus[]> => ensureDependencies());

ipcMain.handle('view:export', async (_e, payload: { view: string; format: ExportFormat; body: string }): Promise<string> => {
  const res = await dialog.showSaveDialog({
    title: 'Export view',
    defaultPath: path.join(app.getPath('downloads'), `${payload.view}.${payload.format}`),
  });
  if (res.canceled || !res.filePath) return '';
  await fs.writeFile(res.filePath, payload.body, 'utf8');
  return res.filePath;
});

ipcMain.handle('prefs:read', async (): Promise<Partial<Preferences>> => {
  try { return JSON.parse(await fs.readFile(PREFS_FILE(), 'utf8')) as Partial<Preferences>; }
  catch { return {}; }
});

ipcMain.handle('prefs:write', async (_e, prefs: Preferences): Promise<void> => {
  await fs.mkdir(USER_DIR(), { recursive: true });
  await fs.writeFile(PREFS_FILE(), JSON.stringify(prefs, null, 2), 'utf8');
});

ipcMain.handle('history:read', async (): Promise<HistoryEntry[]> => {
  try {
    const raw = await fs.readFile(HISTORY_FILE(), 'utf8');
    return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l) as HistoryEntry);
  } catch { return []; }
});

ipcMain.handle('history:append', async (_e, entry: Omit<HistoryEntry, 'id' | 'at'>): Promise<HistoryEntry> => {
  const full: HistoryEntry = { ...entry, id: `h-${Date.now()}`, at: new Date().toISOString() };
  await fs.mkdir(USER_DIR(), { recursive: true });
  await fs.appendFile(HISTORY_FILE(), JSON.stringify(full) + '\n', 'utf8');
  return full;
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
