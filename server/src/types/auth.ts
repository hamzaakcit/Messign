export type AccountStatus = 'active' | 'inactive' | 'locked' | 'pending';

export interface EmployeeAuth {
  id: string;
  auth_user_id: string;
  email: string;
  password_hash: string;
  must_change_password: boolean;
  password_changed_at: string | null;
  password_history: string[];
  temporary_password: string | null;
  account_status: AccountStatus;
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

export interface AuthSession {
  id: string;
  auth_user_id: string;
  refresh_token_hash: string;
  device_name: string | null;
  device_type: string | null;
  browser: string | null;
  ip_address: string | null;
  location: string | null;
  is_active: boolean;
  created_at: string;
  expires_at: string;
  last_activity_at: string;
}

export type AuditAction =
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'logout_all_sessions'
  | 'password_change_self'
  | 'password_change_by_admin'
  | 'password_reset_to_default'
  | 'password_view_by_admin'
  | 'account_locked'
  | 'account_unlocked'
  | 'account_status_changed'
  | 'session_revoked'
  | 'force_password_change_enabled'
  | 'force_password_change_disabled';

export interface AuthAuditLog {
  id: string;
  auth_user_id: string | null;
  target_auth_user_id: string | null;
  action: string;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  status: 'success' | 'failure';
  failure_reason: string | null;
  performed_by: string;
  created_at: string;
}

export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  specialCharsAllowed: string;
  maxFailedAttempts: number;
  lockoutDurationMinutes: number;
  passwordHistoryCount: number;
  sessionTimeoutMinutes: number;
}

export const defaultPasswordPolicy: PasswordPolicy = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  specialCharsAllowed: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  maxFailedAttempts: 5,
  lockoutDurationMinutes: 30,
  passwordHistoryCount: 5,
  sessionTimeoutMinutes: 480,
};

/** Same string as `server/.env.example` — used for non-production login self-heal when `SEED_DEFAULT_PASSWORD` env differs from what you type. */
export const DEV_DEMO_PASSWORD = 'test123';

/**
 * Password used for `db:seed` / bulk import and login self-heal when the DB hash is stale.
 * - Prefer `SEED_DEFAULT_PASSWORD` in `server/.env` (see `server/.env.example`).
 * - In non-production, if unset, falls back to the same demo value as `.env.example` so local dev works without copying env.
 * - In production, unset throws — set the var on the API host (e.g. Railway).
 */
export function getDefaultSeedPassword(): string {
  const pw = process.env.SEED_DEFAULT_PASSWORD?.trim();
  if (pw) return pw;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SEED_DEFAULT_PASSWORD is required in production. Set it on the API host environment.',
    );
  }
  return DEV_DEMO_PASSWORD;
}
