import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import * as contentDal from '../../dal/marketing/content.js';
import { buildCtx, parseDateRange, parsePositiveInt, parseSort } from './common.js';

const router = Router();

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.title || !req.body?.content_type) {
      res.status(400).json({ error: 'Title and content_type are required' });
      return;
    }
    const content = await contentDal.createContent(buildCtx(req), req.body);
    res.status(201).json(content);
  } catch (err) {
    console.error('[marketing/content POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create content' });
  }
});

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await contentDal.listContent(
      buildCtx(req),
      {
        status: req.query.status as string | undefined,
        contentType: req.query.contentType as string | undefined,
        channel: req.query.channel as string | undefined,
        campaignId: req.query.campaignId as string | undefined,
        scheduledDateRange: parseDateRange(req.query.dateFrom, req.query.dateTo),
        authorId: req.query.authorId as string | undefined,
      },
      parseSort(req.query.sortBy, req.query.sortDir, {
        title: 'title',
        status: 'status',
        contentType: 'content_type',
        channel: 'channel',
        scheduledDate: 'scheduled_date',
        engagement: 'engagement',
      }),
      parsePositiveInt(req.query.page, 1),
      parsePositiveInt(req.query.pageSize, 20),
    );
    res.json(result);
  } catch (err) {
    console.error('[marketing/content GET]', err);
    res.status(500).json({ error: 'Failed to list content' });
  }
});

router.get('/calendar', async (req: ReimbursementRequest, res: Response) => {
  try {
    const month = parsePositiveInt(req.query.month, new Date().getMonth() + 1);
    const year = parsePositiveInt(req.query.year, new Date().getFullYear());
    const calendar = await contentDal.getCalendarView(buildCtx(req), month, year);
    res.json(calendar);
  } catch (err) {
    console.error('[marketing/content/calendar GET]', err);
    res.status(500).json({ error: 'Failed to load content calendar' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const content = await contentDal.getContentById(buildCtx(req), req.params.id);
    if (!content) {
      res.status(404).json({ error: 'Content not found' });
      return;
    }
    res.json(content);
  } catch (err) {
    console.error('[marketing/content/:id GET]', err);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const content = await contentDal.updateContent(buildCtx(req), req.params.id, req.body);
    res.json(content);
  } catch (err) {
    console.error('[marketing/content/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update content' });
  }
});

router.post('/:id/publish', async (req: ReimbursementRequest, res: Response) => {
  try {
    const content = await contentDal.publishContent(buildCtx(req), req.params.id);
    res.json(content);
  } catch (err) {
    console.error('[marketing/content/:id/publish POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to publish content' });
  }
});

router.post('/:id/schedule', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.date) {
      res.status(400).json({ error: 'date is required' });
      return;
    }
    const content = await contentDal.scheduleContent(buildCtx(req), req.params.id, req.body.date, req.body.time);
    res.json(content);
  } catch (err) {
    console.error('[marketing/content/:id/schedule POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to schedule content' });
  }
});

export default router;
