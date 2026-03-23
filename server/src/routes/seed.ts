import { Router, Request, Response } from 'express';
import { seedFinanceData } from '../db/seeds/financeSeed.js';
import { seedCrmOkrData } from '../db/seeds/crmOkrSeed.js';
import { seedMarketingData } from '../db/seeds/marketingSeed.js';

const router = Router();

/** Require SEED_SECRET or CRON_SECRET via Authorization header or x-seed-secret header only. */
function requireSeedSecret(req: Request, res: Response, next: () => void) {
  const secret = process.env.SEED_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    res.status(503).json({ error: 'Seed not configured (missing SEED_SECRET or CRON_SECRET)' });
    return;
  }
  const provided =
    req.headers.authorization?.replace(/^Bearer\s+/i, '') ||
    (req.headers['x-seed-secret'] as string);
  if (provided !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

/**
 * POST /api/seed/finance
 * Runs finance seed (idempotent). Use from Vercel Cron or once after deploy.
 * Auth: Bearer <SEED_SECRET> or x-seed-secret header
 */
router.post('/finance', requireSeedSecret, async (_req: Request, res: Response) => {
  try {
    await seedFinanceData();
    res.json({ ok: true, message: 'Finance seed completed.' });
  } catch (err) {
    console.error('[seed/finance]', err);
    res.status(500).json({ ok: false, error: 'Seed failed' });
  }
});

/**
 * POST /api/seed/crm-okr
 * Ensures default CRM pipeline + stages exist and inserts sample companies, contacts, deals.
 * Ensures OKR period Q2 2026 exists and inserts sample goals + key results.
 * Idempotent: skips inserts if data already present.
 */
router.post('/crm-okr', requireSeedSecret, async (_req: Request, res: Response) => {
  try {
    const result = await seedCrmOkrData();
    res.json({
      ok: true,
      message: 'CRM + OKR seed completed.',
      crm: result.crm,
      okr: result.okr,
    });
  } catch (err) {
    console.error('[seed/crm-okr]', err);
    res.status(500).json({ ok: false, error: 'Seed failed' });
  }
});

/**
 * POST /api/seed/marketing
 * Inserts idempotent demo rows for campaigns, content, leads, email, approvals (sentinel campaign name).
 * Auth: same as /api/seed/finance
 */
router.post('/marketing', requireSeedSecret, async (_req: Request, res: Response) => {
  try {
    const result = await seedMarketingData();
    res.json({
      ok: true,
      message: result.seeded ? 'Marketing seed completed.' : 'Marketing seed skipped.',
      ...result,
    });
  } catch (err) {
    console.error('[seed/marketing]', err);
    res.status(500).json({ ok: false, error: 'Seed failed' });
  }
});

export const seedRouter = router;
