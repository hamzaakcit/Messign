/**
 * Ensures a reimbursement_users row exists for the given auth user so that
 * requireAuth (used by Dora, Knowledge Hub, etc.) can resolve the user.
 * Call this whenever employee_auth is created/upserted so new accounts don't get 401.
 */

import { query } from './index.js';

const DEFAULT_ORG_SLUG = 'messign';

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  if (!local) return 'User';
  return local
    .replace(/[._-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || 'User';
}

/**
 * Ensures reimbursement_users has a row for this auth_user_id so requireAuth passes.
 * Uses ON CONFLICT (organization_id, email) to update auth_user_id if the email already exists.
 */
export async function ensureReimbursementUserForAuth(
  authUserId: string,
  email: string,
  fullName?: string
): Promise<void> {
  const orgResult = await query<{ id: string }>(
    `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
    [DEFAULT_ORG_SLUG]
  );
  const orgId = orgResult.rows[0]?.id;
  if (!orgId) return;

  const normalizedEmail = email.trim().toLowerCase();
  const name = (fullName && fullName.trim()) || nameFromEmail(normalizedEmail);

  await query(
    `INSERT INTO reimbursement_users (organization_id, auth_user_id, email, full_name, role, job_title, xp, level, status)
     VALUES ($1, $2, $3, $4, 'employee', 'employee', 0, 1, 'offline')
     ON CONFLICT (organization_id, email) DO UPDATE SET
       auth_user_id = EXCLUDED.auth_user_id,
       full_name = COALESCE(NULLIF(TRIM(EXCLUDED.full_name), ''), reimbursement_users.full_name),
       updated_at = NOW()`,
    [orgId, authUserId, normalizedEmail, name]
  );
}
