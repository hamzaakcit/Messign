import { Router } from 'express';
import { getRecentActivities, addActivity } from '../db/activitiesDb.js';

export const activitiesRouter = Router();

// Get recent activities
activitiesRouter.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const activities = await getRecentActivities(limit);
    res.json(activities);
  } catch (e) {
    console.error('[activities] list error:', e);
    res.status(500).json({ error: 'Failed to load activities' });
  }
});

// Add new activity
activitiesRouter.post('/', async (req, res) => {
  const { userId, type, message, xpGained, metadata } = req.body;
  if (!userId || !type || !message) {
    res.status(400).json({ error: 'userId, type, and message are required' });
    return;
  }
  try {
    const activity = await addActivity({
      userId,
      type,
      message,
      xpGained: xpGained ?? 0,
      metadata,
      timestamp: new Date().toISOString(),
    });
    res.status(201).json(activity);
  } catch (e) {
    console.error('[activities] add error:', e);
    res.status(500).json({ error: 'Failed to add activity' });
  }
});
