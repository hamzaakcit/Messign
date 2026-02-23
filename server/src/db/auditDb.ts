import { query } from './index.js';
import type { AuditLog } from '../types/admin.js';

interface AuditRow {
  id: string;
  admin_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string;
  changes: Record<string, { before: unknown; after: unknown }> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

function mapRowToAuditLog(row: AuditRow): AuditLog {
  return {
    id: row.id,
    timestamp: row.created_at,
    adminId: row.admin_id,
    action: row.action,
    entityType: row.entity_type ?? '',
    entityId: row.entity_id ?? '',
    description: row.description ?? '',
    ipAddress: row.ip_address ?? undefined,
    userAgent: row.user_agent ?? undefined,
    changes: row.changes ?? undefined,
  };
}

export async function addAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'>): Promise<AuditLog> {
  const result = await query<AuditRow>(
    `INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, description, changes, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id::text AS id, admin_id, action, entity_type, entity_id, description, changes, ip_address, user_agent, created_at::text AS created_at`,
    [
      log.adminId,
      log.action,
      log.entityType ?? null,
      log.entityId ?? null,
      log.description ?? '',
      log.changes ? JSON.stringify(log.changes) : null,
      log.ipAddress ?? null,
      log.userAgent ?? null,
    ]
  );
  const row = result.rows[0];
  if (!row) throw new Error('Audit log insert failed');
  return mapRowToAuditLog(row);
}

export async function getAuditLogs(filters?: {
  adminId?: string;
  action?: string;
  entityType?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditLog[]> {
  const limit = Math.min(filters?.limit ?? 50, 200);
  const offset = filters?.offset ?? 0;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (filters?.adminId) {
    conditions.push(`admin_id = $${i++}`);
    params.push(filters.adminId);
  }
  if (filters?.action) {
    conditions.push(`action = $${i++}`);
    params.push(filters.action);
  }
  if (filters?.entityType) {
    conditions.push(`entity_type = $${i++}`);
    params.push(filters.entityType);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);
  const result = await query<AuditRow>(
    `SELECT id::text AS id, admin_id, action, entity_type, entity_id, description, changes, ip_address, user_agent, created_at::text AS created_at
     FROM admin_audit_log ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`,
    params
  );
  return result.rows.map(mapRowToAuditLog);
}
