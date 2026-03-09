import { Router } from 'express';
import type { Response } from 'express';
import { type ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { requireFinanceRole } from '../../middleware/financeRbac.js';
import { paymentService } from '../../services/finance/paymentService.js';

const router = Router();

router.get('/', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const payments = await paymentService.list(req.organizationId!, {
      status: req.query.status as string | undefined,
    });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list payments' });
  }
});

router.post('/', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const payment = await paymentService.create(req.body, req.reimbursementUser!.id, req.organizationId!);
    res.status(201).json(payment);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create payment' });
  }
});

router.post('/:id/complete', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const payment = await paymentService.complete(req.params.id, req.reimbursementUser!.id, req.organizationId!);
    res.json(payment);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to complete payment' });
  }
});

router.post('/bulk-complete', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const { payment_ids } = req.body;
    if (!Array.isArray(payment_ids)) return res.status(400).json({ error: 'payment_ids required' });
    const results = [];
    for (const id of payment_ids) {
      try {
        await paymentService.complete(id, user.id, orgId);
        results.push({ id, success: true });
      } catch (err) {
        results.push({ id, success: false, error: err instanceof Error ? err.message : 'Failed' });
      }
    }
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: 'Bulk complete failed' });
  }
});

export default router;
