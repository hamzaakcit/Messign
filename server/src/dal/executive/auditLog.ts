/**
 * SOC 2 Audit Log — Executive query for platform_audit_log
 */
import { withTenantQuery } from '../../db/index.js';

export interface AuditLogEntry {
  id: string;
  tenant_id: string;
  user_id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AuditLogParams {
  tenantId: string;
  range?: string; // e.g. '30d', '7d', '24h'
  action?: string; // e.g. 'ai.tool.executed', 'auth.login'
  limit?: number;
}

function parseRangeDays(range: string): number {
  if (range === '24h') return 1;
  const match = range.match(/^(\d+)d$/);
  return match ? Math.min(90, Math.max(1, parseInt(match[1]!, 10))) : 30;
}

export async function getAuditLog(params: AuditLogParams): Promise<AuditLogEntry[]> {
  const { tenantId, range = '30d', action, limit = 200 } = params;
  const days = parseRangeDays(range);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  return withTenantQuery(tenantId, async (client) => {
    let sql = `
      SELECT id::text, tenant_id::text, user_id, action, resource_type, resource_id,
             details, ip_address, user_agent, created_at::text
      FROM platform_audit_log
      WHERE tenant_id = $1 AND created_at >= $2
    `;
    const queryParams: unknown[] = [tenantId, since];
    let paramIdx = 3;

    if (action) {
      sql += ` AND action = $${paramIdx}`;
      queryParams.push(action);
      paramIdx++;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIdx}`;
    queryParams.push(limit);

    const result = await client.query(sql, queryParams);
    return result.rows as AuditLogEntry[];
  });
}
