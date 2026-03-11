import { Router } from 'express';
import type { Response } from 'express';
import { query } from '../../db/index.js';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { buildCtx } from './common.js';

const router = Router();

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT
         id::text AS id,
         organization_id::text AS organization_id,
         name,
         description,
         is_billable_default,
         hourly_rate::float AS hourly_rate,
         color,
         is_active,
         created_at::text AS created_at
       FROM time_categories
       WHERE organization_id = $1::uuid
       ORDER BY name ASC`,
      [buildCtx(req).organizationId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[time/categories GET]', err);
    res.status(500).json({ error: 'Failed to list categories' });
  }
});

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (!body.name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const result = await query(
      `INSERT INTO time_categories (
        organization_id, name, description, is_billable_default, hourly_rate, color, is_active
      )
      VALUES ($1::uuid, $2, $3, $4, $5, $6, COALESCE($7, true))
      RETURNING
        id::text AS id,
        organization_id::text AS organization_id,
        name,
        description,
        is_billable_default,
        hourly_rate::float AS hourly_rate,
        color,
        is_active,
        created_at::text AS created_at`,
      [
        buildCtx(req).organizationId,
        String(body.name),
        (body.description as string | undefined) ?? null,
        Boolean((body.isBillableDefault as boolean | undefined) ?? body.is_billable_default),
        body.hourlyRate != null ? Number(body.hourlyRate) : (body.hourly_rate != null ? Number(body.hourly_rate) : null),
        (body.color as string | undefined) ?? '#6B7280',
        body.isActive != null ? Boolean(body.isActive) : (body.is_active != null ? Boolean(body.is_active) : null),
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[time/categories POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create category' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const result = await query(
      `UPDATE time_categories
       SET name = COALESCE($3, name),
           description = COALESCE($4, description),
           is_billable_default = COALESCE($5, is_billable_default),
           hourly_rate = COALESCE($6, hourly_rate),
           color = COALESCE($7, color),
           is_active = COALESCE($8, is_active)
       WHERE id = $1::uuid
         AND organization_id = $2::uuid
       RETURNING
         id::text AS id,
         organization_id::text AS organization_id,
         name,
         description,
         is_billable_default,
         hourly_rate::float AS hourly_rate,
         color,
         is_active,
         created_at::text AS created_at`,
      [
        req.params.id,
        buildCtx(req).organizationId,
        (body.name as string | undefined) ?? null,
        (body.description as string | undefined) ?? null,
        body.isBillableDefault != null ? Boolean(body.isBillableDefault) : (body.is_billable_default != null ? Boolean(body.is_billable_default) : null),
        body.hourlyRate != null ? Number(body.hourlyRate) : (body.hourly_rate != null ? Number(body.hourly_rate) : null),
        (body.color as string | undefined) ?? null,
        body.isActive != null ? Boolean(body.isActive) : (body.is_active != null ? Boolean(body.is_active) : null),
      ],
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[time/categories/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update category' });
  }
});

router.delete('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    await query('DELETE FROM time_categories WHERE id = $1::uuid AND organization_id = $2::uuid', [req.params.id, buildCtx(req).organizationId]);
    res.json({ success: true });
  } catch (err) {
    console.error('[time/categories/:id DELETE]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete category' });
  }
});

export default router;
