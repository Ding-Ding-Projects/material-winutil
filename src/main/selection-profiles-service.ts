import { randomBytes, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  SELECTION_PROFILES_SCHEMA_VERSION,
  SELECTION_PROFILE_LIMITS,
  parseSelectionProfilesJson,
  serializeSelectionProfilesDocument,
  validateSelectionProfileCreateRequest,
  validateSelectionProfileId,
  validateSelectionProfilesMigrationRequest,
  validateSelectionProfileUpdateRequest,
  type SelectionProfile,
  type SelectionProfileCreateRequest,
  type SelectionProfileUpdateRequest,
  type SelectionProfilesMigrationRequest,
  type SelectionProfilesDocument,
} from '../shared/selection-profiles';

interface SelectionProfilesServiceOptions { readonly userDataDirectory: string; }

async function atomicWrite(file: string, body: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  await fs.writeFile(temporary, body, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try { await fs.rename(temporary, file); }
  catch (error) { await fs.rm(temporary, { force: true }); throw error; }
}

const emptyDocument = (): SelectionProfilesDocument => ({ schemaVersion: SELECTION_PROFILES_SCHEMA_VERSION, profiles: [] });

export class SelectionProfilesService {
  private readonly file: string;
  private document: SelectionProfilesDocument = emptyDocument();
  private writeQueue: Promise<void> = Promise.resolve();
  private unavailableMessage: string | null = null;

  constructor(options: SelectionProfilesServiceOptions) {
    this.file = path.join(options.userDataDirectory, 'selection-profiles.v1.json');
  }

  async initialize(): Promise<readonly SelectionProfile[]> {
    try {
      this.document = parseSelectionProfilesJson(await fs.readFile(this.file, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.unavailableMessage = 'The saved selection profiles are unavailable and were left unchanged.';
        return [];
      }
      this.document = emptyDocument();
      await this.persist();
    }
    return this.list();
  }

  list(): readonly SelectionProfile[] {
    this.requireAvailable();
    return parseSelectionProfilesJson(serializeSelectionProfilesDocument(this.document)).profiles;
  }

  async create(value: unknown): Promise<readonly SelectionProfile[]> {
    this.requireAvailable();
    const request = validateSelectionProfileCreateRequest(value);
    if (this.document.profiles.length >= SELECTION_PROFILE_LIMITS.profiles) throw new Error('Selection profile limit reached. Delete a profile before saving another.');
    const profile: SelectionProfile = { id: `profile-${randomUUID()}`, ...request };
    this.document = { schemaVersion: SELECTION_PROFILES_SCHEMA_VERSION, profiles: [...this.document.profiles, profile] };
    await this.persist();
    return this.list();
  }

  async migrate(value: unknown): Promise<readonly SelectionProfile[]> {
    this.requireAvailable();
    const request = validateSelectionProfilesMigrationRequest(value);
    if (this.document.profiles.length > 0) return this.list();
    const profiles: SelectionProfile[] = request.profiles.map((profile) => ({ id: `profile-${randomUUID()}`, ...profile }));
    this.document = { schemaVersion: SELECTION_PROFILES_SCHEMA_VERSION, profiles };
    await this.persist();
    return this.list();
  }

  async update(id: unknown, value: unknown): Promise<readonly SelectionProfile[]> {
    this.requireAvailable();
    const profileId = validateSelectionProfileId(id);
    const request = validateSelectionProfileUpdateRequest(value);
    const index = this.document.profiles.findIndex((profile) => profile.id === profileId);
    if (index < 0) throw new Error('Selection profile no longer exists. Refresh the profiles and try again.');
    const previous = this.document.profiles[index];
    const next: SelectionProfile = { ...previous, ...request };
    const profiles = [...this.document.profiles];
    profiles[index] = next;
    this.document = { schemaVersion: SELECTION_PROFILES_SCHEMA_VERSION, profiles };
    await this.persist();
    return this.list();
  }

  async delete(ids: unknown): Promise<readonly SelectionProfile[]> {
    this.requireAvailable();
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > SELECTION_PROFILE_LIMITS.profiles) {
      throw new TypeError('Selection profile deletion request is invalid.');
    }
    const wanted = new Set(ids.map(validateSelectionProfileId));
    if (wanted.size !== ids.length) throw new TypeError('Selection profile deletion request is invalid.');
    if ([...wanted].some((id) => !this.document.profiles.some((profile) => profile.id === id))) {
      throw new Error('One or more selection profiles no longer exist. Refresh the profiles and try again.');
    }
    this.document = { schemaVersion: SELECTION_PROFILES_SCHEMA_VERSION, profiles: this.document.profiles.filter((profile) => !wanted.has(profile.id)) };
    await this.persist();
    return this.list();
  }

  private async persist(): Promise<void> {
    const payload = serializeSelectionProfilesDocument(this.document);
    this.writeQueue = this.writeQueue.catch(() => undefined).then(() => atomicWrite(this.file, payload));
    await this.writeQueue;
  }

  private requireAvailable(): void {
    if (this.unavailableMessage) throw new Error(this.unavailableMessage);
  }
}
