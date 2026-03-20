import type { Request, Response, NextFunction } from 'express';
import { verifyAccess } from '../utils/jwt.js';
import { computeFingerprint, getClientIp } from '../services/authService.js';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      role?: string;
      sessionId?: string;
      /** From access JWT claim `organizationId` when present */
      jwtOrganizationId?: string;
    }
  }
}

/** Local / LAN browser Host header — relax fingerprint even when NODE_ENV=production (common in .env copied from Railway). */
function isPrivateOrLocalHost(host: string | undefined): boolean {
  if (!host) return false;
  const h = host.split(':')[0]?.trim() ?? '';
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  const m = /^172\.(\d+)\.\d+\.\d+$/.exec(h);
  if (m) {
    const second = parseInt(m[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

/** In production on public hosts, bind access JWT to IP + User-Agent. */
function isFingerprintRelaxed(req: Request): boolean {
  if (process.env.DISABLE_SESSION_FINGERPRINT === '1') return true;
  if (process.env.NODE_ENV !== 'production') return true;
  if (process.env.SESSION_FINGERPRINT_STRICT === '1') return false;
  if (isPrivateOrLocalHost(req.headers.host)) return true;
  return false;
}

function verifyFingerprint(req: Request, fp?: string): boolean {
  if (isFingerprintRelaxed(req)) return true;
  if (!fp) return true;
  const ip = getClientIp(req);
  const expected = computeFingerprint(ip, req.headers['user-agent']);
  return fp === expected;
}

/**
 * Optional JWT auth: if Authorization Bearer is present, verify and set req.userId (and req.role, req.sessionId).
 * If no Bearer token, does nothing (caller may fall back to X-User-Id or return 401).
 */
export function optionalJwt(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    next();
    return;
  }
  try {
    const payload = verifyAccess(token);
    if (!verifyFingerprint(req, payload.fp)) {
      next();
      return;
    }
    req.userId = payload.sub;
    req.role = payload.role;
    req.sessionId = payload.sessionId;
    if (payload.organizationId) {
      req.jwtOrganizationId = payload.organizationId;
    }
  } catch {
    // Invalid or expired token - leave req.userId unset
  }
  next();
}

/**
 * Require JWT: if Authorization Bearer is present, verify and set req.userId. Otherwise 401.
 * Does not fall back to X-User-Id.
 */
export function requireJwt(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  try {
    const payload = verifyAccess(token);
    if (!verifyFingerprint(req, payload.fp)) {
      res.status(401).json({ error: 'Session fingerprint mismatch — please log in again' });
      return;
    }
    req.userId = payload.sub;
    req.role = payload.role;
    req.sessionId = payload.sessionId;
    if (payload.organizationId) {
      req.jwtOrganizationId = payload.organizationId;
    }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
