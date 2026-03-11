import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import * as licensesDal from '../../dal/assets/licenses.js';
import { buildCtx, parsePositiveInt, parseSort } from './common.js';

const router = Router();

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.software_name) {
      res.status(400).json({ error: 'software_name is required' });
      return;
    }
    const license = await licensesDal.createLicense(buildCtx(req), req.body);
    res.status(201).json(license);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create license' });
  }
});

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await licensesDal.listLicenses(
      buildCtx(req),
      {
        status: req.query.status as string | undefined,
        underutilized: req.query.underutilized === 'true',
        expiringWithin: req.query.expiringWithin ? Number(req.query.expiringWithin) : undefined,
        search: req.query.search as string | undefined,
      },
      parseSort(req.query.sortBy, req.query.sortDir, {
        softwareName: 'software_name',
        seatsUsed: 'seats_used',
        seatsPurchased: 'seats_purchased',
        expiryDate: 'expiry_date',
        monthlyCost: 'total_monthly_cost',
        createdAt: 'created_at',
      }),
      parsePositiveInt(req.query.page, 1),
      parsePositiveInt(req.query.pageSize, 20),
    );
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to list licenses' });
  }
});

router.get('/utilization', async (req: ReimbursementRequest, res: Response) => {
  try {
    const data = await licensesDal.getLicenseUtilization(buildCtx(req));
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Failed to get utilization' });
  }
});

router.get('/underutilized', async (req: ReimbursementRequest, res: Response) => {
  try {
    const data = await licensesDal.getUnderutilizedLicenses(buildCtx(req));
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Failed to get underutilized licenses' });
  }
});

router.get('/expiring', async (req: ReimbursementRequest, res: Response) => {
  try {
    const withinDays = req.query.withinDays ? Number(req.query.withinDays) : 30;
    const data = await licensesDal.getExpiringLicenses(buildCtx(req), withinDays);
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Failed to get expiring licenses' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const license = await licensesDal.getLicenseById(buildCtx(req), req.params.id);
    if (!license) {
      res.status(404).json({ error: 'License not found' });
      return;
    }
    res.json(license);
  } catch {
    res.status(500).json({ error: 'Failed to load license' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const license = await licensesDal.updateLicense(buildCtx(req), req.params.id, req.body);
    res.json(license);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update license' });
  }
});

router.post('/:id/seats', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }
    const seat = await licensesDal.assignSeat(buildCtx(req), req.params.id, req.body.userId);
    res.status(201).json(seat);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to assign seat' });
  }
});

router.delete('/:id/seats/:userId', async (req: ReimbursementRequest, res: Response) => {
  try {
    await licensesDal.removeSeat(buildCtx(req), req.params.id, req.params.userId);
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to remove seat' });
  }
});

export default router;
