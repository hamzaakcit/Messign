import { query } from '../../db/index.js';
import { notificationService } from './notificationService.js';
import { auditService } from './auditService.js';

export interface SLAStatus {
  step_id: string;
  expense_id: string;
  elapsed_hours: number;
  deadline_hours: number;
  status: 'on_track' | 'warning' | 'overdue';
  reminder_sent: boolean;
  escalated: boolean;
}

export const slaService = {
  async getStatusForExpense(expenseId: string): Promise<SLAStatus | null> {
    const result = await query(
      `SELECT s.id AS step_id, s.entity_id AS expense_id,
              EXTRACT(EPOCH FROM (NOW() - s.created_at)) / 3600 AS elapsed_hours,
              COALESCE(s.sla_deadline_hours, 48) AS deadline_hours,
              COALESCE(s.sla_reminder_sent, FALSE) AS reminder_sent,
              COALESCE(s.sla_escalated, FALSE) AS escalated
       FROM approval_steps s
       WHERE s.entity_type = 'expense' AND s.entity_id = $1 AND s.status = 'pending'
       ORDER BY s.step_order LIMIT 1`,
      [expenseId],
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    const elapsed = parseFloat(row.elapsed_hours);
    const deadline = parseInt(row.deadline_hours);
    const pct = elapsed / deadline;
    let status: SLAStatus['status'] = 'on_track';
    if (pct >= 1) status = 'overdue';
    else if (pct >= 0.75) status = 'warning';

    return {
      step_id: row.step_id,
      expense_id: row.expense_id,
      elapsed_hours: Math.round(elapsed),
      deadline_hours: deadline,
      status,
      reminder_sent: row.reminder_sent,
      escalated: row.escalated,
    };
  },

  async getOverdueSteps(orgId: string): Promise<SLAStatus[]> {
    const result = await query(
      `SELECT s.id AS step_id, s.entity_id AS expense_id,
              EXTRACT(EPOCH FROM (NOW() - s.created_at)) / 3600 AS elapsed_hours,
              COALESCE(s.sla_deadline_hours, 48) AS deadline_hours,
              COALESCE(s.sla_reminder_sent, FALSE) AS reminder_sent,
              COALESCE(s.sla_escalated, FALSE) AS escalated
       FROM approval_steps s
       JOIN reimbursement_requests r ON r.id = s.entity_id
       WHERE r.organization_id = $1
         AND s.entity_type = 'expense'
         AND s.status = 'pending'
         AND EXTRACT(EPOCH FROM (NOW() - s.created_at)) / 3600 > COALESCE(s.sla_deadline_hours, 48)
       ORDER BY s.created_at ASC`,
      [orgId],
    );
    return result.rows.map((row: Record<string, unknown>) => {
      const elapsed = parseFloat(row.elapsed_hours as string);
      const deadline = parseInt(row.deadline_hours as string);
      return {
        step_id: row.step_id as string,
        expense_id: row.expense_id as string,
        elapsed_hours: Math.round(elapsed),
        deadline_hours: deadline,
        status: 'overdue' as const,
        reminder_sent: row.reminder_sent as boolean,
        escalated: row.escalated as boolean,
      };
    });
  },

  async getSLAMetrics(orgId: string) {
    const total = await query(
      `SELECT COUNT(*) as total FROM approval_steps s
       JOIN reimbursement_requests r ON r.id = s.entity_id
       WHERE r.organization_id = $1 AND s.entity_type = 'expense'
         AND s.created_at >= NOW() - INTERVAL '30 days'`,
      [orgId],
    );
    const onTime = await query(
      `SELECT COUNT(*) as count FROM approval_steps s
       JOIN reimbursement_requests r ON r.id = s.entity_id
       WHERE r.organization_id = $1 AND s.entity_type = 'expense'
         AND s.status IN ('approved', 'rejected')
         AND s.created_at >= NOW() - INTERVAL '30 days'
         AND EXTRACT(EPOCH FROM (COALESCE(s.decision_at, NOW()) - s.created_at)) / 3600 <= COALESCE(s.sla_deadline_hours, 48)`,
      [orgId],
    );
    const overdue = await query(
      `SELECT COUNT(*) as count FROM approval_steps s
       JOIN reimbursement_requests r ON r.id = s.entity_id
       WHERE r.organization_id = $1 AND s.entity_type = 'expense'
         AND s.status = 'pending'
         AND EXTRACT(EPOCH FROM (NOW() - s.created_at)) / 3600 > COALESCE(s.sla_deadline_hours, 48)`,
      [orgId],
    );
    const avgTime = await query(
      `SELECT AVG(EXTRACT(EPOCH FROM (COALESCE(s.decision_at, NOW()) - s.created_at)) / 3600) as avg_hours
       FROM approval_steps s
       JOIN reimbursement_requests r ON r.id = s.entity_id
       WHERE r.organization_id = $1 AND s.entity_type = 'expense'
         AND s.status IN ('approved', 'rejected')
         AND s.created_at >= NOW() - INTERVAL '30 days'`,
      [orgId],
    );

    const totalCount = parseInt(total.rows[0]?.total ?? '0');
    const onTimeCount = parseInt(onTime.rows[0]?.count ?? '0');

    return {
      total_steps_30d: totalCount,
      on_time_count: onTimeCount,
      overdue_count: parseInt(overdue.rows[0]?.count ?? '0'),
      compliance_rate: totalCount > 0 ? Math.round((onTimeCount / totalCount) * 100) : 100,
      avg_resolution_hours: parseFloat(avgTime.rows[0]?.avg_hours ?? '0').toFixed(1),
    };
  },

  async checkAndEscalate(orgId: string) {
    const pendingSteps = await query(
      `SELECT s.*, r.organization_id, r.title AS expense_title,
              EXTRACT(EPOCH FROM (NOW() - s.created_at)) / 3600 AS elapsed_hours
       FROM approval_steps s
       JOIN reimbursement_requests r ON r.id = s.entity_id
       WHERE r.organization_id = $1
         AND s.entity_type = 'expense'
         AND s.status = 'pending'
       ORDER BY s.created_at ASC`,
      [orgId],
    );

    let reminders = 0;
    let escalations = 0;

    for (const step of pendingSteps.rows) {
      const elapsed = parseFloat(step.elapsed_hours);
      const deadline = step.sla_deadline_hours || 48;
      const pct = elapsed / deadline;

      if (pct >= 0.75 && pct < 1 && !step.sla_reminder_sent && step.assigned_to) {
        await query('UPDATE approval_steps SET sla_reminder_sent = TRUE WHERE id = $1', [step.id]);
        await notificationService.create({
          organization_id: orgId,
          recipient_id: step.assigned_to,
          type: 'sla.reminder',
          title: 'Approval Deadline Approaching',
          message: `"${step.expense_title}" needs your approval within ${Math.round(deadline - elapsed)}h.`,
          entity_type: 'expense',
          entity_id: step.entity_id,
          priority: 'high',
        });
        reminders++;
      }

      if (pct >= 1 && !step.sla_escalated) {
        const admin = await query(
          `SELECT id FROM reimbursement_users WHERE organization_id = $1 AND role = 'admin' AND id != $2 LIMIT 1`,
          [orgId, step.assigned_to],
        );
        const escalateTo = admin.rows[0]?.id;
        if (escalateTo) {
          await query(
            `UPDATE approval_steps SET sla_escalated = TRUE, escalated_at = NOW(), assigned_to = $1 WHERE id = $2`,
            [escalateTo, step.id],
          );
          await notificationService.create({
            organization_id: orgId,
            recipient_id: escalateTo,
            type: 'sla.escalation',
            title: 'Overdue Approval Escalated',
            message: `"${step.expense_title}" has exceeded its SLA (${Math.round(elapsed)}h / ${deadline}h) and requires immediate attention.`,
            entity_type: 'expense',
            entity_id: step.entity_id,
            priority: 'urgent',
          });
          await auditService.log({
            organization_id: orgId,
            event_type: 'sla.escalated',
            event_category: 'approval',
            actor_type: 'system',
            entity_type: 'expense',
            entity_id: step.entity_id,
            changes: { escalated_to: escalateTo, elapsed_hours: Math.round(elapsed), deadline_hours: deadline },
          });
          escalations++;
        }
      }
    }

    return { reminders, escalations };
  },
};
