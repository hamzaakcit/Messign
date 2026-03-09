import { Router } from 'express';
import { reimbursementAuth, requireRole, type ReimbursementRequest } from '../middleware/reimbursementAuth.js';
import {
  getAllBudgets,
  getBudgetById,
  getBudgetsByDepartment,
  getActiveBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  getBudgetsExceedingThreshold,
} from '../db/budgetDb.js';
import { FINANCE_DEPARTMENTS } from '../services/finance/categoryDepartmentMap.js';

const router = Router();
router.use(reimbursementAuth);

router.get('/', async (req: ReimbursementRequest, res) => {
  const orgId = req.organizationId!;
  const { department, active } = req.query;

  try {
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
    console.error('[budgets] GET /', err);
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

router.get('/alerts', async (req: ReimbursementRequest, res) => {
  const orgId = req.organizationId!;
  try {
    const exceeded = await getBudgetsExceedingThreshold(orgId);
    res.json(exceeded);
  } catch (err) {
    console.error('[budgets] GET /alerts', err);
    res.status(500).json({ error: 'Failed to fetch budget alerts' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res) => {
  const orgId = req.organizationId!;
  try {
    const budget = await getBudgetById(req.params.id, orgId);
    if (!budget) {
      res.status(404).json({ error: 'Budget not found' });
      return;
    }
    res.json(budget);
  } catch (err) {
    console.error('[budgets] GET /:id', err);
    res.status(500).json({ error: 'Failed to fetch budget' });
  }
});

router.post('/', requireRole('admin', 'finance'), async (req: ReimbursementRequest, res) => {
  const orgId = req.organizationId!;
  const user = req.reimbursementUser!;
  const { department, periodStart, periodEnd, allocatedAmount, currency, alertThreshold, name, description } = req.body;

  if (!department || !periodStart || !periodEnd || allocatedAmount == null) {
    res.status(400).json({ error: 'Missing required fields: department, periodStart, periodEnd, allocatedAmount' });
    return;
  }

  if (!(FINANCE_DEPARTMENTS as readonly string[]).includes(department)) {
    res.status(400).json({ error: `Invalid department "${department}". Valid: ${FINANCE_DEPARTMENTS.join(', ')}` });
    return;
  }

  try {
    const budget = await createBudget(orgId, {
      department,
      periodStart,
      periodEnd,
      allocatedAmount: parseFloat(allocatedAmount),
      currency,
      alertThreshold: alertThreshold != null ? parseFloat(alertThreshold) : undefined,
      createdBy: user.id,
      name: name || undefined,
      description: description || undefined,
    });
    res.status(201).json(budget);
  } catch (err) {
    console.error('[budgets] POST /', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create budget' });
  }
});

router.patch('/:id', requireRole('admin', 'finance'), async (req: ReimbursementRequest, res) => {
  const orgId = req.organizationId!;
  const { department, periodStart, periodEnd, allocatedAmount, currency, alertThreshold } = req.body;

  try {
    const budget = await updateBudget(req.params.id, orgId, {
      department,
      periodStart,
      periodEnd,
      allocatedAmount: allocatedAmount != null ? parseFloat(allocatedAmount) : undefined,
      currency,
      alertThreshold: alertThreshold != null ? parseFloat(alertThreshold) : undefined,
    });
    if (!budget) {
      res.status(404).json({ error: 'Budget not found' });
      return;
    }
    res.json(budget);
  } catch (err) {
    console.error('[budgets] PATCH /:id', err);
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

router.delete('/:id', requireRole('admin', 'finance'), async (req: ReimbursementRequest, res) => {
  const orgId = req.organizationId!;
  try {
    const deleted = await deleteBudget(req.params.id, orgId);
    if (!deleted) {
      res.status(404).json({ error: 'Budget not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[budgets] DELETE /:id', err);
    res.status(500).json({ error: 'Failed to delete budget' });
  }
});

export const budgetsRouter = router;
