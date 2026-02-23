import { Router } from 'express';
import { query } from '../db/index.js';

export const gameRouter = Router();

/**
 * POST /api/game/scores — Submit score on Game Over
 * Body: { score: number, durationMs: number }
 * Requires auth (userId from optionalJwt/requireAuth)
 */
gameRouter.post('/scores', async (req, res) => {
  const userId = (req as any).userId as string | undefined;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { score, durationMs } = req.body;
  if (typeof score !== 'number' || typeof durationMs !== 'number') {
    res.status(400).json({ error: 'score and durationMs are required numbers' });
    return;
  }

  try {
    await query(
      `INSERT INTO game_scores (user_id, score, duration_ms) VALUES ($1, $2, $3)`,
      [userId, Math.max(0, Math.round(score)), Math.max(0, Math.round(durationMs))],
    );

    // Top score PER user (not top 3 from a single user)
    const top3 = await query<{
      user_id: string;
      user_name: string;
      avatar: string | null;
      score: number;
      duration_ms: number;
      played_at: string;
    }>(
      `SELECT DISTINCT ON (gs.user_id)
              gs.user_id, ru.name AS user_name, ru.avatar,
              gs.score, gs.duration_ms, gs.played_at
       FROM game_scores gs
       JOIN reimbursement_users ru ON ru.id = gs.user_id
       ORDER BY gs.user_id, gs.score DESC`,
    );

    // Sort by score and take top 3
    const sorted = top3.rows.sort((a, b) => b.score - a.score).slice(0, 3);
    const rank = sorted.findIndex((r) => r.user_id === userId) + 1;

    res.json({
      rank: rank > 0 ? rank : null,
      isTopThree: rank > 0 && rank <= 3,
      leaderboard: sorted.map((r) => ({
        userId: r.user_id,
        userName: r.user_name,
        avatar: r.avatar,
        score: r.score,
        durationMs: r.duration_ms,
        playedAt: r.played_at,
      })),
    });
  } catch (err) {
    console.error('[game] submit score error:', err);
    res.status(500).json({ error: 'Failed to submit score' });
  }
});

/**
 * GET /api/game/leaderboard — Fetch all-time Top 3
 */
gameRouter.get('/leaderboard', async (_req, res) => {
  try {
    const top3 = await query<{
      user_id: string;
      user_name: string;
      avatar: string | null;
      score: number;
      duration_ms: number;
      played_at: string;
    }>(
      `SELECT DISTINCT ON (gs.user_id)
              gs.user_id, ru.name AS user_name, ru.avatar,
              gs.score, gs.duration_ms, gs.played_at
       FROM game_scores gs
       JOIN reimbursement_users ru ON ru.id = gs.user_id
       ORDER BY gs.user_id, gs.score DESC`,
    );

    const sorted = top3.rows.sort((a, b) => b.score - a.score).slice(0, 3);
    res.json({
      leaderboard: sorted.map((r) => ({
        userId: r.user_id,
        userName: r.user_name,
        avatar: r.avatar,
        score: r.score,
        durationMs: r.duration_ms,
        playedAt: r.played_at,
      })),
    });
  } catch (err) {
    console.error('[game] leaderboard error:', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});
