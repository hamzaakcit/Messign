import { query } from './index.js';
import type { AuthAuditLog } from '../types/auth.js';

interface AuditRow {
  id: string;
  auth_user_id: string | null;
  target_auth_user_id: string | null;
  action: string;
  details: unknown;
  ip_address: string | null;
  user_agent: string | null;
  status: string;
  failure_reason: string | null;
  performed_by: string;
  created_at: string;
}

function mapRow(row: AuditRow): AuthAuditLog {
  return {
    id: row.id,
    auth_user_id: row.auth_user_id,
    target_auth_user_id: row.target_auth_user_id,
    action: row.action,
    details: (row.details as Record<string, unknown>) ?? {},
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    status: row.status as 'success' | 'failure',
    failure_reason: row.failure_reason,
    performed_by: row.performed_by,
    created_at: row.created_at,
  };
}

export async function insert(log: {
  auth_user_id?: string | null;
  target_auth_user_id?: string | null;
  action: string;
  details?: Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string | null;
  status: 'success' | 'failure';
  failure_reason?: string | null;
  performed_by: string;
}): Promise<AuthAuditLog> {
  const result = await query<AuditRow>(
    `INSERT INTO auth_audit_log (auth_user_id, target_auth_user_id, action, details, ip_address, user_agent, status, failure_reason, performed_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id::text AS id, auth_user_id, target_auth_user_id, action, COALESCE(details, '{}')::jsonb AS details,
       ip_address, user_agent, status, failure_reason, performed_by, created_at::text AS created_at`,
    [
      log.auth_user_id ?? null,
      log.target_auth_user_id ?? null,
      log.action,
      log.details ? JSON.stringify(log.details) : '{}',
      log.ip_address ?? null,
      log.user_agent ?? null,
      log.status,
      log.failure_reason ?? null,
      log.performed_by,
    ]
  );
  const row = result.rows[0];
  if (!row) throw new Error('auth_audit_log insert failed');
  return mapRow(row);
}

export async function getLogs(filters?: {
  auth_user_id?: string;
  target_auth_user_id?: string;
  action?: string;
  limit?: number;
  offset?: number;
}): Promise<AuthAuditLog[]> {
  const limit = Math.min(filters?.limit ?? 50, 200);
  const offset = filters?.offset ?? 0;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (filters?.auth_user_id) {
    conditions.push(`auth_user_id = $${i++}`);
    params.push(filters.auth_user_id);
  }
  if (filters?.target_auth_user_id) {
    conditions.push(`target_auth_user_id = $${i++}`);
    params.push(filters.target_auth_user_id);
  }
  if (filters?.action) {
    conditions.push(`action = $${i++}`);
    params.push(filters.action);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);
  const result = await query<AuditRow>(
    `SELECT id::text AS id, auth_user_id, target_auth_user_id, action, COALESCE(details, '{}')::jsonb AS details,
       ip_address, user_agent, status, failure_reason, performed_by, created_at::text AS created_at
     FROM auth_audit_log ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`,
    params
  );
  return result.rows.map(mapRow);
}
