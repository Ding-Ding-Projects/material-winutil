import { setTimeout as delay } from 'node:timers/promises';

export async function waitForTargets(port, timeoutMs = 20000, isProcessAlive) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    if (isProcessAlive && !(await isProcessAlive())) {
      throw new Error(`application process exited before the CDP endpoint became ready on port ${port}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return await response.json();
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await delay(200);
  }
  throw new Error(`CDP endpoint did not become ready on port ${port}: ${last}`);
}

export function assertSingleTarget(targets, predicate, description) {
  if (!Array.isArray(targets) || targets.length !== 1) {
    throw new Error(`CDP isolation failed: expected exactly one target for ${description}, received ${Array.isArray(targets) ? targets.length : 'non-array'}`);
  }
  const target = targets[0];
  if (target.type !== 'page' || !target.webSocketDebuggerUrl || !predicate(target)) {
    throw new Error(`CDP isolation failed: the sole target is not the expected ${description}`);
  }
  return target;
}

export class CdpClient {
  #ws;
  #nextId = 1;
  #pending = new Map();

  static async connect(url, timeoutMs = 10000) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP WebSocket connection timed out')), timeoutMs);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP WebSocket connection failed')); }, { once: true });
    });
    return new CdpClient(ws);
  }

  constructor(ws) {
    this.#ws = ws;
    ws.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (!message.id) return;
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result ?? {});
    });
    ws.addEventListener('close', () => {
      for (const pending of this.#pending.values()) pending.reject(new Error('CDP WebSocket closed'));
      this.#pending.clear();
    });
  }

  call(method, params = {}, timeoutMs = 15000) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      this.#pending.set(id, {
        method,
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      try { this.#ws.send(JSON.stringify({ id, method, params })); }
      catch (error) { clearTimeout(timer); this.#pending.delete(id); reject(error); }
    });
  }

  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: false,
      userGesture: false,
    });
    if (result.exceptionDetails) throw new Error(`Runtime.evaluate failed: ${result.exceptionDetails.text}`);
    return result.result?.value;
  }

  async setViewport(width, height, deviceScaleFactor = 1) {
    await this.call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile: false,
      screenWidth: width,
      screenHeight: height,
      dontSetVisibleSize: false,
    });
  }

  async capturePng() {
    const result = await this.call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }, 30000);
    if (!result.data) throw new Error('Page.captureScreenshot returned no image data');
    return Buffer.from(result.data, 'base64');
  }

  close() {
    this.#ws.close();
  }
}
