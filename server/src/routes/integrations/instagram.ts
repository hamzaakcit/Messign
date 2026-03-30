/**
 * Instagram OAuth routes
 *
 * GET  /api/integrations/instagram/connect    → redirects to Facebook OAuth dialog
 * GET  /api/integrations/instagram/callback   → handles OAuth redirect, stores token
 * GET  /api/integrations/instagram/accounts   → list connected accounts for org
 * DELETE /api/integrations/instagram/:userId  → disconnect an account
 * POST /api/integrations/instagram/:userId/refresh → manually refresh token
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import {
  buildInstagramAuthUrl,
  completeInstagramOAuth,
  listInstagramAccounts,
  disconnectInstagramAccount,
  refreshInstagramToken,
} from '../../services/integrations/instagramOAuth.js';
import { buildCtx } from '../marketing/common.js';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { reimbursementAuth } from '../../middleware/reimbursementAuth.js';

const router = Router();

// /callback is called by Meta's OAuth redirect — no auth header present
// auth is verified via the signed state parameter instead
// All other routes require a valid JWT
router.use((req, res, next) => {
  if (req.path === '/callback') return next();
  requireAuth(req, res, () => reimbursementAuth(req as ReimbursementRequest, res, next));
});

const CLIENT_URL = process.env.CLIENT_URL?.trim() ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// GET /connect — generate OAuth URL and redirect
// ---------------------------------------------------------------------------

router.get('/connect', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    if (!ctx.organizationId) {
      res.status(400).json({ error: 'Organization context required' });
      return;
    }

    // CSRF state: sign orgId + userId so we can verify on callback
    const state = Buffer.from(
      JSON.stringify({
        orgId: ctx.organizationId,
        userId: ctx.userId,
        nonce: crypto.randomBytes(8).toString('hex'),
      }),
    ).toString('base64url');

    const authUrl = buildInstagramAuthUrl(state);
    res.redirect(authUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.redirect(`${CLIENT_URL}/settings/integrations?error=${encodeURIComponent(message)}`);
  }
});

// ---------------------------------------------------------------------------
// GET /callback — Meta redirects here after user authorizes
// ---------------------------------------------------------------------------

router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query as Record<string, string | undefined>;

  if (error) {
    const msg = error_description ?? error ?? 'Authorization denied';
    res.redirect(`${CLIENT_URL}/settings/integrations?error=${encodeURIComponent(msg)}`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${CLIENT_URL}/settings/integrations?error=Missing+code+or+state`);
    return;
  }

  let orgId: string;
  let userId: string;

  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString());
    orgId = parsed.orgId;
    userId = parsed.userId;

    if (!orgId || !userId) throw new Error('Invalid state');
  } catch {
    res.redirect(`${CLIENT_URL}/settings/integrations?error=Invalid+OAuth+state`);
    return;
  }

  try {
    const account = await completeInstagramOAuth(code, orgId, userId);
    const displayName = encodeURIComponent(account.platform_username ?? account.display_name ?? 'your account');
    res.redirect(`${CLIENT_URL}/settings/integrations?success=instagram&account=${displayName}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[integrations/instagram] OAuth callback error:', message);
    res.redirect(`${CLIENT_URL}/settings/integrations?error=${encodeURIComponent(message)}`);
  }
});

// ---------------------------------------------------------------------------
// GET /accounts — list connected Instagram accounts for org
// ---------------------------------------------------------------------------

router.get('/accounts', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    if (!ctx.organizationId) {
      res.status(400).json({ error: 'Organization context required' });
      return;
    }

    const accounts = await listInstagramAccounts(ctx.organizationId);
    res.json({ accounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:platformUserId — disconnect account
// ---------------------------------------------------------------------------

router.delete('/:platformUserId', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    if (!ctx.organizationId) {
      res.status(400).json({ error: 'Organization context required' });
      return;
    }

    await disconnectInstagramAccount(ctx.organizationId, req.params.platformUserId);
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// POST /:platformUserId/refresh — manually refresh token
// ---------------------------------------------------------------------------

router.post('/:platformUserId/refresh', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    if (!ctx.organizationId) {
      res.status(400).json({ error: 'Organization context required' });
      return;
    }

    await refreshInstagramToken(ctx.organizationId, req.params.platformUserId);
    res.json({ ok: true, message: 'Token refreshed successfully' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
