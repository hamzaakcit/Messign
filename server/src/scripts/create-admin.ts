/**
 * One-off script to create the first admin user in production (Neon PostgreSQL).
 * Uses the same bcrypt hashing and tables (employee_auth, reimbursement_users) as the app.
 *
 * Usage (local DB):
 *   Set ADMIN_PASSWORD (min 8 chars). Optional: ADMIN_EMAIL (default hamza@messign.com).
 *     ADMIN_PASSWORD='YourSecurePassword' npx tsx src/scripts/create-admin.ts
 *   Or: npm run create-admin
 *
 * Usage (Railway — injects DATABASE_URL from the linked service):
 *   cd server && npx @railway/cli login && npx @railway/cli link
 *   Select the **API/Node** service that has `DATABASE_URL` (not the Postgres plugin URL alone unless that is what the app uses).
 *   npx @railway/cli run -- bash -c 'export ADMIN_PASSWORD="YourSecurePassword"; export ADMIN_EMAIL="you@yourdomain.com"; npm run create-admin'
 *   If you have multiple services: `npx @railway/cli service` (pick the API), or `npx @railway/cli run -s <api-service-name> -- ...`.
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { query } from '../db/index.js';
import { upsert as upsertEmployeeAuth } from '../db/employeeAuthDb.js';

const DEFAULT_ORG_SLUG = 'messign';
const DEFAULT_ADMIN_EMAIL = 'hamza@messign.com';
const SALT_ROUNDS = 12;

function resolveAdminEmail(): string {
  const raw = process.env.ADMIN_EMAIL?.trim();
  if (raw && raw.includes('@')) return raw.toLowerCase();
  return DEFAULT_ADMIN_EMAIL;
}

async function main(): Promise<void> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    console.error(
      'Set ADMIN_PASSWORD (min 8 chars) and run again, e.g.:\n  ADMIN_PASSWORD="YourPassword" npx tsx src/scripts/create-admin.ts'
    );
    process.exit(1);
  }

  const ADMIN_EMAIL = resolveAdminEmail();

  const orgResult = await query<{ id: string }>(
    `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
    [DEFAULT_ORG_SLUG]
  );
  const orgId = orgResult.rows[0]?.id;
  if (!orgId) {
    console.error('Organization with slug "messign" not found. Run db:seed first or create the organization.');
    process.exit(1);
  }

  const emailNormalized = ADMIN_EMAIL;
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Reuse existing auth_user_id if this email already has a reimbursement_users row
  const existing = await query<{ auth_user_id: string }>(
    `SELECT auth_user_id FROM reimbursement_users WHERE organization_id = $1 AND LOWER(TRIM(email)) = $2 LIMIT 1`,
    [orgId, emailNormalized]
  );
  const authUserId = existing.rows[0]?.auth_user_id ?? randomUUID();

  // Ensure reimbursement_users has an admin row (create or update by email)
  await query(
    `INSERT INTO reimbursement_users (organization_id, auth_user_id, email, full_name, role, status)
     VALUES ($1, $2, $3, $4, 'admin', 'active')
     ON CONFLICT (organization_id, email) DO UPDATE SET
       auth_user_id = EXCLUDED.auth_user_id,
       full_name = EXCLUDED.full_name,
       role = 'admin',
       status = 'active',
       updated_at = NOW()`,
    [orgId, authUserId, emailNormalized, 'Admin']
  );

  // Upsert employee_auth so login works (email + password)
  await upsertEmployeeAuth({
    auth_user_id: authUserId,
    email: emailNormalized,
    password_hash: passwordHash,
    must_change_password: false,
    temporary_password: null,
    account_status: 'active',
    created_by: 'create-admin-script',
    updated_by: 'create-admin-script',
  });

  // Award starter badges so the Achievements page is not empty for the admin
  const starterBadgeIds = [
    'badge-first-task',  // First Steps (common)
    'badge-level-10',    // Rising Star (common)
    'badge-1k-xp',       // XP Hunter (common)
    'badge-team-player', // Team Player (rare)
    'badge-communicator', // Communicator (rare)
  ];
  for (const badgeId of starterBadgeIds) {
    await query(
      `INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT (user_id, badge_id) DO NOTHING`,
      [authUserId, badgeId]
    );
  }

  // Seed initial activity feed entries for the admin so the feed is not empty
  const adminActivities = [
    { type: 'badge_earned', message: 'Admin earned the "First Steps" badge', xp_gained: 100 },
    { type: 'badge_earned', message: 'Admin earned the "Rising Star" badge', xp_gained: 50 },
    { type: 'project_joined', message: 'Admin joined "Messign Mobile App"', xp_gained: 10 },
    { type: 'badge_earned', message: 'Admin earned the "Team Player" badge', xp_gained: 100 },
  ];
  for (const a of adminActivities) {
    await query(
      `INSERT INTO activities (user_id, type, message, xp_gained) VALUES ($1, $2, $3, $4)`,
      [authUserId, a.type, a.message, a.xp_gained]
    );
  }

  console.log('Admin user created successfully!');
  console.log('  Email:', ADMIN_EMAIL);
  console.log('  Role: admin');
  console.log('  Starter badges awarded: 5');
  console.log('  You can log in at http://localhost:3000 using this email and your chosen password.');
}

main().catch((err) => {
  console.error('Failed to create admin user:', err);
  process.exit(1);
});
