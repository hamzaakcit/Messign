import express, { Router } from 'express';
import { withAccountLookup } from './db.js';
import { CredentialNotFoundError } from './credentials.js';
import { describeError, logError, logWarn } from './log.js';
import { AdapterError, WebhookSignatureError, ingestWebhook } from './messaging/index.js';
import { createKeyRateLimiter } from './rateLimit.js';

/**
 * Provider webhooks (WP-12): POST /api/engage/webhooks/:accountId. No user or API key: the provider proves itself by
 * its signature, which the account's adapter verifies over the exact bytes received. The account id in the URL only
 * says which tenant and which secret to check against; an unknown, disabled or malformed id is a plain 404.
 *   200 verified (including duplicates, so the provider stops retrying)
 *   503 also when a report names a message not recorded yet (the report can beat the send call's own bookkeeping)
 *   401 signature missing or invalid            400 signed but malformed
 *   503 cannot verify right now (the provider retries)    429 too many requests for this account
 * Nothing from the body is logged.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const webhookRouter = Router();

const perAccount = createKeyRateLimiter({
  limit: Number(process.env.ENGAGE_WEBHOOK_RATE_LIMIT) > 0 ? Number(process.env.ENGAGE_WEBHOOK_RATE_LIMIT) : 1200,
  windowMs: 60_000,
  key: (req) => (UUID_RE.test(req.params.accountId ?? '') ? req.params.accountId : undefined),
});

/**
 * The webhook's stand-in for authentication middleware: it admits only a well-formed account id. The provider's
 * signature, verified by the account's adapter over the exact bytes, is the actual authentication. The isolation
 * suite accepts this guard on /webhooks routes and nowhere else.
 */
export function requireWebhookAccount(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (UUID_RE.test(req.params.accountId ?? '')) return next();
  res.status(404).json({ error: 'Not found' });
}

webhookRouter.post('/:accountId',
  requireWebhookAccount,
  perAccount,
  // Raw bytes whatever the content type (SNS sends text/plain). If something upstream already parsed the body, the
  // exact bytes are gone and the signature cannot be checked.
  express.raw({ type: () => true, limit: '256kb' }),
  async (req, res) => {
    const accountId = req.params.accountId!;
    if (!Buffer.isBuffer(req.body)) return void res.status(400).json({ error: 'Unreadable body' });
    try {
      const orgId = await withAccountLookup(accountId, async (c) => (await c.query<{ organization_id: string }>(
        `SELECT organization_id FROM engage.channel_accounts WHERE id = $1 AND status = 'active'`, [accountId])).rows[0]?.organization_id);
      if (!orgId) return void res.status(404).json({ error: 'Not found' });
      const headers: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : v;
      const result = await ingestWebhook(orgId, accountId, { headers, body: req.body });
      // A report for a message we cannot find yet is most likely a race: the provider's report can arrive before the
      // send call has returned and its provider message id has been stored (observed with SES: delivery report within a
      // second of acceptance). Answering 200 would make the provider stop retrying and the report would be lost for good.
      // 503 makes it retry (SNS: 3 retries 20 s apart by default). Everything matched in this call is already stored,
      // and a repeat is skipped by the unique provider event id, so retrying is safe. Reports for a message that never
      // existed here (stale, another account) exhaust the retries and are dropped, which is what they were before.
      if (result.unmatched > 0) {
        logWarn('webhook: report for a message not recorded yet', { accountId, unmatched: result.unmatched });
        return void res.status(503).json({ ...result, error: 'Message not recorded yet, try again later' });
      }
      res.json(result);
    } catch (err) {
      if (err instanceof WebhookSignatureError) {
        logWarn('webhook rejected: signature', { accountId });
        return void res.status(401).json({ error: 'Invalid signature' });
      }
      if (err instanceof CredentialNotFoundError) return void res.status(404).json({ error: 'Not found' });
      if (err instanceof AdapterError) {
        if (err.kind === 'transient') return void res.status(503).json({ error: 'Try again later' });
        return void res.status(400).json({ error: 'Malformed notification' });
      }
      logError('webhook failed', { accountId, error: describeError(err) });
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });
