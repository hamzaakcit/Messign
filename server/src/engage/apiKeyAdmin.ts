import { withEngageTenant } from './db.js';

/**
 * Operator-side handling of a tenant's API keys (WP-31): list what exists and revoke one. Revoking is the response to a leaked
 * key, so it must be possible without SQL. A revoked key is refused at once (requireApiKey reads revoked_at on every call), and
 * the audit log records who revoked it (migration 138). Metadata only: the key itself is never stored, only its hash.
 */
export interface ApiKeyInfo { id: string; name: string; prefix: string; scopes: string[]; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }

export async function listApiKeys(orgId: string): Promise<ApiKeyInfo[]> {
  return withEngageTenant(orgId, async (c) => {
    const r = await c.query<{ id: string; name: string; key_prefix: string; scopes: string[]; created_at: Date; last_used_at: Date | null; revoked_at: Date | null }>(
      `SELECT id, name, key_prefix, scopes, created_at, last_used_at, revoked_at FROM engage.api_keys WHERE organization_id = $1 ORDER BY created_at, id`, [orgId]);
    return r.rows.map((k) => ({
      id: k.id, name: k.name, prefix: k.key_prefix, scopes: k.scopes, createdAt: k.created_at.toISOString(),
      lastUsedAt: k.last_used_at ? k.last_used_at.toISOString() : null, revokedAt: k.revoked_at ? k.revoked_at.toISOString() : null,
    }));
  });
}

/** True when this call revoked the key; false when it does not exist for this organization or was already revoked. */
export async function revokeApiKey(orgId: string, keyId: string): Promise<boolean> {
  return withEngageTenant(orgId, async (c) => {
    const r = await c.query(`UPDATE engage.api_keys SET revoked_at = now() WHERE organization_id = $1 AND id = $2 AND revoked_at IS NULL`, [orgId, keyId]);
    return (r.rowCount ?? 0) > 0;
  });
}
