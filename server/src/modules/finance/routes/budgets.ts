import { Router } from 'express';
import type { Response } from 'express';
import { query } from '../../../db/index.js';
import { type ReimbursementRequest } from '../../../middleware/reimbursementAuth.js';
import { requireFinanceRole } from '../../../middleware/financeRbac.js';
import { budgetService as budgetSvc } from '../../../services/finance/budgetService.js';
import { getAllBudgets, getActiveBudgets, getBudgetsByDepartment } from '../../../db/budgetDb.js';

const router = Router();

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const { department, active } = req.query;
    let budgets;
    if (active === 'true') {
      budgets = await getActiveBudgets(orgId);
    } else if (department && typeof department === 'string') {
      budgets = await getBudgetsByDepartment(department, orgId);
    } else {
      budgets = await getAllBudgets(orgId);
    }
    res.json(budgets);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list budgets' });
  }
});

router.post('/', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const b = req.body;
    const data = {
      ...b,
      department: b.department,
      name: b.name ?? null,
      description: b.description ?? null,
      allocated_amount: b.allocated_amount ?? b.allocatedAmount,
      period_start: b.period_start ?? b.periodStart,
      period_end: b.period_end ?? b.periodEnd,
      owner_id: b.owner_id ?? req.reimbursementUser!.id,
      warning_threshold: b.warning_threshold ?? (b.alertThreshold != null ? parseFloat(b.alertThreshold) * 100 : undefined),
    };
    const budget = await budgetSvc.create(data, req.reimbursementUser!.id, req.organizationId!);
    res.status(201).json(budget);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create budget' });
  }
});

router.put('/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const budget = await budgetSvc.update(req.params.id, req.body, req.reimbursementUser!.id, req.organizationId!);
    res.json(budget);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update budget' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const budget = await budgetSvc.getById(req.params.id, req.organizationId!);
    if (!budget) { res.status(404).json({ error: 'Budget not found' }); return; }
    res.json(budget);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get budget' });
  }
});

router.get('/:id/health', async (req: ReimbursementRequest, res: Response) => {
  try {
    const health = await budgetSvc.checkHealth(req.params.id, req.organizationId!);
    if (!health) { res.status(404).json({ error: 'Budget not found' }); return; }
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: 'Failed to check budget health' });
  }
});

router.put('/:id/allocations', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    await budgetSvc.setAllocations(req.params.id, req.body.allocations, req.reimbursementUser!.id, req.organizationId!);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to set allocations' });
  }
});

router.get('/:id/expenses', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const budget = await budgetSvc.getById(req.params.id, orgId);
    if (!budget) return res.status(404).json({ error: 'Budget not found' });
    const result = await query(
      `SELECT r.*, u.full_name as submitter_name
       FROM reimbursement_requests r
       LEFT JOIN reimbursement_users u ON u.id = r.submitted_by
       WHERE r.organization_id = $1 AND r.is_deleted = FALSE
         AND r.budget_id = $2
       ORDER BY r.created_at DESC LIMIT 100`,
      [orgId, req.params.id],
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[finance/budgets/:id/expenses]', err);
    res.status(500).json({ error: 'Failed to load budget expenses' });
  }
});

router.delete('/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    await query(`DELETE FROM finance_budgets WHERE id = $1 AND organization_id = $2`, [req.params.id, orgId]);
    res.json({ success: true });
  } catch (err) {
    console.error('[finance/budgets DELETE]', err);
    res.status(400).json({ error: 'Failed to delete budget' });
  }
});

export default router;
