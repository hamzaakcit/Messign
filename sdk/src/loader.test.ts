import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, type DOMWindow } from 'jsdom';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sdkDir = path.join(repo, 'client', 'public', 'sdk', 'v1');
const SECRET = `Qz7_${'0'.repeat(28)}`;
const SITE = `msk_abcdefgh_${SECRET}`;
const BROWSER = `mbt_${'B'.repeat(43)}`;
const API = 'https://server-production-7283.up.railway.app/api/engage/website/v1/resolve';

interface ResolveBody {
  installationId: string;
  environment: string;
  mode: string;
  audience: string;
}

const NONE: ResolveBody = {
  installationId: '11111111-1111-4111-8111-111111111111',
  environment: 'production',
  mode: 'test',
  audience: 'none',
};

interface Call {
  url: string;
  init: RequestInit;
}

interface Page {
  window: DOMWindow;
  calls: Call[];
  logs: string[];
  probes: { register: number; permission: number };
  runtimeInserts: number;
}

function built(): { loader: string; runtime: string; runtimeName: string } {
  const loader = fs.readFileSync(path.join(sdkDir, 'loader.js'), 'utf8');
  const runtimeName = fs.readdirSync(sdkDir).find((name) => /^messign\.[a-f0-9]+\.js$/.test(name));
  if (!runtimeName) throw new Error('production runtime was not built');
  return { loader, runtime: fs.readFileSync(path.join(sdkDir, runtimeName), 'utf8'), runtimeName };
}

function fakeResponse(status: number, body: string, headers: Record<string, string> = {}): Response {
  const lower = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) lower.set(key.toLowerCase(), value);
  return {
    status,
    headers: { get: (name: string) => lower.get(name.toLowerCase()) ?? null },
    text: async () => body,
    body: { cancel: async () => undefined },
  } as unknown as Response;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return fakeResponse(status, JSON.stringify(body), { 'content-type': 'application/json', ...headers });
}

function open(
  html: string,
  handler: (window: DOMWindow, call: Call, index: number) => Response | Promise<Response>,
  options: { seed?: Record<string, string>; url?: string; blockStorage?: boolean } = {},
): Page {
  const { loader, runtime } = built();
  const calls: Call[] = [];
  const logs: string[] = [];
  const probes = { register: 0, permission: 0 };
  let runtimeInserts = 0;
  const dom = new JSDOM(html.split('__LOADER__').join(loader), {
    url: options.url ?? 'https://shop.example.com/products',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.setTimeout = globalThis.setTimeout.bind(globalThis);
      window.clearTimeout = globalThis.clearTimeout.bind(globalThis);
      window.console.info = (...args: unknown[]) => {
        logs.push(args.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' '));
      };
      Object.defineProperty(window.navigator, 'serviceWorker', {
        configurable: true,
        value: {
          register: () => {
            probes.register += 1;
            return Promise.resolve();
          },
        },
      });
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: {
          requestPermission: () => {
            probes.permission += 1;
            return Promise.resolve('granted');
          },
        },
      });
      if (options.blockStorage) {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() {
            throw new Error('blocked');
          },
        });
      } else if (options.seed) {
        for (const [key, value] of Object.entries(options.seed)) window.localStorage.setItem(key, value);
      }
      window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const call = { url: String(input), init: init ?? {} };
        calls.push(call);
        if (!call.url.endsWith('/api/engage/website/v1/resolve')) {
          throw new Error(`unexpected request ${call.url}`);
        }
        return handler(window, call, calls.length - 1);
      }) as typeof fetch;
      const original = window.Element.prototype.appendChild;
      const patched: typeof original = function append<T extends Node>(this: Element, node: T): T {
        if (isElement(node) && node.getAttribute('data-messign-runtime') === '1') {
          runtimeInserts += 1;
          node.removeAttribute('src');
          const result = original.call(this, node) as T;
          const inline = window.document.createElement('script');
          inline.textContent = runtime;
          original.call(window.document.body, inline);
          return result;
        }
        return original.call(this, node) as T;
      };
      window.Element.prototype.appendChild = patched;
    },
  });
  return { window: dom.window, calls, logs, probes, runtimeInserts };
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

function dump(window: DOMWindow): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    out[key] = window.localStorage.getItem(key) ?? '';
  }
  return out;
}

async function settled(): Promise<void> {
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  await new Promise((resolve) => { setTimeout(resolve, 0); });
}

async function pastBackoff(): Promise<void> {
  await new Promise((resolve) => { setTimeout(resolve, 250); });
}

const snippet = (key = SITE) => `<p id="customer">keep</p><script data-site-key="${key}">__LOADER__</script>`;
const auto = (key = SITE) => `<!DOCTYPE html><body>${snippet(key)}</body>`;
const manual = '<!DOCTYPE html><body><p id="customer">keep</p><script>__LOADER__</script></body>';

function messign(window: DOMWindow): (...args: unknown[]) => void {
  return (window as unknown as { Messign: (...args: unknown[]) => void }).Messign;
}

function headerMap(init: RequestInit): Record<string, string> {
  const headers = init.headers;
  if (!headers || headers instanceof Array || typeof (headers as Headers).get === 'function') {
    throw new Error('headers were not a plain object');
  }
  return headers as Record<string, string>;
}

describe('production SDK artifact', () => {
  it('publishes a loader and a hashed runtime without a source map', () => {
    const { loader, runtime, runtimeName } = built();
    expect(loader).toContain(runtimeName);
    expect(loader).toContain('data-site-key');
    expect(loader).not.toContain(SECRET);
    expect(runtime).toContain('https://server-production-7283.up.railway.app');
    expect(runtime).not.toContain('http://127.0.0.1:3001');
    expect(runtime).not.toContain('sourceMappingURL');
    expect(runtime).not.toContain('requestPermission');
    expect(runtime).not.toContain('serviceWorker');
    expect(runtime).not.toContain('innerHTML');
    expect(fs.readdirSync(sdkDir).some((name) => name.endsWith('.map'))).toBe(false);
    const chat = fs.readFileSync(path.join(repo, 'client/src/components/chat/ChatNotificationPrompt.tsx'), 'utf8');
    expect(chat).toContain('Notification.requestPermission');
  });

  it('resolves the runtime beside the loader src and reads data-site-key from the current script', () => {
    const { loader, runtimeName } = built();
    const dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'https://shop.example.com/', runScripts: 'dangerously' });
    const script = dom.window.document.createElement('script');
    script.src = 'https://www.messign.com/sdk/v1/loader.js';
    script.setAttribute('data-site-key', SITE);
    let src = '';
    const original = dom.window.Element.prototype.appendChild;
    const patched: typeof original = function append<T extends Node>(this: Element, node: T): T {
      if (isElement(node) && node.getAttribute('data-messign-runtime') === '1') {
        const candidate = node as unknown as { src?: string };
        src = typeof candidate.src === 'string' ? candidate.src : '';
      }
      return original.call(this, node) as T;
    };
    dom.window.Element.prototype.appendChild = patched;
    Object.defineProperty(dom.window.document, 'currentScript', { configurable: true, get: () => script });
    dom.window.eval(loader);
    expect(src).toBe(`https://www.messign.com/sdk/v1/${runtimeName}`);
    dom.window.close();
  });

  it('sends one credential-free resolve and leaves the customer page alone', async () => {
    const page = open(auto(), (_window) => json(200, NONE));
    page.window.localStorage.setItem('messign_debug', '1');
    await settled();
    expect(page.calls).toHaveLength(1);
    const call = page.calls[0]!;
    expect(call.url).toBe(API);
    expect(call.init.method).toBe('POST');
    expect(call.init.credentials).toBe('omit');
    expect(call.init.cache).toBe('no-store');
    expect(call.init.body).toBe('{}');
    const headers = headerMap(call.init);
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Site-Key']).toBe(SITE);
    expect(headers.Origin).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
    expect(headers.Cookie).toBeUndefined();
    expect(page.window.document.getElementById('customer')?.textContent).toBe('keep');
    expect(page.window.document.cookie).toBe('');
    expect(page.probes).toEqual({ register: 0, permission: 0 });
    expect(page.runtimeInserts).toBe(1);
    expect(page.logs.join('\n')).toContain('none');
    expect(page.logs.join('\n')).not.toContain(SECRET);
    expect(JSON.stringify(dump(page.window))).not.toContain(SECRET);
  });

  it.each(['test', 'live', 'none'])('stops after a %s audience', async (audience) => {
    const page = open(auto(), (_window) => json(200, { ...NONE, audience, mode: audience === 'live' ? 'live' : 'test' }));
    await settled();
    await pastBackoff();
    expect(page.calls).toHaveLength(1);
  });

  it('ignores a caller-supplied audience and a duplicate init', async () => {
    const page = open(manual, (_window) => json(200, NONE));
    messign(page.window)('init', { siteKey: 'msk_short', audience: 'live', organizationId: 'org_1' });
    messign(page.window)('init', { siteKey: SITE, audience: 'live', organizationId: 'org_1', apiOrigin: 'https://evil.example' });
    messign(page.window)('init', { siteKey: SITE });
    await settled();
    expect(page.calls).toHaveLength(1);
    expect(page.calls[0]!.url).toBe(API);
    expect(page.calls[0]!.init.body).toBe('{}');
  });

  it('processes enroll before init and keeps a later enroll for the next resolve', async () => {
    const queued = `<!DOCTYPE html><body><script>
      window.Messign = function () { (window.Messign.q = window.Messign.q || []).push([].slice.call(arguments)); };
      window.Messign('enroll', { browserId: '${BROWSER}' });
    </script><script data-site-key="${SITE}">__LOADER__</script></body>`;
    const first = open(queued, (_window) => json(200, { ...NONE, audience: 'test' }));
    await settled();
    expect(first.calls).toHaveLength(1);
    expect(first.calls[0]!.init.body).toBe(JSON.stringify({ browserId: BROWSER }));
    messign(first.window)('enroll', { browserId: `mbt_${'C'.repeat(43)}` });
    await settled();
    expect(first.calls).toHaveLength(1);
    const second = open(auto(), (_window) => json(200, NONE), { seed: dump(first.window) });
    await settled();
    expect(second.calls[0]!.init.body).toBe(JSON.stringify({ browserId: `mbt_${'C'.repeat(43)}` }));
  });

  it('rejects an invalid enrollment id and an unsupported command', async () => {
    const page = open(manual, (_window) => json(200, NONE));
    page.window.localStorage.setItem('messign_debug', '1');
    expect(() => messign(page.window)('track', { siteKey: SITE })).not.toThrow();
    expect(() => messign(page.window)('enroll', { browserId: 'mbt_short' })).not.toThrow();
    messign(page.window)('init', { siteKey: SITE });
    await settled();
    expect(page.calls).toHaveLength(1);
    expect(page.calls[0]!.init.body).toBe('{}');
    expect(page.logs.join('\n')).not.toContain(SECRET);
    expect(JSON.stringify(dump(page.window))).not.toContain('mbt_short');
  });

  it('does not load a second runtime when the snippet is included twice', async () => {
    const html = `<!DOCTYPE html><body>${snippet()}${snippet()}</body>`;
    const page = open(html, (_window) => json(200, NONE));
    await settled();
    await pastBackoff();
    expect(page.runtimeInserts).toBe(1);
    expect(page.calls).toHaveLength(1);
  });

  it('does not retry or cache a 401, and does retry 429 and 503', async () => {
    const denied = open(auto(), (_window) => json(401, { error: 'Invalid site key' }));
    await pastBackoff();
    expect(denied.calls).toHaveLength(1);
    expect(JSON.stringify(dump(denied.window))).not.toContain('"kind":"deny"');
    const again = open(auto(), (_window) => json(200, NONE), { seed: dump(denied.window) });
    await settled();
    expect(again.calls).toHaveLength(1);

    let limited = 0;
    const rate = open(auto(), (_window) => {
      limited += 1;
      if (limited < 3) return json(429, { error: 'Rate limit exceeded' }, { 'Retry-After': '0' });
      return json(200, NONE);
    });
    await settled();
    await new Promise((resolve) => { setTimeout(resolve, 30); });
    expect(limited).toBe(3);
    expect(rate.calls).toHaveLength(3);

    let unavailable = 0;
    const down = open(auto(), (_window) => {
      unavailable += 1;
      if (unavailable < 3) return json(503, { error: 'Website environment is not configured', code: 'environment_unset' });
      return json(200, NONE);
    });
    await new Promise((resolve) => { setTimeout(resolve, 800); });
    expect(unavailable).toBe(3);
    expect(down.calls).toHaveLength(3);
  });

  it('caches a 403 briefly and allows a later success once that record expires', async () => {
    const denied = open(auto(), (_window) => json(403, { error: 'Installation is not active', code: 'disabled' }));
    await settled();
    const stored = dump(denied.window);
    const raw = Object.values(stored).find((value) => value.includes('"kind":"deny"'));
    expect(raw).toBeTruthy();
    const record = JSON.parse(raw!) as { exp: number; code: string };
    expect(record.code).toBe('disabled');
    expect(record.exp - Date.now()).toBeLessThanOrEqual(5000);
    expect(record.exp - Date.now()).toBeGreaterThan(0);
    const blocked = open(auto(), () => { throw new Error('cached 403 must not call the network'); }, { seed: stored });
    await settled();
    expect(blocked.calls).toHaveLength(0);
    const expired = JSON.parse(raw!) as { exp: number };
    expired.exp = Date.now() - 1;
    const key = Object.keys(stored).find((name) => stored[name]!.includes('"kind":"deny"'))!;
    const renewed = open(auto(), (_window) => json(200, { ...NONE, audience: 'live', mode: 'live' }), {
      seed: { ...stored, [key]: JSON.stringify(expired) },
    });
    await settled();
    expect(renewed.calls).toHaveLength(1);
  });

  it('uses a valid 30 second success cache and ignores a tampered or cross-origin one', async () => {
    const first = open(auto(), (_window) => json(200, { ...NONE, audience: 'live', mode: 'live' }));
    await settled();
    const stored = dump(first.window);
    const hit = open(auto(), () => { throw new Error('fresh cache must not call the network'); }, { seed: stored });
    await settled();
    expect(hit.calls).toHaveLength(0);
    const other = open(auto(), (_window) => json(200, NONE), { seed: stored, url: 'https://other.example.com/' });
    await settled();
    expect(other.calls).toHaveLength(1);
    const rawKey = Object.keys(stored).find((name) => name.includes(':cache:'))!;
    const tampered = JSON.parse(stored[rawKey]!) as { exp: number };
    tampered.exp = Date.now() + 120_000;
    const forced = open(auto(), (_window) => json(200, NONE), { seed: { [rawKey]: JSON.stringify(tampered) } });
    await settled();
    expect(forced.calls).toHaveLength(1);
  });

  it('rejects malformed JSON and an unexpected schema without retrying', async () => {
    const badJson = open(auto(), () => fakeResponse(200, 'not-json'));
    await pastBackoff();
    expect(badJson.calls).toHaveLength(1);
    const badSchema = open(auto(), (_window) => json(200, { audience: 'live', organizationId: 'org_1' }));
    await pastBackoff();
    expect(badSchema.calls).toHaveLength(1);
    expect(JSON.stringify(dump(badSchema.window))).not.toContain('org_1');
  });

  it('retries a network failure and a timeout, and still resolves when storage is blocked', async () => {
    let failures = 0;
    const flaky = open(auto(), (_window) => {
      failures += 1;
      if (failures < 3) return Promise.reject(new TypeError('Failed to fetch'));
      return json(200, NONE);
    });
    await new Promise((resolve) => { setTimeout(resolve, 800); });
    expect(failures).toBe(3);
    expect(flaky.calls).toHaveLength(3);

    vi.useFakeTimers();
    try {
      let hung = 0;
      const stalled = open(manual, (_window, call) => new Promise((_resolve, reject) => {
        hung += 1;
        call.init.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'));
        });
      }));
      stalled.window.setTimeout = globalThis.setTimeout.bind(globalThis);
      stalled.window.clearTimeout = globalThis.clearTimeout.bind(globalThis);
      messign(stalled.window)('init', { siteKey: SITE });
      await vi.advanceTimersByTimeAsync(8000);
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(8000);
      await vi.advanceTimersByTimeAsync(400);
      await vi.advanceTimersByTimeAsync(8000);
      expect(hung).toBe(3);
    } finally {
      vi.useRealTimers();
    }

    const blocked = open(auto(), (_window) => json(200, NONE), { blockStorage: true });
    await settled();
    expect(blocked.calls).toHaveLength(1);
    expect(blocked.window.document.getElementById('customer')?.textContent).toBe('keep');
  });

  it('builds the development runtime against the local API only', () => {
    execSync('node client/scripts/build-sdk.mjs', { cwd: repo, env: { ...process.env, SDK_ENV: 'development' }, stdio: 'pipe' });
    const devDir = path.join(repo, 'client', 'public', 'sdk', 'v1-dev');
    const name = fs.readdirSync(devDir).find((file) => file.startsWith('messign.'));
    const source = fs.readFileSync(path.join(devDir, name!), 'utf8');
    expect(source).toContain('http://127.0.0.1:3001');
    expect(source).not.toContain('server-production-7283');
    expect(fs.readdirSync(sdkDir).some((file) => file.startsWith('messign.'))).toBe(true);
    expect(fs.readFileSync(path.join(sdkDir, 'loader.js'), 'utf8')).not.toContain('127.0.0.1:3001');
  });
});
