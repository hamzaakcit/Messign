import { Router } from 'express';
import { query } from '../db/index.js';

const router = Router();

/**
 * Public read-only list of departments for main app (e.g. Team directory filter).
 * Sourced from database (performance_teams) so teams and departments stay in sync.
 */
router.get('/', async (_req, res) => {
  try {
    const result = await query<{ id: string; name: string }>(
      `SELECT id::text AS id, team_name AS name FROM performance_teams WHERE is_active = TRUE ORDER BY team_name`
    );
    res.json(result.rows);
  } catch (e) {
    console.error('[departments] DB error:', e);
    res.status(500).json({ error: 'Failed to load departments' });
  }
});

export const departmentsRouter = router;
