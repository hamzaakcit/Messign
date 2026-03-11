import { Router } from 'express';
import * as authService from '../services/authService.js';
import * as passwordService from '../services/passwordService.js';
import * as sessionService from '../services/sessionService.js';
import { requireJwt } from '../middleware/authMiddleware.js';

export const authRouter = Router();

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/api/auth/refresh',
};

// Public: login with email + password (wrap in Promise so async rejections are caught)
authRouter.post('/login', (req, res) => {
  const send500 = (message: string) => {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message } });
    }
  };
  const run = async () => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const { email, password } = body as { email?: string; password?: string };
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Email is required' } });
      }
      if (!password || typeof password !== 'string') {
        return res.status(400).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Password is required' } });
      }
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail.endsWith('@messign.com')) {
        return res.status(403).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Only Messign company accounts (@messign.com) can sign in.' } });
      }
      const result = await authService.login(normalizedEmail, password, req);
      if (result.success) {
        const { refreshToken, ...responseData } = result.data;
        res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
        return res.json({ success: true, data: responseData });
      }
      return res.status(401).json({ success: false, error: result.error });
    } catch (e) {
      console.error('[auth] login error:', e);
      const safeMessage = 'Login failed. Please try again.';
      send500(safeMessage);
    }
  };
  run().catch((e) => {
    console.error('[auth] login unhandled:', e);
    send500('Login failed. Please try again.');
  });
});

// Public: refresh access token (reads refresh token from HttpOnly cookie)
authRouter.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies?.refreshToken as string | undefined;
  if (!refreshToken || typeof refreshToken !== 'string') {
    return res.status(400).json({ error: 'Refresh token cookie missing' });
  }
  try {
    const tokens = await authService.refresh(refreshToken, req);
    if (!tokens) return res.status(401).json({ error: 'Invalid or expired refresh token' });
    res.cookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
    return res.json({ success: true, data: { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn } });
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// Public or with Bearer: logout (revoke session)
authRouter.post('/logout', async (req, res) => {
  const refreshToken = req.cookies?.refreshToken as string | undefined;
  const { sessionId } = req.body as { sessionId?: string };
  try {
    await authService.logout(refreshToken ?? null, sessionId ?? null);
  } catch {
    // ignore
  }
  res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
  return res.json({ success: true });
});

// Protected: current user
authRouter.get('/me', requireJwt, async (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const me = await authService.getMe(userId);
    if (!me) return res.status(404).json({ error: 'User not found' });
    return res.json({ success: true, data: me });
  } catch (e) {
    console.error('[auth] me error:', e);
    return res.status(500).json({ error: 'Failed to get user' });
  }
});

// Protected: change own password
authRouter.put('/password/change', requireJwt, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    await passwordService.changeOwnPassword(userId, currentPassword, newPassword, {
      ipAddress: req.ip ?? undefined,
      userAgent: req.headers['user-agent'] ?? undefined,
    });
    return res.json({ success: true, message: 'Password changed' });
  } catch (e) {
    console.error('[auth] password/change error:', e);
    const message = e instanceof Error ? e.message : 'Failed to change password';
    return res.status(400).json({ error: message });
  }
});

// Protected: list own sessions
authRouter.get('/sessions', requireJwt, async (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const sessions = await sessionService.getSessionsForUser(userId);
    return res.json({ success: true, data: sessions });
  } catch (e) {
    console.error('[auth] sessions error:', e);
    return res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// Protected: revoke one session
authRouter.delete('/sessions/:sessionId', requireJwt, async (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { sessionId } = req.params;
  try {
    const revoked = await sessionService.revokeSession(sessionId);
    if (!revoked) return res.status(404).json({ error: 'Session not found' });
    return res.json({ success: true });
  } catch (e) {
    console.error('[auth] revoke session error:', e);
    return res.status(500).json({ error: 'Failed to revoke session' });
  }
});

// Protected: revoke all sessions except current
authRouter.delete('/sessions', requireJwt, async (req, res) => {
  const userId = req.userId;
  const currentSessionId = req.sessionId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    await sessionService.revokeAllForUser(userId, currentSessionId);
    return res.json({ success: true });
  } catch (e) {
    console.error('[auth] revoke all sessions error:', e);
    return res.status(500).json({ error: 'Failed to revoke sessions' });
  }
});
