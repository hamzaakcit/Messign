/**
 * Tool: get_department_report
 *
 * Executive-level aggregated report across all teams.
 * Adapted for Messign: reimbursement_users, reimbursement_requests.
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';
import { resolveOrgIdForTool } from './resolveOrgIdForTool.js';
import {
  buildShortDepartmentReportSummary,
  computeDepartmentReportAggregates,
} from './departmentReportAggregates.js';

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
  name: 'analytics:get_department_report',
  metadata: {
    namespace: 'analytics',
    name: 'get_department_report',
    summary: 'Department report: headcount, metrics, performance by department.',
    tags: ['analytics', 'department', 'report'],
    alwaysLoaded: false,
    parameterHints: 'department_id?: string, time_period?: string',
  },
  category: 'analytics',

  description: `Generate an executive-level department or company-wide report combining team metrics, project health, financial summary, and activity trends.

Use this tool when someone asks (same example phrasings as DEPARTMENT_REPORT_EXAMPLE_QUESTIONS in availableQuestions.ts):
- "Give me an executive summary"
- "Give me a department report or company report"
- "How are all teams doing?"
- "Give me a monthly or quarterly company review"
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

    const orgId = await resolveOrgIdForTool(context);
    if (!orgId) {
      return { success: false, data: null, summary: 'Organization not configured.' };
    }

    const dateFilter = buildReportDateFilter(timePeriod);
    const report: Record<string, unknown> = {};

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
    }

    if (sections.includes('projects')) {
      const projectsResult = await query(
        `SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status != 'archived')::int as active
        FROM projects
        WHERE organization_id = $1`,
        [orgId]
      );
      const taskMetricsResult = await query(
        `SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status IN ('completed', 'done') AND completed_at >= $1)::int as completed_period,
          COUNT(*) FILTER (WHERE due_date < NOW() AND status NOT IN ('completed', 'done', 'cancelled'))::int as overdue
        FROM tasks
        WHERE project_id IN (SELECT id FROM projects WHERE organization_id = $2)`,
        [dateFilter, orgId]
      );
      report.projects = { ...(projectsResult.rows[0] as object), ...(taskMetricsResult.rows[0] as object) };
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
      } catch {
        report.finance = { unavailable: true };
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
    }

    if (sections.includes('activity')) {
      const activityResult = await query(
        `SELECT COUNT(*)::int as total FROM activities WHERE created_at >= $1`,
        [dateFilter]
      );
      report.activity = activityResult.rows[0];
    }

    const aggregates = computeDepartmentReportAggregates(report);
    const summary = buildShortDepartmentReportSummary(timePeriod, aggregates);

    return {
      success: true,
      data: { ...report, aggregates, timePeriod },
      summary,
      metadata: { source: 'reimbursement_users, projects, tasks, reimbursement_requests, knowledge_documents, activities', timeRange: timePeriod },
    };
  },
};

registerTool(departmentReportTool);
export default departmentReportTool;
