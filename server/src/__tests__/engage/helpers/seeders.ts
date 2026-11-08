import type pg from 'pg';

/**
 * One row per engage table for a given organization. A new engage table fails the isolation suite until it is
 * registered here, so nobody can add a table without it being tested for cross-tenant access.
 */
export type Seeder = (client: pg.PoolClient, organizationId: string) => Promise<void>;

/** Placeholder bytes: these rows only test isolation, never decryption. */
const DUMMY = Buffer.from('seed');

/** A profile for the seeded org. Child-table seeders create their own so each fails on RLS first for a foreign org. */
async function seedProfile(c: pg.PoolClient, org: string): Promise<string> {
  const r = await c.query<{ id: string }>(
    `INSERT INTO engage.profiles (organization_id, external_id) VALUES ($1, $2) RETURNING id`, [org, `seed-${org}-${Math.random()}`]);
  return r.rows[0]!.id;
}

export const SEEDERS: Record<string, Seeder> = {
  profiles: async (c, org) => { await seedProfile(c, org); },
  identifiers: async (c, org) => {
    const id = await seedProfile(c, org);
    await c.query(`INSERT INTO engage.identifiers (organization_id, profile_id, type, value_normalized) VALUES ($1, $2, 'email', $3)`,
      [org, id, `seed-${Math.random()}@example.com`]);
  },
  consents: async (c, org) => {
    const id = await seedProfile(c, org);
    await c.query(`INSERT INTO engage.consents (organization_id, profile_id, channel, status, source, evidence)
                   VALUES ($1, $2, 'email', 'granted', 'import', '{"file":"seed"}'::jsonb)`, [org, id]);
  },
  // consent_state is written only by the trigger on the ledger, so seeding it means appending a consent.
  consent_state: async (c, org) => {
    const id = await seedProfile(c, org);
    await c.query(`INSERT INTO engage.consents (organization_id, profile_id, channel, status, source) VALUES ($1, $2, 'sms', 'revoked', 'stop_keyword')`, [org, id]);
  },
  event_keys: async (c, org) => {
    await c.query(`INSERT INTO engage.event_keys (organization_id, client_event_id, event_id, occurred_at) VALUES ($1, $2, gen_random_uuid(), now())`,
      [org, `seed-${Math.random()}`]);
  },
  events: async (c, org) => {
    const id = await seedProfile(c, org);
    await c.query('SELECT engage.ensure_event_partition(now())');
    await c.query(`INSERT INTO engage.events (organization_id, profile_id, client_event_id, name, occurred_at) VALUES ($1, $2, $3, 'seed_event', now())`,
      [org, id, `seed-${Math.random()}`]);
  },
  trigger_outbox: async (c, org) => {
    await c.query(`INSERT INTO engage.trigger_outbox (organization_id, event_id, occurred_at) VALUES ($1, gen_random_uuid(), now())`, [org]);
  },
  imports: async (c, org) => {
    await c.query(`INSERT INTO engage.imports (organization_id, kind, content) VALUES ($1, 'profiles', 'external_id\nseed')`, [org]);
  },
  suppressions: async (c, org) => {
    await c.query(`INSERT INTO engage.suppressions (organization_id, channel, value_normalized, reason) VALUES ($1, 'email', $2, 'manual')`,
      [org, `seed-${Math.random()}@example.com`]);
  },
  channel_accounts: async (c, org) => {
    await c.query(
      `INSERT INTO engage.channel_accounts (organization_id, channel, provider, mode, label, secret_ciphertext, wrapped_data_key, key_id, secret_fingerprint)
       VALUES ($1, 'email', 'mock', 'test', $2, $3, $3, 'k1', 'seed')`,
      [org, `seed-${org}-${Math.random()}`, DUMMY]);
  },
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
