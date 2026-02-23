import { Router } from 'express';
import {
  getAllBadges,
  getBadgeById,
  addBadge,
  updateBadge,
  removeBadge,
  awardBadgeToUser,
} from '../../db/badgesDb.js';
import { addAuditLog } from '../../db/auditDb.js';
import { requireAdmin } from '../../middleware/adminAuth.js';
import type { Badge } from '../../types/index.js';

const router = Router();
router.use(requireAdmin);

router.get('/', async (_req, res) => {
  try {
    const badges = await getAllBadges();
    res.json(badges);
  } catch (e) {
    console.error('[admin/badges] list error:', e);
    res.status(500).json({ error: 'Failed to load badges' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const badge = await getBadgeById(req.params.id);
    if (!badge) {
      res.status(404).json({ error: 'Badge not found' });
      return;
    }
    res.json(badge);
  } catch (e) {
    console.error('[admin/badges] get error:', e);
    res.status(500).json({ error: 'Failed to load badge' });
  }
});

router.post('/', async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const id = `badge-${(body.name as string)?.toLowerCase().replace(/\s+/g, '-') ?? 'new'}-${Date.now()}`;
  try {
    const newBadge = await addBadge({
      id,
      name: (body.name as string) ?? 'New Badge',
      icon: (body.icon as string) ?? 'award',
      type: (body.type as Badge['type']) ?? 'achievement',
      description: (body.description as string) ?? '',
      rarity: (body.rarity as Badge['rarity']) ?? 'common',
      criteria: (body.criteria as string) ?? undefined,
    });
    await addAuditLog({
      adminId: (req as { adminUserId?: string }).adminUserId ?? 'unknown',
      action: 'badge.created',
      entityType: 'badge',
      entityId: id,
      description: `Created badge ${newBadge.name}`,
    });
    res.status(201).json(newBadge);
  } catch (e) {
    console.error('[admin/badges] create error:', e);
    res.status(500).json({ error: 'Failed to create badge' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const badge = await updateBadge(req.params.id, req.body as Partial<Badge>);
    if (!badge) {
      res.status(404).json({ error: 'Badge not found' });
      return;
    }
    await addAuditLog({
      adminId: (req as { adminUserId?: string }).adminUserId ?? 'unknown',
      action: 'badge.updated',
      entityType: 'badge',
      entityId: badge.id,
      description: `Updated badge ${badge.name}`,
    });
    res.json(badge);
  } catch (e) {
    console.error('[admin/badges] update error:', e);
    res.status(500).json({ error: 'Failed to update badge' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const badge = await getBadgeById(req.params.id);
    if (!badge) {
      res.status(404).json({ error: 'Badge not found' });
      return;
    }
    await removeBadge(req.params.id);
    addAuditLog({
      adminId: (req as { adminUserId?: string }).adminUserId ?? 'unknown',
      action: 'badge.deleted',
      entityType: 'badge',
      entityId: req.params.id,
      description: `Deleted badge ${badge.name}`,
    });
    res.status(204).send();
  } catch (e) {
    console.error('[admin/badges] delete error:', e);
    res.status(500).json({ error: 'Failed to delete badge' });
  }
});

router.post('/:id/award', async (req, res) => {
  const badgeId = req.params.id;
  try {
    const badge = await getBadgeById(badgeId);
    if (!badge) {
      res.status(404).json({ error: 'Badge not found' });
      return;
    }
    const userIds = (req.body as { userIds?: string[] }).userIds;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ error: 'userIds array is required' });
      return;
    }
    for (const uid of userIds) {
      await awardBadgeToUser(badgeId, uid);
    }
    const updated = await getBadgeById(badgeId);
    await addAuditLog({
      adminId: (req as { adminUserId?: string }).adminUserId ?? 'unknown',
      action: 'badge.awarded',
      entityType: 'badge',
      entityId: badge.id,
      description: `Awarded ${badge.name} to ${userIds.length} user(s)`,
    });
    res.json(updated);
  } catch (e) {
    console.error('[admin/badges] award error:', e);
    res.status(500).json({ error: 'Failed to award badge' });
  }
});

export const adminBadgesRouter = router;
