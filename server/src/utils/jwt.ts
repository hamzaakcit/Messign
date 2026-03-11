import jwt from 'jsonwebtoken';

const ACCESS_SECRET = process.env.JWT_SECRET ?? process.env.JWT_ACCESS_SECRET ?? 'messign-access-secret-change-in-production';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET ?? 'messign-refresh-secret-change-in-production';
const ACCESS_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY ?? '15m';
const REFRESH_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY ?? '7d';

function parseExpiryToSeconds(s: string): number {
  const match = s.match(/^(\d+)(m|h|d|s)?$/);
  if (!match) return 900;
  const n = parseInt(match[1], 10);
  const unit = match[2] ?? 's';
  if (unit === 'm') return n * 60;
  if (unit === 'h') return n * 3600;
  if (unit === 'd') return n * 86400;
  return n;
}

export interface AccessPayload {
  sub: string;
  role?: string;
  sessionId?: string;
  fp?: string;
}

export interface RefreshPayload {
  sub: string;
  sessionId: string;
}

export function signAccess(payload: AccessPayload): string {
  return jwt.sign(
    { ...payload, type: 'access' },
    ACCESS_SECRET,
    { expiresIn: parseExpiryToSeconds(ACCESS_EXPIRY) }
  );
}

export function signRefresh(payload: RefreshPayload): string {
  return jwt.sign(
    { ...payload, type: 'refresh' },
    REFRESH_SECRET,
    { expiresIn: parseExpiryToSeconds(REFRESH_EXPIRY) }
  );
}

export function verifyAccess(token: string): AccessPayload {
  const decoded = jwt.verify(token, ACCESS_SECRET) as jwt.JwtPayload & AccessPayload;
  if (decoded.type !== 'access') throw new Error('Invalid token type');
  return { sub: decoded.sub, role: decoded.role, sessionId: decoded.sessionId, fp: decoded.fp };
}

export function verifyRefresh(token: string): RefreshPayload {
  const decoded = jwt.verify(token, REFRESH_SECRET) as jwt.JwtPayload & RefreshPayload;
  if (decoded.type !== 'refresh') throw new Error('Invalid token type');
  return { sub: decoded.sub, sessionId: decoded.sessionId };
}

export function getAccessExpirySeconds(): number {
  return parseExpiryToSeconds(ACCESS_EXPIRY);
}
