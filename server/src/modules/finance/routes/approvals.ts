import { Router } from 'express';
import { query } from '../../../db/index.js';
import { reimbursementAuth, requireRole, type ReimbursementRequest } from '../../../middleware/reimbursementAuth.js';
import { emitToUser } from '../../../sockets/index.js';

const router = Router();
router.use(reimbursementAuth);

router.get('/', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const orgId = req.organizationId!;
  try {
    if (user.role === 'admin' || user.role === 'finance') {
      const result = await query(
        `SELECT a.id AS step_id, a.reimbursement_id, a.step_order, a.step_type, a.assigned_to, a.status AS step_status, a.decision_at, a.decision_notes, a.created_at,
                r.title, r.description, r.original_amount, r.original_currency, r.converted_amount, r.status AS request_status, r.expense_date, r.submitted_at,
                u.full_name AS submitter_name, u.email AS submitter_email,
                c.name AS category_name
         FROM approval_steps a
         JOIN reimbursement_requests r ON r.id = a.reimbursement_id
         JOIN reimbursement_users u ON u.id = r.submitted_by
         LEFT JOIN expense_categories c ON c.id = r.category_id
         WHERE r.organization_id = $1 AND a.status = 'pending'
         ORDER BY a.created_at`,
        [orgId]
      );
      return res.json(result.rows);
    }
    if (user.role === 'manager') {
      const result = await query(
        `SELECT a.id AS step_id, a.reimbursement_id, a.step_order, a.step_type, a.assigned_to, a.status AS step_status, a.decision_at, a.decision_notes, a.created_at,
                r.title, r.description, r.original_amount, r.original_currency, r.converted_amount, r.status AS request_status, r.expense_date, r.submitted_at,
                u.full_name AS submitter_name, u.email AS submitter_email,
                c.name AS category_name
         FROM approval_steps a
         JOIN reimbursement_requests r ON r.id = a.reimbursement_id
         JOIN reimbursement_users u ON u.id = r.submitted_by
         LEFT JOIN expense_categories c ON c.id = r.category_id
         WHERE r.organization_id = $1 AND a.status = 'pending' AND (a.assigned_to = $2 OR a.step_type = 'manager_approval')
         ORDER BY a.created_at`,
        [orgId, user.id]
      );
      return res.json(result.rows);
    }
    res.json([]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list approvals' });
  }
});

router.get('/counts', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const orgId = req.organizationId!;
  try {
    if (user.role === 'admin' || user.role === 'finance') {
      const result = await query(
        `SELECT COUNT(*) AS count FROM approval_steps a
         JOIN reimbursement_requests r ON r.id = a.reimbursement_id
         WHERE r.organization_id = $1 AND a.status = 'pending'`,
        [orgId]
      );
      const count = parseInt(result.rows[0]?.count ?? '0', 10);
      return res.json({ pendingApprovalsCount: count });
    }
    if (user.role === 'manager') {
      const result = await query(
        `SELECT COUNT(*) AS count FROM approval_steps a
         JOIN reimbursement_requests r ON r.id = a.reimbursement_id
         WHERE r.organization_id = $1 AND a.status = 'pending' AND a.assigned_to = $2`,
        [orgId, user.id]
      );
      const count = parseInt(result.rows[0]?.count ?? '0', 10);
      return res.json({ pendingApprovalsCount: count });
    }
    res.json({ pendingApprovalsCount: 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get counts' });
  }
});

router.post('/:stepId/approve', requireRole('manager', 'finance', 'admin'), async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const { stepId } = req.params;
  const { decision_notes } = req.body || {};
  try {
    const stepResult = await query(
      `SELECT a.id, a.reimbursement_id, a.step_order, a.step_type, a.assigned_to, a.status, r.status AS request_status, r.organization_id
       FROM approval_steps a
       JOIN reimbursement_requests r ON r.id = a.reimbursement_id
       WHERE a.id = $1`,
      [stepId]
    );
    const step = stepResult.rows[0];
    if (!step) {
      res.status(404).json({ error: 'Step not found' });
      return;
    }
    if (step.status !== 'pending') {
      res.status(400).json({ error: 'Step already decided' });
      return;
    }
    const canAct = user.role === 'admin' || step.assigned_to === user.id || (user.role === 'finance' && step.step_type === 'finance_approval');
    if (!canAct) {
      res.status(403).json({ error: 'Not assigned to this step' });
      return;
    }
    await query(
      `UPDATE approval_steps SET status = 'approved', decision_at = NOW(), decision_notes = $1 WHERE id = $2`,
      [decision_notes || null, stepId]
    );
    let nextStatus = 'finance_review';
    if (step.step_type === 'manager_approval') {
      nextStatus = 'finance_review';
    } else if (step.step_type === 'finance_approval') {
      nextStatus = 'approved';
    }
    await query(
      `UPDATE reimbursement_requests SET status = $1, updated_at = NOW() WHERE id = $2`,
      [nextStatus, step.reimbursement_id]
    );
    await query(
      `INSERT INTO reimbursement_activity_log (reimbursement_id, user_id, action, action_details) VALUES ($1, $2, 'approved', $3)`,
      [step.reimbursement_id, user.id, JSON.stringify({ step_type: step.step_type, step_id: stepId })]
    );
    const submitterResult = await query(
      `SELECT u.auth_user_id, r.title FROM reimbursement_requests r JOIN reimbursement_users u ON u.id = r.submitted_by WHERE r.id = $1`,
      [step.reimbursement_id]
    );
    const submitter = submitterResult.rows[0] as { auth_user_id: string | null; title: string } | undefined;
    if (submitter?.auth_user_id) {
      emitToUser(submitter.auth_user_id, 'notification:new', {
        userId: submitter.auth_user_id,
        type: 'reimbursement_approved',
        title: 'Reimbursement approved',
        message: `Your request "${submitter.title || 'Reimbursement'}" was approved.`,
        actionUrl: `/reimbursements/${step.reimbursement_id}`,
        actionLabel: 'View',
      });
    }
    const updated = await query(`SELECT * FROM reimbursement_requests WHERE id = $1`, [step.reimbursement_id]);
    res.json(updated.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to approve' });
  }
});

router.post('/:stepId/reject', requireRole('manager', 'finance', 'admin'), async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const { stepId } = req.params;
  const { decision_notes } = req.body || {};
  try {
    const stepResult = await query(
      `SELECT a.id, a.reimbursement_id, a.step_order, a.step_type, a.assigned_to, a.status
       FROM approval_steps a
       JOIN reimbursement_requests r ON r.id = a.reimbursement_id
       WHERE a.id = $1`,
      [stepId]
    );
    const step = stepResult.rows[0];
    if (!step) {
      res.status(404).json({ error: 'Step not found' });
      return;
    }
    if (step.status !== 'pending') {
      res.status(400).json({ error: 'Step already decided' });
      return;
    }
    const canAct = user.role === 'admin' || step.assigned_to === user.id || (user.role === 'finance' && step.step_type === 'finance_approval');
    if (!canAct) {
      res.status(403).json({ error: 'Not assigned to this step' });
      return;
    }
    await query(
      `UPDATE approval_steps SET status = 'rejected', decision_at = NOW(), decision_notes = $1 WHERE id = $2`,
      [decision_notes || null, stepId]
    );
    await query(
      `UPDATE reimbursement_requests SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
      [step.reimbursement_id]
    );
    await query(
      `INSERT INTO reimbursement_activity_log (reimbursement_id, user_id, action, action_details) VALUES ($1, $2, 'rejected', $3)`,
      [step.reimbursement_id, user.id, JSON.stringify({ step_type: step.step_type, step_id: stepId, notes: decision_notes })]
    );
    const submitterResult = await query(
      `SELECT u.auth_user_id, r.title FROM reimbursement_requests r JOIN reimbursement_users u ON u.id = r.submitted_by WHERE r.id = $1`,
      [step.reimbursement_id]
    );
    const submitter = submitterResult.rows[0] as { auth_user_id: string | null; title: string } | undefined;
    if (submitter?.auth_user_id) {
      emitToUser(submitter.auth_user_id, 'notification:new', {
        userId: submitter.auth_user_id,
        type: 'reimbursement_rejected',
        title: 'Reimbursement rejected',
        message: `Your request "${submitter.title || 'Reimbursement'}" was rejected.`,
        actionUrl: `/reimbursements/${step.reimbursement_id}`,
        actionLabel: 'View',
      });
    }
    const updated = await query(`SELECT * FROM reimbursement_requests WHERE id = $1`, [step.reimbursement_id]);
    res.json(updated.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to reject' });
  }
});

router.post('/bulk', requireRole('manager', 'finance', 'admin'), async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const { step_ids, action } = req.body;
  if (!Array.isArray(step_ids) || step_ids.length === 0 || !['approve', 'reject'].includes(action)) {
    res.status(400).json({ error: 'step_ids (array) and action (approve|reject) required' });
    return;
  }
  const results: { stepId: string; success: boolean; error?: string }[] = [];
  for (const stepId of step_ids) {
    try {
      const stepResult = await query(
        `SELECT a.id, a.reimbursement_id, a.step_type, a.assigned_to, a.status FROM approval_steps a WHERE a.id = $1`,
        [stepId]
      );
      const step = stepResult.rows[0];
      if (!step || step.status !== 'pending') {
        results.push({ stepId, success: false, error: 'Invalid or already decided' });
        continue;
      }
      const canAct = user.role === 'admin' || step.assigned_to === user.id || (user.role === 'finance' && step.step_type === 'finance_approval');
      if (!canAct) {
        results.push({ stepId, success: false, error: 'Not assigned' });
        continue;
      }
      if (action === 'approve') {
        await query(`UPDATE approval_steps SET status = 'approved', decision_at = NOW() WHERE id = $1`, [stepId]);
        const nextStatus = step.step_type === 'finance_approval' ? 'approved' : 'finance_review';
        await query(`UPDATE reimbursement_requests SET status = $1, updated_at = NOW() WHERE id = $2`, [nextStatus, step.reimbursement_id]);
        await query(`INSERT INTO reimbursement_activity_log (reimbursement_id, user_id, action) VALUES ($1, $2, 'approved')`, [step.reimbursement_id, user.id]);
      } else {
        await query(`UPDATE approval_steps SET status = 'rejected', decision_at = NOW() WHERE id = $1`, [stepId]);
        await query(`UPDATE reimbursement_requests SET status = 'rejected', updated_at = NOW() WHERE id = $1`, [step.reimbursement_id]);
        await query(`INSERT INTO reimbursement_activity_log (reimbursement_id, user_id, action) VALUES ($1, $2, 'rejected')`, [step.reimbursement_id, user.id]);
      }
      const submitterResult = await query(
        `SELECT u.auth_user_id, r.title FROM reimbursement_requests r JOIN reimbursement_users u ON u.id = r.submitted_by WHERE r.id = $1`,
        [step.reimbursement_id]
      );
      const submitter = submitterResult.rows[0] as { auth_user_id: string | null; title: string } | undefined;
      if (submitter?.auth_user_id) {
        const notifType = action === 'approve' ? 'reimbursement_approved' : 'reimbursement_rejected';
        const notifTitle = action === 'approve' ? 'Reimbursement approved' : 'Reimbursement rejected';
        const notifMessage = action === 'approve'
          ? `Your request "${submitter.title || 'Reimbursement'}" was approved.`
          : `Your request "${submitter.title || 'Reimbursement'}" was rejected.`;
        emitToUser(submitter.auth_user_id, 'notification:new', {
          userId: submitter.auth_user_id,
          type: notifType,
          title: notifTitle,
          message: notifMessage,
          actionUrl: `/reimbursements/${step.reimbursement_id}`,
          actionLabel: 'View',
        });
      }
      results.push({ stepId, success: true });
    } catch (e) {
      results.push({ stepId, success: false, error: String(e) });
    }
  }
  res.json({ results });
});

export const approvalsRouter = router;
