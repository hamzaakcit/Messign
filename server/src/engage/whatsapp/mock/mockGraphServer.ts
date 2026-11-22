import { randomBytes } from 'crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import type { AddressInfo } from 'net';

/**
 * A mock of the WhatsApp Cloud API's Messages endpoint for development and tests (WP-27, ADR-023), built from Meta's
 * official documentation: `POST /<version>/<business phone number id>/messages` with a bearer token, template and text
 * messages, the success body (`messaging_product`, `contacts`, `messages[0].id`) and the error body (`error.code`,
 * `error.message`, `error.error_data.details`, `error.fbtrace_id`) with the documented error codes it can raise:
 *   190 expired or invalid token (401)      100 an invalid parameter          131008 a missing parameter
 *   132001 the template does not exist in that language or is not approved (404)
 *   132000 the variable count does not match the template
 *   131047 a text message outside the 24-hour customer service window (the customer has not written within a day)
 *   131050 the recipient stopped marketing messages from the business        131026 the number cannot be delivered to
 * It never talks to Meta. It differs from the real service wherever the documentation is silent: the first live check with
 * a tenant's Meta test number is the first onboarding step (docs/runbooks/whatsapp.md).
 *
 * Tests drive it with `approveTemplate`, `openSession`, `stopMarketing`, `markUndeliverable`, `failNext`, and read what the
 * adapter sent from `requests`. The webhook payload builders at the bottom produce Meta's documented shapes.
 */

export interface MockGraphOptions { accessToken?: string; phoneNumberId?: string; now?: () => number }
export interface GraphRequest { method: string; path: string; body: unknown; authorized: boolean }
interface Fault { status: number; code: number; details?: string; when?: (r: GraphRequest) => boolean }
interface SentMessage { id: string; to: string; type: string; template?: string; language?: string; params: string[]; text?: string }

const DAY = 24 * 3_600_000;
const digits = (to: string): string => to.replace(/[^0-9]/g, '');

class Refuse extends Error {
  constructor(public readonly status: number, public readonly code: number, public readonly details: string) { super(details); }
}

export class MockGraph {
  readonly requests: GraphRequest[] = [];
  readonly sent: SentMessage[] = [];
  readonly faults: Fault[] = [];
  private server: Server | null = null;
  private url_ = '';
  private readonly templates = new Map<string, number>(); // `${name}|${language}` -> number of body variables
  private readonly sessions = new Map<string, number>(); // recipient digits -> when the customer last wrote
  private readonly stopped = new Set<string>();
  private readonly undeliverable = new Set<string>();
  readonly o: Required<MockGraphOptions>;

  constructor(o: MockGraphOptions = {}) {
    this.o = { accessToken: o.accessToken ?? 'mock-access-token', phoneNumberId: o.phoneNumberId ?? '106540352242922', now: o.now ?? Date.now };
  }

  get url(): string { return this.url_; }
  async start(): Promise<this> { return this.startOn(0); }
  async startOn(port: number): Promise<this> {
    this.server = createServer((req, res) => { void this.handle(req, res); });
    await new Promise<void>((r) => this.server!.listen(port, '127.0.0.1', r));
    this.url_ = `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}`;
    return this;
  }
  async stop(): Promise<void> { await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r())); this.server = null; }

  // --- test controls ---------------------------------------------------------------------------------------------------
  approveTemplate(name: string, language: string, bodyVariables = 0): void { this.templates.set(`${name}|${language}`, bodyVariables); }
  /** The customer wrote to the business now: the 24-hour customer service window opens. */
  openSession(phone: string, at = this.o.now()): void { this.sessions.set(digits(phone), at); }
  /** The customer stopped marketing messages from the business in the WhatsApp app. */
  stopMarketing(phone: string): void { this.stopped.add(digits(phone)); }
  markUndeliverable(phone: string): void { this.undeliverable.add(digits(phone)); }
  failNext(f: Fault): void { this.faults.push(f); }

  // --- the endpoint ----------------------------------------------------------------------------------------------------

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    let body: unknown = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = Symbol.for('malformed'); }
    const r: GraphRequest = { method: req.method ?? 'GET', path: new URL(req.url ?? '/', 'http://mock').pathname, body, authorized: false };
    this.requests.push(r);
    const send = (status: number, payload: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload)); };
    try {
      const fi = this.faults.findIndex((f) => !f.when || f.when(r));
      if (fi >= 0) { const f = this.faults.splice(fi, 1)[0]!; throw new Refuse(f.status, f.code, f.details ?? 'injected fault'); }
      send(200, this.route(r, String(req.headers.authorization ?? '')));
    } catch (err) {
      if (err instanceof Refuse) {
        send(err.status, { error: { message: `(#${err.code}) error`, type: 'OAuthException', code: err.code, error_data: { messaging_product: 'whatsapp', details: err.details }, fbtrace_id: randomBytes(8).toString('hex') } });
      } else send(500, { error: { message: '(#1) unknown', type: 'GraphMethodException', code: 1, fbtrace_id: 'x' } });
    }
  }

  private route(r: GraphRequest, auth: string): unknown {
    const token = /^Bearer (.+)$/.exec(auth)?.[1];
    if (token !== this.o.accessToken) throw new Refuse(401, 190, 'Access token has expired or is invalid.');
    r.authorized = true;
    const m = /^\/(v\d+\.\d+)\/(\d+)\/messages$/.exec(r.path);
    if (r.method !== 'POST' || !m) throw new Refuse(404, 100, 'Unknown path');
    if (m[2] !== this.o.phoneNumberId) throw new Refuse(400, 100, 'Unsupported post request. Object with ID does not exist.');
    const b = r.body as Record<string, unknown> | null;
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Refuse(400, 100, 'Invalid request body');
    if (b.messaging_product !== 'whatsapp') throw new Refuse(400, 100, 'Parameter messaging_product is required and must be whatsapp.');
    if (typeof b.to !== 'string' || b.to === '') throw new Refuse(400, 131008, 'Required parameter is missing: to');
    const to = digits(b.to);
    if (to.length < 8 || to.length > 15) throw new Refuse(400, 131009, 'Parameter value is not valid: to');
    const base = { to, params: [] as string[] };
    let sent: SentMessage;
    if (b.type === 'template') {
      const t = b.template as { name?: unknown; language?: { code?: unknown }; components?: Array<{ type?: unknown; parameters?: Array<{ type?: unknown; text?: unknown }> }> } | undefined;
      if (!t || typeof t.name !== 'string' || typeof t.language?.code !== 'string') throw new Refuse(400, 131008, 'Required parameter is missing: template');
      const vars = this.templates.get(`${t.name}|${t.language.code}`);
      if (vars === undefined) throw new Refuse(404, 132001, 'Template name does not exist in the translation, or the template is not approved.');
      const params = (t.components ?? []).filter((c) => c.type === 'body').flatMap((c) => (c.parameters ?? []).map((p) => String(p.text ?? '')));
      if (params.length !== vars) throw new Refuse(400, 132000, 'Number of parameters does not match the expected number of params');
      sent = { id: '', type: 'template', template: t.name, language: t.language.code, ...base, params };
    } else if (b.type === 'text') {
      const text = (b.text as { body?: unknown } | undefined)?.body;
      if (typeof text !== 'string' || text === '') throw new Refuse(400, 131008, 'Required parameter is missing: text.body');
      const last = this.sessions.get(to);
      if (last === undefined || this.o.now() - last > DAY) throw new Refuse(400, 131047, 'Re-engagement message: more than 24 hours have passed since the customer last replied.');
      sent = { id: '', type: 'text', text, ...base };
    } else throw new Refuse(400, 131051, 'Unsupported message type');
    if (this.undeliverable.has(to)) throw new Refuse(400, 131026, 'Message undeliverable');
    if (sent.type === 'template' && this.stopped.has(to)) throw new Refuse(400, 131050, 'Unable to deliver the message. This recipient has chosen to stop receiving marketing messages on WhatsApp from your business.');
    sent.id = `wamid.${randomBytes(18).toString('base64url')}`;
    this.sent.push(sent);
    return { messaging_product: 'whatsapp', contacts: [{ input: b.to, wa_id: to }], messages: [{ id: sent.id }] };
  }
}

export async function startMockGraph(o: MockGraphOptions = {}): Promise<MockGraph> { return new MockGraph(o).start(); }

// --- Meta's webhook payloads (documented shapes) ---------------------------------------------------------------------------

const wrap = (phoneNumberId: string, field: string, value: Record<string, unknown>) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: '102290129340398', changes: [{ field, value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '15550783881', phone_number_id: phoneNumberId }, ...value } }] }],
});

export function statusPayload(o: { phoneNumberId: string; id: string; status: 'sent' | 'delivered' | 'read' | 'failed' | 'played'; to: string; at?: number; errorCode?: number }) {
  return wrap(o.phoneNumberId, 'messages', {
    statuses: [{
      id: o.id, status: o.status, timestamp: String(Math.floor((o.at ?? Date.now()) / 1000)), recipient_id: digits(o.to),
      ...(o.status === 'failed' ? { errors: [{ code: o.errorCode ?? 131000, title: 'error', message: 'error', error_data: { details: 'details' } }] } : { conversation: { id: 'c1', origin: { type: 'marketing' } } }),
    }],
  });
}

export function textPayload(o: { phoneNumberId: string; from: string | null; text: string; id: string; at?: number; type?: 'text' | 'button' }) {
  const message = {
    id: o.id, timestamp: String(Math.floor((o.at ?? Date.now()) / 1000)), type: o.type ?? 'text', from_user_id: 'TR.13491208655302741918',
    ...(o.from ? { from: digits(o.from) } : {}),
    ...(o.type === 'button' ? { button: { text: o.text, payload: o.text } } : { text: { body: o.text } }),
  };
  return wrap(o.phoneNumberId, 'messages', { contacts: [{ profile: { name: 'Customer' }, ...(o.from ? { wa_id: digits(o.from) } : {}), user_id: 'TR.13491208655302741918' }], messages: [message] });
}

export function preferencePayload(o: { phoneNumberId: string; wa: string | null; value: 'stop' | 'resume'; at?: number }) {
  return wrap(o.phoneNumberId, 'user_preferences', {
    user_preferences: [{
      ...(o.wa ? { wa_id: digits(o.wa) } : {}), user_id: 'TR.13491208655302741918', detail: o.value === 'stop' ? 'User requested to stop marketing messages' : 'User requested to resume marketing messages',
      category: 'marketing_messages', value: o.value, timestamp: Math.floor((o.at ?? Date.now()) / 1000),
    }],
  });
}
