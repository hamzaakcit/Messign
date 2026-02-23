import { Router } from 'express';
import { getBadgeById, getBadgesForUser, getAllBadges, awardBadgeToUser } from '../db/badgesDb.js';

export const badgesRouter = Router();

// Get all badges
badgesRouter.get('/', async (_req, res) => {
  try {
    const badges = await getAllBadges();
    res.json(badges);
  } catch (e) {
    console.error('[badges] list error:', e);
    res.status(500).json({ error: 'Failed to load badges' });
  }
});

// Get badge by ID
badgesRouter.get('/:id', async (req, res) => {
  try {
    const badge = await getBadgeById(req.params.id);
    if (badge) {
      res.json(badge);
    } else {
      res.status(404).json({ error: 'Badge not found' });
    }
  } catch (e) {
    console.error('[badges] get error:', e);
    res.status(500).json({ error: 'Failed to load badge' });
  }
});

// Get badges for a user
badgesRouter.get('/user/:userId', async (req, res) => {
  try {
    const userBadges = await getBadgesForUser(req.params.userId);
    res.json(userBadges);
  } catch (e) {
    console.error('[badges] user badges error:', e);
    res.status(500).json({ error: 'Failed to load user badges' });
  }
});

// Award badge to user (for testing)
badgesRouter.post('/:id/award', async (req, res) => {
  const badgeId = req.params.id;
  const userId = req.body?.userId;
  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }
  try {
    const badge = await awardBadgeToUser(badgeId, userId);
    if (badge) {
      res.json(badge);
    } else {
      res.status(404).json({ error: 'Badge not found' });
    }
  } catch (e) {
    console.error('[badges] award error:', e);
    res.status(500).json({ error: 'Failed to award badge' });
  }
});
