import { Router } from 'express';
import type { Response } from 'express';
import { query } from '../../../db/index.js';
import * as support from '../dal/index.js';
import type { ReimbursementRequest } from '../../../middleware/reimbursementAuth.js';
import { buildCtx, parseOptionalNumber } from './common.js';

const router = Router();

router.get('/health', async (req: ReimbursementRequest, res: Response) => {
  try {
    const scores = await support.customerHealth.getHealthScores(
      buildCtx(req),
      parseOptionalNumber(req.query.minScore),
      parseOptionalNumber(req.query.maxScore),
    );
    res.json(scores);
  } catch (err) {
    console.error('[support/customers/health GET]', err);
    res.status(500).json({ error: 'Failed to load customer health scores' });
  }
});

router.get('/health/at-risk', async (req: ReimbursementRequest, res: Response) => {
  try {
    const scores = await support.customerHealth.getAtRiskCustomers(buildCtx(req));
    res.json(scores);
  } catch (err) {
    console.error('[support/customers/health/at-risk GET]', err);
    res.status(500).json({ error: 'Failed to load at-risk customers' });
  }
});

router.get('/health/:crmCompanyId', async (req: ReimbursementRequest, res: Response) => {
  try {
    const companyCheck = await query<{ id: string }>(
      `SELECT id::text AS id
       FROM crm_companies
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [req.params.crmCompanyId, req.organizationId],
    );
    if (!companyCheck.rows[0]) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }
    const health = await support.customerHealth.updateCustomerHealth(req.params.crmCompanyId);
    res.json(health);
  } catch (err) {
    console.error('[support/customers/health/:crmCompanyId GET]', err);
    res.status(500).json({ error: 'Failed to load company health' });
  }
});

export default router;
