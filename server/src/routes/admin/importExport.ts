import { Router, type Request } from 'express';
import type { Server } from 'socket.io';
import { requireAdmin } from '../../middleware/adminAuth.js';
import { getEmployeesAsUsers } from '../../db/employeesDb.js';
import { addAuditLog } from '../../db/auditDb.js';
import { getOrgIdBySlug, insertEmployees } from '../../db/bulkImportDb.js';

function getIo(req: Request): Server | undefined {
  return req.app.get('io') as Server | undefined;
}

const DEFAULT_ORG_SLUG = 'messign';

const router = Router();
router.use(requireAdmin);

router.post('/import', async (req, res) => {
  const body = req.body as { rows?: unknown[] };
  const rows = Array.isArray(body?.rows) ? body.rows : [];

  const orgId = await getOrgIdBySlug(DEFAULT_ORG_SLUG);
  if (!orgId) {
    res.status(503).json({ error: 'Organization not configured' });
    return;
  }

  let result;
  try {
    result = await insertEmployees(rows, orgId, { createAuth: true });
  } catch (e) {
    console.error('[admin/importExport] import error:', e);
    res.status(500).json({ error: 'Import failed' });
    return;
  }

  await addAuditLog({
    adminId: (req as { adminUserId?: string }).adminUserId ?? 'unknown',
    action: 'import.completed',
    entityType: 'import',
    entityId: 'bulk',
    description: `Bulk import: ${result.successful} rows processed, ${result.failed} failed`,
  });
  getIo(req)?.emit('employee:bulk_import');
  res.status(201).json(result);
});

router.get('/export', async (req, res) => {
  try {
    const users = await getEmployeesAsUsers();
    const format = (req.query.format as string) ?? 'json';
    if (format === 'csv') {
      const headers = ['id', 'email', 'name', 'jobTitle', 'department', 'role', 'level', 'xp', 'joinedAt'];
      const rows = users.map((u) =>
        headers.map((h) => String((u as unknown as Record<string, unknown>)[h] ?? '').replace(/"/g, '""'))
      );
      const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=employees.csv');
      res.send(csv);
      return;
    }
    res.json(users);
  } catch (e) {
    console.error('[admin/importExport] export error:', e);
    res.status(500).json({ error: 'Export failed' });
  }
});

export const adminImportExportRouter = router;
