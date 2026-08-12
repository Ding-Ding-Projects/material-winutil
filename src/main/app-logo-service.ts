import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  APP_LOGO_LIMITS,
  createAppLogoExportMetadata,
  createCustomAppLogoState,
  createPresetAppLogoState,
  defaultAppLogoTransform,
  parseAppLogoPersistedState,
  renderAppLogoPreset,
  renderCustomAppLogo,
  resetAppLogoState,
  serializeAppLogoPersistedState,
  validateAppLogoTransform,
  validateAppLogoUpload,
  type AppLogoDerivedAsset,
  type AppLogoExportMetadata,
  type AppLogoPersistedState,
  type AppLogoPresetId,
  type AppLogoTransform,
} from '../shared/app-logo';

export interface AppLogoRuntimeSnapshot {
  readonly persisted: AppLogoPersistedState;
  readonly assets: readonly AppLogoDerivedAsset[];
  readonly exportMetadata: AppLogoExportMetadata;
  readonly identityBoundary: 'presentation-only';
  readonly sourceRetention: 'derived-raster-only';
}

interface AppLogoServiceOptions {
  readonly userDataDirectory: string;
}

async function atomicWrite(file: string, body: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  await fs.writeFile(temporary, body, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try { await fs.rename(temporary, file); }
  catch (error) { await fs.rm(temporary, { force: true }); throw error; }
}

function decodePersistedCustom(state: AppLogoPersistedState): Uint8Array | null {
  if (state.selection.kind !== 'custom') return null;
  const comma = state.selection.derivedAsset.dataUrl.indexOf(',');
  if (comma < 0) return null;
  return Uint8Array.from(Buffer.from(state.selection.derivedAsset.dataUrl.slice(comma + 1), 'base64'));
}

function runtimeAssets(state: AppLogoPersistedState): readonly AppLogoDerivedAsset[] {
  if (state.selection.kind === 'preset') return renderAppLogoPreset(state.selection.presetId, state.transform);
  const bytes = decodePersistedCustom(state);
  if (!bytes) throw new Error('The derived app logo is unavailable.');
  try {
    const upload = validateAppLogoUpload({ bytes, fileName: 'derived-logo.png', mediaType: 'image/png' });
    return renderCustomAppLogo(upload, state.transform);
  } finally { bytes.fill(0); }
}

function snapshot(state: AppLogoPersistedState): AppLogoRuntimeSnapshot {
  const exportMetadata = createAppLogoExportMetadata(state);
  if (!exportMetadata) throw new Error('The app-logo export boundary is unavailable.');
  return Object.freeze({
    persisted: state,
    assets: runtimeAssets(state),
    exportMetadata,
    identityBoundary: 'presentation-only' as const,
    sourceRetention: 'derived-raster-only' as const,
  });
}

export class AppLogoService {
  private readonly file: string;
  private state: AppLogoPersistedState = resetAppLogoState();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: AppLogoServiceOptions) {
    this.file = path.join(options.userDataDirectory, 'app-logo.v1.json');
  }

  async initialize(): Promise<AppLogoRuntimeSnapshot> {
    let parsed: AppLogoPersistedState | null = null;
    try { parsed = parseAppLogoPersistedState(await fs.readFile(this.file)); } catch { parsed = null; }
    this.state = parsed ?? resetAppLogoState();
    await this.persist();
    return this.snapshot();
  }

  snapshot(): AppLogoRuntimeSnapshot { return snapshot(this.state); }

  async selectPreset(presetId: AppLogoPresetId, transformValue: unknown): Promise<AppLogoRuntimeSnapshot> {
    const transform = validateAppLogoTransform(transformValue);
    if (!transform) throw new TypeError('The app-logo transform is invalid.');
    this.state = createPresetAppLogoState(presetId, transform);
    await this.persist();
    return this.snapshot();
  }

  async selectCustomPng(bytesValue: Uint8Array, transformValue: unknown): Promise<AppLogoRuntimeSnapshot> {
    const transform = validateAppLogoTransform(transformValue);
    if (!transform) throw new TypeError('The app-logo transform is invalid.');
    if (!(bytesValue instanceof Uint8Array) || bytesValue.byteLength === 0 || bytesValue.byteLength > APP_LOGO_LIMITS.maxUploadBytes) {
      throw new TypeError('The local PNG payload is invalid.');
    }
    const source = Uint8Array.from(bytesValue);
    try {
      const upload = validateAppLogoUpload({ bytes: source, fileName: 'selected-logo.png', mediaType: 'image/png' });
      // Persist one normalized, derived 256px raster independently from the
      // live transform. This keeps the source private while allowing later
      // crop/fit/focal/background edits without repeatedly baking them in.
      const canonicalAssets = renderCustomAppLogo(upload, defaultAppLogoTransform());
      this.state = createCustomAppLogoState(transform, canonicalAssets);
      await this.persist();
      return this.snapshot();
    } finally { source.fill(0); }
  }

  async updateTransform(transformValue: unknown): Promise<AppLogoRuntimeSnapshot> {
    const transform = validateAppLogoTransform(transformValue);
    if (!transform) throw new TypeError('The app-logo transform is invalid.');
    if (this.state.selection.kind === 'preset') return this.selectPreset(this.state.selection.presetId, transform);
    this.state = createCustomAppLogoState(transform, [this.state.selection.derivedAsset]);
    await this.persist();
    return this.snapshot();
  }

  async reset(): Promise<AppLogoRuntimeSnapshot> {
    this.state = resetAppLogoState();
    await this.persist();
    return this.snapshot();
  }

  private async persist(): Promise<void> {
    const payload = serializeAppLogoPersistedState(this.state);
    if (!payload) throw new Error('The derived app-logo state could not be serialized safely.');
    this.writeQueue = this.writeQueue.catch(() => undefined).then(() => atomicWrite(this.file, payload));
    await this.writeQueue;
  }
}
