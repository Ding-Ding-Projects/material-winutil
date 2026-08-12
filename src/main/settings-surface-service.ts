import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promises as fs, watch, type FSWatcher } from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import {
  createDefaultDisplayNameState, parseDisplayNameState, renameDisplayName, resetDisplayName,
  serializeDisplayNameState, type DisplayNameState,
} from '../shared/display-name';
import {
  createDefaultDialogEmojiPreferences, parseDialogEmojiPreferences, resolveDialogEmojiDecoration,
  serializeDialogEmojiPreferences, validateDialogEmojiPreferences, type DialogEmojiCategory,
  type DialogEmojiPreferences,
} from '../shared/dialog-emoji';
import {
  changeSchoolModeEnabled, createDefaultSchoolModeState, parseSchoolModeStateJson, renameSchoolMode,
  resetSchoolModeCredentialMetadata, SCHOOL_MODE_SHARED_RECORD_ID, SchoolModeSubscription,
  setSchoolModeCredentialMetadata, updateSchoolModePreferences, validateSchoolModeState,
  type SchoolModePreferences, type SchoolModeState,
} from '../shared/school-mode';
import type { SchoolModeChangeResult, SettingsSurfaceState } from '../shared/types';

const scrypt = promisify(scryptCallback);
const DIALOG_CATEGORIES: readonly DialogEmojiCategory[] = [
  'information', 'success', 'warning', 'error', 'destructive', 'security',
];
const PASSWORD_TARGET = 'school-mode-unlock';
const PASSWORD_ACCOUNT = 'shared-school-mode';
const PASSWORD_RECORD_VERSION = 1;
const MAX_PASSWORD_CODE_POINTS = 256;

export interface SettingsCredentialVault {
  write(target: string, account: string, secret: Uint8Array): Promise<void>;
  read(target: string, account: string): Promise<Buffer | null>;
  delete(target: string, account: string): Promise<boolean>;
}

interface ServiceOptions {
  readonly userDataDirectory: string;
  readonly sharedAppDataDirectory: string;
  readonly vault: SettingsCredentialVault;
}

interface PasswordRecord {
  readonly version: 1;
  readonly salt: string;
  readonly hash: string;
}

function assertPassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length === 0 || Array.from(password).length > MAX_PASSWORD_CODE_POINTS
    || /[\u0000-\u001f\u007f]/u.test(password)) {
    throw new TypeError('The School mode password is invalid.');
  }
}

function preferencesFrom(input: SchoolModePreferences): SchoolModePreferences {
  return {
    language: input.language,
    englishFunnyLevel: input.englishFunnyLevel,
    cantoneseFunnyLevel: input.cantoneseFunnyLevel,
    personalVocabularyEnabled: input.personalVocabularyEnabled,
    dimSumEnabled: input.dimSumEnabled,
  };
}

async function atomicWrite(file: string, body: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  await fs.writeFile(temporary, body, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try { await fs.rename(temporary, file); }
  catch (error) { await fs.rm(temporary, { force: true }); throw error; }
}

export class SettingsSurfaceService {
  private readonly displayNameFile: string;
  private readonly dialogEmojiFile: string;
  private readonly schoolModeFile: string;
  private displayName: DisplayNameState = createDefaultDisplayNameState();
  private dialogEmoji: DialogEmojiPreferences = createDefaultDialogEmojiPreferences();
  private schoolMode: SchoolModeState = createDefaultSchoolModeState();
  private readonly schoolSubscription = new SchoolModeSubscription();
  private watcher: FSWatcher | null = null;
  private listener: ((state: SettingsSurfaceState) => void) | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options: ServiceOptions) {
    this.displayNameFile = path.join(options.userDataDirectory, 'display-name.v1.json');
    this.dialogEmojiFile = path.join(options.userDataDirectory, 'dialog-emoji.v1.json');
    this.schoolModeFile = path.join(options.sharedAppDataDirectory, 'school-mode.v1.json');
  }

  async initialize(preferences: SchoolModePreferences): Promise<SettingsSurfaceState> {
    this.displayName = await this.readOrDefault(this.displayNameFile, parseDisplayNameState, createDefaultDisplayNameState());
    this.dialogEmoji = await this.readOrDefault(this.dialogEmojiFile, parseDialogEmojiPreferences, createDefaultDialogEmojiPreferences());
    let writeDefaultSchoolMode = false;
    try {
      this.schoolMode = parseSchoolModeStateJson(await fs.readFile(this.schoolModeFile, 'utf8'));
      this.schoolSubscription.ingest(this.schoolMode);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.schoolMode = createDefaultSchoolModeState(preferences);
        this.schoolSubscription.ingest(this.schoolMode);
        writeDefaultSchoolMode = true;
      } else {
        this.schoolSubscription.markUnavailable('read-failed');
      }
    }
    await Promise.all([
      atomicWrite(this.displayNameFile, serializeDisplayNameState(this.displayName)),
      atomicWrite(this.dialogEmojiFile, serializeDialogEmojiPreferences(this.dialogEmoji)),
      writeDefaultSchoolMode ? atomicWrite(this.schoolModeFile, JSON.stringify(this.schoolMode)) : Promise.resolve(),
    ]);
    return this.snapshot();
  }

  snapshot(): SettingsSurfaceState {
    const schoolMode = this.schoolSubscription.snapshot();
    const suppressDecoration = schoolMode.status !== 'ready' || schoolMode.effective.enabled;
    const dialogDecorations = Object.fromEntries(DIALOG_CATEGORIES.map((category) => [
      category, resolveDialogEmojiDecoration(this.dialogEmoji, category, suppressDecoration)?.glyph ?? null,
    ])) as Record<DialogEmojiCategory, string | null>;
    return Object.freeze({ displayName: this.displayName, dialogEmoji: this.dialogEmoji, dialogDecorations, schoolMode });
  }

  async renameDisplayName(value: string): Promise<SettingsSurfaceState> {
    const result = renameDisplayName(this.displayName, value, new Date().toISOString());
    this.displayName = result.state;
    await atomicWrite(this.displayNameFile, serializeDisplayNameState(this.displayName));
    return this.emit();
  }

  async resetDisplayName(): Promise<SettingsSurfaceState> {
    this.displayName = resetDisplayName(this.displayName, new Date().toISOString()).state;
    await atomicWrite(this.displayNameFile, serializeDisplayNameState(this.displayName));
    return this.emit();
  }

  async setDialogEmojis(enabled: boolean): Promise<SettingsSurfaceState> {
    this.dialogEmoji = validateDialogEmojiPreferences({ schemaVersion: 1, showEmojisInDialogsAndMessageBoxes: enabled });
    await atomicWrite(this.dialogEmojiFile, serializeDialogEmojiPreferences(this.dialogEmoji));
    return this.emit();
  }

  async renameSchoolMode(displayLabel: string): Promise<SettingsSurfaceState> {
    return this.persistSchoolMode(renameSchoolMode(this.schoolMode, displayLabel));
  }

  async configureSchoolModePassword(password: string): Promise<SettingsSurfaceState> {
    assertPassword(password);
    const salt = randomBytes(16);
    const derivedValue = await scrypt(password, salt, 32);
    if (!(derivedValue instanceof Buffer)) throw new Error('The School mode password verifier is unavailable.');
    const derived = Buffer.from(derivedValue);
    const record: PasswordRecord = { version: PASSWORD_RECORD_VERSION, salt: salt.toString('base64'), hash: derived.toString('base64') };
    const encoded = Buffer.from(JSON.stringify(record), 'utf8');
    try { await this.options.vault.write(PASSWORD_TARGET, PASSWORD_ACCOUNT, encoded); }
    finally { salt.fill(0); derived.fill(0); encoded.fill(0); }
    const revision = this.schoolMode.credential.revision + 1 || 1;
    return this.persistSchoolMode(setSchoolModeCredentialMetadata(this.schoolMode, {
      method: 'password', credentialId: PASSWORD_TARGET, revision,
    }));
  }

  async resetSchoolModeCredential(): Promise<SettingsSurfaceState> {
    await this.options.vault.delete(PASSWORD_TARGET, PASSWORD_ACCOUNT);
    return this.persistSchoolMode(resetSchoolModeCredentialMetadata(this.schoolMode));
  }

  async setSchoolModeEnabled(enabled: boolean, password?: string): Promise<SchoolModeChangeResult> {
    if (enabled && this.schoolSubscription.snapshot().status !== 'ready') {
      return { ok: false, code: 'credential-unavailable', state: this.schoolMode };
    }
    if (enabled && this.schoolMode.credential.method === 'none') {
      return { ok: false, code: 'credential-unavailable', state: this.schoolMode };
    }
    const result = await changeSchoolModeEnabled(this.schoolMode, enabled, async (request) => {
      if (request.credentialMethod === 'none') return { status: 'accepted' as const };
      if (request.credentialMethod !== 'password' || request.credentialId !== PASSWORD_TARGET || typeof password !== 'string') {
        return { status: 'unavailable' as const };
      }
      return { status: await this.verifyPassword(password) ? 'accepted' as const : 'rejected' as const };
    });
    if (!result.ok) return { ok: false, code: result.code, state: result.state };
    if (result.changed) await this.persistSchoolMode(result.state);
    return { ok: true, state: result.state };
  }

  async updatePreferences(preferences: SchoolModePreferences): Promise<void> {
    if (this.schoolSubscription.snapshot().status !== 'ready') return;
    const next = updateSchoolModePreferences(this.schoolMode, preferencesFrom(preferences));
    if (next.generation !== this.schoolMode.generation) await this.persistSchoolMode(next);
  }

  startWatching(listener: (state: SettingsSurfaceState) => void): void {
    this.listener = listener;
    if (this.watcher) return;
    try {
      this.watcher = watch(path.dirname(this.schoolModeFile), { persistent: false }, (_event, filename) => {
        if (filename && filename.toString() !== path.basename(this.schoolModeFile)) return;
        void this.reloadSharedRecord();
      });
    } catch {
      this.schoolSubscription.markUnavailable('watch-failed');
      this.emit();
      return;
    }
    this.watcher.on('error', () => {
      this.schoolSubscription.markUnavailable('watch-failed');
      this.emit();
    });
  }

  close(): void { this.watcher?.close(); this.watcher = null; this.listener = null; }

  private async readOrDefault<T>(file: string, parser: (source: string) => T, fallback: T): Promise<T> {
    try { return parser(await fs.readFile(file, 'utf8')); } catch { return fallback; }
  }

  private async persistSchoolMode(state: SchoolModeState): Promise<SettingsSurfaceState> {
    this.schoolMode = validateSchoolModeState(state);
    this.schoolSubscription.ingest(this.schoolMode);
    this.writeQueue = this.writeQueue.catch(() => undefined).then(() => atomicWrite(this.schoolModeFile, JSON.stringify(this.schoolMode)));
    await this.writeQueue;
    return this.emit();
  }

  private async reloadSharedRecord(): Promise<void> {
    try {
      const next = parseSchoolModeStateJson(await fs.readFile(this.schoolModeFile, 'utf8'));
      if (this.schoolSubscription.ingest(next).accepted) { this.schoolMode = next; this.emit(); }
    } catch {
      this.schoolSubscription.markUnavailable('read-failed');
      this.emit();
    }
  }

  private async verifyPassword(password: string): Promise<boolean> {
    assertPassword(password);
    const encoded = await this.options.vault.read(PASSWORD_TARGET, PASSWORD_ACCOUNT);
    if (!encoded) return false;
    let derived: Buffer | null = null;
    let expected: Buffer | null = null;
    let salt: Buffer | null = null;
    try {
      const record = JSON.parse(encoded.toString('utf8')) as Partial<PasswordRecord>;
      if (record.version !== PASSWORD_RECORD_VERSION || typeof record.salt !== 'string' || typeof record.hash !== 'string') return false;
      salt = Buffer.from(record.salt, 'base64'); expected = Buffer.from(record.hash, 'base64');
      if (salt.byteLength !== 16 || expected.byteLength !== 32) return false;
      const derivedValue = await scrypt(password, salt, 32);
      if (!(derivedValue instanceof Buffer)) return false;
      derived = Buffer.from(derivedValue);
      return timingSafeEqual(derived, expected);
    } catch { return false; }
    finally { encoded.fill(0); derived?.fill(0); expected?.fill(0); salt?.fill(0); }
  }

  private emit(): SettingsSurfaceState {
    const snapshot = this.snapshot();
    this.listener?.(snapshot);
    return snapshot;
  }
}

export { SCHOOL_MODE_SHARED_RECORD_ID };
