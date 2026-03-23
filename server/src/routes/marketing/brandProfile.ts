import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { query } from '../../db/index.js';

const router = Router();

/** Org JSON brand profile for client email builder / AI context (same row as strategist `loadBrandVoiceProfileMd`). */
router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      res.status(403).json({ error: 'No organization context' });
      return;
    }
    const r = await query<{ profile: unknown }>(
      `SELECT profile FROM marketing_brand_profile WHERE organization_id = $1::uuid LIMIT 1`,
      [orgId],
    );
    const profile = r.rows[0]?.profile ?? null;
    res.json({ profile });
  } catch (e) {
    console.error('[marketing/brand-profile]', e);
    res.status(500).json({ error: 'Failed to load brand profile' });
  }
});

export default router;
