import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { buildCtx } from './common.js';
import { query } from '../../db/index.js';
import {
  generateSnapshot,
  storeSnapshot,
  getLatestSnapshot,
  getSnapshotTrend,
} from '../../services/marketing/dashboardAggregator.js';

const router = Router();
const db = { query };

// ── GET /executive — latest snapshot (auto-generates if stale) ──

router.get('/executive', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    if (!ctx.organizationId) {
      res.status(400).json({ error: 'Organization required' });
      return;
    }

    const latest = await getLatestSnapshot(ctx.organizationId, db);
    const isStale = !latest || (Date.now() - new Date(latest.generatedAt).getTime() > 24 * 3600 * 1000);

    if (isStale) {
      const today = new Date().toISOString().slice(0, 10);
      const fresh = await generateSnapshot(ctx.organizationId, today, 30, db);
      await storeSnapshot(ctx.organizationId, fresh, 'daily', db);
      res.json(fresh);
      return;
    }

    res.json(latest);
  } catch (err) {
    console.error('[dashboardRoutes] GET /executive error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ── GET /executive/trend — sparkline/chart data ──

router.get('/executive/trend', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    if (!ctx.organizationId) {
      res.status(400).json({ error: 'Organization required' });
      return;
    }

    const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
    const trends = await getSnapshotTrend(ctx.organizationId, days, db);
    res.json({ trends });
  } catch (err) {
    console.error('[dashboardRoutes] GET /executive/trend error:', err);
    res.status(500).json({ error: 'Failed to load trend data' });
  }
});

// ── POST /executive/refresh — force regenerate ──

router.post('/executive/refresh', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    if (!ctx.organizationId) {
      res.status(400).json({ error: 'Organization required' });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const snapshot = await generateSnapshot(ctx.organizationId, today, 30, db);
    await storeSnapshot(ctx.organizationId, snapshot, 'daily', db);
    res.json(snapshot);
  } catch (err) {
    console.error('[dashboardRoutes] POST /executive/refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh dashboard' });
  }
});

// ── GET /executive/mp-triggers — list MP marketing triggers ──

router.get('/executive/mp-triggers', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    if (!ctx.organizationId) {
      res.status(400).json({ error: 'Organization required' });
      return;
    }

    const userId = req.query.user_id as string | undefined;
    const status = (req.query.status as string) || 'pending';
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    let sql = `SELECT *, COUNT(*) OVER() AS full_count FROM mp_marketing_triggers
               WHERE organization_id = $1 AND status = $2`;
    const params: unknown[] = [ctx.organizationId, status];
    let paramIdx = 3;

    if (userId) {
      sql += ` AND user_id = $${paramIdx}`;
      params.push(userId);
      paramIdx++;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(limit, offset);

    const result = await db.query(sql, params);
    const rows = result.rows as Array<Record<string, unknown>>;
    const total = rows.length > 0 ? Number(rows[0].full_count) : 0;

    const triggers = rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      trigger_type: r.trigger_type,
      content_id: r.content_id || null,
      batch_job_id: r.batch_job_id || null,
      compliance_scan_id: r.compliance_scan_id || null,
      points_earned: r.points_earned,
      multiplier: r.multiplier ? parseFloat(String(r.multiplier)) : 1.0,
      details: r.details || {},
      status: r.status,
      credited_at: r.credited_at || null,
      created_at: r.created_at,
    }));

    res.json({ triggers, total });
  } catch (err) {
    console.error('[dashboardRoutes] GET /executive/mp-triggers error:', err);
    res.status(500).json({ error: 'Failed to load MP triggers' });
  }
});

// ── GET /executive/mp-triggers/summary — per-user aggregates ──

router.get('/executive/mp-triggers/summary', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    if (!ctx.organizationId) {
      res.status(400).json({ error: 'Organization required' });
      return;
    }

    const result = await db.query(
      `SELECT user_id,
              SUM(points_earned)::integer AS total_points,
              COUNT(*)::integer AS trigger_count,
              SUM(CASE WHEN status = 'pending' THEN points_earned ELSE 0 END)::integer AS pending_points
       FROM mp_marketing_triggers
       WHERE organization_id = $1
       GROUP BY user_id
       ORDER BY total_points DESC`,
      [ctx.organizationId],
    );

    const users = (result.rows as Array<Record<string, unknown>>).map((r) => ({
      user_id: r.user_id as string,
      total_points: (r.total_points as number) || 0,
      trigger_count: (r.trigger_count as number) || 0,
      pending_points: (r.pending_points as number) || 0,
    }));

    res.json({ users });
  } catch (err) {
    console.error('[dashboardRoutes] GET /executive/mp-triggers/summary error:', err);
    res.status(500).json({ error: 'Failed to load MP summary' });
  }
});

export default router;
