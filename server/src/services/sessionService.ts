import * as authSessionsDb from '../db/authSessionsDb.js';
import { getPasswordPolicy } from '../db/settingsDb.js';

export async function createSession(params: {
  auth_user_id: string;
  refreshToken: string;
  device_name?: string | null;
  device_type?: string | null;
  browser?: string | null;
  ip_address?: string | null;
  location?: string | null;
}): Promise<{ sessionId: string; expiresAt: Date }> {
  const policy = await getPasswordPolicy();
  const expiresAt = new Date(Date.now() + policy.sessionTimeoutMinutes * 60 * 1000);
  const refreshTokenHash = authSessionsDb.hashToken(params.refreshToken);
  const session = await authSessionsDb.create({
    auth_user_id: params.auth_user_id,
    refresh_token_hash: refreshTokenHash,
    expires_at: expiresAt,
    device_name: params.device_name,
    device_type: params.device_type,
    browser: params.browser,
    ip_address: params.ip_address,
    location: params.location,
  });
  return { sessionId: session.id, expiresAt };
}

export async function revokeSession(sessionId: string): Promise<boolean> {
  return authSessionsDb.revokeById(sessionId);
}

export async function revokeAllForUser(authUserId: string, exceptSessionId?: string): Promise<number> {
  return authSessionsDb.revokeAllForUser(authUserId, exceptSessionId);
}

export async function getSessionsForUser(authUserId: string) {
  return authSessionsDb.getByAuthUserId(authUserId);
}

export async function findSessionByRefreshToken(refreshToken: string) {
  const hash = authSessionsDb.hashToken(refreshToken);
  return authSessionsDb.getByRefreshTokenHash(hash);
}
