import { Router } from 'express';
import type { Response } from 'express';
import { query } from '../../../db/index.js';
import { type ReimbursementRequest } from '../../../middleware/reimbursementAuth.js';
import { requireFinanceRole } from '../../../middleware/financeRbac.js';
import { vendorService } from '../../../services/finance/vendorService.js';

const router = Router();

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const vendors = await vendorService.list(req.organizationId!, {
      search: req.query.search as string | undefined,
    });
    res.json(vendors);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list vendors' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const vendor = await vendorService.getById(req.params.id, req.organizationId!);
    if (!vendor) { res.status(404).json({ error: 'Vendor not found' }); return; }
    res.json(vendor);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get vendor' });
  }
});

router.post('/', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const vendor = await vendorService.create(req.body, req.reimbursementUser!.id, req.organizationId!);
    res.status(201).json(vendor);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create vendor' });
  }
});

router.put('/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const vendor = await vendorService.update(req.params.id, req.body, req.reimbursementUser!.id, req.organizationId!);
    res.json(vendor);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update vendor' });
  }
});

router.delete('/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    await vendorService.deactivate(req.params.id, user.id, orgId);
    res.json({ success: true });
  } catch (err) {
    console.error('[finance/vendors DELETE]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to deactivate vendor' });
  }
});

router.get('/:id/transactions', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const invoices = await query(
      `SELECT * FROM invoices
       WHERE organization_id = $1 AND vendor_id = $2 AND (is_deleted IS NULL OR is_deleted = FALSE)
       ORDER BY created_at DESC LIMIT 50`,
      [orgId, req.params.id],
    );
    const payments = await query(
      `SELECT * FROM finance_payments
       WHERE organization_id = $1 AND vendor_id = $2
       ORDER BY created_at DESC LIMIT 50`,
      [orgId, req.params.id],
    );
    res.json({ invoices: invoices.rows, payments: payments.rows });
  } catch (err) {
    console.error('[finance/vendors/:id/transactions]', err);
    res.status(500).json({ error: 'Failed to load vendor transactions' });
  }
});

router.post('/bulk-deactivate', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const { vendor_ids } = req.body;
    if (!Array.isArray(vendor_ids)) return res.status(400).json({ error: 'vendor_ids required' });
    const results = [];
    for (const id of vendor_ids) {
      try {
        await vendorService.deactivate(id, user.id, orgId);
        results.push({ id, success: true });
      } catch (err) {
        results.push({ id, success: false, error: err instanceof Error ? err.message : 'Failed' });
      }
    }
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: 'Bulk deactivate failed' });
  }
});

export default router;
