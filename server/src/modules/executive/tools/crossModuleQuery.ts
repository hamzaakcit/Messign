/**
 * Executive Module — Cross-Module Graph Query Tool
 *
 * Queries Apache AGE graph for deals at risk from PTO, resource conflicts, workload analysis.
 */
import type { ToolRegistration } from '../../types.js';
import type { ToolResult } from '../../../services/ai/types.js';
import { pool } from '../../../db/index.js';

function escapeCypher(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

export const crossModuleQuery: ToolRegistration = {
  name: 'executive:cross_module_query',
  namespace: 'executive',
  summary: 'Query cross-module relationships: deals at risk from PTO, workload analysis, resource conflicts',
  tags: ['cross-module', 'graph', 'relationships', 'risk', 'dependencies'],
  requiredRoles: ['manager', 'admin', 'executive'],
  deferLoaded: true,
  parameterHints: 'query_type: deals_at_risk_pto | resource_conflicts | workload_by_person',

  llmSchema: {
    type: 'function',
    function: {
      name: 'executive:cross_module_query',
      description:
        'Query cross-department relationships. Examples: find deals at risk because team members are on PTO, identify resource conflicts across projects, analyze workload distribution.',
      parameters: {
        type: 'object',
        properties: {
          query_type: {
            type: 'string',
            enum: ['deals_at_risk_pto', 'resource_conflicts', 'workload_by_person'],
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
    const tenantId = escapeCypher(context.organizationId ?? '');
    if (!tenantId) {
      return { success: false, data: null, summary: 'No organization context. Cannot run cross-module query.' };
    }

    const cutoffEnd = typeof args.date_range_end === 'string' ? args.date_range_end : null;
    const defaultCutoff = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const ptoCutoff = cutoffEnd ? escapeCypher(cutoffEnd) : defaultCutoff;

    const queries: Record<
      string,
      { cypher: string; columns: string }
    > = {
      deals_at_risk_pto: {
        cypher: `
          MATCH (p:Person)-[:ASSIGNED_TO]->(d:Deal),
                (p)-[:HAS_PTO]->(pto:PTORequest)
          WHERE d.stage IN ['negotiation', 'proposal', 'closing']
            AND pto.status = 'approved'
            AND pto.start_date <= '${ptoCutoff}'
            AND d.tenant_id = '${tenantId}'
          RETURN d.name AS deal, d.value AS value, d.stage AS stage,
                 p.name AS person, pto.start_date AS pto_start, pto.end_date AS pto_end
          ORDER BY d.value DESC
          LIMIT 20
        `,
        columns: 'deal agtype, value agtype, stage agtype, person agtype, pto_start agtype, pto_end agtype',
      },
      resource_conflicts: {
        cypher: `
          MATCH (p:Person)-[:ASSIGNED_TO]->(d:Deal)
          WHERE d.stage IN ['negotiation', 'proposal', 'closing']
            AND d.tenant_id = '${tenantId}'
          WITH p, collect(DISTINCT d) AS deals
          WHERE size(deals) > 1
          RETURN p.name AS person,
                 [x IN deals | {deal: x.name, value: x.value, stage: x.stage}] AS active_deals
          ORDER BY size(deals) DESC
          LIMIT 20
        `,
        columns: 'person agtype, active_deals agtype',
      },
      workload_by_person: {
        cypher: `
          MATCH (p:Person)
          WHERE (p.tenant_id = '${tenantId}' OR p.tenant_id IS NULL OR p.tenant_id = '')
          OPTIONAL MATCH (p)-[:ASSIGNED_TO]->(d:Deal)
          WHERE d.stage IN ['negotiation', 'proposal', 'closing']
          OPTIONAL MATCH (p)-[:HANDLES]->(t:Ticket)
          WITH p, count(DISTINCT d) AS active_deals, count(DISTINCT t) AS active_tickets
          WHERE active_deals > 0 OR active_tickets > 0
          RETURN p.name AS person, p.department AS department,
                 active_deals AS active_deals, active_tickets AS active_tickets
          ORDER BY active_deals + active_tickets DESC
          LIMIT 30
        `,
        columns: 'person agtype, department agtype, active_deals agtype, active_tickets agtype',
      },
    };

    const def = queries[queryType];
    if (!def) {
      return {
        success: false,
        data: null,
        summary: `Unknown query type: ${queryType}. Use one of: ${Object.keys(queries).join(', ')}`,
      };
    }

    try {
      const result = await pool.query(
        `SELECT * FROM ag_catalog.cypher('messign_graph', $1) AS (${def.columns})`,
        [def.cypher],
      );

      const rows = result.rows.map((r: Record<string, unknown>) => {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(r)) {
          const v = r[k];
          out[k] = v != null && typeof v === 'object' && 'value' in (v as object)
            ? (v as { value?: unknown }).value
            : v;
        }
        return out;
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
        metadata: { source: 'messign_graph (Apache AGE)', count: rows.length },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        data: null,
        summary: `Graph query failed: ${msg}. Ensure Apache AGE is installed and messign_graph is populated.`,
      };
    }
  },
};
