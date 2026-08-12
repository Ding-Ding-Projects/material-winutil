import path from 'node:path';

export const VSCODE_DOWNLOAD_URL = 'https://code.visualstudio.com/download';

export const EXTERNAL_EDITOR_LIMITS = Object.freeze({
  configuredEditors: 24,
  labelLength: 80,
  executablePathLength: 1_024,
  portableRoots: 16,
  pathResults: 32,
  arguments: 16,
  argumentLength: 512,
  timeoutMs: 30_000,
  outputBytes: 64 * 1_024,
});

export type EditorKind = 'vscode-stable' | 'vscode-insiders' | 'vscode-portable' | 'configured';
export type EditorSource = 'known-install' | 'path' | 'portable' | 'configured';
export type OpenTargetKind = 'file' | 'folder' | 'workspace-root' | 'export';

export interface ConfiguredEditorRecord {
  readonly id: string;
  readonly label: string;
  readonly executablePath: string;
  readonly arguments?: readonly string[];
}

export interface DetectedEditor {
  readonly id: string;
  readonly kind: EditorKind;
  readonly label: string;
  readonly executablePath: string;
  readonly arguments: readonly string[];
  readonly source: EditorSource;
}

export interface EditorDetectionDependencies {
  readonly isFile: (candidatePath: string) => boolean | Promise<boolean>;
  readonly findOnPath: (command: 'code' | 'code-insiders') => readonly string[] | Promise<readonly string[]>;
}

export interface EditorDetectionOptions {
  readonly localAppData?: string;
  readonly programFiles?: string;
  readonly programFilesX86?: string;
  readonly portableRoots?: readonly string[];
  readonly configuredEditors?: readonly ConfiguredEditorRecord[];
}

export interface EditorPickerModel {
  readonly choices: readonly DetectedEditor[];
  readonly freePath: {
    readonly enabled: true;
    readonly label: 'Choose another editor executable';
    readonly requiresAbsoluteExe: true;
  };
  readonly vscodeDownloadUrl: typeof VSCODE_DOWNLOAD_URL;
}

export interface ExecFileOptions {
  readonly shell: false;
  readonly windowsHide: true;
  readonly timeout: number;
  readonly maxBuffer: number;
  readonly encoding: 'utf8';
}

export type ExecFileCallback = (error: NodeJS.ErrnoException | null, stdout?: string, stderr?: string) => void;
export type ExecFileLike = (
  executablePath: string,
  arguments_: readonly string[],
  options: ExecFileOptions,
  callback: ExecFileCallback,
) => unknown;

export interface LaunchRequest {
  readonly editor: DetectedEditor;
  readonly targetPath: string;
  readonly targetKind: OpenTargetKind;
  readonly timeoutMs?: number;
}

export interface LaunchResult {
  readonly ok: boolean;
  readonly status: 'launched' | 'failed' | 'timed-out' | 'not-installed';
  readonly executablePath?: string;
  readonly arguments?: readonly string[];
  readonly error?: string;
  readonly errorCode?: string;
  readonly vscodeDownloadUrl?: typeof VSCODE_DOWNLOAD_URL;
}

const CONTROL_OR_SHELL = /[\u0000-\u001f\u007f&|<>^;`]/;
const POWERSHELL_SUBSTITUTION = /\$\(/;
const CONTROL_ONLY = /[\u0000-\u001f\u007f]/;

function assertBoundedText(value: string, name: string, maximum: number): string {
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximum) throw new Error(`${name} must contain 1-${maximum} characters`);
  if (CONTROL_OR_SHELL.test(trimmed) || POWERSHELL_SUBSTITUTION.test(trimmed)) {
    throw new Error(`${name} contains control or command-injection characters`);
  }
  return trimmed;
}

export function validateExecutablePath(value: string, name = 'executablePath'): string {
  const candidate = assertBoundedText(value, name, EXTERNAL_EDITOR_LIMITS.executablePathLength);
  if (!path.win32.isAbsolute(candidate) || path.win32.extname(candidate).toLowerCase() !== '.exe') {
    throw new Error(`${name} must be an absolute Windows executable path`);
  }
  return path.win32.normalize(candidate);
}

export function validateLaunchArgument(value: string, name = 'argument'): string {
  const argument = assertBoundedText(value, name, EXTERNAL_EDITOR_LIMITS.argumentLength);
  if (argument.toLowerCase() === '--wait') throw new Error(`${name} must not wait for the editor to close`);
  return argument;
}

function validateTargetPath(value: string): string {
  if (typeof value !== 'string') throw new TypeError('targetPath must be a string');
  const candidate = value.trim();
  if (!candidate || candidate.length > EXTERNAL_EDITOR_LIMITS.executablePathLength * 4) {
    throw new Error('targetPath is empty or exceeds the path limit');
  }
  if (CONTROL_ONLY.test(candidate)) throw new Error('targetPath contains control characters');
  if (!path.win32.isAbsolute(candidate)) throw new Error('targetPath must be an absolute Windows path');
  return path.win32.normalize(candidate);
}

export function validateConfiguredEditors(records: readonly ConfiguredEditorRecord[] = []): readonly ConfiguredEditorRecord[] {
  if (!Array.isArray(records) || records.length > EXTERNAL_EDITOR_LIMITS.configuredEditors) {
    throw new Error(`configuredEditors must contain at most ${EXTERNAL_EDITOR_LIMITS.configuredEditors} records`);
  }
  const ids = new Set<string>();
  return records.map((record, index) => {
    const id = assertBoundedText(record.id, `configuredEditors[${index}].id`, 80);
    if (ids.has(id)) throw new Error(`configuredEditors contains duplicate id "${id}"`);
    ids.add(id);
    const label = assertBoundedText(record.label, `configuredEditors[${index}].label`, EXTERNAL_EDITOR_LIMITS.labelLength);
    const executablePath = validateExecutablePath(record.executablePath, `configuredEditors[${index}].executablePath`);
    const arguments_ = record.arguments ?? [];
    if (!Array.isArray(arguments_) || arguments_.length > EXTERNAL_EDITOR_LIMITS.arguments) {
      throw new Error(`configuredEditors[${index}].arguments must contain at most ${EXTERNAL_EDITOR_LIMITS.arguments} entries`);
    }
    return Object.freeze({
      id,
      label,
      executablePath,
      arguments: Object.freeze(arguments_.map((argument, argumentIndex) =>
        validateLaunchArgument(argument, `configuredEditors[${index}].arguments[${argumentIndex}]`))),
    });
  });
}

function isWithin(candidate: string, root: string): boolean {
  const relative = path.win32.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.win32.isAbsolute(relative));
}

function addRoot(roots: string[], candidate: string | undefined): void {
  if (!candidate) return;
  try {
    const validated = assertBoundedText(candidate, 'trusted root', EXTERNAL_EDITOR_LIMITS.executablePathLength);
    if (path.win32.isAbsolute(validated)) roots.push(path.win32.normalize(validated));
  } catch {
    // An invalid injected environment root is ignored rather than becoming trusted.
  }
}

export async function detectExternalEditors(
  options: EditorDetectionOptions,
  dependencies: EditorDetectionDependencies,
): Promise<readonly DetectedEditor[]> {
  const configured = validateConfiguredEditors(options.configuredEditors);
  if ((options.portableRoots?.length ?? 0) > EXTERNAL_EDITOR_LIMITS.portableRoots) {
    throw new Error(`portableRoots must contain at most ${EXTERNAL_EDITOR_LIMITS.portableRoots} entries`);
  }
  const trustedRoots: string[] = [];
  addRoot(trustedRoots, options.localAppData);
  addRoot(trustedRoots, options.programFiles);
  addRoot(trustedRoots, options.programFilesX86);
  for (const portableRoot of options.portableRoots ?? []) addRoot(trustedRoots, portableRoot);

  const probes: Array<Omit<DetectedEditor, 'arguments'> & { arguments?: readonly string[] }> = [];
  const knownLayouts: Array<[EditorKind, string, string]> = [];
  if (options.localAppData) {
    knownLayouts.push(
      ['vscode-stable', 'Visual Studio Code', path.win32.join(options.localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe')],
      ['vscode-insiders', 'Visual Studio Code Insiders', path.win32.join(options.localAppData, 'Programs', 'Microsoft VS Code Insiders', 'Code - Insiders.exe')],
    );
  }
  for (const root of [options.programFiles, options.programFilesX86]) {
    if (!root) continue;
    knownLayouts.push(
      ['vscode-stable', 'Visual Studio Code', path.win32.join(root, 'Microsoft VS Code', 'Code.exe')],
      ['vscode-insiders', 'Visual Studio Code Insiders', path.win32.join(root, 'Microsoft VS Code Insiders', 'Code - Insiders.exe')],
    );
  }
  for (const root of options.portableRoots ?? []) {
    knownLayouts.push(
      ['vscode-portable', 'Visual Studio Code Portable', path.win32.join(root, 'Code.exe')],
      ['vscode-portable', 'Visual Studio Code Insiders Portable', path.win32.join(root, 'Code - Insiders.exe')],
    );
  }
  for (const [kind, label, executablePath] of knownLayouts) {
    probes.push({ id: `${kind}:${executablePath.toLowerCase()}`, kind, label, executablePath, source: kind === 'vscode-portable' ? 'portable' : 'known-install' });
  }
  for (const [command, kind, label] of [
    ['code', 'vscode-stable', 'Visual Studio Code'] as const,
    ['code-insiders', 'vscode-insiders', 'Visual Studio Code Insiders'] as const,
  ]) {
    const pathResults = await dependencies.findOnPath(command);
    if (!Array.isArray(pathResults) || pathResults.length > EXTERNAL_EDITOR_LIMITS.pathResults) {
      throw new Error(`${command} PATH results must contain at most ${EXTERNAL_EDITOR_LIMITS.pathResults} entries`);
    }
    for (const pathResult of pathResults) {
      try {
        const wrapper = assertBoundedText(pathResult, `${command} PATH result`, EXTERNAL_EDITOR_LIMITS.executablePathLength);
        if (!path.win32.isAbsolute(wrapper)) continue;
        const extension = path.win32.extname(wrapper).toLowerCase();
        const candidate = extension === '.cmd'
          ? path.win32.join(path.win32.dirname(path.win32.dirname(wrapper)), kind === 'vscode-stable' ? 'Code.exe' : 'Code - Insiders.exe')
          : wrapper;
        const validated = validateExecutablePath(candidate, `${command} PATH result`);
        if (trustedRoots.some((root) => isWithin(wrapper, root) && isWithin(validated, root)) && await dependencies.isFile(validated)) {
          probes.push({ id: `${kind}:${validated.toLowerCase()}`, kind, label, executablePath: validated, source: 'path' });
        }
      } catch {
        // Poisoned, relative, or non-executable PATH results are deliberately discarded.
      }
    }
  }
  for (const record of configured) {
    probes.push({ id: `configured:${record.id}`, kind: 'configured', label: record.label, executablePath: record.executablePath, arguments: record.arguments, source: 'configured' });
  }

  const detected: DetectedEditor[] = [];
  const seenPaths = new Set<string>();
  for (const probe of probes) {
    let executablePath: string;
    try {
      executablePath = validateExecutablePath(probe.executablePath);
    } catch {
      continue;
    }
    const key = executablePath.toLowerCase();
    if (seenPaths.has(key) || !(await dependencies.isFile(executablePath))) continue;
    seenPaths.add(key);
    detected.push(Object.freeze({ ...probe, executablePath, arguments: Object.freeze([...(probe.arguments ?? [])]) }));
  }
  return Object.freeze(detected);
}

export function buildEditorPickerModel(editors: readonly DetectedEditor[]): EditorPickerModel {
  return Object.freeze({
    choices: Object.freeze([...editors]),
    freePath: Object.freeze({ enabled: true, label: 'Choose another editor executable', requiresAbsoluteExe: true }),
    vscodeDownloadUrl: VSCODE_DOWNLOAD_URL,
  });
}

export function buildLaunchArguments(editor: DetectedEditor, targetPath: string, targetKind: OpenTargetKind): readonly string[] {
  if (!['file', 'folder', 'workspace-root', 'export'].includes(targetKind)) {
    throw new Error('targetKind must be file, folder, workspace-root, or export');
  }
  const normalized = validateTargetPath(targetPath);
  if (!Array.isArray(editor.arguments) || editor.arguments.length > EXTERNAL_EDITOR_LIMITS.arguments) {
    throw new Error(`editor arguments must contain at most ${EXTERNAL_EDITOR_LIMITS.arguments} entries`);
  }
  const arguments_ = editor.arguments.map((argument, index) => validateLaunchArgument(argument, `editor.arguments[${index}]`));
  if (editor.kind.startsWith('vscode-')) {
    arguments_.push(targetKind === 'folder' || targetKind === 'workspace-root' ? '--new-window' : '--reuse-window');
  }
  arguments_.push(normalized);
  return Object.freeze(arguments_);
}

function boundedTimeout(value: number | undefined): number {
  const timeout = value ?? 10_000;
  if (!Number.isInteger(timeout) || timeout < 250 || timeout > EXTERNAL_EDITOR_LIMITS.timeoutMs) {
    throw new Error(`timeoutMs must be an integer between 250 and ${EXTERNAL_EDITOR_LIMITS.timeoutMs}`);
  }
  return timeout;
}

export async function launchExternalEditor(request: LaunchRequest, execFile: ExecFileLike): Promise<LaunchResult> {
  const executablePath = validateExecutablePath(request.editor.executablePath);
  const arguments_ = buildLaunchArguments(request.editor, request.targetPath, request.targetKind);
  const timeout = boundedTimeout(request.timeoutMs);
  return new Promise((resolve) => {
    const settle = (error: NodeJS.ErrnoException | null): void => {
      if (!error) return resolve({ ok: true, status: 'launched', executablePath, arguments: arguments_ });
      const timedOut = error.code === 'ETIMEDOUT' || (error as NodeJS.ErrnoException & { killed?: boolean }).killed === true;
      resolve({
        ok: false,
        status: timedOut ? 'timed-out' : 'failed',
        executablePath,
        arguments: arguments_,
        error: timedOut ? `Editor launch timed out after ${timeout} ms` : 'The editor could not be started.',
        errorCode: timedOut ? 'EDITOR_TIMEOUT' : `EDITOR_SPAWN_${error.code ?? 'FAILED'}`,
      });
    };
    try {
      execFile(executablePath, arguments_, {
        shell: false,
        windowsHide: true,
        timeout,
        maxBuffer: EXTERNAL_EDITOR_LIMITS.outputBytes,
        encoding: 'utf8',
      }, settle);
    } catch (error) {
      settle(error instanceof Error ? error : new Error('Editor launch failed'));
    }
  });
}

export async function openExportInVSCode(
  exportPath: string,
  editors: readonly DetectedEditor[],
  execFile: ExecFileLike,
  timeoutMs?: number,
): Promise<LaunchResult> {
  const vscode = editors.find((editor) => editor.kind === 'vscode-stable')
    ?? editors.find((editor) => editor.kind === 'vscode-insiders' || editor.kind === 'vscode-portable');
  if (!vscode) {
    return {
      ok: false,
      status: 'not-installed',
      error: 'Visual Studio Code was not found. The export was not opened and nothing was downloaded.',
      vscodeDownloadUrl: VSCODE_DOWNLOAD_URL,
    };
  }
  return launchExternalEditor({ editor: vscode, targetPath: exportPath, targetKind: 'export', timeoutMs }, execFile);
}
