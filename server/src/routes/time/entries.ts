import { Router } from 'express';
import type { Response } from 'express';
import * as time from '../../dal/time/index.js';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { buildCtx, parsePositiveInt, parseSort } from './common.js';

const router = Router();

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (!body.date || !body.hours) {
      res.status(400).json({ error: 'date and hours are required' });
      return;
    }
    const entry = await time.entries.createEntry(buildCtx(req), {
      userId: (body.userId as string | undefined) ?? (body.user_id as string | undefined),
      projectId: (body.projectId as string | undefined) ?? (body.project_id as string | undefined),
      taskId: (body.taskId as string | undefined) ?? (body.task_id as string | undefined),
      categoryId: (body.categoryId as string | undefined) ?? (body.category_id as string | undefined),
      date: String(body.date),
      hours: Number(body.hours),
      description: body.description as string | undefined,
      isBillable: Boolean((body.isBillable as boolean | undefined) ?? body.is_billable),
      billingRate: body.billingRate != null ? Number(body.billingRate) : (body.billing_rate != null ? Number(body.billing_rate) : undefined),
      clientId: (body.clientId as string | undefined) ?? (body.client_id as string | undefined),
      source: body.source as 'manual' | 'timer' | 'import' | 'suggestion' | undefined,
      timerId: (body.timerId as string | undefined) ?? (body.timer_id as string | undefined),
    });
    res.status(201).json(entry);
  } catch (err) {
    console.error('[time/entries POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create entry' });
  }
});

router.get('/weekly-grid', async (req: ReimbursementRequest, res: Response) => {
  try {
    const weekStartDate = (req.query.weekStartDate as string | undefined) ?? new Date().toISOString().slice(0, 10);
    const userId = (req.query.userId as string | undefined) ?? buildCtx(req).userId;
    const grid = await time.entries.getWeeklyGrid(buildCtx(req), userId, weekStartDate);
    res.json(grid);
  } catch (err) {
    console.error('[time/entries/weekly-grid GET]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to get weekly grid' });
  }
});

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await time.entries.listEntries(
      buildCtx(req),
      {
        userId: (req.query.userId as string | undefined) ?? (req.query.user_id as string | undefined),
        projectId: (req.query.projectId as string | undefined) ?? (req.query.project_id as string | undefined),
        taskId: (req.query.taskId as string | undefined) ?? (req.query.task_id as string | undefined),
        categoryId: (req.query.categoryId as string | undefined) ?? (req.query.category_id as string | undefined),
        dateRange: (req.query.from || req.query.to)
          ? { from: req.query.from as string | undefined, to: req.query.to as string | undefined }
          : undefined,
        billableOnly: req.query.billableOnly === 'true' || req.query.billable_only === 'true',
        status: req.query.status as 'draft' | 'submitted' | 'approved' | 'rejected' | undefined,
        search: req.query.search as string | undefined,
      },
      parseSort(
        req.query.sortBy,
        req.query.sortDir,
        {
          date: 'te.date',
          createdAt: 'te.created_at',
          updatedAt: 'te.updated_at',
          hours: 'te.hours',
          status: 'te.status',
          projectId: 'te.project_id',
        },
        'te.date',
      ),
      parsePositiveInt(req.query.page, 1),
      parsePositiveInt(req.query.pageSize, 20),
    );
    res.json(result);
  } catch (err) {
    console.error('[time/entries GET]', err);
    res.status(500).json({ error: 'Failed to list entries' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const entry = await time.entries.getEntryById(buildCtx(req), req.params.id);
    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }
    res.json(entry);
  } catch (err) {
    console.error('[time/entries/:id GET]', err);
    res.status(500).json({ error: 'Failed to get entry' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const entry = await time.entries.updateEntry(buildCtx(req), req.params.id, {
      projectId: (body.projectId as string | null | undefined) ?? (body.project_id as string | null | undefined),
      taskId: (body.taskId as string | null | undefined) ?? (body.task_id as string | null | undefined),
      categoryId: (body.categoryId as string | null | undefined) ?? (body.category_id as string | null | undefined),
      date: body.date as string | undefined,
      hours: body.hours != null ? Number(body.hours) : undefined,
      description: body.description as string | null | undefined,
      isBillable: body.isBillable != null ? Boolean(body.isBillable) : (body.is_billable != null ? Boolean(body.is_billable) : undefined),
      billingRate: body.billingRate != null ? Number(body.billingRate) : (body.billing_rate != null ? Number(body.billing_rate) : undefined),
      clientId: (body.clientId as string | null | undefined) ?? (body.client_id as string | null | undefined),
      status: body.status as 'draft' | 'submitted' | 'approved' | 'rejected' | undefined,
    });
    res.json(entry);
  } catch (err) {
    console.error('[time/entries/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update entry' });
  }
});

router.delete('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    await time.entries.deleteEntry(buildCtx(req), req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[time/entries/:id DELETE]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete entry' });
  }
});

export default router;
