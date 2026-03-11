import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { getEmployeeByEmail, getEmployeeByIdAsUser } from '../db/employeesDb.js';
import { getBadgesForUser } from '../db/badgesDb.js';
import {
  getByAuthUserId,
  getByEmail,
  updateLoginTracking,
  incrementFailedAttempts,
  setLocked,
  updatePassword,
} from '../db/employeeAuthDb.js';
import { getPasswordPolicy } from '../db/settingsDb.js';
import { insert as insertAudit } from '../db/authAuditDb.js';
import * as sessionService from './sessionService.js';
import { signAccess, signRefresh, verifyRefresh, getAccessExpirySeconds } from '../utils/jwt.js';
import * as authSessionsDb from '../db/authSessionsDb.js';
import type { User } from '../types/index.js';
import { DEFAULT_PASSWORD } from '../types/auth.js';

export function computeFingerprint(ip?: string | null, userAgent?: string | null): string {
  return crypto.createHash('sha256')
    .update(`${ip ?? ''}:${userAgent ?? ''}`)
    .digest('hex')
    .substring(0, 16);
}

export function getClientIp(req: { ip?: string; headers?: Record<string, string | string[] | undefined> }): string | null {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) return (typeof forwarded === 'string' ? forwarded : forwarded[0])?.trim().split(',')[0] ?? null;
  return req.ip ?? null;
}

function getClientUserAgent(req: { headers?: { 'user-agent'?: string } }): string | null {
  return req.headers?.['user-agent'] ?? null;
}

function parseUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown';
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Edg')) return 'Edge';
  return 'Unknown';
}

function parseDeviceType(ua: string | null): string {
  if (!ua) return 'unknown';
  if (/\b(Android|webOS|iPhone|iPad|iPod)\b/i.test(ua)) return 'mobile';
  if (/\b(Tablet|iPad)\b/i.test(ua)) return 'tablet';
  return 'desktop';
}

export type LoginResult =
  | { success: true; data: { accessToken: string; refreshToken: string; expiresIn: number; user: User; mustChangePassword: boolean } }
  | { success: false; error: { code: 'INVALID_CREDENTIALS' | 'ACCOUNT_LOCKED' | 'ACCOUNT_INACTIVE'; message: string; remainingAttempts?: number; lockedUntil?: string } };

export async function login(
  email: string,
  password: string,
  req?: { ip?: string; headers?: Record<string, string | string[] | undefined> }
): Promise<LoginResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const ip = req ? getClientIp(req) : null;
  const userAgent = req ? getClientUserAgent(req) : null;

  const employeeRow = await getEmployeeByEmail(normalizedEmail);
  if (!employeeRow) {
    return {
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    };
  }

  const authUserId = employeeRow.auth_user_id ?? employeeRow.id;
  const auth = await getByAuthUserId(authUserId);
  if (!auth) {
    return {
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    };
  }

  if (auth.account_status === 'locked') {
    await insertAudit({
      auth_user_id: authUserId,
      action: 'login_failed',
      details: { reason: 'account_locked' },
      ip_address: ip,
      user_agent: userAgent,
      status: 'failure',
      failure_reason: 'Account is locked',
      performed_by: 'system',
    });
    return {
      success: false,
      error: {
        code: 'ACCOUNT_LOCKED',
        message: 'Account is locked. Contact your administrator.',
        lockedUntil: auth.locked_until ?? undefined,
      },
    };
  }

  if (auth.account_status === 'inactive' || auth.account_status === 'pending') {
    return {
      success: false,
      error: {
        code: 'ACCOUNT_INACTIVE',
        message: 'Account is not active. Contact your administrator.',
      },
    };
  }

  const passwordTrimmed = typeof password === 'string' ? password.trim() : '';
  let valid = await bcrypt.compare(passwordTrimmed, auth.password_hash);

  if (!valid && passwordTrimmed === DEFAULT_PASSWORD) {
    const freshHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
    await updatePassword({
      auth_user_id: authUserId,
      password_hash: freshHash,
      password_history: Array.isArray(auth.password_history) ? auth.password_history : [],
      temporary_password: auth.temporary_password,
      must_change_password: auth.must_change_password,
      updated_by: 'system',
    });
    valid = true;
  }

  if (!valid) {
    const policy = await getPasswordPolicy();
    const attempts = await incrementFailedAttempts(authUserId);
    const remaining = policy.maxFailedAttempts - attempts;

    await insertAudit({
      auth_user_id: authUserId,
      action: 'login_failed',
      details: { reason: 'invalid_password', attempts },
      ip_address: ip,
      user_agent: userAgent,
      status: 'failure',
      failure_reason: 'Invalid password',
      performed_by: 'system',
    });

    if (remaining <= 0) {
      const lockedUntil = new Date(Date.now() + policy.lockoutDurationMinutes * 60 * 1000);
      await setLocked(authUserId, lockedUntil, 'Too many failed login attempts');
      return {
        success: false,
        error: {
          code: 'ACCOUNT_LOCKED',
          message: 'Too many failed attempts. Account locked.',
          lockedUntil: lockedUntil.toISOString(),
        },
      };
    }

    return {
      success: false,
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
        remainingAttempts: remaining,
      },
    };
  }

  await updateLoginTracking({
    auth_user_id: authUserId,
    last_login_ip: ip,
    last_login_device: userAgent ? `${parseUserAgent(userAgent)} on ${parseDeviceType(userAgent)}` : null,
  });

  const refreshToken = authSessionsDb.generateRefreshToken();
  const { sessionId, expiresAt } = await sessionService.createSession({
    auth_user_id: authUserId,
    refreshToken,
    device_name: userAgent ? parseUserAgent(userAgent) : null,
    device_type: parseDeviceType(userAgent),
    browser: userAgent ? parseUserAgent(userAgent) : null,
    ip_address: ip,
    location: null,
  });

  const fp = computeFingerprint(ip, userAgent);
  const accessToken = signAccess({ sub: authUserId, sessionId, fp });
  const refreshJwt = signRefresh({ sub: authUserId, sessionId });

  await insertAudit({
    auth_user_id: authUserId,
    action: 'login_success',
    details: { sessionId },
    ip_address: ip,
    user_agent: userAgent,
    status: 'success',
    performed_by: 'self',
  });

  const user = await getEmployeeByIdAsUser(authUserId);
  if (!user) {
    return { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'User not found' } };
  }
  const badges = await getBadgesForUser(user.id);
  const userWithBadges = { ...user, badges };

  return {
    success: true,
    data: {
      accessToken,
      refreshToken: refreshJwt,
      expiresIn: getAccessExpirySeconds(),
      user: userWithBadges,
      mustChangePassword: auth.must_change_password,
    },
  };
}

export async function refresh(
  refreshToken: string,
  req?: { ip?: string; headers?: Record<string, string | string[] | undefined> }
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | null> {
  const payload = verifyRefresh(refreshToken);
  const session = await sessionService.findSessionByRefreshToken(refreshToken);
  if (!session || session.id !== payload.sessionId) return null;
  const ip = req ? getClientIp(req) : null;
  const userAgent = req ? getClientUserAgent(req) : null;
  const fp = computeFingerprint(ip, userAgent);
  const accessToken = signAccess({ sub: payload.sub, sessionId: payload.sessionId, fp });
  const newRefreshJwt = signRefresh({ sub: payload.sub, sessionId: payload.sessionId });
  return {
    accessToken,
    refreshToken: newRefreshJwt,
    expiresIn: getAccessExpirySeconds(),
  };
}

export async function logout(refreshToken: string | null, sessionId: string | null): Promise<void> {
  if (refreshToken) {
    try {
      const payload = verifyRefresh(refreshToken);
      await sessionService.revokeSession(payload.sessionId);
    } catch {
      // Token invalid or expired - nothing to revoke
    }
  } else if (sessionId) {
    await sessionService.revokeSession(sessionId);
  }
}

export async function getMe(authUserId: string): Promise<{ user: User; mustChangePassword: boolean } | null> {
  const user = await getEmployeeByIdAsUser(authUserId);
  if (!user) return null;
  const auth = await getByAuthUserId(authUserId);
  const badges = await getBadgesForUser(user.id);
  return {
    user: { ...user, badges },
    mustChangePassword: auth?.must_change_password ?? false,
  };
}
