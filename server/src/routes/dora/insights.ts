import { Router } from 'express';
import { query } from '../../db/index.js';
import { reimbursementAuth, type ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import type { CallerContext } from '../../dal/types.js';
import * as doraInsights from '../../dal/doraInsights.js';
import { redisConnection } from '../../queue/connection.js';

const router = Router();

const COUNTS_CACHE_TTL_SEC = 15;

function countsCacheKey(ctx: CallerContext): string {
  const dept = ctx.departmentId ?? '';
  return `dora:insight:counts:v1:${ctx.organizationId}:${ctx.userId}:${ctx.role}:${encodeURIComponent(dept)}`;
}

async function invalidateCountsCache(ctx: CallerContext): Promise<void> {
  try {
    await redisConnection.del(countsCacheKey(ctx));
  } catch (e) {
    if (e instanceof Error) console.warn('[Redis] dora counts cache invalidate:', e.message);
  }
}

async function buildCtx(req: ReimbursementRequest): Promise<CallerContext> {
  const authUserId = req.reimbursementUser?.authUserId ?? null;
  let departmentId: string | undefined;
  let teamId: string | undefined;

  if (authUserId) {
    const teamResult = await query<{ team_id: string; team_name: string }>(
      `SELECT ptm.team_id::text AS team_id, pt.team_name
       FROM performance_team_members ptm
       JOIN performance_teams pt ON pt.id = ptm.team_id
       WHERE ptm.employee_id = $1
         AND ptm.is_active = TRUE
       LIMIT 1`,
      [authUserId],
    );
    teamId = teamResult.rows[0]?.team_id;
    departmentId = teamResult.rows[0]?.team_name;
  }

  return {
    userId: req.reimbursementUser!.id,
    role: req.reimbursementUser!.role as CallerContext['role'],
    organizationId: req.organizationId,
    teamId,
    departmentId,
  };
}

router.use(reimbursementAuth);

router.get('/insights', async (req: ReimbursementRequest, res) => {
  try {
    const ctx = await buildCtx(req);
    const insights = await doraInsights.getInsightsForUser(ctx, {
      module: typeof req.query.module === 'string' ? req.query.module : undefined,
      severity: typeof req.query.severity === 'string' ? req.query.severity : undefined,
      unreadOnly: req.query.unreadOnly === 'true',
      limit: typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined,
    });
    res.json({ insights });
  } catch (error) {
    console.error('[dora/insights] list failed:', error);
    res.status(500).json({ error: 'Failed to fetch insights' });
  }
});

router.get('/insights/counts', async (req: ReimbursementRequest, res) => {
  try {
    const ctx = await buildCtx(req);
    const key = countsCacheKey(ctx);
    try {
      const cached = await redisConnection.get(key);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
    } catch (e) {
      if (e instanceof Error) console.warn('[Redis] dora counts cache get:', e.message);
    }
    const counts = await doraInsights.getUnreadCounts(ctx);
    const payload = { counts };
    try {
      await redisConnection.setex(key, COUNTS_CACHE_TTL_SEC, JSON.stringify(payload));
    } catch (e) {
      if (e instanceof Error) console.warn('[Redis] dora counts cache set:', e.message);
    }
    res.json(payload);
  } catch (error) {
    console.error('[dora/insights] counts failed:', error);
    res.status(500).json({ error: 'Failed to fetch unread counts' });
  }
});

router.put('/insights/dismiss-all', async (req: ReimbursementRequest, res) => {
  try {
    const ctx = await buildCtx(req);
    const dismissed = await doraInsights.dismissAll(
      ctx,
      typeof req.body?.module === 'string' ? req.body.module : undefined,
    );
    await invalidateCountsCache(ctx);
    res.json({ dismissed });
  } catch (error) {
    console.error('[dora/insights] dismiss all failed:', error);
    res.status(500).json({ error: 'Failed to dismiss insights' });
  }
});

router.put('/insights/:id/read', async (req: ReimbursementRequest, res) => {
  try {
    const ctx = await buildCtx(req);
    await doraInsights.markRead(ctx, req.params.id);
    await invalidateCountsCache(ctx);
    res.json({ ok: true });
  } catch (error) {
    console.error('[dora/insights] mark read failed:', error);
    res.status(500).json({ error: 'Failed to mark insight as read' });
  }
});

router.put('/insights/:id/dismiss', async (req: ReimbursementRequest, res) => {
  try {
    const ctx = await buildCtx(req);
    await doraInsights.dismiss(ctx, req.params.id);
    await invalidateCountsCache(ctx);
    res.json({ ok: true });
  } catch (error) {
    console.error('[dora/insights] dismiss failed:', error);
    res.status(500).json({ error: 'Failed to dismiss insight' });
  }
});

export default router;
