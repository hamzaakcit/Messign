import { createHmac, timingSafeEqual } from 'crypto';
import { AdapterError, type InboundMessage, type ProviderEvent, type RemoteTemplate, type TemplateStatusUpdate } from '../messaging/adapter.js';

/**
 * WhatsApp Cloud API rules (WP-27, ADR-023), from Meta's official documentation (developers.facebook.com, "WhatsApp Business
 * Platform", pages read 2026-11-22): the Messages API request and response, the webhook handshake and signature, the messages
 * webhook (statuses and incoming messages), the user_preferences webhook and the error codes. Pure: no network, no database.
 */

export const DEFAULT_API_VERSION = 'v23.0';
const API_VERSION_RE = /^v\d{1,3}\.\d{1,2}$/;
const PHONE_NUMBER_ID_RE = /^\d{5,30}$/;
/** Template names are lower-case letters, digits and underscores (WhatsApp Manager); languages look like tr or en_US. */
const TEMPLATE_NAME_RE = /^[a-z0-9_]{1,512}$/;
const LANGUAGE_RE = /^[a-z]{2,3}(_[A-Z]{2})?$/;
/** Our own sanity limits (not Meta's): a message that exceeds them is a bug in the caller, not something to send. */
const MAX_PARAMETERS = 50;
const MAX_PARAMETER_LENGTH = 1024;
const MAX_TEXT_LENGTH = 4096;
/** A text header holds at most 60 characters in total, so a variable value in it is held to the same. */
const MAX_HEADER_PARAMETER_LENGTH = 60;
const MAX_URL_PARAMETER_LENGTH = 300;
/** What may follow a template button's base URL: RFC 3986 characters only, already percent-encoded by the renderer. */
const URL_SUFFIX_RE = /^[A-Za-z0-9\-._~%!$&'()*+,;=:@/?]+$/;

export const isTemplateName = (v: unknown): v is string => typeof v === 'string' && TEMPLATE_NAME_RE.test(v);

export interface WhatsappConfig { phoneNumberId: string; apiVersion: string; defaultLanguage: string; wabaId: string | null }

/** The WhatsApp Business Account id (config waba_id): the account whose templates are listed and whose template webhooks are read. */
const WABA_ID_RE = /^\d{5,30}$/;

/**
 * How many distinct customers the account may start conversations with in a rolling 24 hours. Meta's own limit is per business
 * portfolio and starts at 250 (documentation read 2026-11-23: tiers 250, 2,000, 10,000, 100,000, unlimited); the account's config
 * `daily_recipient_limit` says which tier the tenant has reached. Until it is set, the platform assumes the starting tier, so a
 * large campaign cannot run into Meta's limit unannounced.
 */
export const DEFAULT_DAILY_RECIPIENT_LIMIT = 250;
export function dailyRecipientLimit(config: Record<string, unknown>): number {
  const v = config.daily_recipient_limit;
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : Number.NaN;
  return Number.isInteger(n) && n >= 1 && n <= 10_000_000 ? n : DEFAULT_DAILY_RECIPIENT_LIMIT;
}

export function readConfig(config: Record<string, string | number | boolean>): WhatsappConfig {
  const id = String(config.phone_number_id ?? '');
  if (!PHONE_NUMBER_ID_RE.test(id)) throw new AdapterError('permanent', 'whatsapp_config_invalid', 'phone_number_id is missing or not a number');
  const version = config.api_version === undefined ? DEFAULT_API_VERSION : String(config.api_version);
  if (!API_VERSION_RE.test(version)) throw new AdapterError('permanent', 'whatsapp_config_invalid', 'api_version must look like v23.0');
  const language = config.default_language === undefined ? 'tr' : String(config.default_language);
  if (!LANGUAGE_RE.test(language)) throw new AdapterError('permanent', 'whatsapp_config_invalid', 'default_language must look like tr or en_US');
  const waba = config.waba_id === undefined || config.waba_id === '' ? null : String(config.waba_id);
  if (waba !== null && !WABA_ID_RE.test(waba)) throw new AdapterError('permanent', 'whatsapp_config_invalid', 'waba_id must be the WhatsApp Business Account id (digits)');
  return { phoneNumberId: id, apiVersion: version, defaultLanguage: language, wabaId: waba };
}

/** Meta writes a template's language with an underscore in the send API and the listing (en_US) and with a hyphen in webhooks (en-US). */
export function normalizeLanguage(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = /^([A-Za-z]{2,3})(?:[-_]([A-Za-z]{2}))?$/.exec(raw.trim());
  return m ? `${m[1]!.toLowerCase()}${m[2] ? `_${m[2].toUpperCase()}` : ''}` : null;
}

/**
 * The Messages API body for a message. A template message names an approved template, its language and the values of its
 * positional body variables ({{1}}, {{2}} ...). A text message is free-form and only works inside the 24-hour customer
 * service window (error 131047 otherwise), so marketing never uses it (the send gate requires a template for marketing).
 */
export function buildSendBody(to: string, content: Record<string, unknown>, defaultLanguage: string): Record<string, unknown> {
  if (!/^\+[1-9][0-9]{7,14}$/.test(to)) throw new AdapterError('permanent', 'whatsapp_recipient_invalid');
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
  if (content.template !== undefined) {
    if (!isTemplateName(content.template)) throw new AdapterError('permanent', 'whatsapp_template_invalid');
    const language = content.language === undefined ? defaultLanguage : content.language;
    if (typeof language !== 'string' || !LANGUAGE_RE.test(language)) throw new AdapterError('permanent', 'whatsapp_language_invalid');
    const params = content.body_parameters;
    if (params !== undefined && (!Array.isArray(params) || params.length > MAX_PARAMETERS || params.some((p) => typeof p !== 'string' || p === '' || p.length > MAX_PARAMETER_LENGTH))) {
      throw new AdapterError('permanent', 'whatsapp_parameters_invalid');
    }
    const components: Array<Record<string, unknown>> = [];
    // Components in the order Meta documents: header, body, buttons. A text header takes one text parameter; a URL button takes
    // the part that follows its base URL (the index is a string).
    const header = content.header_parameter;
    if (header !== undefined) {
      if (typeof header !== 'string' || header === '' || header.length > MAX_HEADER_PARAMETER_LENGTH) throw new AdapterError('permanent', 'whatsapp_parameters_invalid');
      components.push({ type: 'header', parameters: [{ type: 'text', text: header }] });
    }
    if (Array.isArray(params) && params.length > 0) components.push({ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) });
    const button = content.url_button_parameter;
    if (button !== undefined) {
      const index = content.url_button_index === undefined ? '0' : content.url_button_index;
      if (typeof button !== 'string' || button.length > MAX_URL_PARAMETER_LENGTH || !URL_SUFFIX_RE.test(button) || (index !== '0' && index !== '1')) {
        throw new AdapterError('permanent', 'whatsapp_parameters_invalid');
      }
      components.push({ type: 'button', sub_type: 'url', index, parameters: [{ type: 'text', text: button }] });
    }
    return { ...base, type: 'template', template: { name: content.template, language: { code: language }, ...(components.length ? { components } : {}) } };
  }
  const text = content.text;
  if (typeof text !== 'string' || text.trim() === '' || text.length > MAX_TEXT_LENGTH) throw new AdapterError('permanent', 'whatsapp_content_invalid');
  return { ...base, type: 'text', text: { preview_url: false, body: text } };
}

// --- errors -------------------------------------------------------------------------------------------------------------

/**
 * What a Graph error code means, from Meta's error-code table. `transient` is worth retrying later (downtime, rate limits);
 * everything else is final for that message. 131050 (the recipient stopped marketing messages from this business) is final
 * and also an opt-out the business must honour. The HTTP status decides only for a code that is not in the table.
 */
// 131049 (Meta held a marketing message back to keep the ecosystem healthy, per customer) is final for that message and is not an
// opt-out: the customer is not suppressed. 132015 and 132016 (the template was paused or disabled) are final too; the template
// status mirror makes the gate stop sending them before Meta has to say so.
const TRANSIENT_CODES = new Set([2, 4, 80007, 130429, 131000, 131016, 131056, 131057, 133004, 2494100]);

export function classifyError(code: number | null, httpStatus: number): { kind: 'transient' | 'permanent'; code: string; optOut: boolean } {
  const label = code === null ? `http_${httpStatus}` : `wa_${code}`;
  if (code !== null && TRANSIENT_CODES.has(code)) return { kind: 'transient', code: label, optOut: false };
  if (code === 131050) return { kind: 'permanent', code: label, optOut: true };
  if (code === null) return { kind: httpStatus >= 500 || httpStatus === 429 || httpStatus === 408 ? 'transient' : 'permanent', code: label, optOut: false };
  return { kind: 'permanent', code: label, optOut: false };
}

/** Reads a Graph error body ({error: {code, ...}}) without keeping its text: only the numeric code is used. */
export function graphErrorCode(body: unknown): number | null {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'number' && Number.isInteger(code) ? code : null;
}

// --- opt-out words --------------------------------------------------------------------------------------------------------

/**
 * What a customer may write to stop WhatsApp messages: the whole message, trimmed and folded (case, Turkish letters,
 * punctuation), has to be one of these. Whole-message only, so a sentence that happens to contain "dur" is not an opt-out;
 * the cost of the odd missed phrase is a person who can still use the app's own stop button, the cost of a false match is one
 * customer fewer.
 */
const OPT_OUT_WORDS = new Set(['stop', 'iptal', 'dur', 'durdur', 'vazgec', 'cikis', 'unsubscribe', 'abonelikten cik', 'bana mesaj atma', 'mesaj gonderme']);

export function foldWord(text: string): string {
  return text.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
export const isOptOutText = (text: unknown): boolean => typeof text === 'string' && OPT_OUT_WORDS.has(foldWord(text));

// --- webhooks -------------------------------------------------------------------------------------------------------------

/** X-Hub-Signature-256: sha256=<HMAC-SHA256 of the exact body, key = the app secret>. Throws nothing; false when it does not match. */
export function signatureMatches(appSecret: string | undefined, header: string | undefined, body: Buffer): boolean {
  if (!appSecret || !header) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!m) return false;
  const expected = createHmac('sha256', appSecret).update(body).digest();
  const given = Buffer.from(m[1]!, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const signBody = (appSecret: string, body: Buffer | string): string => `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`;

/** The handshake: the request must be a subscribe request with this account's verify token; the answer is the challenge. */
export function answerChallenge(query: Record<string, string | undefined>, verifyToken: string | undefined): string | null {
  if (!verifyToken || query['hub.mode'] !== 'subscribe') return null;
  const given = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (typeof given !== 'string' || typeof challenge !== 'string') return null;
  // Compare digests so the comparison takes the same time whatever the lengths.
  const a = createHmac('sha256', 'wa-verify').update(given).digest();
  const b = createHmac('sha256', 'wa-verify').update(verifyToken).digest();
  if (!timingSafeEqual(a, b)) return null;
  // Echoed back as plain text: keep it to what a challenge is (a short token).
  return /^[A-Za-z0-9_.-]{1,200}$/.test(challenge) ? challenge : null;
}

const seconds = (v: unknown): Date | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : Number.NaN;
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
};
const asRecord = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);
const plusPhone = (waId: unknown): string | null => (typeof waId === 'string' && /^[1-9][0-9]{7,14}$/.test(waId) ? `+${waId}` : null);

export interface ParsedWebhook { events: ProviderEvent[]; inbound: InboundMessage[] }

/**
 * Statuses of the messages we sent, and what customers sent. Only deliveries for this account's business phone number are
 * read (a payload for another number is not ours). A delivery may carry several entries; it is the tenant's own app, so a
 * malformed one is refused as a whole (400), not half-applied.
 *
 *   sent, delivered, failed  -> the same event types.   read -> delivered (Meta omits "delivered" when a message is read at
 *   once, and a read message was delivered).   played and anything unknown -> ignored.
 * A status has no event id of its own, so one is made from the message id and the status: a retried delivery repeats it.
 * A failed status carries its error codes: the first one is kept, as `wa_<code>`, with 131050 marked as an opt-out.
 */
export function parseWebhookPayload(body: unknown, phoneNumberId: string): ParsedWebhook {
  const root = asRecord(body);
  const entries = root && root.object === 'whatsapp_business_account' ? root.entry : null;
  if (!Array.isArray(entries)) throw new AdapterError('permanent', 'malformed_webhook');
  const out: ParsedWebhook = { events: [], inbound: [] };
  for (const entry of entries) {
    const changes = asRecord(entry)?.changes;
    if (!Array.isArray(changes)) throw new AdapterError('permanent', 'malformed_webhook');
    for (const change of changes) {
      const c = asRecord(change);
      const value = asRecord(c?.value);
      if (!c || !value) throw new AdapterError('permanent', 'malformed_webhook');
      if (asRecord(value.metadata)?.phone_number_id !== phoneNumberId) continue;
      if (c.field === 'messages') {
        for (const st of Array.isArray(value.statuses) ? value.statuses : []) {
          const s = asRecord(st);
          const at = seconds(s?.timestamp);
          if (!s || typeof s.id !== 'string' || typeof s.status !== 'string' || !at) throw new AdapterError('permanent', 'malformed_webhook');
          const type = s.status === 'sent' ? 'sent' : s.status === 'delivered' || s.status === 'read' ? 'delivered' : s.status === 'failed' ? 'failed' : null;
          if (!type) continue;
          const first = Array.isArray(s.errors) ? asRecord(s.errors[0]) : null;
          const code = typeof first?.code === 'number' ? first.code : null;
          out.events.push({
            providerMessageId: s.id, providerEventId: `${s.id}:${s.status}`, type, occurredAt: at,
            ...(type === 'failed' ? { errorCode: code === null ? 'wa_unknown' : `wa_${code}`, ...(code === 131050 ? { optOut: true } : {}) } : {}),
          });
        }
        for (const m of Array.isArray(value.messages) ? value.messages : []) {
          const msg = asRecord(m);
          const at = seconds(msg?.timestamp);
          if (!msg || typeof msg.id !== 'string' || !at) throw new AdapterError('permanent', 'malformed_webhook');
          // Words a customer typed, or the label of a quick-reply button they pressed. Everything else (media, location,
          // reactions) cannot be an opt-out and is not kept.
          const text = msg.type === 'text' ? asRecord(msg.text)?.body : msg.type === 'button' ? asRecord(msg.button)?.text : undefined;
          if (typeof text !== 'string') continue;
          out.inbound.push({ providerEventId: msg.id, kind: 'text', from: plusPhone(msg.from), text: text.slice(0, 500), occurredAt: at });
        }
      } else if (c.field === 'user_preferences') {
        for (const p of Array.isArray(value.user_preferences) ? value.user_preferences : []) {
          const pref = asRecord(p);
          const at = seconds(pref?.timestamp);
          if (!pref || !at || pref.category !== 'marketing_messages' || (pref.value !== 'stop' && pref.value !== 'resume')) continue;
          const who = typeof pref.wa_id === 'string' ? pref.wa_id : typeof pref.user_id === 'string' ? pref.user_id : null;
          if (!who) continue;
          out.inbound.push({ providerEventId: `pref:${who}:${pref.value}:${String(pref.timestamp)}`, kind: pref.value === 'stop' ? 'preference_stop' : 'preference_resume', from: plusPhone(pref.wa_id), occurredAt: at });
        }
      }
    }
  }
  return out;
}

// --- templates ---------------------------------------------------------------------------------------------------------------

const upper = (v: unknown, re = /^[A-Z_]{2,40}$/): string | null => (typeof v === 'string' && re.test(v.trim().toUpperCase()) ? v.trim().toUpperCase() : null);
const VARIABLE_RE = /\{\{\s*([0-9]+|[a-z_][a-z0-9_]*)\s*\}\}/g;
const distinctVariables = (text: unknown): number => (typeof text === 'string' ? new Set([...text.matchAll(VARIABLE_RE)].map((m) => m[1])).size : 0);

/** Fields asked of Meta when the templates are listed: only what the platform reads. */
export const TEMPLATE_LIST_FIELDS = 'id,name,language,status,category,correct_category,quality_score,rejected_reason,components,parameter_format,last_updated_time';

/**
 * One entry of GET /<WABA id>/message_templates (fields as in TEMPLATE_LIST_FIELDS), from Meta's reference: id, name, language
 * (underscore form), status, category, correct_category, quality_score.score, rejected_reason, parameter_format (POSITIONAL by
 * default, or NAMED) and components (HEADER with format and text, BODY with text, FOOTER, BUTTONS with a buttons list where a URL
 * button's url may end in a variable). An entry that cannot be read is skipped, not guessed at.
 */
export function parseRemoteTemplate(raw: unknown): RemoteTemplate | null {
  const t = asRecord(raw);
  if (!t || typeof t.name !== 'string' || !TEMPLATE_NAME_RE.test(t.name)) return null;
  const language = normalizeLanguage(t.language);
  const status = upper(t.status);
  if (!language || !status) return null;
  const components = Array.isArray(t.components) ? t.components.map(asRecord).filter((c): c is Record<string, unknown> => c !== null) : [];
  const body = components.find((c) => String(c.type).toUpperCase() === 'BODY');
  const headerComponent = components.find((c) => String(c.type).toUpperCase() === 'HEADER');
  const header = headerComponent && String(headerComponent.format ?? 'TEXT').toUpperCase() === 'TEXT' ? headerComponent : undefined;
  const buttons = components.find((c) => String(c.type).toUpperCase() === 'BUTTONS');
  const list = Array.isArray(buttons?.buttons) ? buttons.buttons.map(asRecord).filter((b): b is Record<string, unknown> => b !== null) : [];
  const updated = typeof t.last_updated_time === 'string' || typeof t.last_updated_time === 'number' ? new Date(typeof t.last_updated_time === 'number' ? t.last_updated_time * 1000 : t.last_updated_time) : null;
  const quality = asRecord(t.quality_score)?.score;
  return {
    providerTemplateId: typeof t.id === 'string' && /^[0-9]{1,30}$/.test(t.id) ? t.id : typeof t.id === 'number' ? String(t.id) : null,
    name: t.name, language, status,
    category: upper(t.category), correctCategory: upper(t.correct_category), quality: upper(quality),
    rejectedReason: upper(t.rejected_reason, /^[A-Z_]{2,60}$/) ,
    changedAt: updated && !Number.isNaN(updated.getTime()) ? updated : null,
    shape: {
      bodyText: typeof body?.text === 'string' ? body.text.slice(0, 1024) : null,
      bodyVariables: distinctVariables(body?.text),
      headerFormat: headerComponent ? upper(headerComponent.format ?? 'TEXT') : null,
      headerText: typeof header?.text === 'string' ? header.text.slice(0, 60) : null,
      headerVariables: distinctVariables(header?.text),
      urlButtonVariables: list.filter((b) => String(b.type).toUpperCase() === 'URL').reduce((n, b) => n + distinctVariables(b.url), 0),
      buttons: list.map((b) => String(b.type ?? '').toUpperCase()).filter((x) => /^[A-Z_]{2,30}$/.test(x)).slice(0, 10),
      parameterFormat: String(t.parameter_format ?? 'POSITIONAL').toUpperCase() === 'NAMED' ? 'NAMED' : 'POSITIONAL',
    },
  };
}

/** The listing's body: `data` (entries) and `paging.next` (the URL of the next page, or absent on the last). */
export function parseTemplateListPage(body: unknown): { templates: RemoteTemplate[]; next: string | null } {
  const root = asRecord(body);
  if (!root || !Array.isArray(root.data)) throw new AdapterError('permanent', 'whatsapp_unexpected_response');
  const templates = root.data.map(parseRemoteTemplate).filter((t): t is RemoteTemplate => t !== null);
  const next = asRecord(root.paging)?.next;
  return { templates, next: typeof next === 'string' && next !== '' ? next : null };
}

/**
 * message_template_status_update: one change of one template of a WhatsApp Business Account (entry.id). Read only when the
 * account names that WhatsApp Business Account (config waba_id): a signed delivery from the account's own app is still only
 * trusted for the accounts the tenant said it owns. The event name decides the status:
 *   APPROVED, REJECTED, PAUSED, DISABLED, IN_APPEAL, PENDING, LIMIT_EXCEEDED, LOCKED, ARCHIVED, DELETED, PENDING_DELETION -> the same
 *   REINSTATED -> APPROVED     FLAGGED -> only a quality warning (Meta: negative feedback, still sendable)
 *   UNARCHIVED and anything unknown -> recorded, no status change (the next check reads the truth)
 * The language is normalized (Meta writes en-US here). A repeated delivery has the same key. A malformed entry refuses the whole
 * delivery, like the rest of this file.
 */
export function parseTemplateStatusUpdates(body: unknown, wabaId: string | null): TemplateStatusUpdate[] {
  const root = asRecord(body);
  const entries = root && root.object === 'whatsapp_business_account' ? root.entry : null;
  if (!Array.isArray(entries)) throw new AdapterError('permanent', 'malformed_webhook');
  const out: TemplateStatusUpdate[] = [];
  for (const entry of entries) {
    const e = asRecord(entry);
    const changes = e?.changes;
    if (!e || !Array.isArray(changes)) throw new AdapterError('permanent', 'malformed_webhook');
    for (const change of changes) {
      const c = asRecord(change);
      if (!c) throw new AdapterError('permanent', 'malformed_webhook');
      if (c.field !== 'message_template_status_update') continue;
      const v = asRecord(c.value);
      if (!v) throw new AdapterError('permanent', 'malformed_webhook');
      if (wabaId === null || String(e.id) !== wabaId) continue;
      const name = v.message_template_name;
      const language = normalizeLanguage(v.message_template_language);
      const event = upper(v.event);
      const at = seconds(e.time);
      if (typeof name !== 'string' || !TEMPLATE_NAME_RE.test(name) || !language || !event || !at) throw new AdapterError('permanent', 'malformed_webhook');
      const id = typeof v.message_template_id === 'number' || typeof v.message_template_id === 'string' ? String(v.message_template_id) : null;
      out.push({
        key: `${id ?? name}:${event}:${Math.floor(at.getTime() / 1000)}`.slice(0, 200), name, language,
        providerTemplateId: id !== null && /^[0-9]{1,30}$/.test(id) ? id : null, event, category: upper(v.message_template_category),
        reason: upper(v.reason, /^[A-Z_]{2,60}$/), occurredAt: at,
      });
    }
  }
  return out;
}
