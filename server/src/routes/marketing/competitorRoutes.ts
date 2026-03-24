import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { buildCtx } from './common.js';
import { query } from '../../db/index.js';
import {
  getCompetitor,
  listCompetitors,
  createCompetitor,
  updateCompetitor,
  deleteCompetitor,
  queryEvents,
  getRecentEvents,
  getSignificantEvents,
  getCompetitorEventCounts,
} from '../../services/marketing/competitorService.js';
import type { EventType, SignificanceLevel } from '../../services/marketing/competitorService.js';
import { isJobQueueUnavailableError } from '../../services/jobQueue.js';
import { triggerScrape, scheduleRecurringScrape } from '../../services/marketing/competitorScraper.js';

const router = Router();
const db = { query };

// ── Competitor List + Create ──

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    if (!ctx.organizationId) {
      res.status(400).json({ error: 'Organization required' });
      return;
    }
    const includeInactive = req.query.include_inactive === 'true';
    const result = await listCompetitors(ctx.organizationId, { includeInactive }, db);
    res.json(result);
  } catch (err) {
    console.error('[competitorRoutes] GET / error:', err);
    res.status(500).json({ error: 'Failed to list competitors' });
  }
});

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    if (!ctx.organizationId) {
      res.status(400).json({ error: 'Organization required' });
      return;
    }
    const competitor = await createCompetitor({
      ...req.body,
      organizationId: ctx.organizationId,
      createdBy: ctx.userId,
    }, db);
    res.status(201).json(competitor);
  } catch (err) {
    console.error('[competitorRoutes] POST / error:', err);
    res.status(500).json({ error: 'Failed to create competitor' });
  }
});

/** GET /stats — event counts per competitor since (for dashboard KPI chips). */
router.get('/stats', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    if (!ctx.organizationId) {
      res.status(400).json({ error: 'Organization required' });
      return;
    }
    const since =
      (req.query.since as string) || new Date(Date.now() - 30 * 86400000).toISOString();
    const rows = await getCompetitorEventCounts(ctx.organizationId, since, db);
    const totalEvents = rows.reduce((s, r) => s + r.event_count, 0);
    res.json({ since, per_competitor: rows, total_events: totalEvents });
  } catch (err) {
    console.error('[competitorRoutes] GET /stats error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// ── Events (before /:id to avoid param capture) ──

router.get('/events', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    if (!ctx.organizationId) {
      res.status(400).json({ error: 'Organization required' });
      return;
    }
    const result = await queryEvents(ctx.organizationId, {
      competitorId: req.query.competitor_id as string | undefined,
      eventType: req.query.event_type as EventType | undefined,
      significance: req.query.significance as SignificanceLevel | undefined,
      since: req.query.since as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    }, db);
    res.json(result);
  } catch (err) {
    console.error('[competitorRoutes] GET /events error:', err);
    res.status(500).json({ error: 'Failed to query events' });
  }
});

router.get('/events/recent', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    if (!ctx.organizationId) {
      res.status(400).json({ error: 'Organization required' });
      return;
    }
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const events = await getRecentEvents(ctx.organizationId, limit, db);
    res.json({ events });
  } catch (err) {
    console.error('[competitorRoutes] GET /events/recent error:', err);
    res.status(500).json({ error: 'Failed to get recent events' });
  }
});

router.get('/events/significant', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    if (!ctx.organizationId) {
      res.status(400).json({ error: 'Organization required' });
      return;
    }
    const since = (req.query.since as string) || new Date(Date.now() - 30 * 86400000).toISOString();
    const events = await getSignificantEvents(ctx.organizationId, since, db);
    res.json({ events });
  } catch (err) {
    console.error('[competitorRoutes] GET /events/significant error:', err);
    res.status(500).json({ error: 'Failed to get significant events' });
  }
});

// ── Scrape-All (before /:id to avoid param capture) ──

router.post('/scrape-all', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    if (!ctx.organizationId) {
      res.status(400).json({ error: 'Organization required' });
      return;
    }

    const { competitors } = await listCompetitors(
      ctx.organizationId,
      { includeInactive: false },
      db,
    );
    const active = competitors.filter((c) => c.monitor_urls.length > 0);

    for (const competitor of active) {
      const jobId = await triggerScrape(competitor.id, ctx.organizationId);
      if (jobId == null) {
        res.status(503).json({
          error:
          'Job queue unavailable. Set ENABLE_PG_BOSS=true, ensure Postgres is reachable, and use DATABASE_URL or PG_BOSS_DATABASE_URL (direct DB, not transaction-pooler).',
          code: 'QUEUE_UNAVAILABLE',
        });
        return;
      }
    }

    await scheduleRecurringScrape(ctx.organizationId);

    res.json({ message: `Scrape queued for ${active.length} competitors` });
  } catch (err) {
    if (isJobQueueUnavailableError(err)) {
      res.status(503).json({
        error:
          'Job queue unavailable. Set ENABLE_PG_BOSS=true, ensure Postgres is reachable, and use DATABASE_URL or PG_BOSS_DATABASE_URL (direct DB, not transaction-pooler).',
        code: 'QUEUE_UNAVAILABLE',
      });
      return;
    }
    console.error('[competitorRoutes] POST /scrape-all error:', err);
    res.status(500).json({ error: 'Failed to trigger bulk scrape' });
  }
});

// ── Single Competitor ──

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const competitor = await getCompetitor(req.params.id, db);
    if (!competitor) {
      res.status(404).json({ error: 'Competitor not found' });
      return;
    }
    res.json(competitor);
  } catch (err) {
    console.error('[competitorRoutes] GET /:id error:', err);
    res.status(500).json({ error: 'Failed to get competitor' });
  }
});

router.patch('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const competitor = await updateCompetitor(req.params.id, req.body, db);
    if (!competitor) {
      res.status(404).json({ error: 'Competitor not found' });
      return;
    }
    res.json(competitor);
  } catch (err) {
    console.error('[competitorRoutes] PATCH /:id error:', err);
    res.status(500).json({ error: 'Failed to update competitor' });
  }
});

router.delete('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    await deleteCompetitor(req.params.id, db);
    res.json({ success: true });
  } catch (err) {
    console.error('[competitorRoutes] DELETE /:id error:', err);
    res.status(500).json({ error: 'Failed to delete competitor' });
  }
});

// ── Per-Competitor Scrape ──

router.post('/:id/scrape', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    if (!ctx.organizationId) {
      res.status(400).json({ error: 'Organization required' });
      return;
    }

    const competitor = await getCompetitor(req.params.id, db);
    if (!competitor) {
      res.status(404).json({ error: 'Competitor not found' });
      return;
    }

    const jobId = await triggerScrape(competitor.id, ctx.organizationId);
    if (jobId == null) {
      res.status(503).json({
        error:
          'Job queue unavailable. Set ENABLE_PG_BOSS=true, ensure Postgres is reachable, and use DATABASE_URL or PG_BOSS_DATABASE_URL (direct DB, not transaction-pooler).',
        code: 'QUEUE_UNAVAILABLE',
      });
      return;
    }
    res.json({ job_id: jobId, message: 'Scrape queued' });
  } catch (err) {
    if (isJobQueueUnavailableError(err)) {
      res.status(503).json({
        error:
          'Job queue unavailable. Set ENABLE_PG_BOSS=true, ensure Postgres is reachable, and use DATABASE_URL or PG_BOSS_DATABASE_URL (direct DB, not transaction-pooler).',
        code: 'QUEUE_UNAVAILABLE',
      });
      return;
    }
    console.error('[competitorRoutes] POST /:id/scrape error:', err);
    res.status(500).json({ error: 'Failed to trigger scrape' });
  }
});

router.get('/:id/scrape-status', async (req: ReimbursementRequest, res: Response) => {
  try {
    const ctx = buildCtx(req);
    if (!ctx.organizationId) {
      res.status(400).json({ error: 'Organization required' });
      return;
    }

    const competitor = await getCompetitor(req.params.id, db);
    if (!competitor) {
      res.status(404).json({ error: 'Competitor not found' });
      return;
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recentEvents = await getRecentEvents(ctx.organizationId, 10, db);
    const competitorEvents = recentEvents.filter(
      (e) => e.competitor_id === competitor.id,
    );
    const counts = await getCompetitorEventCounts(ctx.organizationId, thirtyDaysAgo, db);
    const competitorCount = counts.find((c) => c.competitor_id === competitor.id);

    res.json({
      competitor_id: competitor.id,
      competitor_name: competitor.name,
      last_scraped_at: competitor.last_scraped_at,
      last_scrape_summary: competitor.last_scrape_summary ?? null,
      total_events: competitorCount?.event_count ?? 0,
      recent_events: competitorEvents.slice(0, 5),
    });
  } catch (err) {
    console.error('[competitorRoutes] GET /:id/scrape-status error:', err);
    res.status(500).json({ error: 'Failed to get scrape status' });
  }
});

export default router;
