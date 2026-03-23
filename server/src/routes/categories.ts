import { Router } from 'express';
import { query } from '../db/index.js';
import { reimbursementAuth, requireAdmin, type ReimbursementRequest } from '../middleware/reimbursementAuth.js';

const router = Router();
router.use(reimbursementAuth);

router.get('/', async (req: ReimbursementRequest, res) => {
  const orgId = req.organizationId!;
  const all = req.query.all === 'true' && req.reimbursementUser?.role === 'admin';
  try {
    const result = await query(
      all
        ? `SELECT id, organization_id, name, icon, spending_limit, requires_justification_above, is_active, created_at
           FROM expense_categories WHERE organization_id = $1 ORDER BY name`
        : `SELECT id, organization_id, name, icon, spending_limit, requires_justification_above, is_active, created_at
           FROM expense_categories WHERE organization_id = $1 AND is_active = TRUE ORDER BY name`,
      [orgId]
    );
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list categories' });
  }
});

router.post('/', requireAdmin, async (req: ReimbursementRequest, res) => {
  const orgId = req.organizationId!;
  const body = req.body ?? {};
  const { name, icon, spending_limit, requires_justification_above } = body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name required' });
    return;
  }
  try {
    const result = await query(
      `INSERT INTO expense_categories (organization_id, tenant_id, name, icon, spending_limit, requires_justification_above)
       VALUES ($1, $1, $2, $3, $4, $5)
       RETURNING *`,
      [orgId, name.trim(), icon ?? null, spending_limit ?? null, requires_justification_above ?? null]
    );
    const row = result.rows[0];
    if (!row) {
      console.error('Category INSERT returned no row');
      res.status(500).json({ error: 'Failed to create category' });
      return;
    }
    res.status(201).json(row);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === '23505') {
      res.status(400).json({ error: 'A category with this name already exists' });
      return;
    }
    if (err.code === '23503') {
      res.status(400).json({ error: 'Invalid organization' });
      return;
    }
    console.error('Category create error:', e);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.patch('/:id', requireAdmin, async (req: ReimbursementRequest, res) => {
  const orgId = req.organizationId!;
  const { id } = req.params;
  const { name, icon, spending_limit, requires_justification_above, is_active } = req.body;
  try {
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (name !== undefined) {
      updates.push(`name = $${idx}`);
      params.push(typeof name === 'string' ? name.trim() : name);
      idx++;
    }
    if (icon !== undefined) {
      updates.push(`icon = $${idx}`);
      params.push(icon);
      idx++;
    }
    if (spending_limit !== undefined) {
      updates.push(`spending_limit = $${idx}`);
      params.push(spending_limit);
      idx++;
    }
    if (requires_justification_above !== undefined) {
      updates.push(`requires_justification_above = $${idx}`);
      params.push(requires_justification_above);
      idx++;
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${idx}`);
      params.push(!!is_active);
      idx++;
    }
    if (updates.length === 0) {
      const existing = await query(
        `SELECT id, organization_id, name, icon, spending_limit, requires_justification_above, is_active, created_at
         FROM expense_categories WHERE id = $1 AND organization_id = $2`,
        [id, orgId]
      );
      if (!existing.rows[0]) return res.status(404).json({ error: 'Category not found' });
      return res.json(existing.rows[0]);
    }
    params.push(id, orgId);
    const result = await query(
      `UPDATE expense_categories SET ${updates.join(', ')} WHERE id = $${idx} AND organization_id = $${idx + 1}
       RETURNING id, organization_id, name, icon, spending_limit, requires_justification_above, is_active, created_at`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Category not found' });
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

router.delete('/:id', requireAdmin, async (req: ReimbursementRequest, res) => {
  const orgId = req.organizationId!;
  const { id } = req.params;
  try {
    const existing = await query(
      `SELECT id FROM expense_categories WHERE id = $1 AND organization_id = $2`,
      [id, orgId]
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ error: 'Category not found' });
    }
    const inUse = await query(
      `SELECT 1 FROM reimbursement_requests WHERE category_id = $1 LIMIT 1`,
      [id]
    );
    if (inUse.rows[0]) {
      return res.status(400).json({ error: 'Category is in use by reimbursement requests and cannot be deleted' });
    }
    await query(`DELETE FROM expense_categories WHERE id = $1 AND organization_id = $2`, [id, orgId]);
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export const categoriesRouter = router;
