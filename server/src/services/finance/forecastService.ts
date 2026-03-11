import { query } from '../../db/index.js';

interface BudgetForecast {
  budget_id: string;
  department: string;
  allocated_amount: number;
  spent_so_far: number;
  days_elapsed: number;
  days_remaining: number;
  daily_burn_rate: number;
  projected_total: number;
  projected_utilization: number;
  will_exceed: boolean;
  estimated_exhaust_date: string | null;
  confidence: number;
}

interface PaymentForecast {
  month: string;
  expected_payables: number;
  expected_receivables: number;
  net_cashflow: number;
  invoice_count: number;
}

export const forecastService = {
  async forecastBudgets(orgId: string): Promise<BudgetForecast[]> {
    const budgets = await query(
      `SELECT b.*,
              COALESCE((SELECT SUM(original_amount) FROM reimbursement_requests r
                        WHERE r.organization_id = b.organization_id
                        AND r.status IN ('approved', 'paid', 'reimbursed')
                        AND r.expense_date >= b.period_start AND r.expense_date <= b.period_end
                        AND r.department = b.department), 0) as spent
       FROM finance_budgets b
       WHERE b.organization_id = $1 AND b.is_active = TRUE`,
      [orgId],
    );

    return budgets.rows.map((b: Record<string, unknown>) => {
      const start = new Date(b.period_start as string);
      const end = new Date(b.period_end as string);
      const now = new Date();
      const totalDays = Math.max(1, (end.getTime() - start.getTime()) / 86400000);
      const elapsed = Math.max(1, (now.getTime() - start.getTime()) / 86400000);
      const remaining = Math.max(0, (end.getTime() - now.getTime()) / 86400000);
      const allocated = parseFloat(String(b.allocated_amount));
      const spent = parseFloat(String(b.spent));
      const dailyRate = spent / elapsed;
      const projected = spent + dailyRate * remaining;
      const utilization = projected / allocated;

      let exhaustDate: string | null = null;
      if (dailyRate > 0) {
        const daysLeft = (allocated - spent) / dailyRate;
        if (daysLeft > 0 && daysLeft < remaining) {
          const d = new Date(now);
          d.setDate(d.getDate() + Math.ceil(daysLeft));
          exhaustDate = d.toISOString().split('T')[0];
        }
      }

      const confidence = Math.min(0.95, 0.5 + (elapsed / totalDays) * 0.45);

      return {
        budget_id: b.id as string,
        department: b.department as string,
        allocated_amount: allocated,
        spent_so_far: spent,
        days_elapsed: Math.round(elapsed),
        days_remaining: Math.round(remaining),
        daily_burn_rate: Math.round(dailyRate * 100) / 100,
        projected_total: Math.round(projected * 100) / 100,
        projected_utilization: Math.round(utilization * 1000) / 1000,
        will_exceed: utilization > 1,
        estimated_exhaust_date: exhaustDate,
        confidence: Math.round(confidence * 100) / 100,
      };
    });
  },

  async forecastPayments(orgId: string, months = 3): Promise<PaymentForecast[]> {
    const result = await query(
      `SELECT
         TO_CHAR(due_date, 'YYYY-MM') as month,
         SUM(CASE WHEN invoice_type = 'payable' THEN grand_total ELSE 0 END) as payables,
         SUM(CASE WHEN invoice_type = 'receivable' THEN grand_total ELSE 0 END) as receivables,
         COUNT(*) as invoice_count
       FROM invoices
       WHERE organization_id = $1
         AND (is_deleted IS NULL OR is_deleted = FALSE)
         AND status IN ('sent', 'pending', 'approved')
         AND due_date >= CURRENT_DATE
         AND due_date < CURRENT_DATE + ($2 || ' months')::INTERVAL
       GROUP BY TO_CHAR(due_date, 'YYYY-MM')
       ORDER BY month`,
      [orgId, months],
    );

    return result.rows.map((r: Record<string, unknown>) => ({
      month: r.month as string,
      expected_payables: parseFloat(String(r.payables ?? 0)),
      expected_receivables: parseFloat(String(r.receivables ?? 0)),
      net_cashflow: parseFloat(String(r.receivables ?? 0)) - parseFloat(String(r.payables ?? 0)),
      invoice_count: parseInt(String(r.invoice_count ?? 0)),
    }));
  },
};
