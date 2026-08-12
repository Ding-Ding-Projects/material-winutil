import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

const adapter = await import('../../dist/main/external-settings-source.js');
const PUBLIC = Object.freeze([{ address: '93.184.216.34', family: 4 }]);
const LOOPBACK = Object.freeze([{ address: '127.0.0.1', family: 4 }]);
const PRIVATE = Object.freeze([{ address: '169.254.169.254', family: 4 }]);

function jsonResponse(value, init = {}) {
  return new Response(typeof value === 'string' ? value : JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json; charset=utf-8', ...init.headers },
  });
}

function source(overrides = {}) {
  return { kind: 'json-api', url: 'https://settings.example.test/v1/settings', ...overrides };
}

function options(transport, overrides = {}) {
  return { transport, resolve: async () => PUBLIC, ...overrides };
}

const validPayload = {
  schemaVersion: 1,
  settings: {
    theme: 'dark', density: 'compact', language: 'Bilingual', narrator: 'Both',
    narratorEnabled: true, enFunny: 4, yueFunny: 5, accent: '#6750A4',
    font: 'Segoe UI Variable', scale: 1.25, weight: 600, radius: 20,
    reducedMotion: true, exportFormat: 'json',
  },
};

test('loads an exact bounded HTTPS settings document with hardened request options', async () => {
  let calls = 0;
  const settings = await adapter.loadJsonSettingsSource(source(), options(async (request) => {
    calls += 1;
    assert.equal(request.url.href, 'https://settings.example.test/v1/settings');
    assert.equal(request.address, PUBLIC[0].address);
    assert.equal(request.family, 4);
    assert.equal(request.headers.accept, 'application/json');
    return jsonResponse(validPayload);
  }));
  assert.equal(calls, 1);
  assert.deepEqual({ ...settings }, validPayload.settings);
  assert.equal(Object.getPrototypeOf(settings), null);
  assert.equal(Object.isFrozen(settings), true);
});

test('rejects unsupported versions, unknown fields, unknown setting keys, and invalid values', async () => {
  const cases = [
    { schemaVersion: 2, settings: { theme: 'dark' } },
    { schemaVersion: 1, settings: { theme: 'dark' }, extra: true },
    { schemaVersion: 1, settings: { secretSetting: true } },
    { schemaVersion: 1, settings: { theme: 'sepia' } },
    { schemaVersion: 1, settings: {} },
  ];
  for (const payload of cases) {
    await assert.rejects(adapter.loadJsonSettingsSource(source(), options(async () => jsonResponse(payload))),
      (error) => error instanceof adapter.ExternalSettingsSourceError && /^invalid-(?:schema|setting)$/u.test(error.code));
  }
});

test('rejects redirects, invalid media types, malformed JSON, and both declared and streamed oversize bodies', async () => {
  await assert.rejects(adapter.loadJsonSettingsSource(source(), options(async () => new Response(null, {
    status: 302, headers: { location: 'https://other.example.test/' },
  }))), (error) => error.code === 'redirect-rejected');
  await assert.rejects(adapter.loadJsonSettingsSource(source(), options(async () => new Response('{}', {
    headers: { 'content-type': 'text/plain' },
  }))), (error) => error.code === 'invalid-content-type');
  await assert.rejects(adapter.loadJsonSettingsSource(source(), options(async () => jsonResponse('{'))),
    (error) => error.code === 'invalid-response');
  await assert.rejects(adapter.loadJsonSettingsSource(source(), options(async () => jsonResponse(validPayload, {
    headers: { 'content-length': '65000' },
  }), { maxResponseBytes: 128 })), (error) => error.code === 'response-too-large');
  await assert.rejects(adapter.loadJsonSettingsSource(source(), options(async () => jsonResponse({
    schemaVersion: 1, settings: { font: 'x'.repeat(200) },
  }), { maxResponseBytes: 100 })), (error) => error.code === 'response-too-large');
});

test('times out and honors caller cancellation without exposing implementation details', async () => {
  const hangingFetch = async (request) => await new Promise((_resolve, reject) => {
    if (request.signal.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    request.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  });
  await assert.rejects(adapter.loadJsonSettingsSource(source(), options(hangingFetch, { timeoutMs: 10 })),
    (error) => error.code === 'request-aborted' && error.message === 'The external settings source could not be loaded safely.');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(adapter.loadJsonSettingsSource(source(), options(hangingFetch, { signal: controller.signal })),
    (error) => error.code === 'request-aborted');
});

test('rejects credentials, fragments, insecure transport, private targets, and DNS rebinding before fetch', async () => {
  let fetches = 0;
  const fetch = async () => { fetches += 1; return jsonResponse(validPayload); };
  for (const url of [
    'https://person:password@settings.example.test/v1',
    'https://settings.example.test/v1#fragment',
    'http://settings.example.test/v1',
    'file:///settings.json',
  ]) await assert.rejects(adapter.loadJsonSettingsSource(source({ url }), options(fetch)));
  await assert.rejects(adapter.loadJsonSettingsSource(source(), options(fetch, { resolve: async () => PRIVATE })),
    (error) => error.code === 'unsafe-target');
  let resolution = 0;
  await assert.rejects(adapter.loadJsonSettingsSource(source(), options(fetch, {
    resolve: async () => (++resolution === 1 ? PUBLIC : PRIVATE),
  })), (error) => error.code === 'dns-rebinding');
  assert.equal(fetches, 0);
});

test('permits HTTP only for explicitly enabled loopback development', async () => {
  const settings = await adapter.loadJsonSettingsSource(source({ url: 'http://localhost:8123/settings' }), options(
    async () => jsonResponse(validPayload),
    { resolve: async () => LOOPBACK, allowLoopbackHttpForDevelopment: true },
  ));
  assert.equal(settings.theme, 'dark');
  await assert.rejects(adapter.loadJsonSettingsSource(source({ url: 'http://localhost:8123/settings' }), options(
    async () => jsonResponse(validPayload), { resolve: async () => LOOPBACK },
  )), (error) => error.code === 'insecure-transport');
  await assert.rejects(adapter.loadJsonSettingsSource(source({ url: 'http://settings.example.test/settings' }), options(
    async () => jsonResponse(validPayload), { allowLoopbackHttpForDevelopment: true },
  )), (error) => error.code === 'unsafe-target');
});

test('the production transport pins the validated address instead of resolving the URL hostname again', async (t) => {
  const server = createServer((request, response) => {
    assert.match(request.headers.host, /^pin-never-resolves\.invalid:/u);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(validPayload));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const settings = await adapter.loadJsonSettingsSource(source({
    url: `http://pin-never-resolves.invalid:${address.port}/settings`,
  }), {
    resolve: async () => LOOPBACK,
    allowLoopbackHttpForDevelopment: true,
  });
  assert.equal(settings.theme, 'dark');
});

test('parses Home Assistant input_boolean and binary_sensor on/off states with an encoded entity path', async () => {
  for (const [entityId, state, expected] of [
    ['input_boolean.evening_mode', 'on', true],
    ['binary_sensor.someone_home', 'off', false],
  ]) {
    const result = await adapter.loadHomeAssistantBooleanSource({
      kind: 'home-assistant', baseUrl: 'https://ha.example.test/', entityId, token: 'opaque-test-token',
    }, options(async (request) => {
      assert.equal(request.url.href, `https://ha.example.test/api/states/${entityId}`);
      assert.equal(request.headers.authorization, 'Bearer opaque-test-token');
      return jsonResponse({ entity_id: entityId, state, attributes: {}, context: {} });
    }));
    assert.equal(result, expected);
  }
});

test('Home Assistant rejects invalid entities, unexpected states, mismatches, and missing tokens', async () => {
  const base = { kind: 'home-assistant', baseUrl: 'https://ha.example.test/', entityId: 'input_boolean.mode', token: 'opaque-test-token' };
  await assert.rejects(adapter.loadHomeAssistantBooleanSource({ ...base, entityId: 'switch.mode' }, options(async () => jsonResponse({ state: 'on' }))),
    (error) => error.code === 'invalid-entity');
  await assert.rejects(adapter.loadHomeAssistantBooleanSource({ ...base, token: '' }, options(async () => jsonResponse({ state: 'on' }))),
    (error) => error.code === 'missing-token');
  await assert.rejects(adapter.loadHomeAssistantBooleanSource(base, options(async () => jsonResponse({ state: 'unknown' }))),
    (error) => error.code === 'invalid-response');
  await assert.rejects(adapter.loadHomeAssistantBooleanSource(base, options(async () => jsonResponse({ entity_id: 'input_boolean.other', state: 'on' }))),
    (error) => error.code === 'invalid-response');
});

test('errors and source code never leak bearer tokens or response bodies', async () => {
  const sensitive = 'opaque-do-not-print-token';
  for (const response of [
    new Response(`server repeated ${sensitive}`, { status: 401, headers: { 'content-type': 'text/plain' } }),
    jsonResponse({ state: sensitive }),
  ]) {
    let caught;
    try {
      await adapter.loadHomeAssistantBooleanSource({
        kind: 'home-assistant', baseUrl: 'https://ha.example.test/', entityId: 'input_boolean.mode', token: sensitive,
      }, options(async () => response));
    } catch (error) { caught = error; }
    assert.ok(caught instanceof adapter.ExternalSettingsSourceError);
    assert.doesNotMatch(`${caught.message}\n${caught.stack}`, new RegExp(sensitive));
  }
  const { readFile } = await import('node:fs/promises');
  const sourceText = await readFile(new URL('../../src/main/external-settings-source.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(sourceText, /console\.|response\.text\(|JSON\.stringify\(source\)|logger/u);
});

test('generation checks reject stale work before request and after response validation', async () => {
  let current = 2;
  let fetches = 0;
  await assert.rejects(adapter.loadJsonSettingsSource(source(), options(async () => {
    fetches += 1; return jsonResponse(validPayload);
  }, { generation: 1, isGenerationCurrent: (generation) => generation === current })),
  (error) => error.code === 'superseded');
  assert.equal(fetches, 0);

  current = 1;
  await assert.rejects(adapter.loadJsonSettingsSource(source(), options(async () => {
    current = 2;
    return jsonResponse(validPayload);
  }, { generation: 1, isGenerationCurrent: (generation) => generation === current })),
  (error) => error.code === 'superseded');
});
