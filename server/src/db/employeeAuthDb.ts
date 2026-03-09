import { query } from './index.js';
import { ensureReimbursementUserForAuth } from './ensureReimbursementUser.js';
import type { EmployeeAuth, AccountStatus } from '../types/auth.js';

interface AuthRow {
  id: string;
  auth_user_id: string;
  email: string;
  password_hash: string;
  must_change_password: boolean;
  password_changed_at: string | null;
  password_history: unknown;
  temporary_password: string | null;
  account_status: string;
  failed_login_attempts: number;
  locked_until: string | null;
  lock_reason: string | null;
  last_login_at: string | null;
  last_login_ip: string | null;
  last_login_device: string | null;
  total_logins: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

function mapRow(row: AuthRow): EmployeeAuth {
  return {
    id: row.id,
    auth_user_id: row.auth_user_id,
    email: row.email,
    password_hash: row.password_hash,
    must_change_password: row.must_change_password,
    password_changed_at: row.password_changed_at,
    password_history: Array.isArray(row.password_history) ? row.password_history as string[] : [],
    temporary_password: row.temporary_password,
    account_status: row.account_status as AccountStatus,
    failed_login_attempts: row.failed_login_attempts,
    locked_until: row.locked_until,
    lock_reason: row.lock_reason,
    last_login_at: row.last_login_at,
    last_login_ip: row.last_login_ip,
    last_login_device: row.last_login_device,
    total_logins: row.total_logins,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    updated_by: row.updated_by,
  };
}

const COLS = `id::text AS id, auth_user_id, email, password_hash, must_change_password,
  password_changed_at::text AS password_changed_at, COALESCE(password_history, '[]')::jsonb AS password_history,
  temporary_password, account_status, failed_login_attempts, locked_until::text AS locked_until, lock_reason,
  last_login_at::text AS last_login_at, last_login_ip, last_login_device, total_logins,
  created_at::text AS created_at, updated_at::text AS updated_at, created_by, updated_by`;

export async function getByAuthUserId(authUserId: string): Promise<EmployeeAuth | null> {
  const result = await query<AuthRow>(
    `SELECT ${COLS} FROM employee_auth WHERE auth_user_id = $1 LIMIT 1`,
    [authUserId]
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function getByEmail(email: string): Promise<EmployeeAuth | null> {
  const result = await query<AuthRow>(
    `SELECT ${COLS} FROM employee_auth WHERE email = $1 LIMIT 1`,
    [email.trim().toLowerCase()]
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function upsert(params: {
  auth_user_id: string;
  email: string;
  password_hash: string;
  must_change_password: boolean;
  temporary_password: string | null;
  account_status: AccountStatus;
  created_by?: string;
  updated_by?: string;
}): Promise<EmployeeAuth> {
  const createdBy = params.created_by ?? 'system';
  const updatedBy = params.updated_by ?? 'system';
  const result = await query<AuthRow>(
    `INSERT INTO employee_auth (auth_user_id, email, password_hash, must_change_password, temporary_password, account_status, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (auth_user_id) DO UPDATE SET
       email = EXCLUDED.email,
       password_hash = EXCLUDED.password_hash,
       must_change_password = EXCLUDED.must_change_password,
       temporary_password = EXCLUDED.temporary_password,
       account_status = EXCLUDED.account_status,
       updated_at = NOW(),
       updated_by = EXCLUDED.updated_by
     RETURNING ${COLS}`,
    [
      params.auth_user_id,
      params.email.trim().toLowerCase(),
      params.password_hash,
      params.must_change_password,
      params.temporary_password,
      params.account_status,
      createdBy,
      updatedBy,
    ]
  );
  const row = result.rows[0];
  if (!row) throw new Error('employee_auth upsert failed');
  try {
    await ensureReimbursementUserForAuth(params.auth_user_id, params.email.trim().toLowerCase());
  } catch (e) {
    console.warn('[employeeAuthDb] ensureReimbursementUserForAuth failed:', e);
  }
  return mapRow(row);
}

export async function updatePassword(params: {
  auth_user_id: string;
  password_hash: string;
  password_history: string[];
  temporary_password: string | null;
  must_change_password: boolean;
  updated_by: string;
}): Promise<void> {
  await query(
    `UPDATE employee_auth SET
       password_hash = $1,
       password_history = $2::jsonb,
       temporary_password = $3,
       must_change_password = $4,
       password_changed_at = NOW(),
       updated_at = NOW(),
       updated_by = $5
     WHERE auth_user_id = $6`,
    [
      params.password_hash,
      JSON.stringify(params.password_history),
      params.temporary_password,
      params.must_change_password,
      params.updated_by,
      params.auth_user_id,
    ]
  );
}

export async function updateAccountStatus(
  authUserId: string,
  status: AccountStatus,
  updatedBy: string
): Promise<void> {
  await query(
    `UPDATE employee_auth SET account_status = $1, updated_at = NOW(), updated_by = $2 WHERE auth_user_id = $3`,
    [status, updatedBy, authUserId]
  );
}

export async function updateLoginTracking(params: {
  auth_user_id: string;
  last_login_ip: string | null;
  last_login_device: string | null;
}): Promise<void> {
  await query(
    `UPDATE employee_auth SET
       last_login_at = NOW(),
       last_login_ip = $1,
       last_login_device = $2,
       total_logins = total_logins + 1,
       failed_login_attempts = 0,
       updated_at = NOW()
     WHERE auth_user_id = $3`,
    [params.last_login_ip, params.last_login_device, params.auth_user_id]
  );
}

export async function incrementFailedAttempts(authUserId: string): Promise<number> {
  const result = await query<{ failed_login_attempts: number }>(
    `UPDATE employee_auth SET failed_login_attempts = failed_login_attempts + 1, updated_at = NOW()
     WHERE auth_user_id = $1
     RETURNING failed_login_attempts`,
    [authUserId]
  );
  return result.rows[0]?.failed_login_attempts ?? 0;
}

export async function setLocked(
  authUserId: string,
  lockedUntil: Date,
  lockReason: string
): Promise<void> {
  await query(
    `UPDATE employee_auth SET account_status = 'locked', locked_until = $1, lock_reason = $2, updated_at = NOW()
     WHERE auth_user_id = $3`,
    [lockedUntil.toISOString(), lockReason, authUserId]
  );
}

export async function clearLock(authUserId: string): Promise<void> {
  await query(
    `UPDATE employee_auth SET account_status = 'active', locked_until = NULL, lock_reason = NULL, failed_login_attempts = 0, updated_at = NOW()
     WHERE auth_user_id = $1`,
    [authUserId]
  );
}

export async function updateTemporaryPassword(
  authUserId: string,
  temporaryPassword: string | null,
  updatedBy: string
): Promise<void> {
  await query(
    `UPDATE employee_auth SET temporary_password = $1, updated_at = NOW(), updated_by = $2 WHERE auth_user_id = $3`,
    [temporaryPassword, updatedBy, authUserId]
  );
}

export async function updateMustChangePassword(
  authUserId: string,
  mustChangePassword: boolean,
  updatedBy: string
): Promise<void> {
  await query(
    `UPDATE employee_auth SET must_change_password = $1, updated_at = NOW(), updated_by = $2 WHERE auth_user_id = $3`,
    [mustChangePassword, updatedBy, authUserId]
  );
}

const DEFAULT_ORG_SLUG = 'messign';

export async function getAllWithAuth(): Promise<(EmployeeAuth & { full_name?: string; role?: string; department?: string | null })[]> {
  const result = await query<AuthRow & { full_name?: string; role?: string; department?: string | null }>(
    `SELECT ea.id::text AS id, ea.auth_user_id, ea.email, ea.password_hash, ea.must_change_password,
       ea.password_changed_at::text AS password_changed_at, COALESCE(ea.password_history, '[]')::jsonb AS password_history,
       ea.temporary_password, ea.account_status, ea.failed_login_attempts, ea.locked_until::text AS locked_until, ea.lock_reason,
       ea.last_login_at::text AS last_login_at, ea.last_login_ip, ea.last_login_device, ea.total_logins,
       ea.created_at::text AS created_at, ea.updated_at::text AS updated_at, ea.created_by, ea.updated_by,
       ru.full_name,
       ru.role,
       (SELECT pt.team_name FROM performance_team_members ptm JOIN performance_teams pt ON pt.id = ptm.team_id
        WHERE ptm.employee_id = ea.auth_user_id AND ptm.is_active = TRUE LIMIT 1) AS department
     FROM employee_auth ea
     LEFT JOIN reimbursement_users ru ON ru.auth_user_id = ea.auth_user_id
       AND ru.organization_id = (SELECT id FROM organizations WHERE slug = $1 LIMIT 1)
     ORDER BY ea.email`,
    [DEFAULT_ORG_SLUG]
  );
  return result.rows.map((row) => ({ ...mapRow(row), full_name: row.full_name, role: row.role, department: row.department }));
}
