import bcrypt from 'bcrypt';
import { query } from '../db/index.js';
import { getByAuthUserId, upsert } from '../db/employeeAuthDb.js';
import { getDefaultSeedPassword } from '../types/auth.js';

const SALT_ROUNDS = 12;
const DEFAULT_ORG_SLUG = 'messign';

export async function initializeAuthRecords(): Promise<void> {
  let defaultPassword: string;
  try {
    defaultPassword = getDefaultSeedPassword();
  } catch {
    console.info('[initAuth] SEED_DEFAULT_PASSWORD not set — skipping auth seeding (required in production)');
    return;
  }
  const passwordHash = await bcrypt.hash(defaultPassword, SALT_ROUNDS);
  const orgResult = await query<{ id: string }>(
    `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
    [DEFAULT_ORG_SLUG]
  );
  const orgId = orgResult.rows[0]?.id;
  if (!orgId) {
    console.warn('[initAuth] Organization not found, skipping auth init');
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
