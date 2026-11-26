import {
  cacheStorageKey,
  denyRecord,
  enrollmentRecord,
  enrollmentStorageKey,
  parseCacheEntry,
  parseEnrollment,
  successRecord,
} from './cache.js';
import { BROWSER_ID_RE, siteKeyPrefix } from './ids.js';
import { parseResolveBody, type ResolveBody } from './schema.js';

declare const __MESSIGN_API_ORIGIN__: string;
declare const __MESSIGN_SDK_MAJOR__: string;

const API_ORIGIN: string = __MESSIGN_API_ORIGIN__;
const SDK_MAJOR: string = __MESSIGN_SDK_MAJOR__;
const RESOLVE_PATH = '/api/engage/website/v1/resolve';
const TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 3;

interface MessignFn {
  (...args: unknown[]): void;
  q?: unknown[];
}

interface Host {
  Messign?: MessignFn;
  __messignRuntimeV1?: boolean;
  location?: { origin?: string };
  localStorage?: Storage;
  fetch?: typeof fetch;
}

type Outcome =
  | { type: 'ok'; body: ResolveBody }
  | { type: 'malformed' }
  | { type: 'timeout' }
  | { type: 'network' }
  | { type: 'http'; status: number; code?: string | null };

const memory: { current: ResolveBody | null } = { current: null };
let started = false;
let activePrefix: string | null = null;
let pendingBrowserId: string | null = null;

/**
 * Boots the command queue. `init` and `enroll` are the only commands.
 * Anything else is ignored. A second copy of the runtime returns immediately.
 */
function boot(): void {
  try {
    const host = globalThis as Host;
    if (host.__messignRuntimeV1) return;
    host.__messignRuntimeV1 = true;
    const queued = queueOf(host.Messign);
    const live: MessignFn = (...args: unknown[]) => {
      dispatch(args);
    };
    live.q = [];
    host.Messign = live;
    for (const item of queued) dispatch(argsOf(item));
  } catch {
    /* The host page must not see an SDK exception. */
  }
}

function queueOf(fn: MessignFn | undefined): unknown[] {
  if (!fn || !Array.isArray(fn.q)) return [];
  return fn.q.slice();
}

function argsOf(item: unknown): unknown[] {
  if (Array.isArray(item)) return item;
  if (item && typeof item === 'object' && typeof (item as { length?: unknown }).length === 'number') {
    try {
      return Array.prototype.slice.call(item as ArrayLike<unknown>);
    } catch {
      return [];
    }
  }
  return [];
}

function dispatch(args: unknown[]): void {
  try {
    const name = args[0];
    if (name === 'init') onInit(args[1]);
    else if (name === 'enroll') onEnroll(args[1]);
    else debug('unsupported command', { command: commandName(name) });
  } catch {
    debug('command failed');
  }
}

/**
 * Validates the site key and starts one resolve. A second valid init does
 * not fetch again and does not load another script. Fields other than
 * `siteKey` are ignored, including a caller-supplied audience or organization id.
 */
function onInit(payload: unknown): void {
  const siteKey = readSiteKey(payload);
  if (!siteKey) {
    debug('ignored init');
    return;
  }
  const prefix = siteKeyPrefix(siteKey);
  if (!prefix || started) {
    debug('ignored duplicate init', { prefix: prefix ?? 'invalid' });
    return;
  }
  started = true;
  activePrefix = prefix;
  const origin = pageOrigin();
  const stored = pendingBrowserId ?? (origin ? readStoredEnrollment(origin, prefix) : null);
  const browserId = stored && BROWSER_ID_RE.test(stored) ? stored : null;
  pendingBrowserId = browserId;
  if (browserId && origin) writeEnrollment(origin, prefix, browserId);
  void runResolve(siteKey, origin, prefix, browserId);
}

/**
 * Stores a test enrollment for the next resolve. The id must already match
 * the server's `mbt_` plus 43-character base64url rule. This does not call
 * the API and does not generate an id. An enroll that arrives after init
 * has started waits for the following resolve.
 */
function onEnroll(payload: unknown): void {
  const browserId = readBrowserId(payload);
  if (!browserId) {
    debug('ignored enroll');
    return;
  }
  pendingBrowserId = browserId;
  const origin = pageOrigin();
  if (origin && activePrefix) {
    writeEnrollment(origin, activePrefix, browserId);
    clearCache(origin, activePrefix);
  }
}

async function runResolve(siteKey: string, origin: string | null, prefix: string, browserId: string | null): Promise<void> {
  try {
    const cached = browserId || !origin ? null : readCache(origin, prefix);
    if (cached?.kind === 'ok') {
      hold(cached.body);
      return;
    }
    if (cached?.kind === 'deny') {
      debug('cached deny', { code: cached.code });
      return;
    }
    const outcome = await resolveWithRetry(siteKey, browserId);
    if (outcome.type === 'ok') {
      if (origin) writeCache(origin, prefix, JSON.stringify(successRecord(outcome.body, Date.now())));
      hold(outcome.body);
      return;
    }
    if (outcome.type === 'http' && outcome.status === 403) {
      if (origin) writeCache(origin, prefix, JSON.stringify(denyRecord(outcome.code ?? null, Date.now())));
      debug('denied', { status: 403, code: outcome.code ?? null });
      return;
    }
    if (outcome.type === 'http') debug('http', { status: outcome.status });
    else debug(outcome.type);
  } catch {
    debug('resolve failed');
  }
}

/**
 * Keeps the four response fields in memory and stops. `audience: none` is a
 * successful stop. No further request is made. The cached audience is not
 * an authorization decision for any later operation.
 */
function hold(body: ResolveBody): void {
  memory.current = body;
  const current = memory.current;
  debug('resolved', { audience: current.audience, mode: current.mode, environment: current.environment });
}

async function resolveWithRetry(siteKey: string, browserId: string | null): Promise<Outcome> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetchOnce(siteKey, browserId);
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) return { type: isAbort(err) ? 'timeout' : 'network' };
      debug('retry', { detail: errorLabel(err) });
      await wait(backoffMs(attempt));
      continue;
    }
    if (response.status === 200) {
      const parsed = await readJson(response);
      if (parsed === undefined) return { type: 'malformed' };
      const body = parseResolveBody(parsed);
      if (!body) return { type: 'malformed' };
      return { type: 'ok', body };
    }
    if (response.status === 429 || response.status === 503) {
      const delay = retryAfterMs(response) ?? backoffMs(attempt);
      release(response);
      if (attempt === MAX_ATTEMPTS) return { type: 'http', status: response.status };
      await wait(delay);
      continue;
    }
    if (response.status === 403) {
      const parsed = await readJson(response);
      return { type: 'http', status: 403, code: errorCode(parsed) };
    }
    release(response);
    return { type: 'http', status: response.status };
  }
  return { type: 'network' };
}

function release(response: Response): void {
  try {
    void response.body?.cancel();
  } catch {
    /* The status was already read. */
  }
}

function fetchOnce(siteKey: string, browserId: string | null): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const body = browserId ? JSON.stringify({ browserId }) : '{}';
  return fetch(`${API_ORIGIN}${RESOLVE_PATH}`, {
    method: 'POST',
    credentials: 'omit',
    mode: 'cors',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-Site-Key': siteKey,
    },
    body,
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timer);
  });
}

function backoffMs(attempt: number): number {
  return attempt <= 1 ? 200 : 400;
}

function retryAfterMs(response: Response): number | null {
  const raw = response.headers.get('Retry-After');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.floor(seconds * 1000), 5000);
  const when = Date.parse(raw);
  if (Number.isFinite(when)) return Math.min(Math.max(0, when - Date.now()), 5000);
  return null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function errorCode(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const code = (value as { code?: unknown }).code;
  if (typeof code !== 'string' || !/^[a-z0-9_]{1,64}$/.test(code)) return null;
  return code;
}

function isAbort(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

function errorLabel(err: unknown): string {
  if (!err || typeof err !== 'object') return 'unknown';
  const name = (err as { name?: string }).name ?? 'error';
  const message = (err as { message?: string }).message ?? '';
  return `${name}:${message.replace(/msk_[A-Za-z0-9_-]+/g, 'msk_redacted').slice(0, 80)}`;
}

function readSiteKey(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const siteKey = (payload as { siteKey?: unknown }).siteKey;
  if (typeof siteKey !== 'string') return null;
  const trimmed = siteKey.trim();
  return siteKeyPrefix(trimmed) ? trimmed : null;
}

function readBrowserId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const browserId = (payload as { browserId?: unknown }).browserId;
  if (typeof browserId !== 'string' || !BROWSER_ID_RE.test(browserId)) return null;
  return browserId;
}

function pageOrigin(): string | null {
  try {
    const origin = (globalThis as Host).location?.origin;
    if (typeof origin !== 'string' || origin === '' || origin === 'null') return null;
    return origin;
  } catch {
    return null;
  }
}

function store(): Storage | null {
  try {
    const storage = (globalThis as Host).localStorage;
    if (!storage) return null;
    const probe = 'msdk:v1:probe';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function readCache(origin: string, prefix: string): ReturnType<typeof parseCacheEntry> {
  try {
    const raw = store()?.getItem(cacheStorageKey(SDK_MAJOR, origin, prefix)) ?? null;
    return parseCacheEntry(raw, Date.now());
  } catch {
    return null;
  }
}

function clearCache(origin: string, prefix: string): void {
  try {
    store()?.removeItem(cacheStorageKey(SDK_MAJOR, origin, prefix));
  } catch {
    /* A blocked store must not stop the command. */
  }
}

function writeCache(origin: string, prefix: string, raw: string): void {
  try {
    store()?.setItem(cacheStorageKey(SDK_MAJOR, origin, prefix), raw);
  } catch {
    /* A full or blocked store must not stop the resolve that already finished. */
  }
}

function readStoredEnrollment(origin: string, prefix: string): string | null {
  try {
    return parseEnrollment(store()?.getItem(enrollmentStorageKey(SDK_MAJOR, origin, prefix)) ?? null);
  } catch {
    return null;
  }
}

function writeEnrollment(origin: string, prefix: string, browserId: string): void {
  try {
    store()?.setItem(enrollmentStorageKey(SDK_MAJOR, origin, prefix), enrollmentRecord(browserId));
  } catch {
    /* The in-memory id is still used for this page's resolve. */
  }
}

function commandName(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return 'invalid';
  return value.slice(0, 32);
}

function debug(message: string, fields?: Record<string, string | number | null>): void {
  try {
    if (store()?.getItem('messign_debug') !== '1') return;
    const safe: Record<string, string | number | null> = {};
    if (fields) {
      for (const [key, value] of Object.entries(fields)) {
        if (key === 'siteKey' || key === 'browserId' || key === 'organizationId' || key === 'installationId') continue;
        safe[key] = value;
      }
    }
    console.info('[messign]', message, safe);
  } catch {
    /* Logging is optional. */
  }
}

boot();
