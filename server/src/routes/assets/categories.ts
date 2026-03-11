import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';

const router = Router();

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { query } = await import('../../db/index.js');
    const result = await query(
      `SELECT *
       FROM asset_categories
       WHERE ($1::uuid IS NULL OR organization_id = $1::uuid OR organization_id IS NULL)
       ORDER BY name ASC`,
      [req.organizationId ?? null],
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Failed to list categories' });
  }
});

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { query } = await import('../../db/index.js');
    const result = await query(
      `INSERT INTO asset_categories (organization_id, name, description, depreciation_method, useful_life_months, parent_id)
       VALUES ($1::uuid, $2, $3, COALESCE($4, 'straight_line'), $5, $6::uuid)
       RETURNING *`,
      [
        req.organizationId ?? null,
        req.body?.name,
        req.body?.description ?? null,
        req.body?.depreciation_method ?? null,
        req.body?.useful_life_months ?? null,
        req.body?.parent_id ?? null,
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create category' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { query } = await import('../../db/index.js');
    const result = await query(
      `UPDATE asset_categories
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           depreciation_method = COALESCE($4, depreciation_method),
           useful_life_months = COALESCE($5, useful_life_months),
           parent_id = COALESCE($6::uuid, parent_id)
       WHERE id = $1::uuid
       RETURNING *`,
      [
        req.params.id,
        req.body?.name ?? null,
        req.body?.description ?? null,
        req.body?.depreciation_method ?? null,
        req.body?.useful_life_months ?? null,
        req.body?.parent_id ?? null,
      ],
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update category' });
  }
});

export default router;
