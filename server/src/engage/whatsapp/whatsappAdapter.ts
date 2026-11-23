import {
  AdapterError, WebhookSignatureError,
  type AdapterAccount, type AdapterCapabilities, type AdapterSendRequest, type AdapterSendResult, type ChannelAdapter,
  type InboundMessage, type NormalizedError, type ProviderEvent, type RawWebhook, type RemoteTemplate, type TemplateStatusUpdate,
} from '../messaging/adapter.js';
import {
  TEMPLATE_LIST_FIELDS, answerChallenge, buildSendBody, classifyError, graphErrorCode, parseTemplateListPage, parseTemplateStatusUpdates, parseWebhookPayload, readConfig,
  signatureMatches, type ParsedWebhook,
} from './format.js';

/**
 * The WhatsApp Cloud API adapter (WP-27, ADR-023): sends template and text messages through the Messages API of the tenant's
 * own business phone number, and turns Meta's webhooks into delivery reports, opt-outs and the handshake. Like every adapter
 * it never touches the database and never decides whether a message may be sent (the send gate does).
 *
 * Account: provider `whatsapp_cloud`; config `phone_number_id`, optional `api_version` (default v23.0) and `default_language`
 * (default tr); secrets `access_token` (a system user's token), `app_secret` (signs the webhooks) and `verify_token` (the
 * handshake, chosen by us, entered in Meta's app dashboard). Mode `test` is a Meta test number (it can only message the
 * numbers Meta allows), mode `live` a verified business number.
 *
 * The address is graph.facebook.com. For development and tests the operator may point it at a local mock with
 * ENGAGE_WHATSAPP_GRAPH_URL, which must be a loopback address; a tenant cannot change it.
 *
 * Not idempotent: the Cloud API has no idempotency key, so a send that Meta accepted but whose answer was lost is sent
 * again by the retry. That is a rare duplicate, never a lost message; ADR-023 says so.
 */

export const WHATSAPP_PROVIDER = 'whatsapp_cloud';
export const GRAPH_URL = 'https://graph.facebook.com';
const SEND_TIMEOUT_MS = 15_000;
/** Template listing: 100 per page, at most 50 pages (5,000 templates, far above Meta's own limit of 6,000 per verified account only for the largest tenants). */
const LIST_PAGE_SIZE = 100;
const LIST_MAX_PAGES = 50;

export function graphBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.ENGAGE_WHATSAPP_GRAPH_URL?.trim();
  if (!override) return GRAPH_URL;
  if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(override)) throw new AdapterError('permanent', 'whatsapp_config_invalid', 'ENGAGE_WHATSAPP_GRAPH_URL must be a local address');
  return override;
}

export interface WhatsappAdapterOptions { fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv }

export function createWhatsappAdapter(o: WhatsappAdapterOptions = {}): ChannelAdapter {
  const doFetch = o.fetchImpl ?? fetch;
  const env = o.env ?? process.env;

  const parsed = (raw: RawWebhook, account: AdapterAccount): ParsedWebhook => {
    if (!signatureMatches(account.secrets.app_secret, raw.headers['x-hub-signature-256'], raw.body)) throw new WebhookSignatureError();
    let body: unknown;
    try { body = JSON.parse(raw.body.toString('utf8')); } catch { throw new AdapterError('permanent', 'malformed_webhook'); }
    return parseWebhookPayload(body, readConfig(account.config).phoneNumberId);
  };

  return {
    provider: WHATSAPP_PROVIDER,

    capabilities(): AdapterCapabilities {
      // maxTps is informational and deliberately low (our figure, not Meta's) until a rate-limited dispatcher exists.
      return { channels: ['whatsapp'], unicode: true, links: true, domesticTr: true, deliveryReports: true, maxTps: 10 };
    },

    async send(req: AdapterSendRequest, account: AdapterAccount): Promise<AdapterSendResult> {
      if (req.channel !== 'whatsapp') throw new AdapterError('permanent', 'channel_unsupported');
      const cfg = readConfig(account.config);
      const token = account.secrets.access_token;
      if (!token) throw new AdapterError('permanent', 'whatsapp_config_invalid', 'access_token is missing');
      const body = buildSendBody(req.to, req.content, cfg.defaultLanguage);
      let res: Response;
      try {
        res = await doFetch(`${graphBaseUrl(env)}/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
      } catch (err) {
        if (err instanceof AdapterError) throw err;
        // The message names the kind of failure only: a URL, a token or a number never reaches an error.
        throw new AdapterError('transient', err instanceof Error && err.name === 'TimeoutError' ? 'whatsapp_timeout' : 'whatsapp_unreachable');
      }
      const text = await res.text();
      let json: unknown = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = null; }
      if (!res.ok) {
        const c = classifyError(graphErrorCode(json), res.status);
        throw new AdapterError(c.kind, c.code, undefined, c.optOut);
      }
      const id = (json as { messages?: Array<{ id?: unknown }> } | null)?.messages?.[0]?.id;
      // Accepted without an id: whether it will be delivered is unknowable, and sending it again could duplicate it.
      if (typeof id !== 'string' || id === '') throw new AdapterError('permanent', 'whatsapp_unexpected_response');
      return { providerMessageId: id };
    },

    /**
     * GET /<version>/<WABA id>/message_templates, all pages. Throws like a send does (a final error for credentials or a missing
     * WhatsApp Business Account id, a transient one for downtime), so the caller records a code and never provider text. More than
     * LIST_MAX_PAGES pages is an error rather than a silently partial answer.
     */
    async listTemplates(account: AdapterAccount): Promise<RemoteTemplate[]> {
      const cfg = readConfig(account.config);
      if (!cfg.wabaId) throw new AdapterError('permanent', 'waba_missing');
      const token = account.secrets.access_token;
      if (!token) throw new AdapterError('permanent', 'whatsapp_config_invalid', 'access_token is missing');
      const base = graphBaseUrl(env);
      const out: RemoteTemplate[] = [];
      let url: string | null = `${base}/${cfg.apiVersion}/${cfg.wabaId}/message_templates?fields=${encodeURIComponent(TEMPLATE_LIST_FIELDS)}&limit=${LIST_PAGE_SIZE}`;
      for (let page = 0; url; page++) {
        if (page >= LIST_MAX_PAGES) throw new AdapterError('permanent', 'whatsapp_too_many_templates');
        // The next-page URL comes from the provider: it is followed only on the same host as the first request, with the same token.
        if (page > 0 && new URL(url).origin !== new URL(base).origin) throw new AdapterError('permanent', 'whatsapp_unexpected_response');
        let res: Response;
        try {
          res = await doFetch(url, { method: 'GET', headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
        } catch (err) {
          if (err instanceof AdapterError) throw err;
          throw new AdapterError('transient', err instanceof Error && err.name === 'TimeoutError' ? 'whatsapp_timeout' : 'whatsapp_unreachable');
        }
        const text = await res.text();
        let json: unknown = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        if (!res.ok) {
          const c = classifyError(graphErrorCode(json), res.status);
          throw new AdapterError(c.kind, c.code, undefined, false);
        }
        const p = parseTemplateListPage(json);
        out.push(...p.templates);
        url = p.next;
      }
      return out;
    },

    parseTemplateUpdates(raw: RawWebhook, account: AdapterAccount): TemplateStatusUpdate[] {
      if (!signatureMatches(account.secrets.app_secret, raw.headers['x-hub-signature-256'], raw.body)) throw new WebhookSignatureError();
      let body: unknown;
      try { body = JSON.parse(raw.body.toString('utf8')); } catch { throw new AdapterError('permanent', 'malformed_webhook'); }
      return parseTemplateStatusUpdates(body, readConfig(account.config).wabaId);
    },

    parseWebhook(raw: RawWebhook, account: AdapterAccount): ProviderEvent[] { return parsed(raw, account).events; },

    parseInbound(raw: RawWebhook, account: AdapterAccount): InboundMessage[] { return parsed(raw, account).inbound; },

    verifyWebhookChallenge(query: Record<string, string | undefined>, account: AdapterAccount): string | null {
      return answerChallenge(query, account.secrets.verify_token);
    },

    normalizeError(err: unknown): NormalizedError {
      if (err instanceof AdapterError) return { kind: err.kind, code: err.code, ...(err.optOut ? { optOut: true } : {}) };
      return { kind: 'transient', code: 'unknown_error' };
    },
  };
}
