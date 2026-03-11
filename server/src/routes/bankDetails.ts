import { Router } from 'express';
import { query } from '../db/index.js';
import { reimbursementAuth, requireRole, type ReimbursementRequest } from '../middleware/reimbursementAuth.js';
import { encrypt, decrypt } from '../services/crypto/encryptionService.js';

const router = Router();
router.use(reimbursementAuth);

// GET bank details for a user — admin only (scoped to caller's organization)
router.get('/:userId', requireRole('admin', 'finance'), async (req: ReimbursementRequest, res) => {
  const { userId } = req.params;
  const orgId = req.organizationId;
  if (!orgId) {
    res.status(403).json({ error: 'Organization context required' });
    return;
  }
  try {
    const result = await query(
      `SELECT bd.*, u.full_name AS user_name
       FROM bank_details bd
       JOIN reimbursement_users u ON u.id = bd.user_id AND u.organization_id = $2
       WHERE bd.user_id = $1`,
      [userId, orgId]
    );
    const row = result.rows[0] || null;
    if (row) {
      if (row.iban) row.iban = decrypt(row.iban);
      if (row.swift_bic) row.swift_bic = decrypt(row.swift_bic);
    }
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get bank details' });
  }
});

// PUT (upsert) bank details — admin only (scoped to caller's organization)
router.put('/:userId', requireRole('admin', 'finance'), async (req: ReimbursementRequest, res) => {
  const admin = req.reimbursementUser!;
  const orgId = req.organizationId;
  if (!orgId) {
    res.status(403).json({ error: 'Organization context required' });
    return;
  }
  const { userId } = req.params;
  const { bankName, iban, swiftBic, accountHolder } = req.body as {
    bankName?: string; iban?: string; swiftBic?: string; accountHolder?: string;
  };

  const encryptedIban = iban ? encrypt(iban) : null;
  const encryptedSwift = swiftBic ? encrypt(swiftBic) : null;

  try {
    // Ensure target user belongs to same org before upserting
    const userCheck = await query(
      `SELECT 1 FROM reimbursement_users WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [userId, orgId]
    );
    if (!userCheck.rows.length) {
      res.status(404).json({ error: 'User not found in organization' });
      return;
    }
    const result = await query(
      `INSERT INTO bank_details (user_id, bank_name, iban, swift_bic, account_holder, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET bank_name = EXCLUDED.bank_name, iban = EXCLUDED.iban,
                     swift_bic = EXCLUDED.swift_bic, account_holder = EXCLUDED.account_holder,
                     updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING *`,
      [userId, bankName || null, encryptedIban, encryptedSwift, accountHolder || null, admin.id]
    );
    const row = result.rows[0];
    if (row) {
      if (row.iban) row.iban = decrypt(row.iban);
      if (row.swift_bic) row.swift_bic = decrypt(row.swift_bic);
    }
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update bank details' });
  }
});

export const bankDetailsRouter = router;
