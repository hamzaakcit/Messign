/**
 * CRM Module — search_deals tool
 * Search deals by status, owner, value range, or text query.
 */
import type { ToolRegistration } from '../../types.js';
import { withTenantQuery } from '../../../middleware/tenantContext.js';

export const searchDeals: ToolRegistration = {
  name: 'crm:search_deals',
  namespace: 'crm',
  summary: 'Search CRM deals by status, owner, value range, or date',
  tags: ['sales', 'pipeline', 'deals', 'revenue', 'opportunities'],
  requiredRoles: ['sales', 'manager', 'admin'],
  deferLoaded: true,
  parameterHints: 'query?: string, status?: open|won|lost|all, owner_id?: string, min_value?: number, max_value?: number, limit?: number',

  llmSchema: {
    type: 'function',
    function: {
      name: 'crm:search_deals',
      description: 'Search and filter CRM deals. Returns deal name, value, stage, owner, and last activity date.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Free text search on deal name or company' },
          status: { type: 'string', enum: ['open', 'won', 'lost', 'all'] },
          owner_id: { type: 'string', description: 'Filter by deal owner user ID' },
          min_value: { type: 'number' },
          max_value: { type: 'number' },
          limit: { type: 'number', description: 'Max results (default 20)' },
        },
        required: [],
      },
    },
  },

  handler: async (args, context) => {
    const tenantId = context.organizationId;
    if (!tenantId) {
      return { success: false, data: null, summary: 'Tenant context required.' };
    }

    return withTenantQuery(tenantId, async (client) => {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (args.query && String(args.query).trim()) {
        conditions.push(`(d.title ILIKE $${idx} OR co.name ILIKE $${idx})`);
        params.push(`%${String(args.query).trim()}%`);
        idx++;
      }
      const status = args.status as string | undefined;
      if (status && status !== 'all') {
        if (status === 'open') {
          conditions.push('s.is_won = false AND s.is_lost = false');
        } else if (status === 'won') {
          conditions.push('s.is_won = true');
        } else if (status === 'lost') {
          conditions.push('s.is_lost = true');
        }
      }
      if (args.owner_id) {
        conditions.push(`d.owner_id = $${idx}::uuid`);
        params.push(args.owner_id);
        idx++;
      }
      if (args.min_value != null && !Number.isNaN(Number(args.min_value))) {
        conditions.push(`d.amount >= $${idx}`);
        params.push(Number(args.min_value));
        idx++;
      }
      if (args.max_value != null && !Number.isNaN(Number(args.max_value))) {
        conditions.push(`d.amount <= $${idx}`);
        params.push(Number(args.max_value));
        idx++;
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = Math.min(Number(args.limit) || 20, 50);

      const result = await client.query(
        `SELECT d.id, d.title as name, d.amount as value, s.name as stage,
                d.owner_id, co.name as company_name, d.updated_at
         FROM crm_deals d
         JOIN crm_deal_stages s ON s.id = d.stage_id
         LEFT JOIN crm_companies co ON co.id = d.company_id
         ${where}
         ORDER BY d.updated_at DESC
         LIMIT ${limit}`,
        params,
      );

      const deals = result.rows;
      const summary = deals.length === 0
        ? 'No deals found matching the criteria.'
        : `Found ${deals.length} deal(s). ${deals.slice(0, 5).map((d: { name: string; value: number; stage: string }) => `${d.name} — €${Number(d.value).toLocaleString()} (${d.stage})`).join('; ')}${deals.length > 5 ? '…' : ''}`;

      return { success: true, data: { deals, count: deals.length }, summary, metadata: { source: 'crm_deals', count: deals.length } };
    });
  },
};
