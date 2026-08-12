import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IpcNarrationTransport,
  NarratorRuntime,
  formatNarrationFact,
} from '../../dist/main/narrator-runtime.js';

const prefs = (overrides = {}) => ({
  theme: 'dark', density: 'comfortable', language: 'English', narrator: 'English', narratorEnabled: true,
  narratorQuiet: false, narratorReducedSound: false, enFunny: 1, yueFunny: 1, accent: '#6750A4',
  font: 'Segoe UI Variable', scale: 1, weight: 400, radius: 16, reducedMotion: false, exportFormat: 'md',
  ...overrides,
});

test('funny narration adds voice while retaining the complete source fact', () => {
  const fact = 'install failed for 2 items, exit 73.';
  for (const level of [1, 2, 3, 4, 5]) {
    const English = formatNarrationFact(fact, 'English', level);
    const Yue = formatNarrationFact('安裝 2 個項目失敗，結束碼 73。', 'Yue', level);
    assert.match(English, /install failed for 2 items, exit 73\./);
    assert.match(Yue, /安裝 2 個項目失敗，結束碼 73。/);
  }
});

test('runtime speaks Both in strict English then Yue order and never overlaps', async () => {
  const calls = [];
  let active = 0;
  const runtime = new NarratorRuntime({
    async speak(request) {
      active += 1;
      assert.equal(active, 1);
      calls.push([request.language, request.text]);
      await Promise.resolve();
      active -= 1;
    },
    stop() {},
  }, { debounceMs: 0, cooldownMs: 0 });
  runtime.configure(prefs({ narrator: 'Both', enFunny: 2, yueFunny: 4 }), false);
  const result = await runtime.narrate({ category: 'test', English: 'Exact English fact.', Yue: '準確粵語事實。' });
  assert.deepEqual(result, { status: 'spoken', languages: ['English', 'Yue'] });
  assert.deepEqual(calls.map(([language]) => language), ['English', 'Yue']);
  assert.match(calls[0][1], /Exact English fact\./);
  assert.match(calls[1][1], /準確粵語事實。/);
});

test('runtime suppresses audio while disabled, quiet, reduced-sound, or assistive technology is active', async () => {
  for (const [override, screenReaderActive, reason] of [
    [{ narratorEnabled: false }, false, 'disabled'],
    [{ narratorQuiet: true }, false, 'quiet'],
    [{ narratorReducedSound: true }, false, 'reduced-sound'],
    [{}, true, 'screen-reader'],
  ]) {
    const runtime = new NarratorRuntime({ speak: () => assert.fail('suppressed narration must not speak'), stop() {} }, { debounceMs: 0 });
    runtime.configure(prefs(override), screenReaderActive);
    assert.deepEqual(await runtime.narrate({ category: 'test', English: 'English fact', Yue: '粵語事實' }), { status: 'suppressed', reason });
  }
});

test('runtime delivers exact error facts twice even inside the category cooldown', async () => {
  const spoken = [];
  const runtime = new NarratorRuntime({ speak: ({ text }) => spoken.push(text), stop() {} }, { debounceMs: 0, cooldownMs: 60_000 });
  runtime.configure(prefs({ enFunny: 5 }), false);
  const event = { category: 'operation', kind: 'error', English: 'install failed, exit 73; review output.', Yue: '安裝失敗，結束碼 73；請查看輸出。' };
  assert.equal((await runtime.narrate(event)).status, 'spoken');
  assert.equal((await runtime.narrate(event)).status, 'spoken');
  assert.equal(spoken.length, 2);
  assert.ok(spoken.every((text) => text.includes('install failed, exit 73; review output.')));
});

test('IPC transport emits only structured text and language, then resolves from the renderer result', async () => {
  const sent = [];
  const transport = new IpcNarrationTransport(() => ({ send: (channel, payload) => sent.push([channel, payload]) }));
  const request = { text: 'A literal & | ; $() narration.', language: 'English', category: 'test', kind: 'event', signal: new AbortController().signal };
  const completion = transport.speak(request);
  assert.deepEqual(sent, [['narration:speech', { id: 1, text: request.text, language: 'English' }]]);
  assert.equal(transport.complete(1, true), true);
  await completion;
});

test('IPC transport cancellation sends the numeric request id and rejects promptly', async () => {
  const sent = [];
  const transport = new IpcNarrationTransport(() => ({ send: (channel, payload) => sent.push([channel, payload]) }));
  const controller = new AbortController();
  const completion = transport.speak({ text: 'Cancel me', language: 'English', category: 'test', kind: 'event', signal: controller.signal });
  controller.abort();
  await assert.rejects(completion, /cancelled/);
  assert.deepEqual(sent.at(-1), ['narration:cancel', { id: 1 }]);
});

test('IPC transport rejects an already-aborted request without emitting speech', async () => {
  const sent = [];
  const transport = new IpcNarrationTransport(() => ({ send: (channel, payload) => sent.push([channel, payload]) }));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(transport.speak({ text: 'Already cancelled', language: 'English', category: 'test', kind: 'event', signal: controller.signal }), /cancelled/);
  assert.deepEqual(sent, []);
});

test('IPC transport times out a silent renderer and emits bounded cancellation', async () => {
  const sent = [];
  const transport = new IpcNarrationTransport(() => ({ send: (channel, payload) => sent.push([channel, payload]) }), () => 5);
  await assert.rejects(transport.speak({ text: 'Renderer stays silent', language: 'English', category: 'test', kind: 'event', signal: new AbortController().signal }), /timed out/);
  assert.deepEqual(sent.at(-1), ['narration:cancel', { id: 1 }]);
});
