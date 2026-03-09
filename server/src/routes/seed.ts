import { Router, Request, Response } from 'express';
import { seedFinanceData } from '../db/seeds/financeSeed.js';

const router = Router();

/** Require SEED_SECRET or CRON_SECRET for safety (e.g. call from Vercel Cron or manual curl). */
function requireSeedSecret(req: Request, res: Response, next: () => void) {
  const secret = process.env.SEED_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    res.status(503).json({ error: 'Seed not configured (missing SEED_SECRET or CRON_SECRET)' });
    return;
  }
  const provided =
    req.headers.authorization?.replace(/^Bearer\s+/i, '') ||
    (req.headers['x-seed-secret'] as string) ||
    (req.query.secret as string);
  if (provided !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

/**
 * POST or GET /api/seed/finance
 * Runs finance seed (idempotent). Use from Vercel Cron or once after deploy.
 * Auth: Bearer <SEED_SECRET> or x-seed-secret header or ?secret=<SEED_SECRET>
 */
router.all('/finance', requireSeedSecret, async (_req: Request, res: Response) => {
  try {
    await seedFinanceData();
    res.json({ ok: true, message: 'Finance seed completed.' });
  } catch (err) {
    console.error('[seed/finance]', err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Seed failed',
    });
  }
});

export const seedRouter = router;
