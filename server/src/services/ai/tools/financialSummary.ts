/**
 * Tool: get_financial_summary
 *
 * Aggregated financial data: reimbursement_requests, invoices.
 * Adapted for Messign: reimbursement_requests (submitted_by UUID), expense_categories.
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';
import { resolveOrgIdForTool } from './resolveOrgIdForTool.js';

function buildFinanceDateFilter(period: string): Date {
  const now = new Date();
  switch (period) {
    case 'last_month':
      return new Date(now.getFullYear(), now.getMonth() - 1, 1);
    case 'this_quarter':
      return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    case 'this_year':
      return new Date(now.getFullYear(), 0, 1);
    default:
      return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

const financialSummaryTool: Tool = {
  name: 'finance:get_financial_summary',
  category: 'finance',

  metadata: {
    namespace: 'finance',
    name: 'get_financial_summary',
    summary: 'Financial summary: reimbursements, invoices, spending by category, pending approvals.',
    tags: ['finance', 'budget', 'reimbursements', 'invoices', 'spending'],
    alwaysLoaded: true,
    parameterHints: 'time_period: this_month|last_month|this_quarter|this_year, scope?: company|my|team, category?: string',
  },

  description: `Get a financial summary including reimbursement totals, invoice amounts, spending by category, and pending approvals.

Use this tool when someone asks:
- "What's our total spending this month?"
- "Financial overview" or "Budget summary"
- "How much have we spent on [category]?"
- "Total reimbursements this quarter"
- "Invoice summary" or "Outstanding invoices"
- Any question about company finances, budgets, spending, costs, or money`,

  parameters: {
    type: 'object',
    properties: {
      time_period: {
        type: 'string',
        description: 'Time period for the summary.',
        enum: ['this_month', 'last_month', 'this_quarter', 'this_year'],
      },
      scope: {
        type: 'string',
        description: 'Scope of financial data. "company" for totals (admin only), "my" for user\'s own.',
        enum: ['company', 'my', 'team'],
      },
      category: {
        type: 'string',
        description: 'Optional: filter by spending category (e.g., "travel", "supplies", "software").',
      },
    },
    required: ['time_period'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const timePeriod = (args.time_period as string) || 'this_month';
    const scope = (args.scope as string) || 'my';
    const category = args.category as string | undefined;

    const isCompanyScope = scope === 'company' || scope === 'team';
    if (isCompanyScope && !['admin', 'manager', 'cpo', 'finance', 'hr'].includes(context.userRole)) {
      return {
        success: false,
        data: null,
        summary:
          'Company-wide financial data is only available to admins and finance roles. You can view your own finances by asking "Show me my reimbursements".',
      };
    }

    const dateFilter = buildFinanceDateFilter(timePeriod);

    const orgId = await resolveOrgIdForTool(context);
    if (!orgId) {
      return { success: false, data: null, summary: 'Organization not configured.' };
    }

    let reimbursementStats: Record<string, unknown> | null = null;

    if (scope === 'my') {
      const userResult = await query<{ id: string }>(
        `SELECT id FROM reimbursement_users WHERE auth_user_id = $1 AND organization_id = $2 LIMIT 1`,
        [context.userId, orgId]
      );
      const userReimbursementId = userResult.rows[0]?.id;
      if (!userReimbursementId) {
        return { success: false, data: null, summary: 'User not found in organization.' };
      }

      try {
        let reimbQuery: string;
        const reimbParams: unknown[] = [userReimbursementId, dateFilter];
        if (category) {
          reimbQuery = `
            SELECT
              COUNT(*)::int as total_count,
              COALESCE(SUM(r.converted_amount), SUM(r.original_amount))::numeric as total_amount,
              COUNT(*) FILTER (WHERE r.status = 'draft')::int as pending_count,
              COALESCE(SUM(r.converted_amount) FILTER (WHERE r.status = 'draft'), 0)::numeric as pending_amount,
              COUNT(*) FILTER (WHERE r.status IN ('approved', 'paid'))::int as approved_count,
              COALESCE(SUM(r.converted_amount) FILTER (WHERE r.status IN ('approved', 'paid')), 0)::numeric as approved_amount,
              COUNT(*) FILTER (WHERE r.status = 'rejected')::int as rejected_count
            FROM reimbursement_requests r
            JOIN expense_categories c ON c.id = r.category_id
            WHERE r.submitted_by = $1 AND r.created_at >= $2 AND LOWER(c.name) = LOWER($3)
          `;
          reimbParams.push(category);
        } else {
          reimbQuery = `
            SELECT
              COUNT(*)::int as total_count,
              COALESCE(SUM(r.converted_amount), SUM(r.original_amount))::numeric as total_amount,
              COUNT(*) FILTER (WHERE r.status = 'draft')::int as pending_count,
              COALESCE(SUM(r.converted_amount) FILTER (WHERE r.status = 'draft'), 0)::numeric as pending_amount,
              COUNT(*) FILTER (WHERE r.status IN ('approved', 'paid', 'submitted'))::int as approved_count,
              COALESCE(SUM(r.converted_amount) FILTER (WHERE r.status IN ('approved', 'paid', 'submitted')), 0)::numeric as approved_amount,
              COUNT(*) FILTER (WHERE r.status = 'rejected')::int as rejected_count
            FROM reimbursement_requests r
            WHERE r.submitted_by = $1 AND r.created_at >= $2
          `;
        }
        const result = await query(reimbQuery, reimbParams);
        reimbursementStats = result.rows[0] as Record<string, unknown>;
      } catch (err) {
        reimbursementStats = { error: (err as Error).message };
      }
    } else {
      try {
        let reimbQuery: string;
        const reimbParams: unknown[] = [orgId, dateFilter];
        if (category) {
          reimbQuery = `
            SELECT
              COUNT(*)::int as total_count,
              COALESCE(SUM(r.converted_amount), SUM(r.original_amount))::numeric as total_amount,
              COUNT(*) FILTER (WHERE r.status = 'draft')::int as pending_count,
              COALESCE(SUM(r.converted_amount) FILTER (WHERE r.status = 'draft'), 0)::numeric as pending_amount,
              COUNT(*) FILTER (WHERE r.status IN ('approved', 'paid', 'submitted'))::int as approved_count,
              COALESCE(SUM(r.converted_amount) FILTER (WHERE r.status IN ('approved', 'paid', 'submitted')), 0)::numeric as approved_amount,
              COUNT(*) FILTER (WHERE r.status = 'rejected')::int as rejected_count
            FROM reimbursement_requests r
            JOIN expense_categories c ON c.id = r.category_id
            WHERE r.organization_id = $1 AND r.created_at >= $2 AND LOWER(c.name) = LOWER($3)
          `;
          reimbParams.push(category);
        } else {
          reimbQuery = `
            SELECT
              COUNT(*)::int as total_count,
              COALESCE(SUM(r.converted_amount), SUM(r.original_amount))::numeric as total_amount,
              COUNT(*) FILTER (WHERE r.status = 'draft')::int as pending_count,
              COALESCE(SUM(r.converted_amount) FILTER (WHERE r.status = 'draft'), 0)::numeric as pending_amount,
              COUNT(*) FILTER (WHERE r.status IN ('approved', 'paid', 'submitted'))::int as approved_count,
              COALESCE(SUM(r.converted_amount) FILTER (WHERE r.status IN ('approved', 'paid', 'submitted')), 0)::numeric as approved_amount,
              COUNT(*) FILTER (WHERE r.status = 'rejected')::int as rejected_count
            FROM reimbursement_requests r
            WHERE r.organization_id = $1 AND r.created_at >= $2
          `;
        }
        const result = await query(reimbQuery, reimbParams);
        reimbursementStats = result.rows[0] as Record<string, unknown>;
      } catch (err) {
        reimbursementStats = { error: (err as Error).message };
      }
    }

    let invoiceStats: Record<string, unknown> | null = null;
    try {
      const invoiceQuery = scope === 'my'
        ? `SELECT COUNT(*)::int as total, COALESCE(SUM(i.grand_total), 0)::numeric as total_amount,
           COUNT(*) FILTER (WHERE i.status IN ('finalized', 'signed'))::int as paid,
           COUNT(*) FILTER (WHERE i.status IN ('draft', 'revision'))::int as unpaid
           FROM invoices i
           JOIN reimbursement_users ru ON ru.id = i.employee_id
           WHERE ru.auth_user_id = $1 AND i.created_at >= $2`
        : `SELECT COUNT(*)::int as total, COALESCE(SUM(grand_total), 0)::numeric as total_amount,
           COUNT(*) FILTER (WHERE status IN ('finalized', 'signed'))::int as paid,
           COUNT(*) FILTER (WHERE status IN ('draft', 'revision'))::int as unpaid
           FROM invoices i
           WHERE i.created_at >= $1`;

      const invoiceParams = scope === 'my'
        ? [context.userId, dateFilter]
        : [dateFilter];
      const invResult = await query(invoiceQuery, invoiceParams);
      invoiceStats = invResult.rows[0] as Record<string, unknown>;
    } catch {
      /* invoices table may not exist */
    }

    let topCategories: Record<string, unknown>[] = [];
    if (isCompanyScope) {
      try {
        const catResult = await query(
          `SELECT c.name as category, COUNT(*)::int as count, COALESCE(SUM(r.converted_amount), SUM(r.original_amount))::numeric as total
           FROM reimbursement_requests r
           JOIN expense_categories c ON c.id = r.category_id
           WHERE r.organization_id = $1 AND r.created_at >= $2
           GROUP BY c.name
           ORDER BY total DESC
           LIMIT 10`,
          [orgId, dateFilter]
        );
        topCategories = catResult.rows as Record<string, unknown>[];
      } catch {
        /* skip */
      }
    }

    const periodLabel = timePeriod.replace('_', ' ');
    const scopeLabel = scope === 'my' ? 'Your' : 'Company-wide';

    let summary = `**${scopeLabel} Financial Summary (${periodLabel}):**\n`;

    if (reimbursementStats && !reimbursementStats.error) {
      const total = parseFloat(String(reimbursementStats.total_amount ?? 0));
      const pending = parseFloat(String(reimbursementStats.pending_amount ?? 0));
      const approved = parseFloat(String(reimbursementStats.approved_amount ?? 0));
      summary += `\n**Reimbursements:**
- Total: ${reimbursementStats.total_count} claims, $${total.toFixed(2)}
- Pending: ${reimbursementStats.pending_count} ($${pending.toFixed(2)})
- Approved/Submitted: ${reimbursementStats.approved_count} ($${approved.toFixed(2)})
- Rejected: ${reimbursementStats.rejected_count}`;
    }

    if (invoiceStats) {
      const invTotal = parseFloat(String(invoiceStats.total_amount ?? 0));
      summary += `\n\n**Invoices:**
- Total: ${invoiceStats.total} invoices, $${invTotal.toFixed(2)}
- Paid: ${invoiceStats.paid} | Unpaid: ${invoiceStats.unpaid}`;
    }

    if (topCategories.length > 0) {
      summary += `\n\n**Top Spending Categories:**`;
      topCategories.forEach((c, i) => {
        const tot = parseFloat(String(c.total ?? 0));
        summary += `\n${i + 1}. ${c.category}: $${tot.toFixed(2)} (${c.count} claims)`;
      });
    }

    return {
      success: true,
      data: { reimbursements: reimbursementStats, invoices: invoiceStats, topCategories },
      summary,
      metadata: { source: 'reimbursement_requests, invoices', timeRange: timePeriod },
    };
  },
};

registerTool(financialSummaryTool);
export default financialSummaryTool;
