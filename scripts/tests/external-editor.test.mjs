import assert from 'node:assert/strict';
import test from 'node:test';

const externalEditor = await import(new URL('../../dist/main/external-editor.js', import.meta.url));

const {
  EXTERNAL_EDITOR_LIMITS,
  VSCODE_DOWNLOAD_URL,
  buildEditorPickerModel,
  buildLaunchArguments,
  detectExternalEditors,
  launchExternalEditor,
  openExportInVSCode,
  validateConfiguredEditors,
  validateExecutablePath,
  validateLaunchArgument,
} = externalEditor;

const roots = {
  localAppData: String.raw`C:\Users\Example\AppData\Local`,
  programFiles: String.raw`C:\Program Files`,
  programFilesX86: String.raw`C:\Program Files (x86)`,
  portableRoots: [String.raw`D:\Portable Apps\VS Code`],
};

function detector(existing, pathResults = {}) {
  const normalized = new Set(existing.map((value) => value.toLowerCase()));
  return {
    isFile: async (candidate) => normalized.has(candidate.toLowerCase()),
    findOnPath: async (command) => pathResults[command] ?? [],
  };
}

function editor(overrides = {}) {
  return {
    id: 'vscode-stable:test',
    kind: 'vscode-stable',
    label: 'Visual Studio Code',
    executablePath: String.raw`C:\Program Files\Microsoft VS Code\Code.exe`,
    arguments: [],
    source: 'known-install',
    ...overrides,
  };
}

test('detects stable, Insiders, system, x86, and portable layouts without duplicates', async () => {
  const installed = [
    String.raw`C:\Users\Example\AppData\Local\Programs\Microsoft VS Code\Code.exe`,
    String.raw`C:\Users\Example\AppData\Local\Programs\Microsoft VS Code Insiders\Code - Insiders.exe`,
    String.raw`C:\Program Files\Microsoft VS Code\Code.exe`,
    String.raw`C:\Program Files (x86)\Microsoft VS Code Insiders\Code - Insiders.exe`,
    String.raw`D:\Portable Apps\VS Code\Code.exe`,
  ];
  const detected = await detectExternalEditors(roots, detector(installed, {
    code: [installed[2]],
    'code-insiders': [installed[3]],
  }));
  assert.deepEqual(detected.map(({ kind, executablePath }) => [kind, executablePath]), [
    ['vscode-stable', installed[0]],
    ['vscode-insiders', installed[1]],
    ['vscode-stable', installed[2]],
    ['vscode-insiders', installed[3]],
    ['vscode-portable', installed[4]],
  ]);
});

test('PATH probing rejects relative, command-shaped, and outside-trusted-root results', async () => {
  const valid = String.raw`C:\Program Files\Microsoft VS Code\Code.exe`;
  const poisoned = [
    'code.exe',
    String.raw`C:\Temp\Code.exe`,
    String.raw`C:\Program Files\Microsoft VS Code\Code.exe & calc.exe`,
    'C:\\Program Files\\Microsoft VS Code\\Code.exe\r\ncalc.exe',
  ];
  const detected = await detectExternalEditors(roots, detector([valid, ...poisoned], { code: [...poisoned, valid] }));
  assert.deepEqual(detected.map((item) => item.executablePath), [valid]);
});

test('PATH command wrappers resolve only to their installed trusted executable', async () => {
  const executable = String.raw`C:\Program Files\Microsoft VS Code\Code.exe`;
  const wrapper = String.raw`C:\Program Files\Microsoft VS Code\bin\code.cmd`;
  const detected = await detectExternalEditors(roots, detector([executable], { code: [wrapper] }));
  assert.deepEqual(detected.map((item) => item.executablePath), [executable]);
});

test('configured editors are bounded, validated, detected, and exposed by the guided picker', async () => {
  const configuredPath = String.raw`E:\Editors\Friendly Editor\friendly.exe`;
  const configuredEditors = [{ id: 'friendly', label: 'Friendly Editor', executablePath: configuredPath, arguments: ['--reuse'] }];
  const detected = await detectExternalEditors({ ...roots, configuredEditors }, detector([configuredPath]));
  assert.deepEqual(detected, [{
    id: 'configured:friendly',
    kind: 'configured',
    label: 'Friendly Editor',
    executablePath: configuredPath,
    arguments: ['--reuse'],
    source: 'configured',
  }]);
  const picker = buildEditorPickerModel(detected);
  assert.equal(picker.choices[0].executablePath, configuredPath);
  assert.deepEqual(picker.freePath, { enabled: true, label: 'Choose another editor executable', requiresAbsoluteExe: true });
  assert.equal(picker.vscodeDownloadUrl, VSCODE_DOWNLOAD_URL);

  assert.throws(() => validateConfiguredEditors(Array.from({ length: EXTERNAL_EDITOR_LIMITS.configuredEditors + 1 }, (_, id) => ({
    id: String(id), label: 'Editor', executablePath: `C:\\Editors\\${id}.exe`,
  }))), /at most/);
  assert.throws(() => validateConfiguredEditors([
    { id: 'same', label: 'One', executablePath: String.raw`C:\One.exe` },
    { id: 'same', label: 'Two', executablePath: String.raw`C:\Two.exe` },
  ]), /duplicate id/);
});

test('file/export and folder/workspace-root launches have exact distinct VS Code arguments', () => {
  const vscode = editor({ arguments: ['--disable-extensions'] });
  const file = String.raw`C:\Exports and Files\result.json`;
  const folder = String.raw`C:\Workspace Root\Project`;
  assert.deepEqual(buildLaunchArguments(vscode, file, 'file'), ['--disable-extensions', '--reuse-window', file]);
  assert.deepEqual(buildLaunchArguments(vscode, file, 'export'), ['--disable-extensions', '--reuse-window', file]);
  assert.deepEqual(buildLaunchArguments(vscode, folder, 'folder'), ['--disable-extensions', '--new-window', folder]);
  assert.deepEqual(buildLaunchArguments(vscode, folder, 'workspace-root'), ['--disable-extensions', '--new-window', folder]);
  assert.deepEqual(buildLaunchArguments(editor(), String.raw`C:\Exports & Files\result.json`, 'file'),
    ['--reuse-window', String.raw`C:\Exports & Files\result.json`]);
});

test('launch uses the trusted executable directly with no shell, hidden UI, and a bounded timeout', async () => {
  const calls = [];
  const execFile = (file, args, options, callback) => {
    calls.push({ file, args, options });
    callback(null, '', '');
  };
  const target = String.raw`C:\Exports and Files\safe result.json`;
  const result = await launchExternalEditor({ editor: editor(), targetPath: target, targetKind: 'file', timeoutMs: 750 }, execFile);
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{
    file: String.raw`C:\Program Files\Microsoft VS Code\Code.exe`,
    args: ['--reuse-window', target],
    options: { shell: false, windowsHide: true, timeout: 750, maxBuffer: EXTERNAL_EDITOR_LIMITS.outputBytes, encoding: 'utf8' },
  }]);
});

test('spawn failures and timeouts return bounded truthful results', async () => {
  const failure = await launchExternalEditor({ editor: editor(), targetPath: String.raw`C:\safe.txt`, targetKind: 'file' },
    (_file, _args, _options, callback) => callback(Object.assign(new Error('spawn refused'), { code: 'EACCES' })));
  assert.deepEqual({ ok: failure.ok, status: failure.status, error: failure.error, errorCode: failure.errorCode },
    { ok: false, status: 'failed', error: 'The editor could not be started.', errorCode: 'EDITOR_SPAWN_EACCES' });

  const timedOut = await launchExternalEditor({ editor: editor(), targetPath: String.raw`C:\safe.txt`, targetKind: 'file', timeoutMs: 250 },
    (_file, _args, _options, callback) => callback(Object.assign(new Error('killed'), { killed: true })));
  assert.deepEqual({ ok: timedOut.ok, status: timedOut.status, error: timedOut.error, errorCode: timedOut.errorCode },
    { ok: false, status: 'timed-out', error: 'Editor launch timed out after 250 ms', errorCode: 'EDITOR_TIMEOUT' });
  const synchronousFailure = await launchExternalEditor({ editor: editor(), targetPath: String.raw`C:\safe.txt`, targetKind: 'file' },
    () => { throw new Error('synchronous spawn failure'); });
  assert.deepEqual({ ok: synchronousFailure.ok, status: synchronousFailure.status, error: synchronousFailure.error },
    { ok: false, status: 'failed', error: 'The editor could not be started.' });
  await assert.rejects(launchExternalEditor({ editor: editor(), targetPath: String.raw`C:\safe.txt`, targetKind: 'file', timeoutMs: 31_000 }, () => {}), /timeoutMs/);
});

test('missing VS Code never spawns or downloads and returns the official download route', async () => {
  let spawned = false;
  const result = await openExportInVSCode(String.raw`C:\Exports\result.json`, [editor({
    id: 'configured:other', kind: 'configured', label: 'Other', executablePath: String.raw`C:\Other\other.exe`, source: 'configured',
  })], () => { spawned = true; });
  assert.equal(spawned, false);
  assert.deepEqual(result, {
    ok: false,
    status: 'not-installed',
    error: 'Visual Studio Code was not found. The export was not opened and nothing was downloaded.',
    vscodeDownloadUrl: VSCODE_DOWNLOAD_URL,
  });
});

test('every export opens directly in detected VS Code, preferring stable', async () => {
  const calls = [];
  const insiders = editor({ id: 'insiders', kind: 'vscode-insiders', executablePath: String.raw`C:\Insiders\Code - Insiders.exe` });
  const stable = editor();
  const target = String.raw`C:\Exports\settings.json`;
  const result = await openExportInVSCode(target, [insiders, stable], (file, args, options, callback) => {
    calls.push({ file, args, options });
    callback(null);
  });
  assert.equal(result.ok, true);
  assert.equal(calls[0].file, stable.executablePath);
  assert.deepEqual(calls[0].args, ['--reuse-window', target]);
});

test('invalid executable paths, targets, and configured arguments fail closed', () => {
  for (const candidate of ['code.exe', String.raw`C:\Code\code.cmd`, 'C:\\Code\\Code.exe\ncalc.exe', String.raw`C:\Code\Code.exe & calc.exe`]) {
    assert.throws(() => validateExecutablePath(candidate), /absolute Windows executable path|control or command-injection/);
  }
  for (const argument of ['--flag;calc', '--flag & calc', '--flag\nnext', '$(calc)']) {
    assert.throws(() => validateLaunchArgument(argument), /control or command-injection/);
  }
  assert.throws(() => buildLaunchArguments(editor(), 'relative.txt', 'file'), /absolute Windows path/);
  assert.throws(() => buildLaunchArguments(editor({ arguments: ['--then;calc'] }), String.raw`C:\safe.txt`, 'file'), /command-injection/);
  assert.throws(() => buildLaunchArguments(editor({ arguments: ['--wait'] }), String.raw`C:\safe.txt`, 'file'), /must not wait/);
  assert.throws(() => buildLaunchArguments(editor(), String.raw`C:\safe.txt`, 'unknown'), /targetKind/);
  assert.throws(() => validateConfiguredEditors([{ id: 'bad', label: 'Bad', executablePath: String.raw`C:\Bad\bad.exe`, arguments: ['--ok', '--then;calc'] }]), /command-injection/);
});
