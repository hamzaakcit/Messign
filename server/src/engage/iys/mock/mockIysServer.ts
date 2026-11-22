import { createHash, randomBytes } from 'crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import type { AddressInfo } from 'net';
import { addBusinessDays, formatIysDate, parseIysDate, BUSINESS_DAYS_TO_REPORT } from '../format.js';

/**
 * A mock İYS server for development and tests (WP-26, ADR-022). It implements the methods the client uses, with the
 * request and response shapes, the rules and the error codes of the official documentation (https://apidocs.iys.org.tr,
 * 3.2.4): token and refresh token, brands, add consent (v1 and the idempotent v2), and the consent-movement listing with
 * its `after` marker, 7-day window, one-hour delay and 204 for nothing. It is built from the documentation, not from a
 * real İYS, so it can differ from the real service: the first live check with a tenant's credentials is the first
 * onboarding step (docs/runbooks/iys-sync.md).
 *
 * Rules checked on a consent (documentation error codes in brackets): recipient, type, status, source and consentDate are
 * required [H114 H111 H110 H113 H112] with the documented values [H115 H116 H117 H119]; only the documented fields
 * [H118]; e-mail or E.164 phone [H120 H121 H464]; the date format [H158] and not in the future [H162]; not older than
 * three business days [H467]; a first record cannot be a RET [H175]; the status must change [H174]; the date cannot be
 * older than the stored one [H178]; at most two operations per recipient and day [H453].
 *
 * Tests drive it with `addRecipientChange` (a recipient acting through İYS), `failNext` (a fault on the next request) and
 * `requests` (what the client sent). It is never started by the server itself.
 */

export interface MockIysOptions {
  username?: string; password?: string; iysCode?: number; brandCode?: number;
  now?: () => number;
  /** Consent movements are listed only once they are this old (the documentation says one hour). */
  visibilityDelayMs?: number;
}

interface Stored { recipient: string; recipientType: string; type: string; status: string; source: string; consentDate: string; creationMs: number; transactionId: string }
export interface MockRequest { method: string; path: string; query: Record<string, string>; body: unknown; authorized: boolean }
interface Fault { status: number; code: string; message?: string; when?: (r: MockRequest) => boolean }

const ENUM = {
  status: ['ONAY', 'RET'], type: ['ARAMA', 'MESAJ', 'EPOSTA'], recipientType: ['BIREYSEL', 'TACIR'],
  source: ['HS_FIZIKSEL_ORTAM', 'HS_ISLAK_IMZA', 'HS_WEB', 'HS_CAGRI_MERKEZI', 'HS_SOSYAL_MEDYA', 'HS_EPOSTA', 'HS_MESAJ', 'HS_MOBIL', 'HS_EORTAM', 'HS_ETKINLIK', 'HS_2015', 'HS_ATM', 'HS_KARAR'],
};
const ALLOWED_FIELDS = new Set(['recipientType', 'retailerAccess', 'recipient', 'retailerCode', 'source', 'type', 'consentDate', 'status']);
const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{2,}\.[a-z]{2,}$/i;
const PHONE_RE = /^\+[1-9][0-9]{7,14}$/;
const HOUR = 3_600_000;
const WEEK = 7 * 24 * HOUR;

class Refuse extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

export class MockIys {
  readonly requests: MockRequest[] = [];
  readonly faults: Fault[] = [];
  /** The current record per (recipientType, type, recipient), as İYS keeps it. */
  readonly state = new Map<string, Stored>();
  /** Every movement, in the order İYS registered it. */
  readonly movements: Stored[] = [];
  private server: Server | null = null;
  private url_ = '';
  private readonly tokens = new Map<string, { kind: 'access' | 'refresh'; expiresMs: number }>();
  private readonly dailyOps = new Map<string, number>();
  private counter = 0;
  readonly o: Required<Pick<MockIysOptions, 'username' | 'password' | 'iysCode' | 'brandCode' | 'visibilityDelayMs'>> & { now: () => number };

  constructor(o: MockIysOptions = {}) {
    this.o = { username: o.username ?? 'mock-user', password: o.password ?? 'mock-password', iysCode: o.iysCode ?? 100001, brandCode: o.brandCode ?? 100001, visibilityDelayMs: o.visibilityDelayMs ?? HOUR, now: o.now ?? Date.now };
  }

  get url(): string { return this.url_; }
  async start(): Promise<this> { return this.startOn(0); }
  /** Listens on the loopback address only; port 0 picks a free one. */
  async startOn(port: number): Promise<this> {
    this.server = createServer((req, res) => { void this.handle(req, res); });
    await new Promise<void>((r) => this.server!.listen(port, '127.0.0.1', r));
    this.url_ = `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}`;
    return this;
  }
  async stop(): Promise<void> { await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r())); this.server = null; }

  // --- test controls -----------------------------------------------------------------------------------------------

  /** A recipient acts through İYS (the İYS app, the 3338 number, the web page): a movement the provider did not send. */
  addRecipientChange(c: { recipient: string; type: 'ARAMA' | 'MESAJ' | 'EPOSTA'; status: 'ONAY' | 'RET'; source?: string; consentDate?: Date; recipientType?: string; creationMs?: number }): Stored {
    const at = this.o.now();
    return this.record({
      recipient: c.recipient.toLowerCase(), recipientType: c.recipientType ?? 'BIREYSEL', type: c.type, status: c.status,
      source: c.source ?? 'IYS_WEB', consentDate: formatIysDate(c.consentDate ?? new Date(at)), creationMs: c.creationMs ?? at,
    });
  }
  failNext(f: Fault): void { this.faults.push(f); }
  current(recipient: string, type: string, recipientType = 'BIREYSEL'): Stored | undefined { return this.state.get(`${recipientType}|${type}|${recipient.toLowerCase()}`); }
  requestsTo(pathStart: string): MockRequest[] { return this.requests.filter((r) => r.path.startsWith(pathStart)); }

  // --- İYS's side --------------------------------------------------------------------------------------------------

  private record(s: Omit<Stored, 'transactionId'>): Stored {
    const transactionId = createHash('sha256').update(`${s.recipient}|${s.type}|${s.status}|${s.consentDate}|${s.source}|${s.creationMs}|${this.counter++}`).digest('hex');
    const full = { ...s, transactionId };
    this.state.set(`${s.recipientType}|${s.type}|${s.recipient}`, full);
    this.movements.push(full);
    return full;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://mock');
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    const contentType = String(req.headers['content-type'] ?? '');
    let body: unknown = null;
    if (raw) {
      try { body = contentType.includes('application/x-www-form-urlencoded') ? Object.fromEntries(new URLSearchParams(raw)) : JSON.parse(raw); } catch { body = Symbol.for('malformed'); }
    }
    const authHeader = String(req.headers.authorization ?? '');
    const r: MockRequest = { method: req.method ?? 'GET', path: url.pathname, query: Object.fromEntries(url.searchParams), body, authorized: false };
    const trace = randomBytes(16).toString('hex');
    const send = (status: number, payload?: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'x-trace-id': trace });
      res.end(payload === undefined ? undefined : JSON.stringify(payload));
    };
    try {
      this.requests.push(r);
      const fi = this.faults.findIndex((f) => !f.when || f.when(r));
      if (fi >= 0) { const f = this.faults.splice(fi, 1)[0]!; throw new Refuse(f.status, f.code, f.message ?? 'injected fault'); }
      const out = this.route(r, authHeader);
      send(out.status, out.body);
    } catch (err) {
      if (err instanceof Refuse) send(err.status, { errors: [{ code: err.code, message: err.message }] });
      else send(500, { errors: [{ code: 'H015', message: 'Beklenmedik bir hata oluştu.' }] });
    }
  }

  private route(r: MockRequest, authHeader: string): { status: number; body?: unknown } {
    if (r.method === 'POST' && r.path === '/oauth2/token') return { status: 200, body: this.issueToken(r.body) };
    const bearer = /^Bearer (.+)$/i.exec(authHeader)?.[1];
    const t = bearer ? this.tokens.get(bearer) : undefined;
    if (!t || t.kind !== 'access' || t.expiresMs <= this.o.now()) throw new Refuse(401, 'H351', 'Eksik veya geçersiz jeton!');
    r.authorized = true;
    const brands = new RegExp(`^/sps/(\\d+)/brands$`).exec(r.path);
    if (r.method === 'GET' && brands) { this.checkIys(brands[1]!); return { status: 200, body: [{ brandCode: this.o.brandCode, stats: {}, name: 'Mock marka', master: true }] }; }
    const m = /^(?:\/v2)?\/sps\/(\d+)\/brands\/(\d+)\/consents(\/changes)?$/.exec(r.path);
    if (m) {
      this.checkIys(m[1]!);
      if (Number(m[2]) !== this.o.brandCode) throw new Refuse(403, 'H195', 'Marka bilgisi için sunucuda arama yapılamadı.');
      if (r.method === 'POST' && !m[3]) return { status: 200, body: this.addConsent(r.body) };
      if (r.method === 'GET' && m[3]) return this.changes(r.query);
    }
    throw new Refuse(404, 'ERR-SYS-0001', 'İstemci Hatası.');
  }

  private checkIys(code: string): void { if (Number(code) !== this.o.iysCode) throw new Refuse(403, 'ERR-SYS-0005', 'Oturumunuzla verdiğiniz IYS kodu eşleşmemektedir.'); }

  private issueToken(body: unknown): unknown {
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const now = this.o.now();
    const mint = (kind: 'access' | 'refresh', ttl: number) => { const v = randomBytes(24).toString('hex'); this.tokens.set(v, { kind, expiresMs: now + ttl }); return v; };
    if (b.grant_type === 'refresh_token') {
      const t = typeof b.refresh_token === 'string' ? this.tokens.get(b.refresh_token) : undefined;
      if (!t || t.kind !== 'refresh' || t.expiresMs <= now) throw new Refuse(401, 'H351', 'Eksik veya geçersiz jeton!');
      this.tokens.delete(b.refresh_token as string);
    } else {
      if (b.grant_type !== 'password' || typeof b.username !== 'string' || typeof b.password !== 'string' || !b.username || !b.password) throw new Refuse(400, 'H250', 'Kullanıcı adı veya şifre eksik!');
      if (b.username !== this.o.username || b.password !== this.o.password) throw new Refuse(401, 'H251', 'Kullanıcı kimlik bilgileri geçersiz!');
    }
    return { access_token: mint('access', 7_200_000), refresh_token: mint('refresh', 14_400_000), expires_in: 7200, refresh_expires_in: 14_400, token_type: 'bearer' };
  }

  private addConsent(raw: unknown): { transactionId: string; creationDate: string } {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw === 'symbol') throw new Refuse(400, 'H014', 'Gönderilen istek JSON formatına uygun olmalıdır.');
    const b = raw as Record<string, unknown>;
    for (const k of Object.keys(b)) if (!ALLOWED_FIELDS.has(k)) throw new Refuse(422, 'H118', 'Alan değeri kabul edilemedi.');
    if (typeof b.recipient !== 'string' || !b.recipient) throw new Refuse(422, 'H114', 'Alıcı (recipient) bulunamadı.');
    if (typeof b.type !== 'string' || !b.type) throw new Refuse(422, 'H111', 'İzin tipi (type) bulunamadı.');
    if (typeof b.status !== 'string' || !b.status) throw new Refuse(422, 'H110', 'Durum (status) bulunamadı.');
    if (typeof b.source !== 'string' || !b.source) throw new Refuse(422, 'H113', 'İzin kaynağı (source) bulunamadı.');
    if (typeof b.consentDate !== 'string' || !b.consentDate) throw new Refuse(422, 'H112', 'İzin tarihi (consentDate) bulunamadı.');
    if (!ENUM.status.includes(b.status)) throw new Refuse(422, 'H115', 'Durum (status) için uygun değerler: ONAY, RET');
    if (!ENUM.type.includes(b.type)) throw new Refuse(422, 'H117', 'İzin tipi (type) için uygun değerler: ARAMA, MESAJ, EPOSTA');
    const recipientType = b.recipientType === undefined ? 'BIREYSEL' : b.recipientType;
    if (typeof recipientType !== 'string' || !ENUM.recipientType.includes(recipientType)) throw new Refuse(422, 'H116', 'Alıcı tipi (recipientType) için uygun değerler: BIREYSEL, TACIR');
    if (!ENUM.source.includes(b.source)) throw new Refuse(422, 'H119', 'İzin kaynağı (source) için uygun değerler: HS_…');
    if (b.type === 'EPOSTA' ? !EMAIL_RE.test(b.recipient) || b.recipient.length > 265 : !PHONE_RE.test(b.recipient)) {
      throw new Refuse(422, b.type === 'EPOSTA' ? 'H120' : 'H121', 'Alıcı (recipient) kabul edilemedi.');
    }
    const at = parseIysDate(b.consentDate);
    if (!at) throw new Refuse(422, 'H158', 'İzin tarihi yyyy-mm-dd hh:mm:ss formatında olmalıdır.');
    const now = this.o.now();
    if (at.getTime() > now) throw new Refuse(422, 'H162', 'Mevcut tarih ve saatten ileri bir tarih ve saat girilmemelidir.');
    if (addBusinessDays(at, BUSINESS_DAYS_TO_REPORT).getTime() < now) throw new Refuse(422, 'H467', 'Üç iş günü öncesinde alınan izinler kaydedilemez.');

    const recipient = b.recipient.toLowerCase();
    const key = `${recipientType}|${b.type}|${recipient}`;
    const prior = this.state.get(key);
    // The same request again answers with the same transaction (the documented v2 behaviour).
    const again = this.movements.find((m) => m.recipient === recipient && m.type === b.type && m.recipientType === recipientType && m.status === b.status && m.consentDate === b.consentDate && m.source === b.source && m.creationMs > now - 24 * HOUR && m.source.startsWith('HS_'));
    if (again && prior?.transactionId === again.transactionId) return { transactionId: again.transactionId, creationDate: formatIysDate(new Date(again.creationMs)) };
    if (!prior && b.status === 'RET') throw new Refuse(400, 'H175', 'İlk defa kaydedilen bir iznin durum (status) bilgisi RET olmamalıdır.');
    if (prior && prior.status === b.status) throw new Refuse(400, 'H174', 'İzin durumu (status) güncellemesi için farklı bir durum girilmelidir.');
    if (prior && parseIysDate(prior.consentDate)!.getTime() > at.getTime()) throw new Refuse(400, 'H178', 'Sistemdeki iznin tarihinden önceki tarihli izinlerle güncelleme yapılamaz.');
    const day = `${key}|${formatIysDate(new Date(now)).slice(0, 10)}`;
    const ops = (this.dailyOps.get(day) ?? 0) + 1;
    if (ops > 2) throw new Refuse(422, 'H453', 'Alıcı (recipient) için gün içerisinde yapılan işlem sayısı 2\'dir, daha fazla işlem yapılamamaktadır.');
    this.dailyOps.set(day, ops);
    const s = this.record({ recipient, recipientType, type: b.type, status: b.status, source: b.source, consentDate: b.consentDate, creationMs: now });
    return { transactionId: s.transactionId, creationDate: formatIysDate(new Date(s.creationMs)) };
  }

  private changes(q: Record<string, string>): { status: number; body?: unknown } {
    const source = q.source ?? 'IYS';
    if (source !== 'IYS' && source !== 'HS') throw new Refuse(422, 'H460', 'Girilen veriler doğrulamadı.');
    const limit = q.limit === undefined ? 1000 : Number(q.limit);
    if (!Number.isInteger(limit) || limit <= 0 || limit > 1000) throw new Refuse(422, q.limit === '0' ? 'H187' : 'H183', 'limit değeri geçerli olmalıdır.');
    const now = this.o.now();
    const marker = (m: Stored) => `${Math.floor(m.creationMs / 1000)}_${m.transactionId}`;
    let visible = this.movements
      .filter((m) => (source === 'IYS' ? m.source.startsWith('IYS_') : m.source.startsWith('HS_')) && m.creationMs >= now - WEEK && m.creationMs <= now - this.o.visibilityDelayMs)
      .sort((a, b) => Math.floor(a.creationMs / 1000) - Math.floor(b.creationMs / 1000) || (a.transactionId < b.transactionId ? -1 : 1));
    if (q.after) {
      const m = /^(\d+)_([0-9a-f]+)$/.exec(q.after);
      if (!m) throw new Refuse(422, 'H460', 'Girilen veriler doğrulamadı.');
      const sec = Number(m[1]);
      visible = visible.filter((x) => { const s = Math.floor(x.creationMs / 1000); return s > sec || (s === sec && x.transactionId > m[2]!); });
    }
    const page = visible.slice(0, limit);
    if (page.length === 0) return { status: 204 };
    return {
      status: 200,
      body: {
        after: marker(page[page.length - 1]!),
        list: page.map((x) => ({ consentDate: x.consentDate, creationDate: formatIysDate(new Date(x.creationMs)), source: x.source, recipient: x.recipient, recipientType: x.recipientType, status: x.status, type: x.type, transactionId: x.transactionId })),
      },
    };
  }
}

export async function startMockIys(o: MockIysOptions = {}): Promise<MockIys> { return new MockIys(o).start(); }
