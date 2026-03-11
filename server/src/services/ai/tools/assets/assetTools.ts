import { registerTool } from '../../toolRegistry.js';
import { query } from '../../../../db/index.js';
import type { ToolResult } from '../../types.js';

async function resolveOrgId(): Promise<string | undefined> {
  const result = await query<{ id: string }>('SELECT id FROM organizations WHERE slug = $1 LIMIT 1', ['messign']);
  return result.rows[0]?.id;
}

registerTool({
  name: 'get_asset_summary',
  category: 'analytics',
  description: 'Get an overview of company assets including total value, availability, and warranty status.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(): Promise<ToolResult> {
    const orgId = await resolveOrgId();
    if (!orgId) return { success: false, data: null, summary: 'Organization not found.' };
    const [summary, totals] = await Promise.all([
      query<Record<string, unknown>>(`SELECT * FROM mv_asset_summary ORDER BY total_current_value DESC`),
      query<Record<string, unknown>>(
        `SELECT
           COUNT(*)::int AS total_assets,
           COALESCE(SUM(current_value), 0)::numeric AS total_value,
           COUNT(*) FILTER (WHERE status = 'available')::int AS available,
           COUNT(*) FILTER (WHERE status = 'assigned')::int AS assigned,
           COUNT(*) FILTER (WHERE warranty_end >= CURRENT_DATE AND warranty_end <= CURRENT_DATE + INTERVAL '30 days')::int AS warranty_expiring
         FROM assets
         WHERE organization_id = $1::uuid`,
        [orgId],
      ),
    ]);
    const t = totals.rows[0] ?? {};
    return {
      success: true,
      data: { totals: t, categories: summary.rows },
      summary: `Assets: ${Number(t.total_assets ?? 0)} total, €${Number(t.total_value ?? 0).toLocaleString()} current value, ${Number(t.available ?? 0)} available, ${Number(t.assigned ?? 0)} assigned, ${Number(t.warranty_expiring ?? 0)} warranties expiring in 30 days.`,
      metadata: { source: 'mv_asset_summary, assets', count: summary.rows.length },
    };
  },
});

registerTool({
  name: 'get_license_utilization',
  category: 'analytics',
  description: 'Get software license utilization showing which licenses are underutilized and potential cost savings.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(): Promise<ToolResult> {
    const orgId = await resolveOrgId();
    if (!orgId) return { success: false, data: null, summary: 'Organization not found.' };
    const result = await query<Record<string, unknown>>(
      `SELECT mv.*
       FROM mv_license_utilization mv
       JOIN licenses l ON l.id = mv.license_id
       WHERE l.organization_id = $1::uuid
       ORDER BY mv.utilization_percent ASC, mv.software_name ASC`,
      [orgId],
    );
    const items: Array<Record<string, unknown>> = result.rows.map((row) => ({
      ...row,
      potential_savings: Boolean(row.is_underutilized) ? Number(row.total_monthly_cost ?? 0) * 0.4 : 0,
    }));
    const savings = items.reduce((sum, item) => sum + Number(item.potential_savings ?? 0), 0);
    const underutilizedCount = items.filter((i) => Boolean(i.is_underutilized)).length;
    return {
      success: true,
      data: { licenses: items, potentialSavingsMonthly: savings },
      summary: `License utilization: ${underutilizedCount} underutilized licenses out of ${items.length}. Estimated optimization potential: €${savings.toFixed(2)} per month.`,
      metadata: { source: 'mv_license_utilization', count: items.length },
    };
  },
});
