import { formatIysDate, type IysStatus, type IysType } from './format.js';

/**
 * The İYS API client (WP-26, ADR-022), written from the official documentation (https://apidocs.iys.org.tr, 3.2.4):
 *
 *   POST /oauth2/token                                          {username, password, grant_type: "password"} or a refresh token
 *   GET  /sps/{iysCode}/brands                                  the provider's brands
 *   POST /v2/sps/{iysCode}/brands/{brandCode}/consents          one consent; sending the same request again returns the same transactionId
 *   GET  /sps/{iysCode}/brands/{brandCode}/consents/changes     consent movements of the last 7 days (not the last hour), after/limit/source
 *
 * Only the methods Messign needs are here. The tenant's own credentials (username, password, iysCode, brandCode) are the
 * only ones used: Messign is not an İYS integrator (docs/compliance/tr-messaging-obligations.md). Tokens live in memory
 * only. Nothing here logs a recipient, a password or a token: errors carry the HTTP status, İYS's error code and the
 * X-Trace-Id that İYS asks to be quoted in support requests.
 *
 * Limits from the documentation, honoured here: at most 10 requests a second from one IP (requests are spaced), 100 token
 * requests an hour (a token is reused for its 2 hours and refreshed with the refresh token), 1000 status queries and 100
 * history listings an hour. A limit that resets within a second is waited out; an hourly one is raised to the caller, which
 * must not call again before it resets (calling early restarts İYS's counter).
 */

export const IYS_BASE_URLS = { live: 'https://api.iys.org.tr', test: 'https://api.sandbox.iys.org.tr' } as const;
export const MAX_CHANGES_PER_PAGE = 1000;

export interface IysCredentials { username: string; password: string }

export type RateScope = 'second' | 'token' | 'status' | 'history' | 'unknown';

/** İYS answered with an error. `code` is its own error code (H…, ERR-…), `traceId` its X-Trace-Id header. */
export class IysApiError extends Error {
  constructor(public readonly status: number, public readonly code: string | null, message: string, public readonly traceId: string | null) {
    super(message);
    this.name = 'IysApiError';
  }
  /** Worth trying again later: İYS or the network failed, or a rate limit applies. A 4xx about the request itself is final. */
  get retryable(): boolean { return this.status >= 500 || this.status === 429 || this.status === 408; }
}

export class IysRateLimitError extends IysApiError {
  constructor(status: number, code: string | null, message: string, traceId: string | null, public readonly scope: RateScope, public readonly retryAfterMs: number) {
    super(status, code, message, traceId);
    this.name = 'IysRateLimitError';
  }
}

/** The request never got an answer (connection, timeout). */
export class IysNetworkError extends Error {
  constructor(message: string) { super(message); this.name = 'IysNetworkError'; }
}

/** İYS's own documented rate-limit error codes and what they limit (error table of the documentation). */
const RATE_CODES: Record<string, { scope: RateScope; retryAfterMs: number }> = {
  H083: { scope: 'second', retryAfterMs: 1_000 }, H124: { scope: 'second', retryAfterMs: 1_000 },
  H084: { scope: 'token', retryAfterMs: 3_600_000 }, H086: { scope: 'status', retryAfterMs: 3_600_000 }, H089: { scope: 'history', retryAfterMs: 3_600_000 },
};

export interface ConsentToAdd {
  recipient: string; type: IysType; status: IysStatus; source: string; consentDate: Date; recipientType?: 'BIREYSEL' | 'TACIR';
}
export interface AddedConsent { transactionId: string; creationDate: string }

/** One movement as İYS lists it (documented fields; citizenName is the recipient's name and is never read). */
export interface IysChange {
  recipient: string; recipientType: string; type: string; status: string; source: string;
  consentDate?: string; creationDate: string; transactionId: string;
}
export interface ChangesPage { after: string | null; list: IysChange[] }
export interface IysBrand { brandCode: number; name: string; master: boolean }

export interface IysClientOptions {
  baseUrl: string; iysCode: number; brandCode: number; credentials: IysCredentials;
  fetchImpl?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void>;
  /** Spacing between requests, 100 ms for the documented 10 a second. */
  minIntervalMs?: number; timeoutMs?: number;
}

interface Tokens { access: string; accessExpiresAt: number; refresh: string | null; refreshExpiresAt: number }

const lastRequestAt = new Map<string, number>(); // per host, so two clients of one process share the 10-a-second budget

export class IysClient {
  private tokens: Tokens | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(private readonly o: IysClientOptions) {
    if (!Number.isSafeInteger(o.iysCode) || o.iysCode <= 0 || !Number.isSafeInteger(o.brandCode) || o.brandCode <= 0) throw new Error('iysCode and brandCode must be positive integers');
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.now = o.now ?? Date.now;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.minIntervalMs = o.minIntervalMs ?? 100;
    this.timeoutMs = o.timeoutMs ?? 15_000;
  }

  // --- the methods -------------------------------------------------------------------------------------------------

  async listBrands(): Promise<IysBrand[]> {
    const body = await this.api('GET', `/sps/${this.o.iysCode}/brands`);
    if (!Array.isArray(body)) throw new IysApiError(502, null, 'İYS answered with an unexpected body', null);
    return body.flatMap((b: Record<string, unknown>) => (typeof b?.brandCode === 'number' ? [{ brandCode: b.brandCode, name: String(b.name ?? ''), master: b.master === true }] : []));
  }

  /** Registers one consent decision. Optional fields that have no value are left out, as the documentation requires. */
  async addConsent(c: ConsentToAdd): Promise<AddedConsent> {
    const body = await this.api('POST', `/v2/sps/${this.o.iysCode}/brands/${this.o.brandCode}/consents`, {
      recipient: c.recipient, type: c.type, source: c.source, status: c.status, consentDate: formatIysDate(c.consentDate), recipientType: c.recipientType ?? 'BIREYSEL',
    });
    const r = body as Partial<AddedConsent> | null;
    if (!r || typeof r.transactionId !== 'string' || typeof r.creationDate !== 'string') throw new IysApiError(502, null, 'İYS answered with an unexpected body', null);
    return { transactionId: r.transactionId, creationDate: r.creationDate };
  }

  /**
   * Consent movements of the last 7 days that are older than an hour, oldest first, `source` IYS (what recipients did
   * through İYS) or HS (what the provider reported). `after` is the marker the previous page returned; with none, the
   * listing starts at the beginning of the window. İYS answers 204 when there is nothing: the page is then empty and keeps
   * the marker it was given.
   */
  async listChanges(o: { after?: string | null; limit?: number; source?: 'IYS' | 'HS' } = {}): Promise<ChangesPage> {
    const q = new URLSearchParams();
    q.set('source', o.source ?? 'IYS');
    q.set('limit', String(Math.min(Math.max(Math.trunc(o.limit ?? MAX_CHANGES_PER_PAGE), 1), MAX_CHANGES_PER_PAGE)));
    if (o.after) q.set('after', o.after);
    const body = await this.api('GET', `/sps/${this.o.iysCode}/brands/${this.o.brandCode}/consents/changes?${q.toString()}`);
    if (body === null) return { after: o.after ?? null, list: [] };
    const page = body as { after?: unknown; list?: unknown };
    if (!Array.isArray(page.list)) throw new IysApiError(502, null, 'İYS answered with an unexpected body', null);
    return { after: typeof page.after === 'string' && page.after ? page.after : o.after ?? null, list: page.list as IysChange[] };
  }

  // --- tokens and transport ----------------------------------------------------------------------------------------

  private async token(): Promise<string> {
    const t = this.tokens;
    if (t && this.now() < t.accessExpiresAt - 300_000) return t.access;
    if (t?.refresh && this.now() < t.refreshExpiresAt - 300_000) {
      try { return await this.fetchToken({ grant_type: 'refresh_token', refresh_token: t.refresh }); } catch (err) {
        if (!(err instanceof IysApiError) || err.status >= 500 || err.status === 429) throw err; // a rejected refresh falls back to the password
      }
    }
    return this.fetchToken({ grant_type: 'password', username: this.o.credentials.username, password: this.o.credentials.password });
  }

  private async fetchToken(payload: Record<string, string>): Promise<string> {
    const res = await this.send('POST', '/oauth2/token', payload, null);
    const b = res.body as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; refresh_expires_in?: unknown } | null;
    if (!b || typeof b.access_token !== 'string') throw new IysApiError(502, null, 'İYS answered the token request with an unexpected body', res.traceId);
    const at = this.now();
    this.tokens = {
      access: b.access_token, accessExpiresAt: at + (typeof b.expires_in === 'number' ? b.expires_in : 7200) * 1000,
      refresh: typeof b.refresh_token === 'string' ? b.refresh_token : null, refreshExpiresAt: at + (typeof b.refresh_expires_in === 'number' ? b.refresh_expires_in : 14_400) * 1000,
    };
    return b.access_token;
  }

  /** An authenticated call. A 401 drops the token and tries once more with a new one. */
  private async api(method: 'GET' | 'POST', path: string, payload?: unknown): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      try {
        return (await this.send(method, path, payload, await this.token())).body;
      } catch (err) {
        if (err instanceof IysApiError && err.status === 401 && attempt === 0) { this.tokens = null; continue; }
        throw err;
      }
    }
  }

  private async send(method: 'GET' | 'POST', path: string, payload: unknown, token: string | null): Promise<{ body: unknown; traceId: string | null }> {
    for (let waited = 0; ; waited++) {
      await this.pace();
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.o.baseUrl}${path}`, {
          method,
          headers: { accept: 'application/json', ...(payload !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
          ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        // The message names the kind of failure, never the URL query or the body.
        throw new IysNetworkError(err instanceof Error && err.name === 'TimeoutError' ? 'İYS did not answer in time' : 'İYS could not be reached');
      }
      const traceId = res.headers.get('x-trace-id');
      if (res.status === 204) return { body: null, traceId };
      const text = await res.text();
      let json: unknown = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = null; }
      if (res.ok) return { body: json, traceId };
      const first = (json as { errors?: Array<{ code?: unknown; message?: unknown }> } | null)?.errors?.[0];
      const code = typeof first?.code === 'string' ? first.code : null;
      const message = typeof first?.message === 'string' ? first.message.slice(0, 200) : `İYS answered ${res.status}`;
      const rate = res.status === 429 ? RATE_CODES[code ?? ''] ?? { scope: 'unknown' as RateScope, retryAfterMs: 60_000 } : null;
      if (rate) {
        if (rate.scope === 'second' && waited < 2) { await this.sleep(rate.retryAfterMs); continue; }
        throw new IysRateLimitError(res.status, code, message, traceId, rate.scope, rate.retryAfterMs);
      }
      throw new IysApiError(res.status, code, message, traceId);
    }
  }

  private async pace(): Promise<void> {
    const last = lastRequestAt.get(this.o.baseUrl) ?? 0;
    const wait = last + this.minIntervalMs - this.now();
    lastRequestAt.set(this.o.baseUrl, Math.max(this.now(), last + this.minIntervalMs));
    if (wait > 0) await this.sleep(wait);
  }
}
