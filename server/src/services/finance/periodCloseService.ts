import { query, getClient } from '../../db/index.js';
import { auditService } from './auditService.js';

const DEFAULT_TASKS = [
  { key: 'review_expenses', label: 'Review all pending expenses', order: 1 },
  { key: 'approve_invoices', label: 'Approve/finalize all draft invoices', order: 2 },
  { key: 'reconcile_payments', label: 'Verify all payments are recorded', order: 3 },
  { key: 'review_journal_entries', label: 'Review auto-generated journal entries', order: 4 },
  { key: 'verify_gl_balances', label: 'Verify GL account balances match', order: 5 },
  { key: 'run_pl_report', label: 'Generate and review P&L report', order: 6 },
  { key: 'review_tax', label: 'Review tax obligations', order: 7 },
  { key: 'manager_signoff', label: 'Manager sign-off', order: 8 },
];

export const periodCloseService = {
  async list(orgId: string) {
    const result = await query(
      `SELECT pc.*,
         (SELECT json_agg(json_build_object(
           'id', t.id, 'task_key', t.task_key, 'label', t.label,
           'is_completed', t.is_completed, 'completed_at', t.completed_at,
           'completed_by', t.completed_by, 'sort_order', t.sort_order
         ) ORDER BY t.sort_order)
         FROM finance_period_close_tasks t WHERE t.period_close_id = pc.id) AS tasks
       FROM finance_period_closes pc
       WHERE pc.organization_id = $1
       ORDER BY pc.period DESC`,
      [orgId],
    );
    return result.rows;
  },

  async getOrCreate(orgId: string, period: string) {
    const existing = await query(
      `SELECT pc.*,
         (SELECT json_agg(json_build_object(
           'id', t.id, 'task_key', t.task_key, 'label', t.label,
           'is_completed', t.is_completed, 'completed_at', t.completed_at,
           'completed_by', t.completed_by, 'sort_order', t.sort_order
         ) ORDER BY t.sort_order)
         FROM finance_period_close_tasks t WHERE t.period_close_id = pc.id) AS tasks
       FROM finance_period_closes pc
       WHERE pc.organization_id = $1 AND pc.period = $2`,
      [orgId, period],
    );
    if (existing.rows[0]) return existing.rows[0];

    const client = await getClient();
    try {
      await client.query('BEGIN');

      const pc = await client.query(
        `INSERT INTO finance_period_closes (organization_id, period, status)
         VALUES ($1, $2, 'open')
         ON CONFLICT (organization_id, period) DO UPDATE SET organization_id = $1
         RETURNING *`,
        [orgId, period],
      );

      for (const task of DEFAULT_TASKS) {
        await client.query(
          `INSERT INTO finance_period_close_tasks (period_close_id, task_key, label, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [pc.rows[0].id, task.key, task.label, task.order],
        );
      }

      await client.query('COMMIT');

      return this.getOrCreate(orgId, period);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async updateTask(orgId: string, periodCloseId: string, taskKey: string, completed: boolean, userId: string) {
    const pc = await query(
      `SELECT * FROM finance_period_closes WHERE id = $1 AND organization_id = $2`,
      [periodCloseId, orgId],
    );
    if (!pc.rows[0]) throw new Error('Period close not found');
    if (pc.rows[0].status === 'locked') throw new Error('Period is locked');
    if (pc.rows[0].status === 'closed') throw new Error('Period is closed');

    if (pc.rows[0].status === 'open') {
      await query(
        `UPDATE finance_period_closes SET status = 'in_progress' WHERE id = $1`,
        [periodCloseId],
      );
    }

    const result = await query(
      `UPDATE finance_period_close_tasks
       SET is_completed = $1,
           completed_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
           completed_by = CASE WHEN $1 THEN $2::UUID ELSE NULL END
       WHERE period_close_id = $3 AND task_key = $4
       RETURNING *`,
      [completed, userId, periodCloseId, taskKey],
    );
    if (!result.rows[0]) throw new Error('Task not found');
    return result.rows[0];
  },

  async closePeriod(orgId: string, periodCloseId: string, userId: string) {
    const pc = await query(
      `SELECT pc.*,
         (SELECT COUNT(*) FILTER (WHERE NOT t.is_completed) FROM finance_period_close_tasks t WHERE t.period_close_id = pc.id) AS incomplete_count
       FROM finance_period_closes pc
       WHERE pc.id = $1 AND pc.organization_id = $2`,
      [periodCloseId, orgId],
    );
    if (!pc.rows[0]) throw new Error('Period close not found');
    if (pc.rows[0].status === 'locked') throw new Error('Period is already locked');
    if (pc.rows[0].status === 'closed') throw new Error('Period is already closed');
    if (parseInt(pc.rows[0].incomplete_count) > 0) throw new Error('All tasks must be completed before closing');

    const period = pc.rows[0].period;
    const plData = await query(
      `SELECT g.type,
         COALESCE(SUM(CASE WHEN g.type = 'revenue' THEN jl.credit_amount - jl.debit_amount
                            ELSE jl.debit_amount - jl.credit_amount END), 0) AS amount
       FROM finance_gl_accounts g
       JOIN finance_journal_lines jl ON jl.gl_account_id = g.id
       JOIN finance_journal_entries je ON je.id = jl.journal_entry_id
       WHERE g.organization_id = $1 AND je.status = 'posted' AND je.period = $2
         AND g.type IN ('revenue', 'expense')
       GROUP BY g.type`,
      [orgId, period],
    );

    let revTotal = 0, expTotal = 0;
    for (const r of plData.rows) {
      if (r.type === 'revenue') revTotal = parseFloat(r.amount);
      else expTotal = parseFloat(r.amount);
    }

    const result = await query(
      `UPDATE finance_period_closes
       SET status = 'closed', closed_at = NOW(), closed_by = $1,
           revenue_total = $2, expense_total = $3, net_income = $4
       WHERE id = $5
       RETURNING *`,
      [userId, revTotal, expTotal, revTotal - expTotal, periodCloseId],
    );

    auditService.log({
      organization_id: orgId,
      event_type: 'period.closed',
      event_category: 'accounting',
      actor_type: 'user',
      actor_id: userId,
      entity_type: 'period_close',
      entity_id: periodCloseId,
      changes: { period, revenue: revTotal, expenses: expTotal, net: revTotal - expTotal },
    }).catch(() => {});

    return result.rows[0];
  },

  async lockPeriod(orgId: string, periodCloseId: string, userId: string) {
    const result = await query(
      `UPDATE finance_period_closes
       SET status = 'locked', locked_at = NOW(), locked_by = $1
       WHERE id = $2 AND organization_id = $3 AND status = 'closed'
       RETURNING *`,
      [userId, periodCloseId, orgId],
    );
    if (!result.rows[0]) throw new Error('Period not found or not in closed status');

    auditService.log({
      organization_id: orgId,
      event_type: 'period.locked',
      event_category: 'accounting',
      actor_type: 'user',
      actor_id: userId,
      entity_type: 'period_close',
      entity_id: periodCloseId,
    }).catch(() => {});

    return result.rows[0];
  },

  async reopenPeriod(orgId: string, periodCloseId: string, userId: string) {
    const pc = await query(
      `SELECT * FROM finance_period_closes WHERE id = $1 AND organization_id = $2`,
      [periodCloseId, orgId],
    );
    if (!pc.rows[0]) throw new Error('Period close not found');
    if (pc.rows[0].status === 'locked') throw new Error('Locked periods cannot be reopened');

    const result = await query(
      `UPDATE finance_period_closes
       SET status = 'in_progress', closed_at = NULL, closed_by = NULL,
           revenue_total = NULL, expense_total = NULL, net_income = NULL
       WHERE id = $1
       RETURNING *`,
      [periodCloseId],
    );

    auditService.log({
      organization_id: orgId,
      event_type: 'period.reopened',
      event_category: 'accounting',
      actor_type: 'user',
      actor_id: userId,
      entity_type: 'period_close',
      entity_id: periodCloseId,
    }).catch(() => {});

    return result.rows[0];
  },
};
