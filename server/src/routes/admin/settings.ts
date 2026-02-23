import { Router } from 'express';
import { getSettings, updateSettings } from '../../db/settingsDb.js';
import { addAuditLog } from '../../db/auditDb.js';
import { requireAdmin } from '../../middleware/adminAuth.js';

const router = Router();
router.use(requireAdmin);

router.get('/', async (_req, res) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (e) {
    console.error('[admin/settings] get error:', e);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

router.put('/', async (req, res) => {
  try {
    const updated = await updateSettings(req.body);
    await addAuditLog({
      adminId: (req as { adminUserId?: string }).adminUserId ?? 'unknown',
      action: 'settings.updated',
      entityType: 'settings',
      entityId: 'general',
      description: 'Updated system settings',
    });
    res.json(updated);
  } catch (e) {
    console.error('[admin/settings] update error:', e);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export const adminSettingsRouter = router;
