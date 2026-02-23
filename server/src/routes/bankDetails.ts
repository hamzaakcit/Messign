import { Router } from 'express';
import { query } from '../db/index.js';
import { reimbursementAuth, requireRole, type ReimbursementRequest } from '../middleware/reimbursementAuth.js';

const router = Router();
router.use(reimbursementAuth);

// GET bank details for a user — admin only
router.get('/:userId', requireRole('admin', 'finance'), async (req: ReimbursementRequest, res) => {
  const { userId } = req.params;
  try {
    const result = await query(
      `SELECT bd.*, u.full_name AS user_name
       FROM bank_details bd
       JOIN reimbursement_users u ON u.id = bd.user_id
       WHERE bd.user_id = $1`,
      [userId]
    );
    res.json(result.rows[0] || null);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get bank details' });
  }
});

// PUT (upsert) bank details — admin only
router.put('/:userId', requireRole('admin', 'finance'), async (req: ReimbursementRequest, res) => {
  const admin = req.reimbursementUser!;
  const { userId } = req.params;
  const { bankName, iban, swiftBic, accountHolder } = req.body as {
    bankName?: string; iban?: string; swiftBic?: string; accountHolder?: string;
  };
  try {
    const result = await query(
      `INSERT INTO bank_details (user_id, bank_name, iban, swift_bic, account_holder, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET bank_name = EXCLUDED.bank_name, iban = EXCLUDED.iban,
                     swift_bic = EXCLUDED.swift_bic, account_holder = EXCLUDED.account_holder,
                     updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING *`,
      [userId, bankName || null, iban || null, swiftBic || null, accountHolder || null, admin.id]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update bank details' });
  }
});

export const bankDetailsRouter = router;
