import express, { Router } from 'express';
import { createKeyRateLimiter } from './rateLimit.js';
import { describeError, logError, logInfo } from './log.js';
import { applyUnsubscribe, getUnsubscribeInfo, verifyUnsubscribeToken, type UnsubscribeContext, type UnsubscribeVia } from './unsubscribe.js';

/**
 * Public unsubscribe routes (WP-13): /api/engage/unsubscribe/:token. No user and no API key: the signed token in the
 * link is the credential, checked by `requireUnsubscribeToken` before anything touches the database.
 *   GET   what the page shows (masked address, sender name, whether already unsubscribed). Never changes state,
 *         because mail scanners and link previewers fetch links.
 *   POST  the opt-out. This is the RFC 8058 one-click target named in the List-Unsubscribe header (body
 *         "List-Unsubscribe=One-Click") and also what the page's confirm button calls.
 * A bad, forged or unknown token is always the same 404, so the routes reveal nothing about who exists.
 * Nothing from the token or the body is logged.
 */

declare module 'express-serve-static-core' {
  interface Request { unsubscribeContext?: UnsubscribeContext }
}

export const unsubscribeRouter = Router();

const perClient = createKeyRateLimiter({
  limit: Number(process.env.ENGAGE_UNSUBSCRIBE_RATE_LIMIT) > 0 ? Number(process.env.ENGAGE_UNSUBSCRIBE_RATE_LIMIT) : 60,
  windowMs: 60_000,
  key: (req) => req.ip || req.socket.remoteAddress || 'unknown',
});

/**
 * The stand-in for authentication middleware on these routes: it admits only a token whose signature verifies. The
 * isolation suite accepts this guard on /unsubscribe routes and nowhere else.
 */
export function requireUnsubscribeToken(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const ctx = verifyUnsubscribeToken(req.params.token);
  if (!ctx) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  req.unsubscribeContext = ctx;
  next();
}

const noStore = (res: express.Response) => res.setHeader('Cache-Control', 'no-store');

unsubscribeRouter.get('/:token', requireUnsubscribeToken, perClient, async (req, res) => {
  noStore(res);
  try {
    const info = await getUnsubscribeInfo(req.unsubscribeContext!);
    if (!info) return void res.status(404).json({ error: 'Not found' });
    res.json(info);
  } catch (err) {
    logError('unsubscribe info failed', { error: describeError(err) });
    res.status(500).json({ error: 'Something went wrong' });
  }
});

unsubscribeRouter.post('/:token',
  requireUnsubscribeToken,
  perClient,
  express.urlencoded({ extended: false, limit: '1kb' }),
  async (req, res) => {
    noStore(res);
    // The RFC 8058 one-click body marks a mail client's request; anything else is the page's confirm button.
    const via: UnsubscribeVia = req.body && typeof req.body === 'object' && req.body['List-Unsubscribe'] === 'One-Click' ? 'one_click' : 'page';
    try {
      const result = await applyUnsubscribe(req.unsubscribeContext!, via);
      if (!result) return void res.status(404).json({ error: 'Not found' });
      if (!result.alreadyUnsubscribed) logInfo('recipient unsubscribed', { via });
      res.json({ unsubscribed: true, alreadyUnsubscribed: result.alreadyUnsubscribed });
    } catch (err) {
      logError('unsubscribe failed', { error: describeError(err) });
      res.status(500).json({ error: 'Something went wrong' });
    }
  });
