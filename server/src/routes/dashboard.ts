import { Router, Request, Response } from 'express';
import { getDashboardTrends, type DashboardMetric, type TrendPeriod } from '../db/performanceDb.js';
import { query } from '../db/index.js';
import type { AuthenticatedRequest } from '../middleware/requireAuth.js';
import type { CallerContext } from '../dal/types.js';
import { getCommandCenterData } from '../dal/commandCenter.js';

const router = Router();

async function buildCallerContext(req: AuthenticatedRequest): Promise<CallerContext> {
  const authUserId = req.userId;
  const org = req.tenantId;
  const ru = await query<{ id: string }>(
    `SELECT id::text FROM reimbursement_users WHERE auth_user_id = $1::uuid LIMIT 1`,
    [authUserId],
  );
  const ruId = ru.rows[0]?.id;
  return {
    userId: authUserId,
    userUuid: ruId ?? authUserId,
    role: req.role as CallerContext['role'],
    organizationId: org,
  };
}

router.get('/trends', async (req: Request, res: Response) => {
  const metric = (req.query.metric as DashboardMetric) || 'revenue';
  const entityId = (req.query.entityId as string) || 'company';
  const range = (req.query.range as TrendPeriod) || '12m';

  const validMetrics: DashboardMetric[] = ['revenue', 'sms', 'mail'];
  const validRanges: TrendPeriod[] = ['7d', '90d', '12m', '3y'];

  if (!validMetrics.includes(metric)) {
    res.status(400).json({ error: 'Invalid metric' });
    return;
  }
  if (!validRanges.includes(range)) {
    res.status(400).json({ error: 'Invalid range' });
    return;
  }

  try {
    const data = await getDashboardTrends(metric, entityId, range);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[dashboard] trends error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch trends' });
  }
});

router.get('/command-center', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const ctx = await buildCallerContext(authReq);
    const data = await getCommandCenterData(ctx);
    res.json(data);
  } catch (err) {
    console.error('[dashboard] command-center error:', err);
    res.status(500).json({ error: 'Failed to load command center' });
  }
});

export const dashboardRouter = router;
