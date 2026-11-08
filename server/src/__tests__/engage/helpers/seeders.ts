import type pg from 'pg';

/**
 * One row per engage table for a given organization. A new engage table fails the isolation suite until it is
 * registered here, so nobody can add a table without it being tested for cross-tenant access.
 */
export type Seeder = (client: pg.PoolClient, organizationId: string) => Promise<void>;

export const SEEDERS: Record<string, Seeder> = {
  tenant_settings: async (c, org) => {
    await c.query('INSERT INTO engage.tenant_settings (organization_id) VALUES ($1)', [org]);
  },
  tenant_readiness: async (c, org) => {
    await c.query(`INSERT INTO engage.tenant_readiness (organization_id, channel, item, value) VALUES ($1, 'email', 'seed-${org}', 'v')`, [org]);
  },
  api_keys: async (c, org) => {
    await c.query(
      `INSERT INTO engage.api_keys (organization_id, name, key_prefix, key_hash, scopes) VALUES ($1, 'seed', 'mke_seed', $2, '{ingest}')`,
      [org, `seed-hash-${org}-${Math.random()}`]);
  },
};
