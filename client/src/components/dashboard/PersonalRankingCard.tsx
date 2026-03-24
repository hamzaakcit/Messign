import type { RankingStats } from '@/types/dashboard';
import { useCountUp } from '@/hooks/useCountUp';
import { ProgressBar } from '@/components/ui';
import { Trophy, Calendar, Award, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PersonalRankingCardProps {
  stats: RankingStats;
}

function formatPoints(value: number): string {
  return value.toLocaleString();
}

export function PersonalRankingCard({ stats }: PersonalRankingCardProps) {
  const monthly = useCountUp(stats.monthlyPoints, 1000, true);
  const yearly = useCountUp(stats.yearlyPoints, 1200, true);
  const total = useCountUp(stats.totalPoints, 1400, true);

  const points = [
    {
      label: 'Monthly Points',
      value: monthly,
      icon: Calendar,
      color: 'text-primary-400',
      bgColor: 'bg-primary-500/10',
    },
    {
      label: 'Yearly Points',
      value: yearly,
      icon: Award,
      color: 'text-accent-400',
      bgColor: 'bg-accent-500/10',
    },
    {
      label: 'Total Points',
      value: total,
      icon: Trophy,
      color: 'text-warning-500',
      bgColor: 'bg-warning-500/10',
    },
  ];

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold text-app-text mb-4 flex items-center gap-2">
        <Trophy className="w-5 h-5 text-warning-500" />
        Your ranking
      </h3>

      {/* Points breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {points.map((p) => (
          <div
            key={p.label}
            className={cn(
              'rounded-xl p-4 border border-white/5',
              p.bgColor
            )}
          >
            <p.icon className={cn('w-5 h-5 mb-2', p.color)} />
            <p className="text-2xl font-bold text-app-text tabular-nums">
              {formatPoints(p.value)}
            </p>
            <p className="text-sm text-app-muted">{p.label}</p>
          </div>
        ))}
      </div>

      {/* Rank & progress */}
      <div className="pt-4 border-t border-white/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-app-muted">Current rank</span>
          <span className="text-xl font-bold text-app-text">
            #{stats.currentRank}
            <span className="text-app-muted font-normal text-sm ml-1">
              of {stats.totalEmployees}
            </span>
          </span>
        </div>
        <ProgressBar
          value={stats.progressToNextRank}
          variant="xp"
          size="md"
          className="mb-3"
        />
        <p className="text-xs text-app-muted">
          {stats.progressToNextRank}% to next rank
        </p>
        {stats.rankChange !== 0 && (
          <div
            className={cn(
              'flex items-center gap-1 mt-3 text-sm font-medium',
              stats.rankChange > 0 ? 'text-success-500' : 'text-danger-500'
            )}
          >
            {stats.rankChange > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {stats.rankChange > 0 ? '+' : ''}{stats.rankChange} positions this month
          </div>
        )}
      </div>
    </div>
  );
}
