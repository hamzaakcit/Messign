import { Router } from 'express';
import { query } from '../../db/index.js';
import { addAuditLog } from '../../db/auditDb.js';
import { requireAdmin } from '../../middleware/adminAuth.js';

const router = Router();
router.use(requireAdmin);

router.get('/', async (_req, res) => {
  try {
    const result = await query<{ id: string; name: string; description: string | null }>(
      `SELECT id::text AS id, team_name AS name, description FROM performance_teams WHERE is_active = TRUE ORDER BY team_name`
    );
    if (!res.headersSent) {
      res.json(result.rows.map((r) => ({ id: r.id, name: r.name, description: r.description ?? undefined })));
    }
  } catch (e) {
    const err = e as Error;
    console.error('[admin/departments] GET', err);
    if (!res.headersSent) {
      const message = process.env.NODE_ENV === 'development' ? err.message : 'Failed to load departments';
      res.status(500).json({ error: 'Failed to load departments', detail: process.env.NODE_ENV === 'development' ? message : undefined });
    }
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await query<{ id: string; name: string; description: string | null }>(
      `SELECT id::text AS id, team_name AS name, description FROM performance_teams WHERE id = $1 AND is_active = TRUE LIMIT 1`,
      [req.params.id]
    );
    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: 'Department not found' });
      return;
    }
    res.json({ id: row.id, name: row.name, description: row.description ?? undefined });
  } catch (e) {
    console.error('[admin/departments]', e);
    res.status(500).json({ error: 'Failed to load department' });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const name = (body.name as string) ?? 'New Department';
    const code = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'new';
    const result = await query<{ id: string; team_code: string; team_name: string; description: string | null }>(
      `INSERT INTO performance_teams (team_code, team_name, description, team_type, is_active)
       VALUES ($1, $2, $3, 'operations', TRUE)
       RETURNING id::text AS id, team_code, team_name, description`,
      [`${code}-${Date.now()}`, name, (body.description as string) ?? null]
    );
    const row = result.rows[0];
    if (!row) {
      res.status(500).json({ error: 'Failed to create department' });
      return;
    }
    const newDept = { id: row.id, name: row.team_name, description: row.description ?? undefined };
    addAuditLog({
      adminId: (req as { adminUserId?: string }).adminUserId ?? 'unknown',
      action: 'department.created',
      entityType: 'department',
      entityId: row.id,
      description: `Created department ${name}`,
    });
    res.status(201).json(newDept);
  } catch (e) {
    console.error('[admin/departments] POST', e);
    res.status(500).json({ error: 'Failed to create department' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;
    if (body.name != null) {
      updates.push(`team_name = $${paramIdx++}`);
      params.push(body.name);
    }
    if (body.description != null) {
      updates.push(`description = $${paramIdx++}`);
      params.push(body.description);
    }
    if (updates.length === 0) {
      const r = await query<{ id: string; name: string; description: string | null }>(
        `SELECT id::text AS id, team_name AS name, description FROM performance_teams WHERE id = $1 LIMIT 1`,
        [req.params.id]
      );
      const row = r.rows[0];
      if (!row) {
        res.status(404).json({ error: 'Department not found' });
        return;
      }
      return res.json({ id: row.id, name: row.name, description: row.description ?? undefined });
    }
    params.push(req.params.id);
    const result = await query<{ id: string; name: string; description: string | null }>(
      `UPDATE performance_teams SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIdx} RETURNING id::text AS id, team_name AS name, description`,
      params
    );
    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: 'Department not found' });
      return;
    }
    await addAuditLog({
      adminId: (req as { adminUserId?: string }).adminUserId ?? 'unknown',
      action: 'department.updated',
      entityType: 'department',
      entityId: row.id,
      description: `Updated department ${row.name}`,
    });
    res.json({ id: row.id, name: row.name, description: row.description ?? undefined });
  } catch (e) {
    console.error('[admin/departments] PUT', e);
    res.status(500).json({ error: 'Failed to update department' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await query<{ team_name: string }>(
      `SELECT team_name FROM performance_teams WHERE id = $1 LIMIT 1`,
      [req.params.id]
    );
    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: 'Department not found' });
      return;
    }
    await query(`UPDATE performance_teams SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, [req.params.id]);
    await addAuditLog({
      adminId: (req as { adminUserId?: string }).adminUserId ?? 'unknown',
      action: 'department.deleted',
      entityType: 'department',
      entityId: req.params.id,
      description: `Deleted department ${row.team_name}`,
    });
    res.status(204).send();
  } catch (e) {
    console.error('[admin/departments] DELETE', e);
    res.status(500).json({ error: 'Failed to delete department' });
  }
});

export const adminDepartmentsRouter = router;
