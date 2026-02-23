import { Router } from 'express';
import { getAllRoles, getRoleById, addRole, updateRole } from '../../db/rolesDb.js';
import { addAuditLog } from '../../db/auditDb.js';
import { requireAdmin } from '../../middleware/adminAuth.js';
import type { Permission } from '../../types/admin.js';

const router = Router();
router.use(requireAdmin);

router.get('/', async (_req, res) => {
  try {
    const roles = await getAllRoles();
    res.json(roles);
  } catch (e) {
    console.error('[admin/roles] list error:', e);
    res.status(500).json({ error: 'Failed to load roles' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const role = await getRoleById(req.params.id);
    if (!role) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }
    res.json(role);
  } catch (e) {
    console.error('[admin/roles] get error:', e);
    res.status(500).json({ error: 'Failed to load role' });
  }
});

router.post('/', async (req, res) => {
  const body = req.body as Record<string, unknown>;
  if (!body.name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  try {
    const newRole = await addRole({
      name: (body.name as string) ?? 'Custom Role',
      description: (body.description as string) ?? undefined,
      permissions: (body.permissions as Permission[]) ?? [],
      isSystem: false,
    });
    await addAuditLog({
      adminId: (req as { adminUserId?: string }).adminUserId ?? 'unknown',
      action: 'role.created',
      entityType: 'role',
      entityId: newRole.id,
      description: `Created role ${newRole.name}`,
    });
    res.status(201).json(newRole);
  } catch (e) {
    console.error('[admin/roles] create error:', e);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const role = await getRoleById(req.params.id);
    if (!role) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const updated = await updateRole(req.params.id, {
      name: body.name as string | undefined,
      description: body.description as string | undefined,
      permissions: body.permissions as Permission[] | undefined,
    });
    if (!updated) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }
    await addAuditLog({
      adminId: (req as { adminUserId?: string }).adminUserId ?? 'unknown',
      action: 'role.updated',
      entityType: 'role',
      entityId: updated.id,
      description: `Updated role ${updated.name}`,
    });
    res.json(updated);
  } catch (e) {
    console.error('[admin/roles] update error:', e);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

export const adminRolesRouter = router;
