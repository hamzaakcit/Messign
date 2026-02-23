import { randomBytes, createHash } from 'crypto';
import { query } from './index.js';
import type { AuthSession } from '../types/auth.js';

interface SessionRow {
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

function mapRow(row: SessionRow): AuthSession {
  return {
    id: row.id,
    auth_user_id: row.auth_user_id,
    refresh_token_hash: row.refresh_token_hash,
    device_name: row.device_name,
    device_type: row.device_type,
    browser: row.browser,
    ip_address: row.ip_address,
    location: row.location,
    is_active: row.is_active,
    created_at: row.created_at,
    expires_at: row.expires_at,
    last_activity_at: row.last_activity_at,
  };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function create(params: {
  auth_user_id: string;
  refresh_token_hash: string;
  expires_at: Date;
  device_name?: string | null;
  device_type?: string | null;
  browser?: string | null;
  ip_address?: string | null;
  location?: string | null;
}): Promise<AuthSession> {
  const result = await query<SessionRow>(
    `INSERT INTO auth_sessions (auth_user_id, refresh_token_hash, expires_at, device_name, device_type, browser, ip_address, location)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id::text AS id, auth_user_id, refresh_token_hash, device_name, device_type, browser, ip_address, location,
       is_active, created_at::text AS created_at, expires_at::text AS expires_at, last_activity_at::text AS last_activity_at`,
    [
      params.auth_user_id,
      params.refresh_token_hash,
      params.expires_at.toISOString(),
      params.device_name ?? null,
      params.device_type ?? null,
      params.browser ?? null,
      params.ip_address ?? null,
      params.location ?? null,
    ]
  );
  const row = result.rows[0];
  if (!row) throw new Error('auth_sessions insert failed');
  return mapRow(row);
}

export async function getById(sessionId: string): Promise<AuthSession | null> {
  const result = await query<SessionRow>(
    `SELECT id::text AS id, auth_user_id, refresh_token_hash, device_name, device_type, browser, ip_address, location,
       is_active, created_at::text AS created_at, expires_at::text AS expires_at, last_activity_at::text AS last_activity_at
     FROM auth_sessions WHERE id = $1 AND is_active = TRUE LIMIT 1`,
    [sessionId]
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function getByRefreshTokenHash(refreshTokenHash: string): Promise<AuthSession | null> {
  const result = await query<SessionRow>(
    `SELECT id::text AS id, auth_user_id, refresh_token_hash, device_name, device_type, browser, ip_address, location,
       is_active, created_at::text AS created_at, expires_at::text AS expires_at, last_activity_at::text AS last_activity_at
     FROM auth_sessions WHERE refresh_token_hash = $1 AND is_active = TRUE AND expires_at > NOW() LIMIT 1`,
    [refreshTokenHash]
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function getByAuthUserId(authUserId: string): Promise<AuthSession[]> {
  const result = await query<SessionRow>(
    `SELECT id::text AS id, auth_user_id, refresh_token_hash, device_name, device_type, browser, ip_address, location,
       is_active, created_at::text AS created_at, expires_at::text AS expires_at, last_activity_at::text AS last_activity_at
     FROM auth_sessions WHERE auth_user_id = $1 AND is_active = TRUE AND expires_at > NOW() ORDER BY last_activity_at DESC`,
    [authUserId]
  );
  return result.rows.map(mapRow);
}

export async function revokeById(sessionId: string): Promise<boolean> {
  const result = await query(
    `UPDATE auth_sessions SET is_active = FALSE WHERE id = $1 RETURNING id`,
    [sessionId]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

export async function revokeAllForUser(authUserId: string, exceptSessionId?: string): Promise<number> {
  if (exceptSessionId) {
    const result = await query(
      `UPDATE auth_sessions SET is_active = FALSE WHERE auth_user_id = $1 AND id != $2 RETURNING id`,
      [authUserId, exceptSessionId]
    );
    return result.rowCount ?? 0;
  }
  const result = await query(
    `UPDATE auth_sessions SET is_active = FALSE WHERE auth_user_id = $1 RETURNING id`,
    [authUserId]
  );
  return result.rowCount ?? 0;
}

export async function updateLastActivity(sessionId: string): Promise<void> {
  await query(
    `UPDATE auth_sessions SET last_activity_at = NOW() WHERE id = $1`,
    [sessionId]
  );
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex');
}
