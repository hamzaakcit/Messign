import { Router } from 'express';
import type { Response } from 'express';
import { query } from '../../../db/index.js';
import { type ReimbursementRequest } from '../../../middleware/reimbursementAuth.js';
import { requireFinanceRole } from '../../../middleware/financeRbac.js';

const router = Router();

router.get('/settings', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const result = await query(
      `SELECT * FROM finance_settings WHERE organization_id = $1`,
      [orgId],
    );
    if (!result.rows[0]) {
      const created = await query(
        `INSERT INTO finance_settings (organization_id) VALUES ($1)
         ON CONFLICT (organization_id) DO UPDATE SET organization_id = $1
         RETURNING *`,
        [orgId],
      );
      return res.json(created.rows[0]);
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[finance/settings GET]', err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

router.put('/settings', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const allowedFields = [
      'company_name', 'company_address', 'company_phone', 'company_email',
      'company_website', 'company_tax_id', 'company_logo_url', 'base_currency',
      'fiscal_year_start', 'receipt_required_above', 'dora_autonomy_level',
      'dora_auto_approve_enabled', 'dora_auto_approve_max', 'dora_min_confidence',
      'dora_max_risk', 'dora_features',
    ];
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(req.body)) {
      if (allowedFields.includes(key) && val !== undefined) {
        sets.push(`${key} = $${idx++}`);
        params.push(key === 'dora_features' ? JSON.stringify(val) : val);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = NOW()');
    params.push(orgId);
    const result = await query(
      `UPDATE finance_settings SET ${sets.join(', ')} WHERE organization_id = $${idx} RETURNING *`,
      params,
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Settings not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[finance/settings PUT]', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

router.get('/settings/approval-workflows', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const result = await query(
      `SELECT approval_workflow_config FROM finance_settings WHERE organization_id = $1`,
      [orgId],
    );
    res.json(result.rows[0]?.approval_workflow_config ?? []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load workflows' });
  }
});

router.put('/settings/approval-workflows', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const result = await query(
      `UPDATE finance_settings SET approval_workflow_config = $1, updated_at = NOW() WHERE organization_id = $2 RETURNING approval_workflow_config`,
      [JSON.stringify(req.body.workflows ?? []), orgId],
    );
    res.json(result.rows[0]?.approval_workflow_config ?? []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update workflows' });
  }
});

router.get('/expense-policies', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const result = await query(
      `SELECT * FROM finance_expense_policies WHERE organization_id = $1 ORDER BY priority, name`,
      [orgId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[finance/expense-policies GET]', err);
    res.status(500).json({ error: 'Failed to load expense policies' });
  }
});

router.post('/expense-policies', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const { name, description, rules, violation_action, violation_message, applies_to_teams, applies_to_roles, priority } = req.body;
    if (!name || !rules) return res.status(400).json({ error: 'Name and rules are required' });
    const result = await query(
      `INSERT INTO finance_expense_policies
       (organization_id, name, description, rules, violation_action, violation_message, applies_to_teams, applies_to_roles, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [orgId, name, description || null, JSON.stringify(rules), violation_action || 'flag',
       violation_message || null, applies_to_teams || '{}', applies_to_roles || '{}', priority ?? 0],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[finance/expense-policies POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create policy' });
  }
});

router.put('/expense-policies/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    const allowed = ['name', 'description', 'rules', 'violation_action', 'violation_message', 'is_active', 'priority'];
    for (const [key, val] of Object.entries(req.body)) {
      if (allowed.includes(key) && val !== undefined) {
        sets.push(`${key} = $${idx++}`);
        params.push(key === 'rules' ? JSON.stringify(val) : val);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = NOW()');
    params.push(req.params.id, orgId);
    const result = await query(
      `UPDATE finance_expense_policies SET ${sets.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx} RETURNING *`,
      params,
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Policy not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[finance/expense-policies PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update policy' });
  }
});

router.delete('/expense-policies/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    await query(
      `DELETE FROM finance_expense_policies WHERE id = $1 AND organization_id = $2`,
      [req.params.id, orgId],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[finance/expense-policies DELETE]', err);
    res.status(500).json({ error: 'Failed to delete policy' });
  }
});

router.get('/notification-preferences', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const result = await query(
      `SELECT preferences FROM finance_notification_preferences WHERE user_id = $1 AND organization_id = $2`,
      [user.id, orgId],
    );
    res.json(result.rows[0]?.preferences ?? {});
  } catch (err) {
    res.status(500).json({ error: 'Failed to load notification preferences' });
  }
});

router.put('/notification-preferences', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const result = await query(
      `INSERT INTO finance_notification_preferences (user_id, organization_id, preferences)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, organization_id) DO UPDATE SET preferences = $3, updated_at = NOW()
       RETURNING preferences`,
      [user.id, orgId, JSON.stringify(req.body)],
    );
    res.json(result.rows[0]?.preferences ?? {});
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

export default router;
