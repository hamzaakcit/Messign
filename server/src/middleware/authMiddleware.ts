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

/** In production, bind access JWT to IP + User-Agent. In dev, Vite proxy / LAN hostnames make IP unstable → 401 + login loop. */
function isFingerprintRelaxed(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.DISABLE_SESSION_FINGERPRINT === '1';
}

function verifyFingerprint(req: Request, fp?: string): boolean {
  if (isFingerprintRelaxed()) return true;
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
