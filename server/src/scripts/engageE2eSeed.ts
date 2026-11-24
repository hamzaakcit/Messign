/**
 * Seeds a throwaway database for the engage browser tests (playwright.engage.config.ts). Never point it at a real
 * database: it migrates it, gives the messign_engage role a test password, and creates a tenant with test data.
 *
 *   ENGAGE_E2E_ADMIN_URL=postgresql://...  ENGAGE_E2E_SEED_FILE=e2e-engage/.auth/seed.json  npx tsx src/scripts/engageE2eSeed.ts
 *
 * The tenant: an admin with a freshly generated password (written to the seed file only, never printed), send enabled
 * in sandbox with a mock email account, the cart-abandonment journey approved and active, and 30 simulated carts run
 * through the real pipeline, so customers have journeys, messages, gate decisions and consent records.
 */
import { randomBytes } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import pg from 'pg';

const ENGAGE_ROLE_PASSWORD = 'engage-test-only'; // the same test-only password the integration fixture uses

async function main(): Promise<void> {
  const adminUrl = process.env.ENGAGE_E2E_ADMIN_URL;
  const seedFile = process.env.ENGAGE_E2E_SEED_FILE;
  if (!adminUrl || !seedFile) throw new Error('ENGAGE_E2E_ADMIN_URL and ENGAGE_E2E_SEED_FILE are required');
  const host = new URL(adminUrl).hostname;
  if (!['localhost', '127.0.0.1', '::1', ''].includes(host)) throw new Error('Refusing to seed a non-local database');

  const { runMigrations } = await import('../migrations/runner.js');
  await runMigrations({ connectionString: adminUrl, log: () => undefined });
  const admin = new pg.Pool({ connectionString: adminUrl, max: 2 });
  await admin.query(`ALTER ROLE messign_engage LOGIN PASSWORD '${ENGAGE_ROLE_PASSWORD}'`);
  await admin.query(`SELECT engage.ensure_event_partition(GREATEST(m, now() - interval '399 days'))
                       FROM generate_series(date_trunc('month', now() - interval '3 days'), now() + interval '1 day', interval '1 month') AS m`);

  const u = new URL(adminUrl);
  u.username = 'messign_engage';
  u.password = ENGAGE_ROLE_PASSWORD;
  process.env.ENGAGE_DATABASE_URL = u.toString();
  process.env.DATABASE_URL = adminUrl;
  process.env.SEND_MODE = 'sandbox';

  const { provisionOrganization } = await import('../engage/bootstrap/provisionOrganization.js');
  const suffix = randomBytes(4).toString('hex');
  const email = `e2e-admin-${suffix}@example.com`;
  const client = await admin.connect();
  let t: Awaited<ReturnType<typeof provisionOrganization>>;
  try {
    t = await provisionOrganization(client, { name: `E2E Kitap ${suffix}`, slug: `e2e-${suffix}`, adminEmail: email, adminFullName: 'E2E Admin' });
  } finally { client.release(); }
  const password = randomBytes(18).toString('base64url');
  await admin.query(`UPDATE employee_auth SET password_hash = $2, must_change_password = false WHERE auth_user_id = $1`,
    [t.admin.authUserId, await bcrypt.hash(password, 10)]);
  const org = t.organization.id;

  const db = await import('../engage/db.js');
  const M = await import('../engage/messaging/index.js');
  const creds = await import('../engage/credentials.js');
  const CA = await import('../engage/journeys/cartAbandonment.js');
  const J = await import('../engage/journeys/journeys.js');
  const S = await import('../engage/simulator/cartSimulator.js');
  const R = await import('../engage/simulator/runCartSimulation.js');
  await db.withEngageTenant(org, (c) => c.query(`UPDATE engage.tenant_settings SET send_enabled = true WHERE organization_id = $1`, [org]));
  await M.addRateCard(org, { channel: 'email', category: 'marketing', unitCostMinor: 1, currency: 'TRY' });
  await M.setBudgetCap(org, 'email', 1_000_000, 'TRY');
  await creds.createAccount(org, t.admin.userId, { channel: 'email', provider: 'mock', mode: 'test', label: 'Mock sender', config: {}, secrets: { webhook_secret: `whsec_${suffix}` } });
  const { journeyId } = await CA.installCartAbandonment(org, t.admin.userId, { holdoutPercent: 0 });
  await J.approveJourneyVersion(org, t.admin.userId, journeyId, 1);
  await J.activateJourneyVersion(org, t.admin.userId, journeyId, 1);
  const plan = S.planCartSimulation({ carts: 30, seed: 4242, runId: suffix, noConsentRate: 0.2, mix: { abandons: 1, buys_before_reminder: 0, buys_between: 0, buys_reported_late: 0 } });
  await R.runCartSimulation(org, plan, { dispatch: true });

  const pick = async (status: string) => (await db.withEngageTenant(org, (c) => c.query<{ external_id: string }>(
    `SELECT p.external_id FROM engage.messages m JOIN engage.profiles p ON p.organization_id = m.organization_id AND p.id = m.profile_id
      WHERE m.organization_id = $1 AND m.status = $2 ORDER BY p.external_id LIMIT 1`, [org, status]))).rows[0]?.external_id;
  const sentCustomer = (await pick('sent')) ?? (await pick('delivered'));
  const blockedCustomer = await pick('blocked');
  if (!sentCustomer || !blockedCustomer) throw new Error('The simulation produced no sent or no blocked message');

  mkdirSync(path.dirname(seedFile), { recursive: true });
  writeFileSync(seedFile, JSON.stringify({ email, password, organizationId: org, sentCustomer, blockedCustomer }, null, 2), { mode: 0o600 });
  await db.closeEngagePool();
  await admin.end();
  const legacy = await import('../db/index.js');
  await (legacy.pool as unknown as { end: () => Promise<void> }).end().catch(() => undefined);
  console.log(`[e2e-seed] tenant ${t.organization.slug} ready; credentials in ${seedFile}`);
}

main().catch((err) => { console.error('[e2e-seed] failed:', err instanceof Error ? err.message : err); process.exit(1); });
