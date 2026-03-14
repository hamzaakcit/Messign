/**
 * Executive Module — Cross-Module Query Tool
 *
 * Uses standard SQL JOINs instead of Apache AGE (graph unavailable on Railway).
 * Queries: deals at risk from PTO, resource conflicts, workload analysis, revenue at risk.
 */
import type { ToolRegistration } from '../../types.js';
import type { ToolResult } from '../../../services/ai/types.js';
import { withTenantQuery } from '../../../db/index.js';

function validateUUID(id: string): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    throw new Error('Invalid UUID format');
  }
  return id;
}

function validateDate(dateStr: string): string {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    throw new Error('Invalid date format (expected YYYY-MM-DD)');
  }
  return dateStr;
}

export const crossModuleQuery: ToolRegistration = {
  name: 'executive:cross_module_query',
  namespace: 'executive',
  summary: 'Query cross-module relationships: deals at risk from PTO, workload analysis, resource conflicts, revenue at risk',
  tags: ['cross-module', 'graph', 'relationships', 'risk', 'dependencies'],
  requiredRoles: ['manager', 'admin', 'executive'],
  deferLoaded: true,
  parameterHints: 'query_type: deals_at_risk_pto | resource_conflicts | workload_by_person | revenue_at_risk',

  llmSchema: {
    type: 'function',
    function: {
      name: 'executive:cross_module_query',
      description:
        'Query cross-department relationships. Examples: find deals at risk because team members are on PTO, identify resource conflicts across projects, analyze workload distribution, revenue at risk from open support tickets.',
      parameters: {
        type: 'object',
        properties: {
          query_type: {
            type: 'string',
            enum: ['deals_at_risk_pto', 'resource_conflicts', 'workload_by_person', 'revenue_at_risk'],
            description: 'Type of cross-module query to run',
          },
          date_range_start: { type: 'string', description: 'ISO date for PTO cutoff start (YYYY-MM-DD)' },
          date_range_end: { type: 'string', description: 'ISO date for PTO cutoff end (YYYY-MM-DD)' },
        },
        required: ['query_type'],
      },
    },
  },

  handler: async (args, context): Promise<ToolResult> => {
    const queryType = args.query_type as string;
    const rawTenantId = context.organizationId ?? '';
    if (!rawTenantId) {
      return { success: false, data: null, summary: 'No organization context. Cannot run cross-module query.' };
    }
    let safeTenantId: string;
    try {
      safeTenantId = validateUUID(rawTenantId);
    } catch {
      return { success: false, data: null, summary: 'Invalid organization ID format.' };
    }

    const cutoffEnd = typeof args.date_range_end === 'string' ? args.date_range_end : null;
    const defaultCutoff = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let ptoCutoff: string;
    if (cutoffEnd) {
      try {
        ptoCutoff = validateDate(cutoffEnd);
      } catch {
        return { success: false, data: null, summary: 'Invalid date format for date_range_end (expected YYYY-MM-DD).' };
      }
    } else {
      ptoCutoff = defaultCutoff;
    }

    const validTypes = ['deals_at_risk_pto', 'resource_conflicts', 'workload_by_person', 'revenue_at_risk'];
    if (!validTypes.includes(queryType)) {
      return {
        success: false,
        data: null,
        summary: `Unknown query type: ${queryType}. Use one of: ${validTypes.join(', ')}`,
      };
    }

    const today = new Date().toISOString().slice(0, 10);

    try {
      const rows = await withTenantQuery(safeTenantId, async (client) => {
        switch (queryType) {
          case 'deals_at_risk_pto': {
            const res = await client.query(
              `SELECT
                d.title AS deal_name,
                d.amount_eur AS deal_value,
                s.name AS stage,
                u.full_name AS assigned_to,
                MIN(te.date)::text AS pto_start,
                MAX(te.date)::text AS pto_end
              FROM crm_deals d
              JOIN crm_deal_stages s ON d.stage_id = s.id
              JOIN reimbursement_users u ON d.owner_id = u.id AND u.organization_id = $3::uuid
              JOIN time_entries te ON te.user_id = u.id AND te.organization_id = $3::uuid
              JOIN time_categories tc ON te.category_id = tc.id AND tc.organization_id = $3::uuid
                AND (LOWER(tc.name) IN ('pto', 'leave', 'vacation', 'time off') OR tc.name ILIKE '%pto%')
              WHERE d.organization_id = $3::uuid
                AND te.date >= $1::date
                AND te.date <= $2::date
                AND te.status = 'approved'
                AND s.name IN ('Proposal', 'Negotiation', 'Qualified')
                AND s.is_won = false AND s.is_lost = false
              GROUP BY d.id, d.title, d.amount_eur, s.name, u.full_name
              ORDER BY d.amount_eur DESC NULLS LAST
              LIMIT 20`,
              [today, ptoCutoff, safeTenantId],
            );
            return res.rows;
          }

          case 'resource_conflicts': {
            const res = await client.query(
              `SELECT
                u.full_name AS person,
                jsonb_agg(
                  jsonb_build_object(
                    'deal', d.title,
                    'value', d.amount_eur,
                    'stage', s.name
                  )
                ) AS active_deals
              FROM crm_deals d
              JOIN crm_deal_stages s ON d.stage_id = s.id
              JOIN reimbursement_users u ON d.owner_id = u.id AND u.organization_id = $1::uuid
              WHERE d.organization_id = $1::uuid
                AND s.name IN ('Proposal', 'Negotiation', 'Qualified')
                AND s.is_won = false AND s.is_lost = false
              GROUP BY u.id, u.full_name
              HAVING COUNT(*) > 1
              ORDER BY COUNT(*) DESC
              LIMIT 20`,
              [safeTenantId],
            );
            return res.rows;
          }

          case 'workload_by_person': {
            const res = await client.query(
              `WITH deal_counts AS (
                SELECT d.owner_id, COUNT(*) AS cnt
                FROM crm_deals d
                JOIN crm_deal_stages s ON d.stage_id = s.id
                WHERE d.organization_id = $1::uuid
                  AND s.name IN ('Proposal', 'Negotiation', 'Qualified')
                  AND s.is_won = false AND s.is_lost = false
                GROUP BY d.owner_id
              ),
              ticket_counts AS (
                SELECT assignee_id, COUNT(*) AS cnt
                FROM support_tickets
                WHERE organization_id = $1::uuid
                  AND status NOT IN ('resolved', 'closed')
                GROUP BY assignee_id
              ),
              task_counts AS (
                SELECT (jsonb_array_elements_text(t.assignees))::text AS assignee_id, COUNT(*) AS cnt
                FROM tasks t
                WHERE t.assignees IS NOT NULL AND jsonb_array_length(t.assignees) > 0
                  AND t.status NOT IN ('completed', 'done', 'cancelled')
                GROUP BY 1
              )
              SELECT
                u.full_name AS person,
                u.job_title AS department,
                COALESCE(dc.cnt, 0)::int AS active_deals,
                COALESCE(tc.cnt, 0)::int AS active_tickets,
                COALESCE(tkc.cnt, 0)::int AS active_tasks
              FROM reimbursement_users u
              LEFT JOIN deal_counts dc ON dc.owner_id = u.id
              LEFT JOIN ticket_counts tc ON tc.assignee_id = u.id
              LEFT JOIN task_counts tkc ON tkc.assignee_id = u.auth_user_id OR tkc.assignee_id = u.id::text
              WHERE u.organization_id = $1::uuid
                AND COALESCE(dc.cnt, 0) + COALESCE(tc.cnt, 0) + COALESCE(tkc.cnt, 0) > 0
              ORDER BY COALESCE(dc.cnt, 0) + COALESCE(tc.cnt, 0) + COALESCE(tkc.cnt, 0) DESC
              LIMIT 30`,
              [safeTenantId],
            );
            return res.rows;
          }

          case 'revenue_at_risk': {
            const res = await client.query(
              `SELECT
                d.title AS deal_name,
                d.amount_eur AS deal_value,
                s.name AS stage,
                c.name AS company_name,
                COUNT(st.id)::int AS open_tickets
              FROM crm_deals d
              JOIN crm_deal_stages s ON d.stage_id = s.id
              JOIN crm_companies c ON d.company_id = c.id AND c.organization_id = $1::uuid
              JOIN support_tickets st ON st.crm_company_id = c.id AND st.organization_id = $1::uuid
                AND st.status NOT IN ('resolved', 'closed')
              WHERE d.organization_id = $1::uuid
                AND s.name IN ('Proposal', 'Negotiation')
                AND s.is_won = false AND s.is_lost = false
              GROUP BY d.id, d.title, d.amount_eur, s.name, c.name
              ORDER BY d.amount_eur DESC NULLS LAST
              LIMIT 20`,
              [safeTenantId],
            );
            return res.rows;
          }

          default:
            throw new Error(`Unhandled query type: ${queryType}`);
        }
      });

      const summary =
        rows.length === 0
          ? `No results for ${queryType}.`
          : `${queryType}: ${rows.length} result(s).\n` +
            rows
              .slice(0, 5)
              .map((r) => JSON.stringify(r))
              .join('\n') +
            (rows.length > 5 ? `\n... and ${rows.length - 5} more` : '');

      return {
        success: true,
        data: rows,
        summary,
        metadata: { source: 'sql_joins', count: rows.length },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        data: null,
        summary: `Cross-module query failed: ${msg}`,
      };
    }
  },
};
