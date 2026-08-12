import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_NARRATOR_CONFIG,
  NARRATOR_LIMITS,
  SerializedNarrator,
} from '../../dist/shared/narrator.js';

class FakeClock {
  nowValue = 1_000;
  nextHandle = 1;
  timers = new Map();

  now = () => this.nowValue;
  setTimeout = (callback, delayMs) => {
    const handle = this.nextHandle++;
    this.timers.set(handle, { at: this.nowValue + delayMs, callback });
    return handle;
  };
  clearTimeout = (handle) => { this.timers.delete(handle); };

  async advance(delayMs) {
    const target = this.nowValue + delayMs;
    while (true) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      if (!due) break;
      this.timers.delete(due[0]);
      this.nowValue = due[1].at;
      due[1].callback();
      await Promise.resolve();
    }
    this.nowValue = target;
    await Promise.resolve();
  }
}

const event = (category, english = category, yue = `粵-${category}`, kind = 'event') => ({
  category,
  kind,
  text: { English: english, Yue: yue },
});

const enabled = (overrides = {}) => ({ enabled: true, debounceMs: 0, cooldownMs: 0, ...overrides });

test('narrator is disabled by default', async () => {
  const calls = [];
  const narrator = new SerializedNarrator({ speak: (request) => calls.push(request) });
  const result = await narrator.enqueue(event('startup')).completion;
  assert.equal(DEFAULT_NARRATOR_CONFIG.enabled, false);
  assert.equal(result.status, 'suppressed');
  assert.equal(result.reason, 'disabled');
  assert.deepEqual(calls, []);
});

test('serializes utterances without overlap', async () => {
  const clock = new FakeClock();
  const releases = [];
  const order = [];
  let active = 0;
  let maximumActive = 0;
  const narrator = new SerializedNarrator({
    clock,
    config: enabled(),
    speak: async ({ text }) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      order.push(`start:${text}`);
      await new Promise((resolve) => releases.push(resolve));
      order.push(`end:${text}`);
      active -= 1;
    },
  });

  const first = narrator.enqueue(event('one'));
  const second = narrator.enqueue(event('two'));
  await clock.advance(0);
  assert.deepEqual(order, ['start:one']);
  releases.shift()();
  while (releases.length === 0) await Promise.resolve();
  assert.deepEqual(order, ['start:one', 'end:one', 'start:two']);
  releases.shift()();
  assert.equal((await first.completion).status, 'spoken');
  assert.equal((await second.completion).status, 'spoken');
  assert.equal(maximumActive, 1);
});

test('Both speaks strict English then Yue and passes each funny level to the formatter', async () => {
  const clock = new FakeClock();
  const formatted = [];
  const spoken = [];
  const narrator = new SerializedNarrator({
    clock,
    config: enabled({ language: 'Both', englishFunnyLevel: 2, yueFunnyLevel: 5 }),
    formatter: (request) => {
      formatted.push(request);
      return `${request.language}:${request.funnyLevel}:${request.sourceText}`;
    },
    speak: ({ text, language }) => { spoken.push([language, text]); },
  });
  const ticket = narrator.enqueue(event('update', 'Exact English fact', '準確粵語事實'));
  await clock.advance(0);
  const result = await ticket.completion;
  assert.deepEqual(spoken, [
    ['English', 'English:2:Exact English fact'],
    ['Yue', 'Yue:5:準確粵語事實'],
  ]);
  assert.deepEqual(formatted.map(({ language, funnyLevel, sourceText }) => [language, funnyLevel, sourceText]), [
    ['English', 2, 'Exact English fact'],
    ['Yue', 5, '準確粵語事實'],
  ]);
  assert.deepEqual(result.languages, ['English', 'Yue']);
});

test('debounce supersedes a queued same-category entry instead of stacking', async () => {
  const clock = new FakeClock();
  const spoken = [];
  const narrator = new SerializedNarrator({
    clock,
    config: enabled({ debounceMs: 50 }),
    speak: ({ text }) => { spoken.push(text); },
  });
  const oldTicket = narrator.enqueue(event('progress', 'old'));
  await clock.advance(25);
  const newTicket = narrator.enqueue(event('progress', 'new'));
  assert.equal((await oldTicket.completion).status, 'superseded');
  await clock.advance(49);
  assert.deepEqual(spoken, []);
  await clock.advance(1);
  assert.equal((await newTicket.completion).status, 'spoken');
  assert.deepEqual(spoken, ['new']);
});

test('per-category cooldown suppresses events but never errors', async () => {
  const clock = new FakeClock();
  const spoken = [];
  const narrator = new SerializedNarrator({
    clock,
    config: enabled({ cooldownMs: 1_000, categoryCooldownMs: { sync: 500 } }),
    speak: ({ text }) => { spoken.push(text); },
  });
  const first = narrator.enqueue(event('sync', 'first'));
  await clock.advance(0);
  assert.equal((await first.completion).status, 'spoken');
  await clock.advance(100);
  const second = narrator.enqueue(event('sync', 'second'));
  await clock.advance(0);
  const suppressed = await second.completion;
  assert.equal(suppressed.status, 'suppressed');
  assert.equal(suppressed.reason, 'cooldown');
  const errorTicket = narrator.enqueue(event('sync', 'exact error', '準確錯誤', 'error'));
  await clock.advance(0);
  assert.equal((await errorTicket.completion).status, 'spoken');
  assert.deepEqual(spoken, ['first', 'exact error']);
});

test('quiet, reduced-sound, and screen-reader modes suppress audio and preserve exact error facts', async () => {
  for (const [setting, reason] of [
    ['quiet', 'quiet'],
    ['reducedSound', 'reduced-sound'],
    ['screenReaderActive', 'screen-reader'],
  ]) {
    const suppressions = [];
    const narrator = new SerializedNarrator({
      config: enabled({ [setting]: true }),
      speak: () => assert.fail('suppressed narration must not call speak'),
      onSuppressed: (value) => suppressions.push(value),
    });
    const exactText = { English: 'Disk write failed: C:\\data.', Yue: '寫入失敗：C:\\data。' };
    const result = await narrator.enqueue({ category: 'write', kind: 'error', text: exactText }).completion;
    assert.equal(result.status, 'suppressed');
    assert.equal(result.reason, reason);
    assert.deepEqual(result.preservedText, exactText);
    assert.deepEqual(suppressions[0].preservedText, exactText);
  }
});

test('cancel removes queued work and stop aborts active work plus clears the queue', async () => {
  const clock = new FakeClock();
  let activeSignal;
  let releaseActive;
  const narrator = new SerializedNarrator({
    clock,
    config: enabled({ debounceMs: 10 }),
    speak: ({ signal }) => {
      activeSignal = signal;
      return new Promise((resolve) => { releaseActive = resolve; });
    },
  });
  const cancelled = narrator.enqueue(event('cancel-me'));
  assert.equal(cancelled.cancel(), true);
  assert.equal((await cancelled.completion).status, 'cancelled');

  const active = narrator.enqueue(event('active'));
  await clock.advance(10);
  const queued = narrator.enqueue(event('queued'));
  const stopping = narrator.stop();
  assert.equal(activeSignal.aborted, true);
  assert.equal((await queued.completion).status, 'stopped');
  releaseActive();
  await stopping;
  assert.equal((await active.completion).status, 'stopped');
});

test('bounds categories, text, queue length, formatter output, delays, and clock values', async () => {
  const clock = new FakeClock();
  const narrator = new SerializedNarrator({
    clock,
    config: enabled({ debounceMs: 100, maxTextLength: 4, maxCategoryLength: 3, maxQueueSize: 1 }),
    speak: () => undefined,
  });
  assert.throws(() => narrator.enqueue(event('long')), /category/);
  assert.throws(() => narrator.enqueue(event('ok', '12345', '粵語')), /English text/);
  const held = narrator.enqueue(event('one', '1234', '粵語'));
  const full = await narrator.enqueue(event('two', '1234', '粵語')).completion;
  assert.equal(full.status, 'suppressed');
  assert.equal(full.reason, 'queue-full');
  held.cancel();

  assert.throws(() => new SerializedNarrator({
    speak: () => undefined,
    config: { debounceMs: NARRATOR_LIMITS.maxDelayMs + 1 },
  }), /debounceMs/);
  assert.throws(() => new SerializedNarrator({
    speak: () => undefined,
    clock: { ...clock, now: () => Number.POSITIVE_INFINITY },
  }), /clock/);

  const formatted = new SerializedNarrator({
    clock,
    config: enabled({ maxTextLength: 4 }),
    formatter: () => '12345',
    speak: () => assert.fail('out-of-bounds formatted text must not be spoken'),
  });
  const badFormat = formatted.enqueue(event('ok', '1234', '粵語'));
  await clock.advance(0);
  assert.equal((await badFormat.completion).status, 'failed');
});
