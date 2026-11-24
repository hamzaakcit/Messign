import { logError, logInfo } from '../log.js';

/**
 * Tells the operators (WP-29, ADR-024): one JSON POST to ENGAGE_ALERT_WEBHOOK_URL. The body carries `text` (Slack, Mattermost,
 * Teams style) and `content` (Discord style) with the same message, plus the structured `notices`. The URL is a secret (a chat
 * webhook is a credential): it is never logged, never put in an error, and never part of the repository. An http URL is accepted
 * only for loopback (development and tests). A failed send never throws: it returns false and the caller leaves the alerts
 * "not told yet", so the next run tries again.
 */

export function alertWebhookUrl(env: NodeJS.ProcessEnv = process.env): URL | null {
  const raw = env.ENGAGE_ALERT_WEBHOOK_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const loopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
    if (u.protocol === 'https:' || (u.protocol === 'http:' && loopback)) return u;
  } catch { /* falls through */ }
  logError('alert webhook url is not usable (https, or http for loopback)');
  return null;
}

export interface Delivery { configured: boolean; ok: boolean }

export async function sendToOperators(text: string, notices: unknown[], opts: { url?: URL | null; timeoutMs?: number } = {}): Promise<Delivery> {
  const url = opts.url === undefined ? alertWebhookUrl() : opts.url;
  if (!url) return { configured: false, ok: false };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 5000);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, content: text, source: 'messign-engage', notices }), signal: ctl.signal, redirect: 'error' });
    if (!res.ok) { logError('alert webhook refused the message', { status: res.status }); return { configured: true, ok: false }; }
    logInfo('operators notified', { notices: notices.length });
    return { configured: true, ok: true };
  } catch (err) {
    logError('alert webhook not reachable', { name: err instanceof Error ? err.name : 'error' }); // never the URL, never the message
    return { configured: true, ok: false };
  } finally { clearTimeout(timer); }
}

/** The optional dead-man ping: a GET to ENGAGE_OPS_HEARTBEAT_URL after each successful run, for a service that alerts when it stops coming. */
export async function pingHeartbeat(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const raw = env.ENGAGE_OPS_HEARTBEAT_URL?.trim();
  if (!raw) return;
  let url: URL;
  try { url = new URL(raw); } catch { logError('heartbeat url is not usable'); return; }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) { logError('heartbeat url is not usable (https, or http for loopback)'); return; }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try { await fetch(url, { signal: ctl.signal, redirect: 'error' }); } catch { logError('heartbeat not reachable'); } finally { clearTimeout(timer); }
}
