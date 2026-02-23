import { Trophy, TrendingUp, TrendingDown, Minus, ChevronRight, Crown } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { useUsersStore } from '@/stores/usersStore';
import { useAuthStore } from '@/stores/authStore';
import { Avatar } from '@/components/ui';
import { formatNumber, formatRelativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

export function DashboardRightSidebar() {
  const { leaderboard, activities } = useGameStore();
  const { getUserById } = useUsersStore();
  const { user: currentUser } = useAuthStore();

  return (
    <div className="h-full bg-app-sidebar border-l border-app flex flex-col overflow-hidden transition-colors duration-200" role="complementary" aria-label="Champions leaderboard and activity">
      <div className="p-4 border-b border-app">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-warning-500" aria-hidden />
          <h2 className="font-bold text-app">Champions 2026</h2>
        </div>

        {/* Top 3 with crowns */}
        <div className="flex justify-center gap-2 mb-4">
          {leaderboard.slice(0, 3).map((entry, index) => {
            const pos = [{ size: 'lg' as const, ring: 'ring-2 ring-warning-500' }, { size: 'md' as const, ring: 'ring-2 ring-gray-400' }, { size: 'md' as const, ring: 'ring-2 ring-amber-700' }][index];
            return (
              <div key={entry.userId} className="flex flex-col items-center">
                <div className="relative">
                  {index === 0 && <Crown className="absolute -top-4 left-1/2 -translate-x-1/2 w-5 h-5 text-warning-500" aria-hidden />}
                  <Avatar src={entry.user.avatar} name={entry.user.name} size={pos.size} showStatus={false} className={pos.ring} />
                  <span className={cn('absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold', index === 0 && 'bg-warning-500 text-black', index === 1 && 'bg-gray-400 text-black', index === 2 && 'bg-amber-700 text-app')}>{entry.rank}</span>
                </div>
                <p className="mt-2 text-xs text-app font-medium truncate max-w-[60px]">{entry.user.name.split(' ')[0]}{currentUser?.id === entry.userId ? ' (you)' : ''}</p>
                <p className="text-xs text-primary-400">{formatNumber(entry.xp)} MP</p>
              </div>
            );
          })}
        </div>

        {/* Extended list 4–10, current user highlighted */}
        <div className="space-y-2">
          {leaderboard.slice(3, 10).map((entry) => {
            const isCurrentUser = currentUser?.id === entry.userId;
            return (
              <div key={entry.userId} className={cn('flex items-center gap-3 p-2 rounded-lg transition-colors', isCurrentUser ? 'bg-primary-500/20 ring-1 ring-primary-500/40' : 'hover:bg-app-hover')}>
                <span className="w-6 text-center text-sm font-medium text-app-muted">{entry.rank}</span>
                <Avatar src={entry.user.avatar} name={entry.user.name} size="sm" showStatus={false} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-app truncate">{entry.user.name}{isCurrentUser && ' (you)'}</p>
                  <p className="text-xs text-app-muted">{entry.user.jobTitle}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-primary-400">{formatNumber(entry.xp)}</p>
                  <div className="flex items-center justify-end text-xs">
                    {entry.change > 0 && <span className="text-success-500 flex items-center"><TrendingUp className="w-3 h-3 mr-0.5" />{entry.change}</span>}
                    {entry.change < 0 && <span className="text-danger-500 flex items-center"><TrendingDown className="w-3 h-3 mr-0.5" />{Math.abs(entry.change)}</span>}
                    {entry.change === 0 && <span className="text-app-muted flex items-center"><Minus className="w-3 h-3" /></span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="p-4 pb-2 flex items-center justify-between">
          <h3 className="font-semibold text-app">Live Activity</h3>
          <a href="#" className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">View all <ChevronRight className="w-3 h-3" /></a>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
          {activities.length === 0 ? (
            <p className="text-sm text-app-muted py-4 text-center">No recent activity</p>
          ) : activities.map((activity) => {
            const user = getUserById(activity.userId);
            if (!user) return null;
            return (
              <div key={activity.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-app-hover transition-colors">
                <Avatar src={user.avatar} name={user.name} size="sm" showStatus={false} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-app-muted"><span className="font-medium text-app">{user.name.split(' ')[0]}</span> {activity.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-app-muted">{formatRelativeTime(activity.timestamp)}</span>
                    {activity.xpGained && activity.xpGained > 0 && <span className="text-xs text-primary-400">+{activity.xpGained} MP</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

