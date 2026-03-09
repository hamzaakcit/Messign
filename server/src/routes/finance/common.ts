import { Router } from 'express';
import type { Response } from 'express';
import { query } from '../../db/index.js';
import { type ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { requireFinanceRole } from '../../middleware/financeRbac.js';
import { expenseService } from '../../services/finance/expenseService.js';
import { auditService } from '../../services/finance/auditService.js';
import { notificationService } from '../../services/finance/notificationService.js';
import { CATEGORY_DEPARTMENT_MAP } from '../../services/finance/categoryDepartmentMap.js';

const router = Router();

router.get('/category-department-map', async (_req: ReimbursementRequest, res: Response) => {
  try {
    res.json(CATEGORY_DEPARTMENT_MAP);
  } catch (err) {
    console.error('[finance/category-department-map]', err);
    res.status(500).json({ error: 'Failed to load category-department map' });
  }
});

// Returns the current user's finance profile (role, id, etc.)
router.get('/me', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    res.json({ id: user.id, role: user.role, email: user.email, full_name: user.fullName });
  } catch (err) {
    console.error('[finance/me]', err);
    res.status(500).json({ error: 'Failed to load user profile' });
  }
});

router.get('/dashboard', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const metrics = await expenseService.getDashboardMetrics(orgId, user.id, user.role);
    res.json(metrics);
  } catch (err) {
    console.error('[finance/dashboard]', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

router.get('/notifications', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const unreadOnly = req.query.unread === 'true';
    const notifications = await notificationService.getForUser(user.id, 50, 0, unreadOnly);
    const unreadCount = await notificationService.getUnreadCount(user.id);
    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error('[finance/notifications GET]', err);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

router.put('/notifications/:id/read', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    await notificationService.markRead(req.params.id, user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notification' });
  }
});

router.put('/notifications/read-all', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    await notificationService.markAllRead(user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark all read' });
  }
});

router.get('/audit-log', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const log = await auditService.getLog(orgId, {
      entity_type: req.query.entity_type as string | undefined,
      entity_id: req.query.entity_id as string | undefined,
      actor_type: req.query.actor_type as string | undefined,
      event_category: req.query.event_category as string | undefined,
      severity: req.query.severity as string | undefined,
      date_from: req.query.date_from as string | undefined,
      date_to: req.query.date_to as string | undefined,
      search: req.query.search as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    });
    res.json(log);
  } catch (err) {
    console.error('[finance/audit-log]', err);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

router.get('/audit-log/verify-chain', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const verification = await auditService.verifyHashChain(orgId, 100);
    res.json(verification);
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify chain' });
  }
});

router.get('/activity', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const limit = parseInt(req.query.limit as string) || 10;
    const expenses = await query(
      `SELECT id, title, original_amount AS amount, status, created_at, 'expense' AS type
       FROM reimbursement_requests WHERE organization_id = $1 AND is_deleted = FALSE
       ORDER BY created_at DESC LIMIT $2`,
      [orgId, limit],
    );
    const invoices = await query(
      `SELECT id, invoice_number AS title, grand_total AS amount, status, created_at, 'invoice' AS type
       FROM invoices WHERE organization_id = $1 AND (is_deleted IS NULL OR is_deleted = FALSE)
       ORDER BY created_at DESC LIMIT $2`,
      [orgId, limit],
    );
    const all = [...expenses.rows, ...invoices.rows]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
    res.json(all);
  } catch (err) {
    console.error('[finance/activity]', err);
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

router.get('/pending-approvals', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const result = await query(
      `SELECT r.id, r.title, r.original_amount AS amount, u.full_name AS submitted_by_name, r.created_at, 'expense' AS type
       FROM reimbursement_requests r
       LEFT JOIN reimbursement_users u ON u.id = r.submitted_by
       INNER JOIN approval_steps s ON s.reimbursement_id = r.id AND s.status = 'pending'
       WHERE r.organization_id = $1 AND r.is_deleted = FALSE
         AND r.status IN ('submitted', 'pending_approval', 'manager_review', 'ai_flagged', 'finance_review')
         AND (s.assigned_to = $2 OR (s.step_type IN ('manager_approval', 'finance_review') AND EXISTS (
           SELECT 1 FROM reimbursement_users u2 WHERE u2.id = $2 AND u2.role IN ('manager', 'admin', 'finance')
         )))
       ORDER BY r.created_at DESC LIMIT 20`,
      [orgId, user.id],
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[finance/pending-approvals]', err);
    res.status(500).json({ error: 'Failed to load pending approvals' });
  }
});

export default router;
