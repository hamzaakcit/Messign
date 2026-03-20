import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';
import {
  getActiveBudgets,
  getBudgetsByDepartment,
  getBudgetsExceedingThreshold,
  type BudgetWithSpent,
} from '../../../db/budgetDb.js';
import { resolveOrgIdForTool } from './resolveOrgIdForTool.js';

function formatCurrency(amount: number, currency: string = 'EUR'): string {
  return `${currency} ${amount.toFixed(2)}`;
}

function formatBudgetSummary(budgets: BudgetWithSpent[]): string {
  if (budgets.length === 0) return 'No budgets found for the specified criteria.';

  let summary = '';
  for (const b of budgets) {
    const status = b.utilizationPct >= 1 ? 'OVER BUDGET'
      : b.utilizationPct >= b.alertThreshold ? 'WARNING'
      : 'OK';
    summary += `\n- **${b.department}** (${b.periodStart} → ${b.periodEnd}): ` +
      `${formatCurrency(b.spent, b.currency)} / ${formatCurrency(b.allocatedAmount, b.currency)} ` +
      `(${(b.utilizationPct * 100).toFixed(1)}%) [${status}]`;
  }
  return summary;
}

const getBudgetStatusTool: Tool = {
  name: 'finance:get_budget_status',
  metadata: {
    namespace: 'finance',
    name: 'get_budget_status',
    summary: 'Budget status: spent vs allocated, remaining, utilization.',
    tags: ['finance', 'budget'],
    alwaysLoaded: false,
    parameterHints: 'budget_id?: string, department_id?: string',
  },
  category: 'finance',
  description: `Get the current status of department budgets including spending, remaining amounts, and threshold alerts.

Use this tool when someone asks:
- "What's our budget status?"
- "How much budget is left for engineering?"
- "Are any departments over budget?"
- "Show me budget utilization"
- "Budget health" or "spending vs budget"
- Any question about department budgets or budget alerts`,

  parameters: {
    type: 'object',
    properties: {
      department: {
        type: 'string',
        description: 'Filter by department name (e.g., "Engineering", "Marketing"). Leave empty for all departments.',
      },
      alerts_only: {
        type: 'boolean',
        description: 'If true, only return budgets that have exceeded their alert threshold.',
      },
    },
    required: [],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const department = args.department as string | undefined;
    const alertsOnly = args.alerts_only as boolean | undefined;

    if (!['admin', 'manager', 'cpo', 'finance', 'hr'].includes(context.userRole)) {
      return {
        success: false,
        data: null,
        summary: 'Budget information is only available to admins, managers, and finance roles.',
      };
    }

    const orgId = await resolveOrgIdForTool(context);
    if (!orgId) return { success: false, data: null, summary: 'Organization not configured.' };

    let budgets: BudgetWithSpent[];
    if (alertsOnly) {
      budgets = await getBudgetsExceedingThreshold(orgId);
    } else if (department) {
      budgets = await getBudgetsByDepartment(department, orgId);
    } else {
      budgets = await getActiveBudgets(orgId);
    }

    const summary = alertsOnly
      ? `**Budget Alerts** (departments exceeding threshold):${formatBudgetSummary(budgets)}`
      : department
        ? `**Budget Status for ${department}:**${formatBudgetSummary(budgets)}`
        : `**Active Budget Status (${budgets.length} departments):**${formatBudgetSummary(budgets)}`;

    return {
      success: true,
      data: budgets,
      summary,
      metadata: {
        source: 'budgets, reimbursement_requests',
        count: budgets.length,
      },
    };
  },
};

registerTool(getBudgetStatusTool);
export default getBudgetStatusTool;
