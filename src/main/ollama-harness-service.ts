import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  OLLAMA_HARNESS_PROFILES, createHarnessPlan, restoreHarnessSnapshot,
  type OllamaCatalogVariant, type OllamaHarnessConfiguration, type OllamaHarnessExecutable,
  type OllamaHarnessLaunchResult, type OllamaHarnessPlan, type OllamaHarnessPreflightRequest,
  type OllamaHarnessProfileId, type OllamaHarnessRestoreResult, type OllamaHealthSnapshot,
} from '../shared/ollama-suite';

interface HarnessDependencies {
  resolveVariant(model: string): Promise<OllamaCatalogVariant>;
  health(): Promise<OllamaHealthSnapshot>;
  now?: () => Date;
}

interface ActiveHarnessPlan {
  token: string;
  plan: OllamaHarnessPlan;
}

const EXECUTABLE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  vscode: 'Code.exe',
  opencode: 'opencode.exe',
  'open-webui': 'open-webui.exe',
});

function environmentRoot(name: string): string | null {
  const value = process.env[name];
  return value && path.isAbsolute(value) ? path.resolve(value) : null;
}

function allowedRoots(executableId: string): string[] {
  const roots = [
    environmentRoot('LOCALAPPDATA') && path.join(environmentRoot('LOCALAPPDATA')!, 'Programs'),
    environmentRoot('ProgramFiles'),
    environmentRoot('ProgramFiles(x86)'),
  ].filter((value): value is string => Boolean(value));
  return [...new Set(roots.map((value) => path.resolve(value)))];
}

function knownCandidates(executableId: string): string[] {
  const executable = EXECUTABLE_NAMES[executableId];
  if (!executable) return [];
  const productDirectories = executableId === 'vscode'
    ? ['Microsoft VS Code']
    : executableId === 'opencode'
      ? ['OpenCode']
      : ['Open WebUI'];
  return allowedRoots(executableId).flatMap((root) => productDirectories.map((directory) => path.join(root, directory, executable)));
}

function isInsideRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function safeBaseEnvironment(): NodeJS.ProcessEnv {
  const allowed = [
    'SystemRoot', 'WINDIR', 'ComSpec', 'PATH', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE',
    'LOCALAPPDATA', 'APPDATA', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)',
  ];
  return Object.fromEntries(allowed.flatMap((key) => {
    const value = process.env[key];
    return value === undefined ? [] : [[key, value]];
  }));
}

export class OllamaHarnessService {
  private active: ActiveHarnessPlan | null = null;
  private readonly now: () => Date;

  constructor(private readonly dependencies: HarnessDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  private profile(profileId: unknown) {
    const profile = OLLAMA_HARNESS_PROFILES.find(({ id }) => id === profileId);
    if (!profile) throw new Error('Harness profile is not allowlisted.');
    return profile;
  }

  private async validateExecutable(profileId: OllamaHarnessProfileId, candidate: unknown): Promise<OllamaHarnessExecutable> {
    const profile = this.profile(profileId);
    if (typeof candidate !== 'string' || !candidate || candidate.length > 4_096 || !path.isAbsolute(candidate)) {
      throw new Error('Select a detected allowlisted harness executable.');
    }
    const normalized = path.resolve(candidate);
    const expectedName = EXECUTABLE_NAMES[profile.executableId];
    if (!expectedName || path.basename(normalized).toLowerCase() !== expectedName.toLowerCase()
      || !allowedRoots(profile.executableId).some((root) => isInsideRoot(normalized, root))) {
      throw new Error('The selected executable is outside this profile’s allowlisted installed locations.');
    }
    const stat = await fs.stat(normalized).catch(() => null);
    if (!stat?.isFile()) throw new Error('The selected allowlisted executable is no longer installed.');
    return { profileId, executableId: profile.executableId, path: normalized, label: profile.label };
  }

  async detectedExecutables(profileId: unknown): Promise<OllamaHarnessExecutable[]> {
    const profile = this.profile(profileId);
    const candidates = await Promise.all(knownCandidates(profile.executableId).map(async (candidate) => {
      const stat = await fs.stat(candidate).catch(() => null);
      return stat?.isFile() ? this.validateExecutable(profile.id, candidate) : null;
    }));
    return candidates.filter((item): item is OllamaHarnessExecutable => item !== null);
  }

  async preflight(request: OllamaHarnessPreflightRequest): Promise<OllamaHarnessPlan> {
    if (!request || typeof request !== 'object') throw new Error('Harness preflight request is invalid.');
    const profile = this.profile(request.profileId);
    const executable = await this.validateExecutable(profile.id, request.executablePath);
    const variant = await this.dependencies.resolveVariant(request.model);
    const workspace = request.configuration?.workspaceFolder;
    if (workspace !== undefined) {
      if (!path.isAbsolute(workspace)) throw new Error('Choose a workspace folder using the native folder picker.');
      const workspaceStat = await fs.stat(workspace).catch(() => null);
      if (!workspaceStat?.isDirectory()) throw new Error('The selected workspace folder is no longer available.');
    }
    if (!variant.capabilities.includes('text')) throw new Error('The selected installed model does not report text capability required by this harness profile.');
    const plan = createHarnessPlan(profile.id, variant, request.configuration, executable, this.now());
    this.active = { token: randomUUID(), plan };
    return structuredClone(plan);
  }

  private activePlan(plan: unknown): ActiveHarnessPlan {
    if (!this.active || !plan || typeof plan !== 'object') throw new Error('Create a fresh harness preview before launching.');
    const candidate = plan as OllamaHarnessPlan;
    if (candidate.schemaVersion !== 1 || candidate.executablePath !== this.active.plan.executablePath
      || candidate.profileId !== this.active.plan.profileId || candidate.model !== this.active.plan.model
      || candidate.snapshot.createdAt !== this.active.plan.snapshot.createdAt) {
      throw new Error('Harness launch plan does not match the active reviewed preflight.');
    }
    return this.active;
  }

  private start(plan: OllamaHarnessPlan): Promise<ChildProcess> {
    const args = [...plan.arguments];
    const workspace = plan.snapshot.configuration.workspaceFolder;
    if (workspace && plan.profileId === 'vscode-continue') args.push(workspace);
    const env = { ...safeBaseEnvironment(), ...plan.environment };
    return new Promise((resolve, reject) => {
      const child = spawn(plan.executablePath, args, { cwd: workspace || undefined, env, shell: false, windowsHide: true, detached: true, stdio: 'ignore' });
      child.once('error', reject);
      child.once('spawn', () => { child.unref(); resolve(child); });
    });
  }

  async launch(plan: unknown): Promise<OllamaHarnessLaunchResult> {
    const active = this.activePlan(plan);
    const executable = await this.validateExecutable(active.plan.profileId, active.plan.executablePath);
    if (executable.path !== active.plan.executablePath) throw new Error('Harness executable changed after preflight. Preview again before launch.');
    let child: ChildProcess | null = null;
    try {
      child = await this.start(active.plan);
      const health = await this.dependencies.health();
      if (health.state !== 'healthy') throw new Error('The local Ollama API was not ready after harness launch.');
      return { schemaVersion: 1, plan: structuredClone(active.plan), state: 'ready',
        readiness: { ollamaHealthy: true, processStarted: true, checkedAt: this.now().toISOString(), message: 'The allowlisted harness process started and the local Ollama API is healthy.' },
        restoredConfiguration: null };
    } catch (error) {
      if (child && child.exitCode === null && !child.killed) child.kill();
      const restored = restoreHarnessSnapshot(active.plan);
      return { schemaVersion: 1, plan: structuredClone(active.plan), state: 'rolled-back',
        readiness: { ollamaHealthy: false, processStarted: Boolean(child), checkedAt: this.now().toISOString(), message: error instanceof Error ? error.message : 'Harness launch failed.' },
        restoredConfiguration: restored };
    }
  }

  restore(plan: unknown): OllamaHarnessRestoreResult {
    const active = this.activePlan(plan);
    const configuration = restoreHarnessSnapshot(active.plan);
    return { schemaVersion: 1, restored: true, configuration, message: 'The reviewed harness configuration snapshot was restored locally.' };
  }
}
