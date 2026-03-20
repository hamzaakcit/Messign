import { registerTool } from '../../toolRegistry.js';
import { query } from '../../../../db/index.js';
import type { ToolContext, ToolResult } from '../../types.js';
import { resolveOrgIdForTool } from '../resolveOrgIdForTool.js';

registerTool({
  name: 'finance:get_spending_insights',
  metadata: {
    namespace: 'finance',
    name: 'get_spending_insights',
    summary: 'Spending insights: trends, top categories, anomalies.',
    tags: ['finance', 'spending', 'analytics'],
    alwaysLoaded: false,
    parameterHints: 'time_period?: string',
  },
  category: 'finance',
  description: 'Get aggregate spending analytics including totals by category, top vendors, and trends for the organization.',
  parameters: {
    type: 'object',
    properties: {
      period: { type: 'string', description: 'Time period: "month", "quarter", "year". Default: month.', enum: ['month', 'quarter', 'year'] },
      team_id: { type: 'string', description: 'Optional team ID to filter by.' },
    },
    required: [],
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const period = (args.period as string) ?? 'month';
    const intervalMap: Record<string, string> = { month: '1 month', quarter: '3 months', year: '1 year' };
    const interval = intervalMap[period] ?? '1 month';

    const orgId = await resolveOrgIdForTool(ctx);
    if (!orgId) return { success: false, data: null, summary: 'Organization not found.' };

    const params = [orgId, interval];
    const [byCategory, topExpenses, summary] = await Promise.all([
      query(
        `SELECT category_slug, COUNT(*) as count, SUM(original_amount) as total, AVG(original_amount) as avg
         FROM reimbursement_requests
         WHERE organization_id = $1 AND is_deleted = FALSE AND expense_date >= NOW() - $2::interval
         GROUP BY category_slug ORDER BY total DESC LIMIT 10`,
        params,
      ),
      query(
        `SELECT title, original_amount, category_slug, expense_date, status
         FROM reimbursement_requests
         WHERE organization_id = $1 AND is_deleted = FALSE AND expense_date >= NOW() - $2::interval
         ORDER BY original_amount DESC LIMIT 5`,
        params,
      ),
      query<{ total: string; count: string; avg: string }>(
        `SELECT SUM(original_amount) as total, COUNT(*) as count, AVG(original_amount) as avg
         FROM reimbursement_requests
         WHERE organization_id = $1 AND is_deleted = FALSE AND expense_date >= NOW() - $2::interval`,
        params,
      ),
    ]);

    const total = parseFloat(summary.rows[0]?.total ?? '0');
    const count = parseInt(summary.rows[0]?.count ?? '0');
    const avg = parseFloat(summary.rows[0]?.avg ?? '0');

    const categoryBreakdown = byCategory.rows.map((c) =>
      `${(c.category_slug ?? 'uncategorized').replace(/_/g, ' ')}: $${parseFloat(c.total).toLocaleString()} (${c.count} expenses)`
    ).join('\n');

    const topItems = topExpenses.rows.map((e) =>
      `$${parseFloat(e.original_amount).toLocaleString()} — ${e.title}`
    ).join('\n');

    return {
      success: true,
      data: { by_category: byCategory.rows, top_expenses: topExpenses.rows, total, count, avg },
      summary: `Spending insights (last ${period}):\nTotal: $${total.toLocaleString()} across ${count} expenses (avg: $${avg.toFixed(2)})\n\nBy category:\n${categoryBreakdown}\n\nTop expenses:\n${topItems}`,
      metadata: { source: 'reimbursement_requests', count },
    };
  },
});

registerTool({
  name: 'finance:analyze_spending_pattern',
  metadata: {
    namespace: 'finance',
    name: 'analyze_spending_pattern',
    summary: 'Analyze spending patterns: recurring, seasonal, outliers.',
    tags: ['finance', 'spending', 'patterns'],
    alwaysLoaded: false,
    parameterHints: 'time_period?: string',
  },
  category: 'finance',
  description: 'Detect anomalies and unusual patterns in spending. Identifies outliers and trend deviations.',
  parameters: {
    type: 'object',
    properties: {
      user_id: { type: 'string', description: 'Optional user ID to analyze specific person.' },
      category: { type: 'string', description: 'Optional category slug to analyze.' },
    },
    required: [],
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const orgId = await resolveOrgIdForTool(ctx);
    if (!orgId) return { success: false, data: null, summary: 'Organization not found.' };

    const conditions = ['organization_id = $1', 'is_deleted = FALSE', "expense_date >= NOW() - INTERVAL '3 months'"];
    const params: unknown[] = [orgId];
    let idx = 2;

    if (args.user_id) {
      conditions.push(`submitted_by = $${idx++}`);
      params.push(args.user_id);
    }
    if (args.category) {
      conditions.push(`category_slug = $${idx++}`);
      params.push(args.category);
    }

    const stats = await query<{ avg_amount: string; stddev: string; max_amount: string; count: string }>(
      `SELECT AVG(original_amount) as avg_amount, STDDEV(original_amount) as stddev,
              MAX(original_amount) as max_amount, COUNT(*) as count
       FROM reimbursement_requests WHERE ${conditions.join(' AND ')}`,
      params,
    );

    const avg = parseFloat(stats.rows[0]?.avg_amount ?? '0');
    const stddev = parseFloat(stats.rows[0]?.stddev ?? '0');
    const threshold = avg + 2 * stddev;

    const outliers = await query(
      `SELECT id, title, original_amount, expense_date, submitted_by, category_slug
       FROM reimbursement_requests
       WHERE ${conditions.join(' AND ')} AND original_amount > $${idx++}
       ORDER BY original_amount DESC LIMIT 10`,
      [...params, threshold],
    );

    const anomalies = outliers.rows.map((o: any) => ({
      ...o,
      deviation: ((parseFloat(o.original_amount) - avg) / stddev).toFixed(1),
    }));

    return {
      success: true,
      data: { avg, stddev, threshold, anomalies },
      summary: `Spending pattern analysis (3 months):\nAverage: $${avg.toFixed(2)}, Std Dev: $${stddev.toFixed(2)}\nOutlier threshold: $${threshold.toFixed(2)}\n${anomalies.length} anomalies detected: ${anomalies.map((a: any) => `"${a.title}" ($${parseFloat(a.original_amount).toLocaleString()}, ${a.deviation}σ)`).join(', ') || 'none'}`,
      metadata: { source: 'reimbursement_requests', count: anomalies.length },
    };
  },
});

registerTool({
  name: 'finance:get_finance_dashboard',
  metadata: {
    namespace: 'finance',
    name: 'get_finance_dashboard',
    summary: 'Finance dashboard: KPIs, pending approvals, budget status.',
    tags: ['finance', 'dashboard', 'kpis'],
    alwaysLoaded: false,
    parameterHints: '(none)',
  },
  category: 'finance',
  description: 'Get comprehensive finance dashboard metrics including pending expenses, budget health, invoice status, and payment summary.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const { analyticsService } = await import('../../../finance/analyticsService.js');
    const orgId = await resolveOrgIdForTool(ctx);
    if (!orgId) return { success: false, data: null, summary: 'Organization not found.' };

    const dashboard = await analyticsService.getDashboard(orgId);

    const summary = [
      `Finance Dashboard:`,
      `Expenses: $${dashboard.expenses.total_this_month.toLocaleString()} this month (${dashboard.expenses.count_this_month} expenses), ${dashboard.expenses.pending_count} pending ($${dashboard.expenses.pending_total.toLocaleString()})`,
      `Budgets: $${dashboard.budgets.total_spent.toLocaleString()} / $${dashboard.budgets.total_allocated.toLocaleString()} spent, ${dashboard.budgets.critical_count} in critical status`,
      `Invoices: $${dashboard.invoices.total_outstanding.toLocaleString()} outstanding, ${dashboard.invoices.overdue_count} overdue ($${dashboard.invoices.overdue_total.toLocaleString()})`,
      `Payments: $${dashboard.payments.total_paid_month.toLocaleString()} paid this month (${dashboard.payments.payment_count} payments)`,
    ].join('\n');

    return { success: true, data: dashboard, summary, metadata: { source: 'multiple', count: 4 } };
  },
});
