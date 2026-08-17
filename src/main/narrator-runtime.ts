import {
  SerializedNarrator,
  type NarrationInput,
  type NarrationResult,
  type NarrationSpeakRequest,
  type NarratorConfig,
} from '../shared/narrator';
import type {
  NarrationClientResult,
  NarrationEvent,
  NarrationSpeechCancel,
  NarrationSpeechRequest,
  Preferences,
} from '../shared/types';

export interface NarrationTransport {
  speak(request: NarrationSpeakRequest & { voiceId: string | null }): Promise<void>;
  stop(): void;
}

export interface IpcNarrationSender {
  send(channel: 'narration:speech', payload: NarrationSpeechRequest): void;
  send(channel: 'narration:cancel', payload: NarrationSpeechCancel): void;
}

export class IpcNarrationTransport implements NarrationTransport {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: () => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();

  constructor(
    private readonly sender: () => IpcNarrationSender | undefined,
    private readonly timeoutForText: (text: string) => number = (text) => Math.min(120_000, Math.max(10_000, text.length * 250)),
  ) {}

  speak(request: NarrationSpeakRequest & { voiceId: string | null }): Promise<void> {
    const target = this.sender();
    if (!target) return Promise.reject(new Error('The narration renderer is unavailable.'));
    const id = this.nextId++;
    return new Promise<void>((resolve, reject) => {
      const abort = (): void => {
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(id);
        target.send('narration:cancel', { id });
        reject(new Error('Narration was cancelled.'));
      };
      if (request.signal.aborted) { reject(new Error('Narration was cancelled.')); return; }
      const timeoutMs = this.timeoutForText(request.text);
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
        reject(new RangeError('Narration timeout must be a safe integer from 1 to 120000 milliseconds.'));
        return;
      }
      const timer = setTimeout(() => {
        if (!this.pending.delete(id)) return;
        request.signal.removeEventListener('abort', abort);
        target.send('narration:cancel', { id });
        reject(new Error('Platform speech synthesis timed out.'));
      }, timeoutMs);
      timer.unref();
      this.pending.set(id, {
        timer,
        resolve: () => { clearTimeout(timer); request.signal.removeEventListener('abort', abort); resolve(); },
        reject: (error) => { clearTimeout(timer); request.signal.removeEventListener('abort', abort); reject(error); },
      });
      request.signal.addEventListener('abort', abort, { once: true });
      target.send('narration:speech', { id, text: request.text, language: request.language, voiceId: request.voiceId });
    });
  }

  complete(id: number, ok: boolean, error = 'Platform speech synthesis failed.'): boolean {
    const pending = this.pending.get(id);
    if (!pending) return false;
    this.pending.delete(id);
    if (ok) pending.resolve(); else pending.reject(new Error(error.slice(0, 512)));
    return true;
  }

  stop(): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      this.pending.delete(id);
      this.sender()?.send('narration:cancel', { id });
      pending.reject(new Error('Narration was stopped.'));
    }
  }
}

const FUNNY_VOICE: Readonly<Record<'English' | 'Yue', readonly string[]>> = Object.freeze({
  English: Object.freeze([
    '',
    'Quick note: ',
    'A small but useful announcement: ',
    'The utility desk has cleared its throat: ',
    'Tiny fanfare, exact facts, no confetti in the vents: ',
  ]),
  Yue: Object.freeze([
    '',
    '提提你：',
    '有個細細聲但實用嘅通知：',
    '工具枱清清喉嚨宣布：',
    '細細個 fanfare，事實照足，散紙唔會跌入風扇：',
  ]),
});

export function formatNarrationFact(sourceText: string, language: 'English' | 'Yue', funnyLevel: number): string {
  return `${FUNNY_VOICE[language][funnyLevel - 1] ?? ''}${sourceText}`;
}

function clientResult(result: NarrationResult): NarrationClientResult {
  if (result.status === 'spoken') return { status: 'spoken', languages: result.languages };
  if (result.status === 'suppressed') return { status: 'suppressed', reason: result.reason };
  if (result.status === 'failed') return { status: 'failed', error: result.error instanceof Error ? result.error.message : String(result.error) };
  return { status: result.status };
}

export class NarratorRuntime {
  private readonly narrator: SerializedNarrator;
  private voiceIds: Readonly<Record<'English' | 'Yue', string | null>> = { English: null, Yue: null };

  constructor(transport: NarrationTransport, config: Partial<NarratorConfig> = {}) {
    this.narrator = new SerializedNarrator({
      speak: (request) => transport.speak({ ...request, voiceId: this.voiceIds[request.language] }),
      formatter: ({ sourceText, language, funnyLevel }) => formatNarrationFact(sourceText, language, funnyLevel),
      config: {
        debounceMs: 180,
        cooldownMs: 4_000,
        categoryCooldownMs: { navigation: 1_500, progress: 2_500, update: 5_000 },
        ...config,
      },
    });
  }

  configure(prefs: Preferences, screenReaderActive: boolean): void {
    this.voiceIds = { English: prefs.narratorEnglishVoice, Yue: prefs.narratorYueVoice };
    this.narrator.updateConfig({
      enabled: prefs.narratorEnabled,
      language: prefs.narrator,
      englishFunnyLevel: prefs.enFunny,
      yueFunnyLevel: prefs.yueFunny,
      quiet: prefs.narratorQuiet,
      reducedSound: prefs.narratorReducedSound,
      screenReaderActive,
    });
    if (!prefs.narratorEnabled || prefs.narratorQuiet || prefs.narratorReducedSound || screenReaderActive) {
      void this.narrator.stop();
    }
  }

  async narrate(event: NarrationEvent): Promise<NarrationClientResult> {
    const input: NarrationInput = {
      category: event.category,
      kind: event.kind,
      text: { English: event.English, Yue: event.Yue },
    };
    return clientResult(await this.narrator.enqueue(input).completion);
  }

  stop(): Promise<void> { return this.narrator.stop(); }
}
