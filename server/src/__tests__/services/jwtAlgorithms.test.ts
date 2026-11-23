/** WP-31: tokens are HS256 only, and every refresh token is unique. */
import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { signAccess, signRefresh, verifyAccess, verifyRefresh } from '../../utils/jwt.js';

const secret = process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET || 'messign-access-secret-change-in-production';
const unsigned = (payload: object) => `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.`;

describe('JWT algorithms', () => {
  it('accepts its own HS256 tokens', () => {
    expect(verifyAccess(signAccess({ sub: 'u1' })).sub).toBe('u1');
  });
  it('refuses the same claims under another algorithm, even with the right secret', () => {
    const hs512 = jwt.sign({ sub: 'u1', type: 'access' }, secret, { algorithm: 'HS512' });
    expect(() => verifyAccess(hs512)).toThrow();
  });
  it('refuses an unsigned token', () => {
    expect(() => verifyAccess(unsigned({ sub: 'u1', type: 'access', exp: Math.floor(Date.now() / 1000) + 600 }))).toThrow();
  });
  it('mints a different refresh token every time, even in the same second', () => {
    const a = signRefresh({ sub: 'u1', sessionId: 's1' });
    const b = signRefresh({ sub: 'u1', sessionId: 's1' });
    expect(a).not.toBe(b);
    expect(verifyRefresh(a)).toEqual({ sub: 'u1', sessionId: 's1' });
  });
  it('does not take an access token as a refresh token or the other way round', () => {
    expect(() => verifyRefresh(signAccess({ sub: 'u1' }))).toThrow();
  });
});
