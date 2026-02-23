import { Router } from 'express';
import { query } from '../db/index.js';
import { reimbursementAuth, type ReimbursementRequest } from '../middleware/reimbursementAuth.js';

const router = Router();
router.use(reimbursementAuth);

/**
 * Resolve a userId param to the reimbursement_users UUID.
 * Accepts either a UUID directly or an auth_user_id like "user-1".
 */
async function resolveUserId(paramId: string): Promise<string | null> {
  // Check if it's already a valid UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(paramId)) return paramId;
  // Otherwise look up by auth_user_id
  const result = await query<{ id: string }>(
    `SELECT id FROM reimbursement_users WHERE auth_user_id = $1 LIMIT 1`,
    [paramId]
  );
  return result.rows[0]?.id ?? null;
}

// GET signature — self or admin
router.get('/:userId', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const { userId } = req.params;
  const isAdmin = user.role === 'admin' || user.role === 'finance';

  const resolvedId = await resolveUserId(userId);
  if (!resolvedId) { res.status(404).json({ error: 'User not found' }); return; }

  if (user.id !== resolvedId && !isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  try {
    const result = await query(
      `SELECT signature_data, created_at FROM signatures WHERE user_id = $1`,
      [resolvedId]
    );
    res.json(result.rows[0] || null);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get signature' });
  }
});

// PUT signature — self or admin
router.put('/:userId', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const { userId } = req.params;
  const isAdmin = user.role === 'admin' || user.role === 'finance';

  const resolvedId = await resolveUserId(userId);
  if (!resolvedId) { res.status(404).json({ error: 'User not found' }); return; }

  if (user.id !== resolvedId && !isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { signatureData } = req.body as { signatureData: string };
  if (!signatureData) {
    res.status(400).json({ error: 'signatureData required' });
    return;
  }
  try {
    const result = await query(
      `INSERT INTO signatures (user_id, signature_data, updated_by, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET signature_data = EXCLUDED.signature_data, updated_by = EXCLUDED.updated_by, created_at = NOW()
       RETURNING *`,
      [resolvedId, signatureData, user.id]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save signature' });
  }
});

export const signaturesRouter = router;
