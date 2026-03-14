/**
 * SOC 2 Audit Trail — Platform-wide audit logging
 *
 * Every AI action that touches business data must have a corresponding audit record
 * with who, what, when, and the AI's reasoning trail.
 *
 * Fire-and-forget: never blocks the caller. Logs errors to console on failure.
 */
import { pool } from '../db/index.js';

/** Sentinel tenant for auth-only events (login/logout/refresh) when no org context */
const AUTH_TENANT_SENTINEL = '00000000-0000-0000-0000-000000000000';

export type AuditEvent = {
  tenantId?: string | null;
  userId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

export function logAuditEvent(event: AuditEvent): void {
  const tenantId = event.tenantId || AUTH_TENANT_SENTINEL;
  void (async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
      await client.query(
        `INSERT INTO platform_audit_log (tenant_id, user_id, action, resource_type, resource_id, details, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          tenantId,
          event.userId,
          event.action,
          event.resourceType ?? null,
          event.resourceId ?? null,
          JSON.stringify(event.details ?? {}),
          event.ipAddress ?? null,
          event.userAgent ?? null,
        ],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[audit] log failed:', err instanceof Error ? err.message : String(err));
    } finally {
      client.release();
    }
  })();
}
