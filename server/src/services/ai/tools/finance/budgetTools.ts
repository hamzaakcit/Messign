import { registerTool } from '../../toolRegistry.js';
import { query } from '../../../../db/index.js';
import type { ToolContext, ToolResult } from '../../types.js';

registerTool({
  name: 'check_budget_health',
  category: 'finance',
  description: 'Get current health status, utilization, and remaining amount for a budget. Can check by department name or budget ID.',
  parameters: {
    type: 'object',
    properties: {
      department: { type: 'string', description: 'Department name to check budget for.' },
      budget_id: { type: 'string', description: 'Budget ID to check.' },
    },
    required: [],
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    let condition = '';
    const params: unknown[] = [];

    if (args.budget_id) {
      condition = 'b.id = $1';
      params.push(args.budget_id);
    } else if (args.department) {
      condition = 'LOWER(b.department) ILIKE $1';
      params.push(`%${(args.department as string).toLowerCase()}%`);
    } else {
      condition = 'b.status = $1';
      params.push('active');
    }

    const result = await query(
      `SELECT b.*,
              CASE WHEN b.allocated_amount > 0
                THEN ROUND((COALESCE(b.spent_amount,0) / b.allocated_amount * 100)::numeric, 1)
                ELSE 0 END as utilization_pct,
              b.allocated_amount - COALESCE(b.spent_amount,0) as remaining
       FROM budgets b
       WHERE ${condition}
       ORDER BY b.created_at DESC LIMIT 10`,
      params,
    );

    if (result.rows.length === 0) {
      return { success: true, data: [], summary: 'No budgets found matching criteria.' };
    }

    const summaryLines = result.rows.map((b) => {
      const pct = parseFloat(b.utilization_pct ?? '0');
      const status = pct >= 100 ? 'EXCEEDED' : pct >= parseFloat(b.critical_threshold ?? '95') ? 'CRITICAL' : pct >= parseFloat(b.warning_threshold ?? '80') ? 'WARNING' : 'Healthy';
      return `${b.department || b.name}: ${pct.toFixed(1)}% used ($${parseFloat(b.spent_amount ?? '0').toLocaleString()} / $${parseFloat(b.allocated_amount).toLocaleString()}) — ${status}, $${parseFloat(b.remaining).toLocaleString()} remaining`;
    });

    return {
      success: true,
      data: result.rows,
      summary: summaryLines.join('\n'),
      metadata: { source: 'budgets', count: result.rows.length },
    };
  },
});

registerTool({
  name: 'forecast_budget',
  category: 'finance',
  description: 'Forecast budget burn rate and projected exhaustion date based on historical spending patterns.',
  parameters: {
    type: 'object',
    properties: {
      budget_id: { type: 'string', description: 'Budget ID to forecast.' },
      department: { type: 'string', description: 'Department name to forecast.' },
    },
    required: [],
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    let budgetCondition = 'b.status = $1';
    const params: unknown[] = ['active'];

    if (args.budget_id) {
      budgetCondition = 'b.id = $1';
      params[0] = args.budget_id;
    } else if (args.department) {
      budgetCondition = 'LOWER(b.department) ILIKE $1';
      params[0] = `%${(args.department as string).toLowerCase()}%`;
    }

    const budgets = await query(
      `SELECT b.*, b.allocated_amount - COALESCE(b.spent_amount,0) as remaining
       FROM budgets b WHERE ${budgetCondition} LIMIT 5`,
      params,
    );

    const forecasts = budgets.rows.map((b) => {
      const periodStart = new Date(b.period_start);
      const periodEnd = new Date(b.period_end);
      const now = new Date();
      const totalDays = (periodEnd.getTime() - periodStart.getTime()) / 86400000;
      const elapsedDays = Math.max(1, (now.getTime() - periodStart.getTime()) / 86400000);
      const remainingDays = Math.max(0, (periodEnd.getTime() - now.getTime()) / 86400000);

      const spent = parseFloat(b.spent_amount ?? '0');
      const allocated = parseFloat(b.allocated_amount ?? '0');
      const dailyBurn = spent / elapsedDays;
      const projectedTotal = dailyBurn * totalDays;
      const daysToExhaustion = dailyBurn > 0 ? (allocated - spent) / dailyBurn : Infinity;

      return {
        department: b.department || b.name,
        allocated,
        spent,
        daily_burn_rate: Math.round(dailyBurn * 100) / 100,
        projected_total: Math.round(projectedTotal * 100) / 100,
        days_remaining: Math.round(remainingDays),
        days_to_exhaustion: daysToExhaustion === Infinity ? null : Math.round(daysToExhaustion),
        will_exceed: projectedTotal > allocated,
      };
    });

    const summary = forecasts.map((f) =>
      `${f.department}: Daily burn $${f.daily_burn_rate}/day, projected total $${f.projected_total.toLocaleString()}${f.will_exceed ? ' (WILL EXCEED budget)' : ''}, ${f.days_to_exhaustion ? `exhausts in ${f.days_to_exhaustion} days` : 'within budget'}`
    ).join('\n');

    return { success: true, data: forecasts, summary, metadata: { source: 'budgets', count: forecasts.length } };
  },
});
