import { Router } from 'express';
import {
  getEmployeesAsUsers,
  getEmployeeByIdAsUser,
  getEmployeesByRole,
  addEmployeeXP,
  updateEmployeeStatus,
} from '../db/employeesDb.js';
import { getBadgesForUser } from '../db/badgesDb.js';

export const usersRouter = Router();

// Get all users (DB only)
usersRouter.get('/', async (_req, res) => {
  try {
    const users = await getEmployeesAsUsers();
    const withBadges = await Promise.all(users.map(async (u) => ({ ...u, badges: await getBadgesForUser(u.id) })));
    res.json(withBadges);
  } catch (e) {
    console.error('[users] DB error:', e);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// Get current user (first admin from DB; no mock fallback)
usersRouter.get('/me', async (_req, res) => {
  try {
    const admins = await getEmployeesByRole('admin');
    const first = admins[0];
    if (!first) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const id = first.auth_user_id ?? first.id;
    const user = await getEmployeeByIdAsUser(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ ...user, badges: await getBadgesForUser(user.id) });
  } catch (e) {
    console.error('[users] /me error:', e);
    res.status(500).json({ error: 'Failed to load current user' });
  }
});

// Get user by ID (DB only)
usersRouter.get('/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const user = await getEmployeeByIdAsUser(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ ...user, badges: await getBadgesForUser(user.id) });
  } catch (e) {
    console.error('[users] get by id error:', e);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

// Update user XP (DB)
usersRouter.post('/:id/xp', async (req, res) => {
  const id = req.params.id;
  const amount = Number(req.body?.amount);
  if (Number.isNaN(amount) || amount < 0) {
    res.status(400).json({ error: 'Invalid amount' });
    return;
  }
  try {
    const row = await addEmployeeXP(id, amount);
    if (!row) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const user = await getEmployeeByIdAsUser(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ ...user, badges: await getBadgesForUser(user.id) });
  } catch (e) {
    console.error('[users] xp error:', e);
    res.status(500).json({ error: 'Failed to update XP' });
  }
});

// Update user status (DB)
usersRouter.patch('/:id/status', async (req, res) => {
  const id = req.params.id;
  const status = req.body?.status;
  const allowed: Array<'online' | 'away' | 'busy' | 'offline'> = ['online', 'away', 'busy', 'offline'];
  if (!status || !allowed.includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }
  try {
    const row = await updateEmployeeStatus(id, status);
    if (!row) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const user = await getEmployeeByIdAsUser(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ ...user, badges: await getBadgesForUser(user.id) });
  } catch (e) {
    console.error('[users] status error:', e);
    res.status(500).json({ error: 'Failed to update status' });
  }
});
