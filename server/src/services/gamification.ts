import { getEmployeeByIdAsUser, addEmployeeXP } from '../db/employeesDb.js';
import { hasBadge as dbHasBadge, awardBadgeToUser } from '../db/badgesDb.js';
import { addActivity } from '../db/activitiesDb.js';

export const XP_REWARDS = {
  message_sent: 5,
  task_completed: 50,
  project_completed: 200,
  document_created: 25,
  badge_earned: 100,
  daily_login: 10,
  help_colleague: 30,
  code_review: 20,
  bug_fixed: 40,
};

export const LEVEL_THRESHOLDS = [
  0, 100, 250, 500, 800, 1200, 1700, 2300, 3000, 3800,
  4700, 5700, 6800, 8000, 9300, 10700, 12200, 13800, 15500, 17300,
  19200, 21200, 23300, 25500, 27800, 30200, 32700, 35300, 38000, 40800,
];

export function calculateLevel(xp: number): { level: number; xpToNext: number; progress: number } {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]!) {
      level = i + 1;
    } else {
      break;
    }
  }
  const currentThreshold = LEVEL_THRESHOLDS[level - 1] || 0;
  const nextThreshold = LEVEL_THRESHOLDS[level] || currentThreshold + 2000;
  const xpInLevel = xp - currentThreshold;
  const xpNeeded = nextThreshold - currentThreshold;
  return {
    level,
    xpToNext: nextThreshold - xp,
    progress: (xpInLevel / xpNeeded) * 100,
  };
}

export async function awardXP(userId: string, amount: number, reason: string) {
  const user = await getEmployeeByIdAsUser(userId);
  if (!user) return null;
  const oldLevel = user.level;
  await addEmployeeXP(userId, amount);
  const updatedUser = await getEmployeeByIdAsUser(userId);
  if (!updatedUser) return null;
  if (updatedUser.level > oldLevel) {
    await addActivity({
      userId,
      type: 'level_up',
      message: `reached Level ${updatedUser.level}!`,
      xpGained: 0,
      timestamp: new Date().toISOString(),
    });
    return { user: updatedUser, leveledUp: true, newLevel: updatedUser.level };
  }
  return { user: updatedUser, leveledUp: false };
}

export async function checkBadgeCriteria(userId: string): Promise<string[]> {
  const user = await getEmployeeByIdAsUser(userId);
  if (!user) return [];
  const earnedBadges: string[] = [];
  if (user.stats.tasksCompleted >= 1 && !(await dbHasBadge(userId, 'badge-first-task'))) {
    await awardBadge(userId, 'badge-first-task');
    earnedBadges.push('badge-first-task');
  }
  if (user.stats.tasksCompleted >= 100 && !(await dbHasBadge(userId, 'badge-task-master'))) {
    await awardBadge(userId, 'badge-task-master');
    earnedBadges.push('badge-task-master');
  }
  if (user.level >= 10 && !(await dbHasBadge(userId, 'badge-level-10'))) {
    await awardBadge(userId, 'badge-level-10');
    earnedBadges.push('badge-level-10');
  }
  if (user.level >= 20 && !(await dbHasBadge(userId, 'badge-level-20'))) {
    await awardBadge(userId, 'badge-level-20');
    earnedBadges.push('badge-level-20');
  }
  if (user.xp >= 1000 && !(await dbHasBadge(userId, 'badge-1k-xp'))) {
    await awardBadge(userId, 'badge-1k-xp');
    earnedBadges.push('badge-1k-xp');
  }
  if (user.xp >= 10000 && !(await dbHasBadge(userId, 'badge-10k-xp'))) {
    await awardBadge(userId, 'badge-10k-xp');
    earnedBadges.push('badge-10k-xp');
  }
  if (user.stats.messagesSent >= 1000 && !(await dbHasBadge(userId, 'badge-communicator'))) {
    await awardBadge(userId, 'badge-communicator');
    earnedBadges.push('badge-communicator');
  }
  return earnedBadges;
}

async function awardBadge(userId: string, badgeId: string) {
  const badge = await awardBadgeToUser(badgeId, userId);
  if (badge) {
    await addActivity({
      userId,
      type: 'badge_earned',
      message: `earned the "${badge.name}" badge`,
      xpGained: 100,
      metadata: { badgeId },
      timestamp: new Date().toISOString(),
    });
    await addEmployeeXP(userId, 100);
  }
}
