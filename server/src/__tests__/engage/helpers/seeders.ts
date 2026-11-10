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

/** A message needs its own profile and mock account, so each fails on RLS first for a foreign org. */
async function seedMessage(c: pg.PoolClient, org: string): Promise<string> {
  const profile = await seedProfile(c, org);
  const acct = await c.query<{ id: string }>(
    `INSERT INTO engage.channel_accounts (organization_id, channel, provider, mode, label, secret_ciphertext, wrapped_data_key, key_id, secret_fingerprint)
     VALUES ($1, 'email', 'mock', 'test', $2, $3, $3, 'k1', 'seed') RETURNING id`, [org, `msg-seed-${org}-${Math.random()}`, DUMMY]);
  const m = await c.query<{ id: string }>(
    `INSERT INTO engage.messages (organization_id, profile_id, channel, purpose, channel_account_id, provider, idempotency_key, request_hash, content)
     VALUES ($1, $2, 'email', 'transactional', $3, 'mock', $4, $5, '{}'::jsonb) RETURNING id`,
    [org, profile, acct.rows[0]!.id, `seed-${Math.random()}`, 'a'.repeat(64)]);
  return m.rows[0]!.id;
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
  messages: async (c, org) => { await seedMessage(c, org); },
  message_events: async (c, org) => {
    const m = await seedMessage(c, org);
    // The event trigger insists on a tenant context (the other seeders are only checked by RLS, which the admin bypasses).
    await c.query("SELECT set_config('app.current_tenant', $1, false)", [org]);
    try {
      await c.query(`INSERT INTO engage.message_events (organization_id, message_id, type, source) VALUES ($1, $2, 'sent', 'system')`, [org, m]);
    } finally {
      await c.query('RESET app.current_tenant');
    }
  },
  send_decisions: async (c, org) => {
    const m = await seedMessage(c, org);
    await c.query(`INSERT INTO engage.send_decisions (organization_id, message_id, decision, code, send_mode) VALUES ($1, $2, 'deny', 'seed', 'sandbox')`, [org, m]);
  },
  send_allowlist: async (c, org) => {
    await c.query(`INSERT INTO engage.send_allowlist (organization_id, channel, value_normalized) VALUES ($1, 'email', $2)`, [org, `seed-${Math.random()}@example.com`]);
  },
  rate_cards: async (c, org) => {
    await c.query(`INSERT INTO engage.rate_cards (organization_id, channel, category, unit_cost_minor, currency) VALUES ($1, 'email', 'marketing', 1, 'TRY')`, [org]);
  },
  budget_caps: async (c, org) => {
    await c.query(`INSERT INTO engage.budget_caps (organization_id, channel, monthly_cap_minor, currency) VALUES ($1, $2, 100, 'TRY') ON CONFLICT DO NOTHING`,
      [org, ['email', 'sms', 'whatsapp'][Math.floor(Math.random() * 3)]]);
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
  templates: async (c, org) => { await seedTemplate(c, org); },
  journeys: async (c, org) => { await seedJourney(c, org); },
  journey_versions: async (c, org) => {
    const j = await seedJourney(c, org);
    await c.query(`INSERT INTO engage.journey_versions (organization_id, journey_id, version, definition) VALUES ($1, $2, 1, '{"steps":[]}'::jsonb)`, [org, j]);
  },
  enrollments: async (c, org) => { await seedEnrollment(c, org); },
  enrollment_steps: async (c, org) => {
    const e = await seedEnrollment(c, org);
    await c.query(`INSERT INTO engage.enrollment_steps (organization_id, enrollment_id, step_id, step_type, started_at, wake_at) VALUES ($1, $2, 's1', 'delay', now(), 'infinity')`, [org, e]);
  },
  segments: async (c, org) => { await seedSegment(c, org); },
  segment_versions: async (c, org) => {
    const s = await seedSegment(c, org);
    await c.query(`INSERT INTO engage.segment_versions (organization_id, segment_id, version, definition) VALUES ($1, $2, 1, '{"where":{"field":"orders.count","op":"gte","value":1}}'::jsonb)`, [org, s]);
  },
  segment_runs: async (c, org) => {
    const s = await seedSegment(c, org);
    const sv = await c.query<{ id: string }>(
      `INSERT INTO engage.segment_versions (organization_id, segment_id, version, definition) VALUES ($1, $2, 1, '{"where":{"field":"orders.count","op":"gte","value":1}}'::jsonb) RETURNING id`, [org, s]);
    const j = await seedJourney(c, org);
    const jv = await c.query<{ id: string }>(
      `INSERT INTO engage.journey_versions (organization_id, journey_id, version, definition) VALUES ($1, $2, 1, '{"steps":[]}'::jsonb) RETURNING id`, [org, j]);
    await c.query(
      `INSERT INTO engage.segment_runs (organization_id, journey_id, journey_version_id, segment_version_id, slot_at) VALUES ($1, $2, $3, $4, '2100-01-01T00:00:00Z')`,
      [org, j, jv.rows[0]!.id, sv.rows[0]!.id]);
  },
  template_versions: async (c, org) => {
    const t = await seedTemplate(c, org);
    await c.query(`INSERT INTO engage.template_versions (organization_id, template_id, version, subject, text_body) VALUES ($1, $2, 1, 's', 't')`, [org, t]);
  },
};

async function seedTemplate(c: pg.PoolClient, org: string): Promise<string> {
  const r = await c.query<{ id: string }>(
    `INSERT INTO engage.templates (organization_id, key, name, channel) VALUES ($1, $2, 'seed', 'email') RETURNING id`,
    [org, `seed-${Math.random().toString(36).slice(2, 12)}`]);
  return r.rows[0]!.id;
}

async function seedJourney(c: pg.PoolClient, org: string): Promise<string> {
  const r = await c.query<{ id: string }>(
    `INSERT INTO engage.journeys (organization_id, key, name) VALUES ($1, $2, 'seed') RETURNING id`,
    [org, `seed-${Math.random().toString(36).slice(2, 12)}`]);
  return r.rows[0]!.id;
}

/** next_run_at = infinity: a seeded enrollment is never due, so a journey tick in a parallel test file never runs it. */
async function seedEnrollment(c: pg.PoolClient, org: string): Promise<string> {
  const j = await seedJourney(c, org);
  const v = await c.query<{ id: string }>(
    `INSERT INTO engage.journey_versions (organization_id, journey_id, version, definition) VALUES ($1, $2, 1, '{"steps":[]}'::jsonb) RETURNING id`, [org, j]);
  const p = await seedProfile(c, org);
  const r = await c.query<{ id: string }>(
    `INSERT INTO engage.enrollments (organization_id, journey_id, journey_version_id, profile_id, trigger_kind, trigger_key, entered_at, current_step, next_run_at)
     VALUES ($1, $2, $3, $4, 'api', $5, now(), 's1', 'infinity') RETURNING id`, [org, j, v.rows[0]!.id, p, `api:seed-${Math.random()}`]);
  return r.rows[0]!.id;
}

async function seedSegment(c: pg.PoolClient, org: string): Promise<string> {
  const r = await c.query<{ id: string }>(
    `INSERT INTO engage.segments (organization_id, key, name) VALUES ($1, $2, 'seed') RETURNING id`,
    [org, `seed-${Math.random().toString(36).slice(2, 12)}`]);
  return r.rows[0]!.id;
}
