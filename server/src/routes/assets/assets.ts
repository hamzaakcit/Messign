import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import * as assetsDal from '../../dal/assets/assets.js';
import { buildCtx, parsePositiveInt, parseSort } from './common.js';

const router = Router();

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.name) {
      res.status(400).json({ error: 'Asset name is required' });
      return;
    }
    const asset = await assetsDal.createAsset(buildCtx(req), req.body);
    res.status(201).json(asset);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create asset' });
  }
});

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await assetsDal.listAssets(
      buildCtx(req),
      {
        status: req.query.status as string | undefined,
        categoryId: req.query.categoryId as string | undefined,
        assignedTo: req.query.assignedTo as string | undefined,
        departmentId: req.query.departmentId as string | undefined,
        warrantyExpiring: req.query.warrantyExpiring === 'true',
        search: req.query.search as string | undefined,
      },
      parseSort(req.query.sortBy, req.query.sortDir, {
        name: 'name',
        status: 'status',
        createdAt: 'created_at',
        warrantyEnd: 'warranty_end',
        purchaseCost: 'purchase_cost',
        currentValue: 'current_value',
      }),
      parsePositiveInt(req.query.page, 1),
      parsePositiveInt(req.query.pageSize, 20),
    );
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to list assets' });
  }
});

router.get('/metrics', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await assetsDal.getAssetMetrics(buildCtx(req));
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to load asset metrics' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const asset = await assetsDal.getAssetById(buildCtx(req), req.params.id);
    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }
    res.json(asset);
  } catch {
    res.status(500).json({ error: 'Failed to load asset' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const asset = await assetsDal.updateAsset(buildCtx(req), req.params.id, req.body);
    res.json(asset);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update asset' });
  }
});

router.post('/:id/assign', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.assigneeId) {
      res.status(400).json({ error: 'assigneeId is required' });
      return;
    }
    const asset = await assetsDal.assignAsset(buildCtx(req), req.params.id, req.body.assigneeId);
    res.json(asset);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to assign asset' });
  }
});

router.post('/:id/return', async (req: ReimbursementRequest, res: Response) => {
  try {
    const asset = await assetsDal.returnAsset(buildCtx(req), req.params.id, req.body.condition ?? 'good', req.body.notes);
    res.json(asset);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to return asset' });
  }
});

router.post('/:id/retire', async (req: ReimbursementRequest, res: Response) => {
  try {
    const asset = await assetsDal.retireAsset(buildCtx(req), req.params.id, req.body.reason ?? 'Retired');
    res.json(asset);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to retire asset' });
  }
});

router.post('/:id/maintenance', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.scheduled_date) {
      res.status(400).json({ error: 'scheduled_date is required' });
      return;
    }
    const maintenance = await assetsDal.scheduleMaintenance(buildCtx(req), req.params.id, req.body);
    res.status(201).json(maintenance);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to schedule maintenance' });
  }
});

export default router;
