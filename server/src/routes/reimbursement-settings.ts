import { Router } from 'express';
import { query } from '../db/index.js';
import { reimbursementAuth, requireAdmin, type ReimbursementRequest } from '../middleware/reimbursementAuth.js';

const router = Router();
router.use(reimbursementAuth);
router.use(requireAdmin);

router.get('/', async (req: ReimbursementRequest, res) => {
  const orgId = req.organizationId!;
  try {
    const result = await query(
      `SELECT id, organization_id, mileage_rate_per_km, mileage_currency, meal_limit, daily_limit, monthly_limit,
              require_signed_invoice_above, auto_approve_below, enable_ocr, enable_mileage, enable_currency_conversion, updated_at
       FROM reimbursement_settings WHERE organization_id = $1`,
      [orgId]
    );
    const row = result.rows[0];
    if (!row) {
      // Return defaults so admin can see the form and save to create the row
      res.json({
        organization_id: orgId,
        mileage_rate_per_km: 0.67,
        mileage_currency: 'USD',
        meal_limit: null,
        daily_limit: null,
        monthly_limit: null,
        require_signed_invoice_above: null,
        auto_approve_below: null,
        enable_ocr: true,
        enable_mileage: true,
        enable_currency_conversion: true,
      });
      return;
    }
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

router.patch('/', async (req: ReimbursementRequest, res) => {
  const orgId = req.organizationId!;
  const body = req.body;
  const allowed = [
    'mileage_rate_per_km', 'mileage_currency', 'meal_limit', 'daily_limit', 'monthly_limit',
    'require_signed_invoice_above', 'auto_approve_below', 'enable_ocr', 'enable_mileage', 'enable_currency_conversion',
  ];
  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  for (const key of allowed) {
    if (body[key] !== undefined) {
      updates.push(`${key} = $${idx}`);
      params.push(body[key]);
      idx++;
    }
  }
  if (updates.length === 0) {
    const result = await query(`SELECT * FROM reimbursement_settings WHERE organization_id = $1`, [orgId]);
    const row = result.rows[0];
    if (row) return res.json(row);
    // No row: insert defaults
    const insertResult = await query(
      `INSERT INTO reimbursement_settings (organization_id) VALUES ($1) RETURNING *`,
      [orgId]
    );
    return res.json(insertResult.rows[0]);
  }
  updates.push('updated_at = NOW()');
  params.push(orgId);
  try {
    const result = await query(
      `UPDATE reimbursement_settings SET ${updates.join(', ')} WHERE organization_id = $${idx} RETURNING *`,
      params
    );
    let row = result.rows[0];
    if (!row) {
      // No existing row: insert with provided values
      const insParams = [
        orgId,
        body.mileage_rate_per_km ?? 0.67,
        body.mileage_currency ?? 'USD',
        body.meal_limit ?? null,
        body.daily_limit ?? null,
        body.monthly_limit ?? null,
        body.require_signed_invoice_above ?? null,
        body.auto_approve_below ?? null,
        body.enable_ocr ?? true,
        body.enable_mileage ?? true,
        body.enable_currency_conversion ?? true,
      ];
      const insResult = await query(
        `INSERT INTO reimbursement_settings (organization_id, mileage_rate_per_km, mileage_currency, meal_limit, daily_limit, monthly_limit, require_signed_invoice_above, auto_approve_below, enable_ocr, enable_mileage, enable_currency_conversion)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        insParams
      );
      row = insResult.rows[0];
    }
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export const reimbursementSettingsRouter = router;
