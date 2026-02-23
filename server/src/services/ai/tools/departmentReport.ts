/**
 * Tool: get_department_report
 *
 * Executive-level aggregated report across all teams.
 * Adapted for Messign: reimbursement_users, reimbursement_requests.
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';

const DEFAULT_ORG_SLUG = 'messign';

function buildReportDateFilter(period: string): Date {
  const now = new Date();
  switch (period) {
    case 'this_quarter':
      return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    case 'this_year':
      return new Date(now.getFullYear(), 0, 1);
    default:
      return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

const departmentReportTool: Tool = {
  name: 'get_department_report',
  category: 'analytics',

  description: `Generate an executive-level department or company-wide report combining team metrics, project health, financial summary, and activity trends.

Use this tool when someone asks:
- "Give me an executive summary"
- "Department report" or "Company report"
- "How are all teams doing?"
- "Monthly/quarterly company review"
- "Prepare data for the board meeting"
- Any request for a high-level, multi-domain report`,

  parameters: {
    type: 'object',
    properties: {
      time_period: {
        type: 'string',
        description: 'Report period.',
        enum: ['this_month', 'this_quarter', 'this_year'],
      },
      include_sections: {
        type: 'string',
        description: 'Comma-separated: "people,projects,finance,knowledge,activity". Default all.',
      },
    },
    required: ['time_period'],
  },

  requiredRoles: ['admin', 'cpo'],

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const timePeriod = (args.time_period as string) || 'this_month';
    const includeSections = (args.include_sections as string) || 'people,projects,finance,knowledge,activity';
    const sections = includeSections.split(',').map((s) => s.trim().toLowerCase());

    const orgResult = await query<{ id: string }>(`SELECT id FROM organizations WHERE slug = $1 LIMIT 1`, [DEFAULT_ORG_SLUG]);
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) {
      return { success: false, data: null, summary: 'Organization not configured.' };
    }

    const dateFilter = buildReportDateFilter(timePeriod);
    const periodLabel = timePeriod.replace('_', ' ');
    const report: Record<string, unknown> = {};
    let summary = `**Executive Report — ${periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1)}**\n`;

    if (sections.includes('people')) {
      const peopleResult = await query(
        `SELECT
          COUNT(*)::int as total_employees,
          COUNT(*) FILTER (WHERE auth_user_id IS NOT NULL AND auth_user_id != '')::int as active,
          COUNT(*) FILTER (WHERE created_at >= $1)::int as new_hires
        FROM reimbursement_users
        WHERE organization_id = $2`,
        [dateFilter, orgId]
      );
      report.people = peopleResult.rows[0];
      const p = report.people as Record<string, unknown>;
      summary += `\n**People:**
- Active employees: ${p.active ?? 0} | New hires (${periodLabel}): ${p.new_hires ?? 0}`;
    }

    if (sections.includes('projects')) {
      const projectsResult = await query(
        `SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status != 'archived')::int as active
        FROM projects`
      );
      const taskMetricsResult = await query(
        `SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status IN ('completed', 'done') AND completed_at >= $1)::int as completed_period,
          COUNT(*) FILTER (WHERE due_date < NOW() AND status NOT IN ('completed', 'done', 'cancelled'))::int as overdue
        FROM tasks`,
        [dateFilter]
      );
      report.projects = { ...(projectsResult.rows[0] as object), ...(taskMetricsResult.rows[0] as object) };
      const proj = report.projects as Record<string, unknown>;
      summary += `\n\n**Projects & Tasks:**
- Active projects: ${proj.active ?? 0} | Tasks completed (${periodLabel}): ${proj.completed_period ?? 0}
- Overdue tasks: ${proj.overdue ?? 0}`;
    }

    if (sections.includes('finance')) {
      try {
        const financeResult = await query(
          `SELECT
            COUNT(*)::int as total_claims,
            COALESCE(SUM(converted_amount), SUM(original_amount), 0)::numeric as total_amount,
            COUNT(*) FILTER (WHERE status = 'submitted')::int as pending_count,
            COALESCE(SUM(converted_amount) FILTER (WHERE status = 'submitted'), 0)::numeric as pending_amount
          FROM reimbursement_requests
          WHERE organization_id = $1 AND created_at >= $2`,
          [orgId, dateFilter]
        );
        report.finance = financeResult.rows[0];
        const f = report.finance as Record<string, unknown>;
        summary += `\n\n**Finance (${periodLabel}):**
- Reimbursements: ${f.total_claims ?? 0} claims, $${parseFloat(String(f.total_amount ?? 0)).toFixed(2)} total
- Pending approval: ${f.pending_count ?? 0} claims ($${parseFloat(String(f.pending_amount ?? 0)).toFixed(2)})`;
      } catch {
        summary += `\n\n**Finance:** Data unavailable`;
      }
    }

    if (sections.includes('knowledge')) {
      const knowledgeResult = await query(
        `SELECT
          COUNT(*)::int as total_docs,
          COUNT(*) FILTER (WHERE status = 'published')::int as published,
          COUNT(*) FILTER (WHERE created_at >= $1)::int as new_docs,
          COUNT(*) FILTER (WHERE status = 'in_review')::int as pending_review
        FROM knowledge_documents`,
        [dateFilter]
      );
      report.knowledge = knowledgeResult.rows[0];
      const k = report.knowledge as Record<string, unknown>;
      summary += `\n\n**Knowledge Base:**
- Total documents: ${k.total_docs ?? 0} (${k.published ?? 0} published)
- New (${periodLabel}): ${k.new_docs ?? 0} | Pending review: ${k.pending_review ?? 0}`;
    }

    if (sections.includes('activity')) {
      const activityResult = await query(
        `SELECT COUNT(*)::int as total FROM activities WHERE created_at >= $1`,
        [dateFilter]
      );
      report.activity = activityResult.rows[0];
      const act = report.activity as Record<string, unknown>;
      summary += `\n\n**Activity:**
- Total actions (${periodLabel}): ${act.total ?? 0}`;
    }

    return {
      success: true,
      data: report,
      summary,
      metadata: { source: 'reimbursement_users, projects, tasks, reimbursement_requests, knowledge_documents, activities', timeRange: timePeriod },
    };
  },
};

registerTool(departmentReportTool);
export default departmentReportTool;
