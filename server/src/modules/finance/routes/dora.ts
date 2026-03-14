import { Router } from 'express';
import type { Response } from 'express';
import { query } from '../../../db/index.js';
import { type ReimbursementRequest } from '../../../middleware/reimbursementAuth.js';
import { requireFinanceRole } from '../../../middleware/financeRbac.js';
import { analyticsService } from '../../../services/finance/analyticsService.js';
import { approvalService } from '../../../services/finance/approvalService.js';
import { forecastService } from '../../../services/finance/forecastService.js';
import { slaService } from '../../../services/finance/slaService.js';

const router = Router();

router.post('/dora-decisions/:id/feedback', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { rating, comment } = req.body;
    await query(
      `UPDATE finance_dora_decisions SET feedback_rating = $1, feedback_comment = $2 WHERE id = $3`,
      [rating, comment ?? null, req.params.id],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[finance/dora-feedback]', err);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

router.get('/dora/insights', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const insights: Array<{ priority: number; type: string; title: string; message: string; action_url?: string; action_label?: string }> = [];

    const pending = await query(
      `SELECT COUNT(*) as c, COALESCE(SUM(original_amount), 0) as total
       FROM reimbursement_requests
       WHERE organization_id = $1 AND is_deleted = FALSE AND status IN ('submitted', 'manager_review', 'ai_reviewing')`,
      [orgId],
    );
    const pendingCount = parseInt(pending.rows[0]?.c ?? '0');
    const pendingTotal = parseFloat(pending.rows[0]?.total ?? '0');
    if (pendingCount > 0) {
      insights.push({
        priority: 1, type: 'warning',
        title: `${pendingCount} expense${pendingCount > 1 ? 's' : ''} pending`,
        message: `$${pendingTotal.toFixed(0)} total awaiting review.`,
        action_label: 'Review', action_url: '/finance/expenses?status=submitted',
      });
    }

    const overdue = await query(
      `SELECT COUNT(*) as c, COALESCE(SUM(grand_total), 0) as total
       FROM invoices WHERE organization_id = $1 AND status = 'overdue' AND (is_deleted IS NULL OR is_deleted = FALSE)`,
      [orgId],
    );
    const overdueCount = parseInt(overdue.rows[0]?.c ?? '0');
    if (overdueCount > 0) {
      insights.push({
        priority: 2, type: 'warning',
        title: `${overdueCount} overdue invoice${overdueCount > 1 ? 's' : ''}`,
        message: `$${parseFloat(overdue.rows[0]?.total ?? '0').toFixed(0)} outstanding.`,
        action_label: 'View', action_url: '/finance/invoices?status=overdue',
      });
    }

    const budgetAlerts = await query(
      `SELECT department, CASE WHEN allocated_amount > 0 THEN COALESCE(spent_amount,0) / allocated_amount ELSE 0 END AS pct
       FROM finance_budgets WHERE organization_id = $1 AND status = 'active'
       AND allocated_amount > 0 AND COALESCE(spent_amount,0) / allocated_amount >= COALESCE(alert_threshold, 0.80)
       ORDER BY pct DESC LIMIT 3`,
      [orgId],
    );
    for (const b of budgetAlerts.rows) {
      insights.push({
        priority: 3, type: parseFloat(b.pct) >= 1 ? 'warning' : 'info',
        title: `${b.department} budget at ${(parseFloat(b.pct) * 100).toFixed(0)}%`,
        message: 'Consider reviewing spending.',
        action_label: 'View Budgets', action_url: '/finance/budgets',
      });
    }

    if (insights.length === 0) {
      insights.push({
        priority: 10, type: 'success',
        title: 'All clear',
        message: 'No urgent items requiring attention.',
      });
    }

    insights.sort((a, b) => a.priority - b.priority);
    res.json({ insights });
  } catch (err) {
    console.error('[finance/dora/insights]', err);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

router.get('/dora/scheduled-jobs/status', requireFinanceRole('admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const result = await query(
      `SELECT * FROM finance_dora_job_runs WHERE organization_id = $1 ORDER BY started_at DESC LIMIT 50`,
      [orgId],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load job status' });
  }
});

router.get('/sla/status/:expenseId', async (req: ReimbursementRequest, res: Response) => {
  try {
    const status = await slaService.getStatusForExpense(req.params.expenseId);
    res.json(status);
  } catch (err) {
    console.error('[finance/sla/status]', err);
    res.status(500).json({ error: 'Failed to get SLA status' });
  }
});

router.get('/sla/metrics', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const metrics = await slaService.getSLAMetrics(req.organizationId!);
    res.json(metrics);
  } catch (err) {
    console.error('[finance/sla/metrics]', err);
    res.status(500).json({ error: 'Failed to get SLA metrics' });
  }
});

router.get('/sla/overdue', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const overdue = await slaService.getOverdueSteps(req.organizationId!);
    res.json(overdue);
  } catch (err) {
    console.error('[finance/sla/overdue]', err);
    res.status(500).json({ error: 'Failed to get overdue SLAs' });
  }
});

router.get('/analytics/dashboard', async (req: ReimbursementRequest, res: Response) => {
  try {
    const data = await analyticsService.getDashboard(req.organizationId!);
    res.json(data);
  } catch (err) {
    console.error('[finance/analytics/dashboard]', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

router.get('/analytics/spending-trend', async (req: ReimbursementRequest, res: Response) => {
  try {
    const months = req.query.months ? parseInt(req.query.months as string) : 6;
    const data = await analyticsService.getSpendingTrend(req.organizationId!, months);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load spending trend' });
  }
});

router.get('/analytics/spending-by-category', async (req: ReimbursementRequest, res: Response) => {
  try {
    const data = await analyticsService.getSpendingByCategory(req.organizationId!);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load category breakdown' });
  }
});

router.get('/analytics/ai-metrics', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const data = await analyticsService.getAIMetrics(req.organizationId!);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load AI metrics' });
  }
});

router.get('/forecast/budgets', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const forecasts = await forecastService.forecastBudgets(req.organizationId!);
    res.json(forecasts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate budget forecasts' });
  }
});

router.get('/forecast/payments', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const months = parseInt(req.query.months as string) || 3;
    const forecasts = await forecastService.forecastPayments(req.organizationId!, months);
    res.json(forecasts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate payment forecasts' });
  }
});

router.get('/approvals/chain/:entityType/:entityId', async (req: ReimbursementRequest, res: Response) => {
  try {
    const chain = await approvalService.getChain(req.params.entityType, req.params.entityId);
    res.json(chain);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load approval chain' });
  }
});

router.post('/approvals/advance', requireFinanceRole('manager', 'finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const { entityType, entityId, action, notes } = req.body;
    const actorId = req.reimbursementUser!.id;
    if (!approvalService.checkSoD(req.body.submitterId || '', actorId)) {
      return res.status(403).json({ error: 'Separation of duties violation: submitter cannot approve' });
    }
    const result = await approvalService.advanceStep(entityType, entityId, actorId, req.organizationId!, action, notes);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to advance approval' });
  }
});

router.post('/approvals/delegate', requireFinanceRole('manager', 'finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const { stepId, delegateToId } = req.body;
    const result = await approvalService.delegate(stepId, delegateToId, req.organizationId!, req.reimbursementUser!.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Delegation failed' });
  }
});

router.post('/approvals/escalate', requireFinanceRole('manager', 'finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const { stepId } = req.body;
    const result = await approvalService.escalate(stepId, req.organizationId!);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Escalation failed' });
  }
});

export default router;
