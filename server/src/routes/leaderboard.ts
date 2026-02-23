import { Router } from 'express';
import { getEmployeesAsUsers } from '../db/employeesDb.js';
import type { LeaderboardEntry } from '../types/index.js';

export const leaderboardRouter = Router();

leaderboardRouter.get('/', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const users = await getEmployeesAsUsers();
  const sortedUsers = [...users].sort((a, b) => b.xp - a.xp);
  const leaderboard: LeaderboardEntry[] = sortedUsers.slice(0, limit).map((user, index) => ({
    rank: index + 1,
    userId: user.id,
    user: { ...user },
    xp: user.xp,
    change: Math.floor(Math.random() * 5) - 2,
  }));
  res.json(leaderboard);
});

leaderboardRouter.get('/me', async (_, res) => {
  const users = await getEmployeesAsUsers();
  const sortedUsers = [...users].sort((a, b) => b.xp - a.xp);
  const currentUserId = 'EMP101';
  const rank = sortedUsers.findIndex((u) => u.id === currentUserId) + 1;
  const user = users.find((u) => u.id === currentUserId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({
    rank: rank || 0,
    userId: currentUserId,
    user: { ...user },
    xp: user.xp,
    change: 0,
  });
});
