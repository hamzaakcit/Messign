import { Trophy, Unlock, BarChart3, Target } from 'lucide-react';
import { useUsersStore } from '@/stores/usersStore';
import { Avatar } from '@/components/ui';
import { ProgressBar } from '@/components/ui';
import { nearestAchievements, recentUnlocks, myAchievementStats, nextMilestones } from '@/data/rightSidebar';

export function AchievementsRightSidebar() {
  const { getUserById } = useUsersStore();

  return (
    <div className="h-full bg-app-sidebar border-l border-app flex flex-col overflow-hidden transition-colors duration-200" role="complementary" aria-label="Achievement progress">
      {/* Nearest unlockable */}
      <div className="p-4 border-b border-app">
        <h3 className="font-semibold text-app flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-primary-400" /> Achievement Progress
        </h3>
        <ul className="space-y-3">
          {nearestAchievements.map((a) => (
            <li key={a.id} className="p-2 rounded-lg bg-app-surface-tertiary">
              <p className="text-sm text-app-text font-medium">{a.name}</p>
              <ProgressBar value={a.progress} size="sm" className="mt-1" />
              <p className="text-xs text-app-muted mt-1">{a.needed}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* Recent unlocks */}
      <div className="p-4 border-b border-app">
        <h3 className="font-semibold text-app flex items-center gap-2 mb-2">
          <Unlock className="w-4 h-4 text-success-500" /> Recent Unlocks
        </h3>
        <ul className="space-y-2">
          {recentUnlocks.map((u) => {
            const user = getUserById(u.userId);
            return user ? (
              <li key={u.userId + u.badgeName} className="flex items-center gap-2 text-sm">
                <Avatar src={user.avatar} name={user.name} size="sm" showStatus={false} />
                <span className="text-app-muted">{user.name.split(' ')[0]} unlocked <span className="text-primary-400">{u.badgeName}</span></span>
                <span className="text-app-muted text-xs ml-auto">{u.time}</span>
              </li>
            ) : null;
          })}
        </ul>
      </div>

      {/* My stats */}
      <div className="p-4 border-b border-app">
        <h3 className="font-semibold text-app flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-accent-400" /> My Achievement Stats
        </h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="p-2 rounded bg-app-surface-tertiary">
            <p className="text-app-muted text-xs">Total badges</p>
            <p className="text-app-text font-semibold">{myAchievementStats.totalBadges}/{myAchievementStats.totalPossible}</p>
          </div>
          <div className="p-2 rounded bg-app-surface-tertiary">
            <p className="text-app-muted text-xs">MP from achievements</p>
            <p className="text-app-text font-semibold">{myAchievementStats.xpFromAchievements.toLocaleString()}</p>
          </div>
          <div className="p-2 rounded bg-app-surface-tertiary col-span-2">
            <p className="text-app-muted text-xs">Completion</p>
            <ProgressBar value={myAchievementStats.completionPercent} size="sm" className="mt-1" />
            <p className="text-xs text-app-muted mt-1">{myAchievementStats.completionPercent}%</p>
          </div>
          <div className="p-2 rounded bg-app-surface-tertiary col-span-2">
            <p className="text-app-muted text-xs">Rarest badge</p>
            <p className="text-primary-400 font-medium">{myAchievementStats.rarestBadge}</p>
          </div>
        </div>
      </div>

      {/* Next milestones */}
      <div className="p-4 flex-1 overflow-hidden flex flex-col min-h-0">
        <h3 className="font-semibold text-app flex items-center gap-2 mb-2">
          <Trophy className="w-4 h-4 text-warning-500" /> Next Milestones
        </h3>
        <ul className="space-y-2">
          {nextMilestones.map((m, i) => (
            <li key={i} className="text-sm p-2 rounded-lg bg-app-surface-tertiary text-app-muted">{m.text}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
