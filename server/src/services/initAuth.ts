import bcrypt from 'bcrypt';
import { query } from '../db/index.js';
import { getByAuthUserId, upsert } from '../db/employeeAuthDb.js';
import { getDefaultSeedPassword } from '../types/auth.js';

const SALT_ROUNDS = 12;
const DEFAULT_ORG_SLUG = 'messign';
/** Same stable UUID as `server/src/db/seed.ts` so dev and seed stay aligned. */
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Creates the default tenant when the DB has no rows yet (fresh migrate without seed).
 * Idempotent: matches seed’s ON CONFLICT(slug) behavior.
 */
async function ensureMessignOrganizationRow(): Promise<void> {
  await query(
    `INSERT INTO organizations (id, name, slug, base_currency)
     VALUES ($1, 'Messign', $2, 'USD')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name`,
    [DEFAULT_ORG_ID, DEFAULT_ORG_SLUG],
  );
}

export async function initializeAuthRecords(): Promise<void> {
  let defaultPassword: string;
  try {
    defaultPassword = getDefaultSeedPassword();
  } catch {
    console.info('[initAuth] SEED_DEFAULT_PASSWORD not set — skipping auth seeding (required in production)');
    return;
  }
  try {
    await ensureMessignOrganizationRow();
  } catch (e) {
    console.warn('[initAuth] ensureMessignOrganizationRow failed:', e instanceof Error ? e.message : e);
  }
  const passwordHash = await bcrypt.hash(defaultPassword, SALT_ROUNDS);
  let orgResult = await query<{ id: string }>(
    `SELECT id::text AS id FROM organizations WHERE slug = $1 LIMIT 1`,
    [DEFAULT_ORG_SLUG],
  );
  let orgId = orgResult.rows[0]?.id;
  if (!orgId) {
    const anyOrg = await query<{ id: string }>(
      `SELECT id::text AS id FROM organizations ORDER BY created_at ASC NULLS LAST LIMIT 1`,
      [],
    );
    orgId = anyOrg.rows[0]?.id;
    if (orgId) {
      console.warn(
        '[initAuth] No organization with slug "messign"; using first organizations row for auth seeding',
      );
    }
  }
  if (!orgId) {
    console.warn('[initAuth] No organizations in database — skipping auth init (run db:seed or migrations)');
    return;
  }

  const usersResult = await query<{ auth_user_id: string; email: string }>(
    `SELECT auth_user_id, email FROM reimbursement_users WHERE organization_id = $1 AND auth_user_id IS NOT NULL`,
    [orgId]
  );

  for (const row of usersResult.rows) {
    const authUserId = row.auth_user_id;
    if (!authUserId) continue;
    const existing = await getByAuthUserId(authUserId);
    if (existing) continue;
    await upsert({
      auth_user_id: authUserId,
      email: row.email.trim().toLowerCase(),
      password_hash: passwordHash,
      must_change_password: true,
      temporary_password: defaultPassword,
      account_status: 'active',
      created_by: 'system',
      updated_by: 'system',
    });
    console.log(`[initAuth] Auth record created for ${row.email}`);
  }
  console.log('[initAuth] Auth initialization complete');
}
