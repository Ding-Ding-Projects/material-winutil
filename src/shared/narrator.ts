export type NarratorLanguage = 'English' | 'Yue' | 'Both';
export type SpokenLanguage = Exclude<NarratorLanguage, 'Both'>;
export type NarrationKind = 'event' | 'error';

export interface NarrationText {
  English: string;
  Yue: string;
}

export interface NarrationInput {
  category: string;
  text: NarrationText;
  kind?: NarrationKind;
}

export interface NarratorClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface NarrationFormatRequest {
  sourceText: string;
  language: SpokenLanguage;
  funnyLevel: number;
  category: string;
  kind: NarrationKind;
}

export interface NarrationSpeakRequest {
  text: string;
  language: SpokenLanguage;
  category: string;
  kind: NarrationKind;
  signal: AbortSignal;
}

export type NarrationFormatter = (request: NarrationFormatRequest) => string;
export type NarratorSpeak = (request: NarrationSpeakRequest) => void | Promise<void>;

export type NarrationSuppressionReason =
  | 'disabled'
  | 'quiet'
  | 'reduced-sound'
  | 'screen-reader'
  | 'cooldown'
  | 'queue-full';

export interface NarrationSuppression {
  id: number;
  category: string;
  kind: NarrationKind;
  reason: NarrationSuppressionReason;
  /** Error facts are returned unchanged so the caller can preserve them visually. */
  preservedText?: Readonly<NarrationText>;
}

export type NarrationResult =
  | { id: number; status: 'spoken'; languages: readonly SpokenLanguage[] }
  | ({ status: 'suppressed' } & NarrationSuppression)
  | { id: number; status: 'superseded' | 'cancelled' | 'stopped' }
  | { id: number; status: 'failed'; error: unknown };

export interface NarrationTicket {
  id: number;
  completion: Promise<NarrationResult>;
  cancel(): boolean;
}

export interface NarratorConfig {
  enabled: boolean;
  language: NarratorLanguage;
  englishFunnyLevel: number;
  yueFunnyLevel: number;
  debounceMs: number;
  cooldownMs: number;
  categoryCooldownMs: Readonly<Record<string, number>>;
  quiet: boolean;
  reducedSound: boolean;
  screenReaderActive: boolean;
  maxTextLength: number;
  maxCategoryLength: number;
  maxQueueSize: number;
}

export interface NarratorOptions {
  speak: NarratorSpeak;
  formatter?: NarrationFormatter;
  clock?: NarratorClock;
  config?: Partial<NarratorConfig>;
  onSuppressed?: (suppression: NarrationSuppression) => void;
}

export const NARRATOR_LIMITS = Object.freeze({
  maxTextLength: 16_384,
  maxCategoryLength: 128,
  maxQueueSize: 128,
  maxDelayMs: 86_400_000,
  maxClockValue: Number.MAX_SAFE_INTEGER,
});

export const DEFAULT_NARRATOR_CONFIG: Readonly<NarratorConfig> = Object.freeze({
  enabled: false,
  language: 'English',
  englishFunnyLevel: 1,
  yueFunnyLevel: 1,
  debounceMs: 250,
  cooldownMs: 3_000,
  categoryCooldownMs: Object.freeze({}),
  quiet: false,
  reducedSound: false,
  screenReaderActive: false,
  maxTextLength: 4_096,
  maxCategoryLength: 64,
  maxQueueSize: 32,
});

const SYSTEM_CLOCK: NarratorClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

interface QueueEntry {
  id: number;
  input: Readonly<{ category: string; text: Readonly<NarrationText>; kind: NarrationKind }>;
  completion: Promise<NarrationResult>;
  resolve: (result: NarrationResult) => void;
  timer?: unknown;
  state: 'debouncing' | 'queued' | 'active' | 'settled';
  requestedEnd?: 'cancelled' | 'stopped';
  controller?: AbortController;
}

function assertIntegerInRange(name: string, value: number, minimum: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be a safe integer from ${minimum} to ${maximum}.`);
  }
}

function validateConfig(config: NarratorConfig): NarratorConfig {
  if (!['English', 'Yue', 'Both'].includes(config.language)) {
    throw new TypeError('language must be English, Yue, or Both.');
  }
  assertIntegerInRange('englishFunnyLevel', config.englishFunnyLevel, 1, 5);
  assertIntegerInRange('yueFunnyLevel', config.yueFunnyLevel, 1, 5);
  assertIntegerInRange('debounceMs', config.debounceMs, 0, NARRATOR_LIMITS.maxDelayMs);
  assertIntegerInRange('cooldownMs', config.cooldownMs, 0, NARRATOR_LIMITS.maxDelayMs);
  assertIntegerInRange('maxTextLength', config.maxTextLength, 1, NARRATOR_LIMITS.maxTextLength);
  assertIntegerInRange('maxCategoryLength', config.maxCategoryLength, 1, NARRATOR_LIMITS.maxCategoryLength);
  assertIntegerInRange('maxQueueSize', config.maxQueueSize, 1, NARRATOR_LIMITS.maxQueueSize);
  for (const [category, delay] of Object.entries(config.categoryCooldownMs)) {
    if (category.length === 0 || category.length > config.maxCategoryLength) {
      throw new RangeError('categoryCooldownMs contains an invalid category.');
    }
    assertIntegerInRange(`categoryCooldownMs.${category}`, delay, 0, NARRATOR_LIMITS.maxDelayMs);
  }
  return config;
}

function frozenInput(input: NarrationInput): QueueEntry['input'] {
  return Object.freeze({
    category: input.category,
    kind: input.kind ?? 'event',
    text: Object.freeze({ English: input.text.English, Yue: input.text.Yue }),
  });
}

export class SerializedNarrator {
  private config: NarratorConfig;
  private readonly speak: NarratorSpeak;
  private readonly formatter: NarrationFormatter;
  private readonly clock: NarratorClock;
  private readonly onSuppressed?: (suppression: NarrationSuppression) => void;
  private readonly waitingByCategory = new Map<string, QueueEntry>();
  private readonly ready: QueueEntry[] = [];
  private readonly lastSpokenAt = new Map<string, number>();
  private active?: QueueEntry;
  private draining = false;
  private nextId = 1;

  constructor(options: NarratorOptions) {
    if (typeof options.speak !== 'function') throw new TypeError('speak must be a function.');
    this.speak = options.speak;
    this.formatter = options.formatter ?? ((request) => request.sourceText);
    this.clock = options.clock ?? SYSTEM_CLOCK;
    this.onSuppressed = options.onSuppressed;
    this.config = validateConfig({
      ...DEFAULT_NARRATOR_CONFIG,
      ...options.config,
      categoryCooldownMs: { ...DEFAULT_NARRATOR_CONFIG.categoryCooldownMs, ...options.config?.categoryCooldownMs },
    });
    this.readClock();
  }

  getConfig(): Readonly<NarratorConfig> {
    return Object.freeze({ ...this.config, categoryCooldownMs: Object.freeze({ ...this.config.categoryCooldownMs }) });
  }

  updateConfig(update: Partial<NarratorConfig>): void {
    this.config = validateConfig({
      ...this.config,
      ...update,
      categoryCooldownMs: update.categoryCooldownMs
        ? { ...update.categoryCooldownMs }
        : { ...this.config.categoryCooldownMs },
    });
  }

  enqueue(input: NarrationInput): NarrationTicket {
    this.validateInput(input);
    const id = this.nextId++;
    const normalized = frozenInput(input);

    if (!this.config.enabled) return this.immediateSuppression(id, normalized, 'disabled');

    const blockedReason = this.environmentSuppression();
    if (blockedReason) return this.immediateSuppression(id, normalized, blockedReason);

    const previous = this.waitingByCategory.get(normalized.category);
    if (previous) this.settle(previous, { id: previous.id, status: 'superseded' });

    if (!previous && this.waitingByCategory.size >= this.config.maxQueueSize) {
      return this.immediateSuppression(id, normalized, 'queue-full');
    }

    let resolve!: (result: NarrationResult) => void;
    const completion = new Promise<NarrationResult>((done) => { resolve = done; });
    const entry: QueueEntry = {
      id,
      input: normalized,
      completion,
      resolve,
      state: 'debouncing',
    };
    this.waitingByCategory.set(normalized.category, entry);
    entry.timer = this.clock.setTimeout(() => this.finishDebounce(entry), this.config.debounceMs);
    return { id, completion, cancel: () => this.cancel(id) };
  }

  cancel(id: number): boolean {
    assertIntegerInRange('id', id, 1, Number.MAX_SAFE_INTEGER);
    if (this.active?.id === id) {
      this.active.requestedEnd = 'cancelled';
      this.active.controller?.abort();
      return true;
    }
    for (const entry of this.waitingByCategory.values()) {
      if (entry.id === id) {
        this.settle(entry, { id, status: 'cancelled' });
        return true;
      }
    }
    return false;
  }

  async stop(): Promise<void> {
    const activeCompletion = this.active?.completion;
    if (this.active) {
      this.active.requestedEnd = 'stopped';
      this.active.controller?.abort();
    }
    for (const entry of [...this.waitingByCategory.values()]) {
      this.settle(entry, { id: entry.id, status: 'stopped' });
    }
    if (activeCompletion) await activeCompletion;
  }

  private finishDebounce(entry: QueueEntry): void {
    if (entry.state !== 'debouncing' || this.waitingByCategory.get(entry.input.category) !== entry) return;
    entry.timer = undefined;
    entry.state = 'queued';
    this.ready.push(entry);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.ready.length > 0) {
        const entry = this.ready.shift();
        if (!entry || entry.state !== 'queued') continue;
        this.waitingByCategory.delete(entry.input.category);
        entry.state = 'active';
        entry.controller = new AbortController();
        this.active = entry;
        await this.process(entry);
        this.active = undefined;
      }
    } finally {
      this.draining = false;
      if (this.ready.length > 0) void this.drain();
    }
  }

  private async process(entry: QueueEntry): Promise<void> {
    const suppression = this.environmentSuppression();
    if (suppression) {
      this.suppress(entry, suppression);
      return;
    }

    const now = this.readClock();
    const cooldown = this.config.categoryCooldownMs[entry.input.category] ?? this.config.cooldownMs;
    const lastSpoken = this.lastSpokenAt.get(entry.input.category);
    if (entry.input.kind !== 'error' && lastSpoken !== undefined && now - lastSpoken < cooldown) {
      this.suppress(entry, 'cooldown');
      return;
    }

    const languages: readonly SpokenLanguage[] = this.config.language === 'Both'
      ? ['English', 'Yue']
      : [this.config.language];
    try {
      for (const language of languages) {
        if (entry.controller?.signal.aborted) break;
        const sourceText = entry.input.text[language];
        const formatted = this.formatter({
          sourceText,
          language,
          funnyLevel: language === 'English' ? this.config.englishFunnyLevel : this.config.yueFunnyLevel,
          category: entry.input.category,
          kind: entry.input.kind,
        });
        if (typeof formatted !== 'string' || formatted.length === 0 || formatted.length > this.config.maxTextLength) {
          throw new RangeError(`formatter output must contain 1 to ${this.config.maxTextLength} characters.`);
        }
        await this.speak({
          text: formatted,
          language,
          category: entry.input.category,
          kind: entry.input.kind,
          signal: entry.controller!.signal,
        });
      }
      if (entry.requestedEnd) {
        this.settle(entry, { id: entry.id, status: entry.requestedEnd });
      } else {
        this.lastSpokenAt.set(entry.input.category, this.readClock());
        this.settle(entry, { id: entry.id, status: 'spoken', languages });
      }
    } catch (error) {
      if (entry.requestedEnd) this.settle(entry, { id: entry.id, status: entry.requestedEnd });
      else this.settle(entry, { id: entry.id, status: 'failed', error });
    }
  }

  private validateInput(input: NarrationInput): void {
    if (!input || typeof input !== 'object') throw new TypeError('narration input is required.');
    if (typeof input.category !== 'string' || input.category.length === 0 || input.category.length > this.config.maxCategoryLength) {
      throw new RangeError(`category must contain 1 to ${this.config.maxCategoryLength} characters.`);
    }
    if (input.kind !== undefined && input.kind !== 'event' && input.kind !== 'error') {
      throw new TypeError('kind must be event or error.');
    }
    if (!input.text || typeof input.text !== 'object') throw new TypeError('text is required.');
    for (const language of ['English', 'Yue'] as const) {
      const text = input.text[language];
      if (typeof text !== 'string' || text.length === 0 || text.length > this.config.maxTextLength) {
        throw new RangeError(`${language} text must contain 1 to ${this.config.maxTextLength} characters.`);
      }
    }
  }

  private readClock(): number {
    const value = this.clock.now();
    if (!Number.isFinite(value) || value < 0 || value > NARRATOR_LIMITS.maxClockValue) {
      throw new RangeError(`clock must return a finite value from 0 to ${NARRATOR_LIMITS.maxClockValue}.`);
    }
    return value;
  }

  private environmentSuppression(): NarrationSuppressionReason | undefined {
    if (this.config.quiet) return 'quiet';
    if (this.config.reducedSound) return 'reduced-sound';
    if (this.config.screenReaderActive) return 'screen-reader';
    return undefined;
  }

  private immediateSuppression(
    id: number,
    input: QueueEntry['input'],
    reason: NarrationSuppressionReason,
  ): NarrationTicket {
    const result = this.suppressionResult(id, input, reason);
    this.onSuppressed?.(result);
    return { id, completion: Promise.resolve({ status: 'suppressed', ...result }), cancel: () => false };
  }

  private suppress(entry: QueueEntry, reason: NarrationSuppressionReason): void {
    const result = this.suppressionResult(entry.id, entry.input, reason);
    this.onSuppressed?.(result);
    this.settle(entry, { status: 'suppressed', ...result });
  }

  private suppressionResult(
    id: number,
    input: QueueEntry['input'],
    reason: NarrationSuppressionReason,
  ): NarrationSuppression {
    return {
      id,
      category: input.category,
      kind: input.kind,
      reason,
      preservedText: input.kind === 'error' ? input.text : undefined,
    };
  }

  private settle(entry: QueueEntry, result: NarrationResult): void {
    if (entry.state === 'settled') return;
    if (entry.timer !== undefined) this.clock.clearTimeout(entry.timer);
    if (this.waitingByCategory.get(entry.input.category) === entry) {
      this.waitingByCategory.delete(entry.input.category);
    }
    const readyIndex = this.ready.indexOf(entry);
    if (readyIndex >= 0) this.ready.splice(readyIndex, 1);
    entry.timer = undefined;
    entry.state = 'settled';
    entry.resolve(result);
  }
}
