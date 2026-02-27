import { query } from '../../db/index.js';

export const analyticsService = {
  async getDashboard(orgId: string) {
    const [expenses, budgets, invoices, payments] = await Promise.all([
      query<{ total: string; count: string; pending_count: string; pending_total: string; avg_processing_days: string }>(
        `SELECT
           COALESCE(SUM(original_amount), 0) as total,
           COUNT(*) as count,
           COUNT(*) FILTER (WHERE status IN ('submitted','manager_review','finance_review','ai_reviewing')) as pending_count,
           COALESCE(SUM(original_amount) FILTER (WHERE status IN ('submitted','manager_review','finance_review','ai_reviewing')), 0) as pending_total,
           COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(approved_at, NOW()) - submitted_at))/86400) FILTER (WHERE submitted_at IS NOT NULL), 0) as avg_processing_days
         FROM reimbursement_requests
         WHERE organization_id = $1 AND is_deleted = FALSE
           AND created_at >= DATE_TRUNC('month', NOW())`,
        [orgId],
      ),
      query<{ total_allocated: string; total_spent: string; critical_count: string }>(
        `SELECT
           COALESCE(SUM(allocated_amount), 0) as total_allocated,
           COALESCE(SUM(COALESCE(spent_amount, 0)), 0) as total_spent,
           COUNT(*) FILTER (WHERE COALESCE(spent_amount, 0) / NULLIF(allocated_amount, 0) * 100 >= COALESCE(critical_threshold, 95)) as critical_count
         FROM budgets
         WHERE organization_id = $1 AND status = 'active'`,
        [orgId],
      ),
      query<{ total_outstanding: string; overdue_count: string; overdue_total: string }>(
        `SELECT
           COALESCE(SUM(grand_total - COALESCE(amount_paid, 0)) FILTER (WHERE status IN ('sent','partially_paid')), 0) as total_outstanding,
           COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count,
           COALESCE(SUM(grand_total) FILTER (WHERE status = 'overdue'), 0) as overdue_total
         FROM invoices
         WHERE organization_id = $1 AND (is_deleted IS NULL OR is_deleted = FALSE)`,
        [orgId],
      ),
      query<{ total_paid_month: string; payment_count: string }>(
        `SELECT
           COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) as total_paid_month,
           COUNT(*) FILTER (WHERE status = 'completed') as payment_count
         FROM finance_payments
         WHERE organization_id = $1 AND created_at >= DATE_TRUNC('month', NOW())`,
        [orgId],
      ),
    ]);

    return {
      expenses: {
        total_this_month: parseFloat(expenses.rows[0]?.total ?? '0'),
        count_this_month: parseInt(expenses.rows[0]?.count ?? '0'),
        pending_count: parseInt(expenses.rows[0]?.pending_count ?? '0'),
        pending_total: parseFloat(expenses.rows[0]?.pending_total ?? '0'),
        avg_processing_days: parseFloat(expenses.rows[0]?.avg_processing_days ?? '0'),
      },
      budgets: {
        total_allocated: parseFloat(budgets.rows[0]?.total_allocated ?? '0'),
        total_spent: parseFloat(budgets.rows[0]?.total_spent ?? '0'),
        critical_count: parseInt(budgets.rows[0]?.critical_count ?? '0'),
      },
      invoices: {
        total_outstanding: parseFloat(invoices.rows[0]?.total_outstanding ?? '0'),
        overdue_count: parseInt(invoices.rows[0]?.overdue_count ?? '0'),
        overdue_total: parseFloat(invoices.rows[0]?.overdue_total ?? '0'),
      },
      payments: {
        total_paid_month: parseFloat(payments.rows[0]?.total_paid_month ?? '0'),
        payment_count: parseInt(payments.rows[0]?.payment_count ?? '0'),
      },
    };
  },

  async getSpendingTrend(orgId: string, months = 6) {
    const result = await query(
      `SELECT
         DATE_TRUNC('month', expense_date) as month,
         SUM(original_amount) as total,
         COUNT(*) as count,
         AVG(original_amount) as avg_amount
       FROM reimbursement_requests
       WHERE organization_id = $1 AND is_deleted = FALSE
         AND expense_date >= NOW() - INTERVAL '1 month' * $2
       GROUP BY DATE_TRUNC('month', expense_date)
       ORDER BY month`,
      [orgId, months],
    );
    return result.rows;
  },

  async getSpendingByCategory(orgId: string) {
    const result = await query(
      `SELECT
         r.category_slug,
         ec.name as category_name,
         SUM(r.original_amount) as total,
         COUNT(*) as count
       FROM reimbursement_requests r
       LEFT JOIN expense_categories ec ON ec.slug = r.category_slug
       WHERE r.organization_id = $1 AND r.is_deleted = FALSE
         AND r.expense_date >= DATE_TRUNC('month', NOW())
       GROUP BY r.category_slug, ec.name
       ORDER BY total DESC`,
      [orgId],
    );
    return result.rows;
  },

  async getAIMetrics(orgId: string) {
    const result = await query<{
      total_decisions: string; avg_confidence: string; auto_approved: string;
      flagged: string; overridden: string; avg_processing_ms: string;
    }>(
      `SELECT
         COUNT(*) as total_decisions,
         COALESCE(AVG(confidence_score), 0) as avg_confidence,
         COUNT(*) FILTER (WHERE decision_type = 'auto_approve') as auto_approved,
         COUNT(*) FILTER (WHERE decision_type = 'flag_for_review') as flagged,
         COUNT(*) FILTER (WHERE was_overridden = TRUE) as overridden,
         COALESCE(AVG(processing_time_ms), 0) as avg_processing_ms
       FROM finance_dora_decisions
       WHERE organization_id = $1 AND created_at >= DATE_TRUNC('month', NOW())`,
      [orgId],
    );
    const r = result.rows[0];
    return {
      total_decisions: parseInt(r?.total_decisions ?? '0'),
      avg_confidence: parseFloat(r?.avg_confidence ?? '0'),
      auto_approved: parseInt(r?.auto_approved ?? '0'),
      flagged: parseInt(r?.flagged ?? '0'),
      overridden: parseInt(r?.overridden ?? '0'),
      avg_processing_ms: parseFloat(r?.avg_processing_ms ?? '0'),
    };
  },
};
