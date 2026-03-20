import { query } from '../../../db/index.js';
import type { ToolContext } from '../types.js';

const FALLBACK_SLUG = 'messign';

/** Tenant for tool SQL — prefer auth context; fall back to default org for legacy callers. */
export async function resolveOrgIdForTool(context: ToolContext): Promise<string | null> {
  if (context.organizationId) return context.organizationId;
  const r = await query<{ id: string }>(`SELECT id FROM organizations WHERE slug = $1 LIMIT 1`, [FALLBACK_SLUG]);
  return r.rows[0]?.id ?? null;
}
