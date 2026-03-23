import { Router } from 'express';
import { reimbursementAuth, type ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import type { CallerContext } from '../../dal/types.js';
import { generateBriefing, getBriefingByDate, getOrGenerateBriefing } from '../../services/dora/dailyBriefing.js';
import { redisConnection } from '../../queue/connection.js';

const router = Router();
const CACHE_TTL = 60;

function buildCtx(req: ReimbursementRequest): CallerContext {
  const user = req.reimbursementUser!;
  return {
    userId: user.id,
    userUuid: user.id,
    role: user.role as CallerContext['role'],
    organizationId: req.organizationId,
  };
}

function today(): string {
  return new Date().toISOString().split('T')[0]!;
}

router.use(reimbursementAuth);

router.get('/daily', async (req: ReimbursementRequest, res) => {
  try {
    const refresh = req.query.refresh === 'true';
    const ctx = buildCtx(req);
    const date = today();
    const cacheKey = `daily_briefing_${ctx.userId}_${date}`;
    if (!refresh) {
      try {
        const cached = await redisConnection.get(cacheKey);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      } catch (e) {
        if (e instanceof Error) console.warn('[Redis] daily briefing cache get:', e.message);
      }
    }
    const briefing = refresh ? await generateBriefing(ctx) : await getOrGenerateBriefing(ctx);
    try {
      await redisConnection.setex(cacheKey, CACHE_TTL, JSON.stringify(briefing));
    } catch (e) {
      if (e instanceof Error) console.warn('[Redis] daily briefing cache set:', e.message);
    }
    res.json(briefing);
  } catch (error) {
    console.error('[dora/briefing] get daily failed', error);
    res.status(500).json({ error: 'Failed to load daily briefing' });
  }
});

router.get('/daily/:date', async (req: ReimbursementRequest, res) => {
  try {
    const ctx = buildCtx(req);
    const briefing = await getBriefingByDate(ctx, req.params.date);
    if (!briefing) {
      return res.status(404).json({ error: 'No briefing found for date' });
    }
    return res.json(briefing);
  } catch (error) {
    console.error('[dora/briefing] get by date failed', error);
    return res.status(500).json({ error: 'Failed to load briefing' });
  }
});

export default router;
