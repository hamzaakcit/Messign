/**
 * Claude Daily Rate Limiter
 *
 * Limits: 2 uses/day for employees, 30 uses/day for admins.
 * Backed by the ai_claude_daily_usage table so limits persist across restarts.
 */

import { Request, Response, NextFunction } from 'express';
import { query } from '../db/index.js';

type AuthReq = Request & { userId?: string; role?: string };

function getDailyLimit(role: string): number {
  return role === 'admin' ? 30 : 2;
}

export async function getClaudeUsageStatus(
  userId: string,
  role: string
): Promise<{ used: number; limit: number; remaining: number }> {
  const limit = getDailyLimit(role);
  const result = await query<{ count: number }>(
    `SELECT count FROM ai_claude_daily_usage WHERE user_id = $1 AND usage_date = CURRENT_DATE`,
    [userId]
  );
  const used = result.rows[0]?.count ?? 0;
  return { used, limit, remaining: Math.max(0, limit - used) };
}

export async function incrementClaudeUsage(userId: string): Promise<void> {
  await query(
    `INSERT INTO ai_claude_daily_usage (user_id, usage_date, count)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (user_id, usage_date)
     DO UPDATE SET count = ai_claude_daily_usage.count + 1`,
    [userId]
  );
}

export async function claudeRateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authReq = req as AuthReq;
  const userId = authReq.userId;
  const role = authReq.role ?? 'employee';

  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  try {
    const { used, limit, remaining } = await getClaudeUsageStatus(userId, role);
    if (remaining <= 0) {
      res.status(429).json({
        error: `Daily Claude limit reached (${limit}/day). Resets at midnight UTC.`,
        used,
        limit,
        remaining: 0,
      });
      return;
    }
    next();
  } catch (e) {
    console.error('[claudeRateLimit] DB error:', e);
    next();
  }
}
