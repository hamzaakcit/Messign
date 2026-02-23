import { Router } from 'express';
import { getAuditLogs, addAuditLog } from '../../db/auditDb.js';
import { requireAdmin } from '../../middleware/adminAuth.js';

const router = Router();
router.use(requireAdmin);

router.get('/', async (req, res) => {
  try {
    const adminId = req.query.adminId as string | undefined;
    const action = req.query.action as string | undefined;
    const entityType = req.query.entityType as string | undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : 50;
    const offset = req.query.offset != null ? Number(req.query.offset) : 0;
    const logs = await getAuditLogs({ adminId, action, entityType, limit, offset });
    res.json(logs);
  } catch (e) {
    console.error('[admin/audit] list error:', e);
    res.status(500).json({ error: 'Failed to load audit logs' });
  }
});

router.post('/', async (req, res) => {
  const body = req.body as Record<string, unknown>;
  try {
    const entry = await addAuditLog({
      adminId: (req as { adminUserId?: string }).adminUserId ?? 'unknown',
      action: (body.action as string) ?? 'custom',
      entityType: (body.entityType as string) ?? 'unknown',
      entityId: (body.entityId as string) ?? '',
      description: (body.description as string) ?? '',
      ipAddress: (body.ipAddress as string) ?? undefined,
      userAgent: (body.userAgent as string) ?? undefined,
      changes: body.changes as Record<string, { before: unknown; after: unknown }> | undefined,
    });
    res.status(201).json(entry);
  } catch (e) {
    console.error('[admin/audit] add error:', e);
    res.status(500).json({ error: 'Failed to add audit log' });
  }
});

export const adminAuditRouter = router;
