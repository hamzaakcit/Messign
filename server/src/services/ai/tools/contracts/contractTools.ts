import { registerTool } from '../../toolRegistry.js';
import { query } from '../../../../db/index.js';
import type { ToolContext, ToolResult } from '../../types.js';
import type { CallerContext } from '../../../../dal/types.js';
import * as contractsDal from '../../../../dal/contracts/contracts.js';

function buildCtx(ctx: ToolContext, organizationId?: string): CallerContext {
  return {
    userId: ctx.userId,
    role: (ctx.userRole ?? 'employee') as CallerContext['role'],
    organizationId,
  };
}

async function resolveOrgId(): Promise<string | undefined> {
  const result = await query<{ id: string }>('SELECT id FROM organizations WHERE slug = $1 LIMIT 1', ['messign']);
  return result.rows[0]?.id;
}

registerTool({
  name: 'get_contract_renewals',
  category: 'analytics',
  description: 'Get upcoming contract renewals and expirations with their status and required actions.',
  parameters: {
    type: 'object',
    properties: {
      withinDays: { type: 'number', description: 'Optional days window for renewals.' },
    },
    required: [],
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const orgId = await resolveOrgId();
    if (!orgId) return { success: false, data: null, summary: 'Organization not found.' };
    const withinDays = Number(args.withinDays ?? 90);
    const result = await query<Record<string, unknown>>(
      `SELECT *
       FROM mv_contract_renewals
       WHERE days_until_expiry <= $2
         AND contract_id IN (SELECT id FROM contracts WHERE organization_id = $1::uuid)
       ORDER BY days_until_expiry ASC`,
      [orgId, Number.isFinite(withinDays) ? withinDays : 90],
    );
    const urgent = result.rows.filter((r) => Number(r.days_until_expiry ?? 999) <= 30).length;
    return {
      success: true,
      data: result.rows,
      summary: `Contract renewals: ${result.rows.length} contracts within ${withinDays} days, ${urgent} urgent (<=30 days).`,
      metadata: { source: 'mv_contract_renewals', count: result.rows.length },
    };
  },
});

registerTool({
  name: 'extract_contract_terms',
  category: 'analytics',
  description: 'Extract key terms, obligations, and dates from a contract document using AI.',
  parameters: {
    type: 'object',
    properties: {
      contractId: { type: 'string', description: 'Optional contract UUID.' },
      contractTitle: { type: 'string', description: 'Optional fuzzy contract title.' },
    },
    required: [],
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const orgId = await resolveOrgId();
    if (!orgId) return { success: false, data: null, summary: 'Organization not found.' };
    const found = await query<{ id: string; title: string }>(
      `SELECT id::text, title
       FROM contracts
       WHERE organization_id = $1::uuid
         AND (
           ($2::uuid IS NOT NULL AND id = $2::uuid)
           OR ($3::text IS NOT NULL AND title ILIKE $3)
         )
       ORDER BY updated_at DESC
       LIMIT 1`,
      [
        orgId,
        typeof args.contractId === 'string' ? args.contractId : null,
        typeof args.contractTitle === 'string' && args.contractTitle.trim() ? `%${args.contractTitle.trim()}%` : null,
      ],
    );
    const contract = found.rows[0];
    if (!contract) {
      return { success: false, data: null, summary: 'Contract not found for extraction.' };
    }
    const extracted = await contractsDal.extractTermsWithAI(buildCtx(ctx, orgId), contract.id);
    return {
      success: true,
      data: extracted,
      summary: `Extracted key terms for "${contract.title}" with confidence ${Number(extracted.dora_extraction_confidence ?? 0).toFixed(2)}.`,
      metadata: { source: 'contracts.extractTermsWithAI', count: 1 },
    };
  },
});
