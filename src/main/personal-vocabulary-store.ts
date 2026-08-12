import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  loadPersonalVocabularyCache,
  validatePersonalVocabulary,
  type PersonalVocabularyDocument,
} from '../shared/personal-vocabulary';
import type { PersonalVocabularyState, PersonalVocabularyUploadResult } from '../shared/types';

const EMPTY_MAPPINGS = Object.freeze(Object.create(null) as Record<string, never>);

function publicState(document: PersonalVocabularyDocument): PersonalVocabularyState {
  return Object.freeze({
    state: 'loaded' as const,
    entryCount: Object.keys(document.mappings).length,
    mappings: Object.freeze({ ...document.mappings }),
  });
}

export class PersonalVocabularyStore {
  private readonly cachePath: string;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly appDataDirectory: string) {
    this.cachePath = path.join(appDataDirectory, 'personal-vocabulary.cache.json');
  }

  async load(): Promise<PersonalVocabularyState> {
    await this.mutationQueue.catch(() => undefined);
    try {
      const payload = await fs.readFile(this.cachePath);
      const validation = loadPersonalVocabularyCache(payload);
      return validation.ok
        ? publicState(validation.document)
        : Object.freeze({ state: 'invalid', entryCount: 0, mappings: EMPTY_MAPPINGS });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return Object.freeze({ state: 'empty', entryCount: 0, mappings: EMPTY_MAPPINGS });
      }
      return Object.freeze({ state: 'invalid', entryCount: 0, mappings: EMPTY_MAPPINGS });
    }
  }

  async upload(payload: Uint8Array): Promise<PersonalVocabularyUploadResult> {
    const validation = validatePersonalVocabulary(payload);
    if (!validation.ok) return validation;
    const write = async (): Promise<void> => {
      await fs.mkdir(this.appDataDirectory, { recursive: true });
      const temporary = `${this.cachePath}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, validation.canonicalCache, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        await fs.rename(temporary, this.cachePath);
      } finally {
        await fs.rm(temporary, { force: true });
      }
    };
    const queued = this.mutationQueue.catch(() => undefined).then(write);
    this.mutationQueue = queued;
    await queued;
    return Object.freeze({ ok: true, vocabulary: publicState(validation.document) });
  }

  async clear(): Promise<PersonalVocabularyState> {
    const queued = this.mutationQueue.catch(() => undefined).then(() => fs.rm(this.cachePath, { force: true }));
    this.mutationQueue = queued;
    await queued;
    return Object.freeze({ state: 'empty', entryCount: 0, mappings: EMPTY_MAPPINGS });
  }
}
