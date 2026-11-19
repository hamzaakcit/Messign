import type { PoolClient } from 'pg';

/**
 * The platform organization may use engage as well as the Company-OS modules (ADR-016, one Lucy page for both). An
 * operator switches that on, and off again, here; nothing does it automatically. Only the platform organization
 * qualifies: an engage tenant stays `engage` and every other organization stays `workspace`. It writes the legacy
 * `organizations` table, which the engage role cannot touch, so it runs on the admin client (allow-listed bootstrap, ADR-002).
 */
export class EnablePlatformError extends Error {}

export interface EnablePlatformResult {
  organizationId: string;
  slug: string;
  product: 'all' | 'workspace';
  /** False when the organization already had the requested product. */
  changed: boolean;
}

/** Same rule as `requirePlatformAdmin`: the platform organization is the one named by PLATFORM_ORG_SLUG (default `messign`). */
export function platformSlug(): string {
  return process.env.PLATFORM_ORG_SLUG?.trim() || 'messign';
}

/** Route and script entry point: takes a client from the legacy admin pool (the only place engage code does). */
export async function setPlatformEngageWithAdminPool(on: boolean): Promise<EnablePlatformResult> {
  const { pool } = await import('../../db/index.js');
  const client = await pool.connect();
  try {
    return await setPlatformEngage(client, on);
  } finally {
    client.release();
  }
}

/**
 * `on`: product `all` and the engage settings row (send stays disabled until the operator enables it). `off`: back to
 * `workspace`; the engage data stays in place but becomes unreachable, as for any organization that is not a tenant.
 */
export async function setPlatformEngage(client: PoolClient, on: boolean): Promise<EnablePlatformResult> {
  const slug = platformSlug();
  await client.query('BEGIN');
  try {
    const found = await client.query<{ id: string; product: string }>(
      'SELECT id, product FROM organizations WHERE slug = $1 FOR UPDATE', [slug]);
    const org = found.rows[0];
    if (!org) throw new EnablePlatformError(`The platform organization "${slug}" does not exist.`);
    if (org.product === 'engage') throw new EnablePlatformError(`"${slug}" is an engage tenant, not the platform organization; it is not changed here.`);

    const product = on ? 'all' : 'workspace';
    const changed = org.product !== product;
    if (changed) await client.query('UPDATE organizations SET product = $2 WHERE id = $1', [org.id, product]);
    if (on) await client.query('INSERT INTO engage.tenant_settings (organization_id) VALUES ($1) ON CONFLICT DO NOTHING', [org.id]);
    await client.query('COMMIT');
    return { organizationId: org.id, slug, product, changed };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}
