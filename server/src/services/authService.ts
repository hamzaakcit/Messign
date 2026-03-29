import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { getEmployeeByEmail, getEmployeeByIdAsUser } from '../db/employeesDb.js';
import { getBadgesForUser } from '../db/badgesDb.js';
import {
  clearLock,
  getByAuthUserId,
  getByEmail,
  updateLoginTracking,
  incrementFailedAttempts,
  setLocked,
  updatePassword,
  upsert as upsertEmployeeAuth,
} from '../db/employeeAuthDb.js';
import { getPasswordPolicy } from '../db/settingsDb.js';
import { insert as insertAudit } from '../db/authAuditDb.js';
import { query } from '../db/index.js';
import { logAuditEvent } from '../platform/audit.js';
import * as sessionService from './sessionService.js';
import { signAccess, signRefresh, verifyRefresh, getAccessExpirySeconds } from '../utils/jwt.js';
import * as authSessionsDb from '../db/authSessionsDb.js';
import { ensureReimbursementUserForAuth } from '../db/ensureReimbursementUser.js';
import type { User } from '../types/index.js';
import { DEV_DEMO_PASSWORD, getDefaultSeedPassword } from '../types/auth.js';

export function computeFingerprint(ip?: string | null, userAgent?: string | null): string {
  return crypto.createHash('sha256')
    .update(`${ip ?? ''}:${userAgent ?? ''}`)
    .digest('hex')
    .substring(0, 16);
}

/** Normalize `::ffff:a.b.c.d` to `a.b.c.d` so JWT fp matches across IPv4-mapped vs dotted forms. */
export function normalizeIpv4MappedAddress(ip: string): string {
  const m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip.trim());
  return m ? m[1] : ip.trim();
}

/**
 * Returns true if the JWT `fp` claim matches any plausible IP + user-agent pair.
 * Socket.IO handshakes and Express can expose different client IPs for the same browser tab.
 */
export function matchAccessTokenFingerprint(
  tokenFp: string | undefined,
  ipCandidates: Array<string | null | undefined>,
  userAgent: string | string[] | undefined,
): boolean {
  if (!tokenFp) return true;
  const ua = typeof userAgent === 'string' ? userAgent : userAgent?.[0] ?? null;
  const seen = new Set<string>();
  for (const raw of ipCandidates) {
    if (raw == null || raw === '') continue;
    const trimmed = String(raw).trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    const normalized = normalizeIpv4MappedAddress(trimmed);
    for (const ip of new Set([trimmed, normalized])) {
      if (computeFingerprint(ip, ua) === tokenFp) return true;
    }
  }
  return false;
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
  const isNonProd = process.env.NODE_ENV !== 'production';

  let employeeRow = await getEmployeeByEmail(normalizedEmail);
  /** `employee_auth` can exist without a matching `reimbursement_users` row (skipped seed, org mismatch). */
  if (!employeeRow) {
    const authOnly = await getByEmail(normalizedEmail);
    if (authOnly) {
      await ensureReimbursementUserForAuth(authOnly.auth_user_id, normalizedEmail);
      employeeRow = await getEmployeeByEmail(normalizedEmail);
    }
  }
  if (!employeeRow) {
    return {
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    };
  }

  const authUserId = employeeRow.auth_user_id ?? employeeRow.id;
  let auth = await getByAuthUserId(authUserId);
  /** Local/staging: workspace user exists but `employee_auth` was never created (skipped initAuth org mismatch, etc.). */
  if (!auth && isNonProd) {
    try {
      const seedPw = getDefaultSeedPassword();
      const freshHash = await bcrypt.hash(seedPw, 12);
      await upsertEmployeeAuth({
        auth_user_id: authUserId,
        email: normalizedEmail,
        password_hash: freshHash,
        must_change_password: true,
        temporary_password: seedPw,
        account_status: 'active',
        created_by: 'system',
        updated_by: 'system',
      });
      auth = await getByAuthUserId(authUserId);
      if (auth) {
        console.warn(`[authService] login self-heal: created employee_auth for ${normalizedEmail}`);
      }
    } catch (e) {
      console.warn('[authService] login self-heal employee_auth failed:', e instanceof Error ? e.message : e);
    }
  }
  if (!auth) {
    return {
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    };
  }

  const passwordTrimmed = typeof password === 'string' ? password.trim() : '';

  /** Matches seed string; in non-production only, comparison is case-insensitive (avoids Test123 vs test123 lockouts during local dev). */
  function passwordMatchesSeed(seed: string | null): boolean {
    if (!seed) return false;
    if (passwordTrimmed === seed) return true;
    return isNonProd && passwordTrimmed.toLowerCase() === seed.toLowerCase();
  }

  if (auth.account_status === 'locked') {
    const seedPw = (() => {
      try {
        return getDefaultSeedPassword();
      } catch {
        return null;
      }
    })();
    const demoUnlock =
      isNonProd && (passwordMatchesSeed(seedPw) || passwordTrimmed === DEV_DEMO_PASSWORD);
    if (demoUnlock) {
      await clearLock(authUserId);
      const authAfter = await getByAuthUserId(authUserId);
      if (authAfter?.account_status === 'active') {
        auth = authAfter;
      }
    }
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
    logAuditEvent({
      userId: authUserId,
      action: 'auth.login',
      details: { success: false, reason: 'account_locked' },
      ipAddress: ip ?? undefined,
      userAgent: userAgent ?? undefined,
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

  /** bcrypt cost 12 — dominant CPU cost on login; lowering rounds trades security for latency. */
  let valid = await bcrypt.compare(passwordTrimmed, auth.password_hash);

  const seedPw = (() => { try { return getDefaultSeedPassword(); } catch { return null; } })();
  if (!valid && seedPw != null && passwordMatchesSeed(seedPw)) {
    const freshHash = await bcrypt.hash(seedPw, 12);
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

  /** Non-production: typed password is the documented demo (`test123`) even when `SEED_DEFAULT_PASSWORD` in .env is different. */
  if (!valid && isNonProd && passwordTrimmed === DEV_DEMO_PASSWORD) {
    const freshHash = await bcrypt.hash(DEV_DEMO_PASSWORD, 12);
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

  const [orgRow, user] = await Promise.all([
    query<{ organization_id: string }>(
      `SELECT organization_id::text FROM reimbursement_users WHERE auth_user_id = $1 LIMIT 1`,
      [authUserId],
    ),
    getEmployeeByIdAsUser(authUserId),
  ]);
  if (!user) {
    return { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'User not found' } };
  }
  const tenantId = orgRow.rows[0]?.organization_id ?? null;

  const placeholderToken = authSessionsDb.generateRefreshToken();
  const { sessionId } = await sessionService.createSession({
    auth_user_id: authUserId,
    refreshToken: placeholderToken,
    device_name: userAgent ? parseUserAgent(userAgent) : null,
    device_type: parseDeviceType(userAgent),
    browser: userAgent ? parseUserAgent(userAgent) : null,
    ip_address: ip,
    location: null,
  });

  const refreshJwt = signRefresh({ sub: authUserId, sessionId });
  await sessionService.updateRefreshTokenHash(sessionId, refreshJwt);

  const fp = computeFingerprint(ip, userAgent);
  const accessToken = signAccess({
    sub: authUserId,
    sessionId,
    fp,
    organizationId: tenantId ?? undefined,
  });

  await insertAudit({
    auth_user_id: authUserId,
    action: 'login_success',
    details: { sessionId },
    ip_address: ip,
    user_agent: userAgent,
    status: 'success',
    performed_by: 'self',
  });
  logAuditEvent({
    tenantId: tenantId ?? undefined,
    userId: authUserId,
    action: 'auth.login',
    details: { sessionId, success: true },
    ipAddress: ip ?? undefined,
    userAgent: userAgent ?? undefined,
  });

  const [, badges] = await Promise.all([
    ensureReimbursementUserForAuth(authUserId, user.email, user.name).catch((e) => {
      console.warn('[authService.login] ensureReimbursementUserForAuth:', e);
    }),
    getBadgesForUser(user.id),
  ]);
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
  const orgRow = await query<{ organization_id: string }>(
    `SELECT organization_id::text FROM reimbursement_users WHERE auth_user_id = $1 LIMIT 1`,
    [payload.sub],
  );
  const fp = computeFingerprint(ip, userAgent);
  const accessToken = signAccess({
    sub: payload.sub,
    sessionId: payload.sessionId,
    fp,
    organizationId: orgRow.rows[0]?.organization_id,
  });
  const newRefreshJwt = signRefresh({ sub: payload.sub, sessionId: payload.sessionId });
  await sessionService.updateRefreshTokenHash(payload.sessionId, newRefreshJwt);

  logAuditEvent({
    userId: payload.sub,
    action: 'auth.refresh',
    details: { sessionId: payload.sessionId },
    ipAddress: ip ?? undefined,
    userAgent: userAgent ?? undefined,
  });

  return {
    accessToken,
    refreshToken: newRefreshJwt,
    expiresIn: getAccessExpirySeconds(),
  };
}

export async function logout(
  refreshToken: string | null,
  sessionId: string | null,
  req?: { ip?: string; headers?: Record<string, string | string[] | undefined> },
): Promise<void> {
  let userId: string | null = null;
  let revokedSessionId: string | null = sessionId;
  if (refreshToken) {
    try {
      const payload = verifyRefresh(refreshToken);
      userId = payload.sub;
      revokedSessionId = payload.sessionId;
      await sessionService.revokeSession(payload.sessionId);
    } catch {
      // Token invalid or expired - nothing to revoke
    }
  } else if (sessionId) {
    await sessionService.revokeSession(sessionId);
  }

  if (revokedSessionId) {
    const { blacklistSession } = await import('../middleware/authMiddleware.js');
    await blacklistSession(revokedSessionId);
  }

  if (userId) {
    const ip = req ? getClientIp(req) : null;
    const userAgent = req ? getClientUserAgent(req) : null;
    logAuditEvent({
      userId,
      action: 'auth.logout',
      details: { sessionId: sessionId ?? undefined },
      ipAddress: ip ?? undefined,
      userAgent: userAgent ?? undefined,
    });
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
