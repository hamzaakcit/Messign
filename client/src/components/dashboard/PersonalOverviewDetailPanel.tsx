import { useEffect, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  X,
  Calendar,
  Target,
  BarChart3,
  Award,
  TrendingUp,
  TrendingDown,
  Trophy,
  Rocket,
  CheckCircle,
  Crown,
  Bug,
  Zap,
  Sunrise,
  Moon,
  Code,
  Server,
  Palette,
  PenTool,
  BarChart,
  Star,
  Shield,
  Users,
  Heart,
  MessageCircle,
} from 'lucide-react';
import type { User } from '@/types';
import type { PersonalOverviewDetail, RankingStats } from '@/types/dashboard';
import { getRarityTheme, type RarityKey } from '@/lib/badgeRarity';
import { useCountUp } from '@/hooks/useCountUp';
import { Avatar, Badge, Card, ProgressBar } from '@/components/ui';
import { cn } from '@/lib/utils';

const BADGE_ICON_MAP: Record<string, LucideIcon> = {
  rocket: Rocket,
  'check-circle': CheckCircle,
  crown: Crown,
  bug: Bug,
  zap: Zap,
  sunrise: Sunrise,
  moon: Moon,
  code: Code,
  server: Server,
  palette: Palette,
  'pen-tool': PenTool,
  'bar-chart': BarChart,
  star: Star,
  award: Award,
  shield: Shield,
  target: Target,
  users: Users,
  heart: Heart,
  'message-circle': MessageCircle,
  trophy: Trophy,
};

interface PersonalOverviewDetailPanelProps {
  user: User;
  detail: PersonalOverviewDetail;
  rankingStats: RankingStats;
  isOpen: boolean;
  onClose: () => void;
}

function formatPoints(value: number): string {
  return value.toLocaleString();
}

export function PersonalOverviewDetailPanel({
  user,
  detail,
  rankingStats,
  isOpen,
  onClose,
}: PersonalOverviewDetailPanelProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleEscape]);

  const { yearlyHoliday, performance, personalKPIs } = detail;
  const monthlyPoints = useCountUp(rankingStats.monthlyPoints, 1000, true);
  const yearlyPoints = useCountUp(rankingStats.yearlyPoints, 1200, true);
  const totalPoints = useCountUp(rankingStats.totalPoints, 1400, true);
  const holidayPercent = yearlyHoliday.totalDays
    ? (yearlyHoliday.usedDays / yearlyHoliday.totalDays) * 100
    : 0;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        className={cn(
          'fixed inset-y-0 right-0 w-full max-w-lg z-50 flex flex-col',
          'bg-dark-800 border-l border-white/10 shadow-xl',
          'animate-slide-in-right'
        )}
        role="dialog"
        aria-label="Personal overview details"
      >

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-semibold text-white">Personal overview</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            aria-label="Close panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Profile summary */}
          <div className="flex items-center gap-4">
            <Avatar
              src={user.avatar}
              name={user.name}
              size="xl"
              status={user.status}
              showStatus
            />
            <div className="min-w-0">
              <h3 className="font-semibold text-white truncate">{user.name}</h3>
              <p className="text-sm text-gray-400">{user.jobTitle}</p>
              <p className="text-xs text-gray-500">{user.department}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge
                  variant={
                    user.role === 'admin' ? 'red' : user.role === 'manager' ? 'purple' : 'blue'
                  }
                >
                  {user.role}
                </Badge>
                <Badge variant="default" className="text-xs">
                  Level {user.level}
                </Badge>
              </div>
            </div>
          </div>

          {/* Yearly holiday */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-5 h-5 text-primary-400" aria-hidden />
              <h4 className="text-sm font-semibold text-white">Yearly holiday {yearlyHoliday.year}</h4>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              <div>
                <p className="text-2xl font-bold text-white">{yearlyHoliday.totalDays}</p>
                <p className="text-xs text-gray-500">Total days</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary-400">{yearlyHoliday.usedDays}</p>
                <p className="text-xs text-gray-500">Used</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-success-500">{yearlyHoliday.remainingDays}</p>
                <p className="text-xs text-gray-500">Remaining</p>
              </div>
            </div>
            <ProgressBar
              value={holidayPercent}
              max={100}
              variant="default"
              size="md"
              showLabel={false}
            />
            <p className="text-xs text-gray-500 mt-1">
              {yearlyHoliday.usedDays} of {yearlyHoliday.totalDays} days used
            </p>
          </Card>

          {/* Ranking & points */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-5 h-5 text-warning-500" aria-hidden />
              <h4 className="text-sm font-semibold text-white">Your ranking & points</h4>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-xl p-3 border border-white/5 bg-primary-500/10">
                <Calendar className="w-5 h-5 text-primary-400 mb-1.5" aria-hidden />
                <p className="text-xl font-bold text-white tabular-nums">{formatPoints(monthlyPoints)}</p>
                <p className="text-xs text-gray-500">Monthly</p>
              </div>
              <div className="rounded-xl p-3 border border-white/5 bg-accent-500/10">
                <Award className="w-5 h-5 text-accent-400 mb-1.5" aria-hidden />
                <p className="text-xl font-bold text-white tabular-nums">{formatPoints(yearlyPoints)}</p>
                <p className="text-xs text-gray-500">Yearly</p>
              </div>
              <div className="rounded-xl p-3 border border-white/5 bg-warning-500/10">
                <Trophy className="w-5 h-5 text-warning-500 mb-1.5" aria-hidden />
                <p className="text-xl font-bold text-white tabular-nums">{formatPoints(totalPoints)}</p>
                <p className="text-xs text-gray-500">Total</p>
              </div>
            </div>
            <div className="pt-3 border-t border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Current rank</span>
                <span className="text-lg font-bold text-white">
                  #{rankingStats.currentRank}
                  <span className="text-gray-500 font-normal text-sm ml-1">
                    of {rankingStats.totalEmployees}
                  </span>
                </span>
              </div>
              <ProgressBar
                value={rankingStats.progressToNextRank}
                variant="xp"
                size="md"
                className="mb-2"
              />
              <p className="text-xs text-gray-500 mb-1">
                {rankingStats.progressToNextRank}% to next rank
              </p>
              {rankingStats.rankChange !== 0 && (
                <div
                  className={cn(
                    'flex items-center gap-1 text-sm font-medium',
                    rankingStats.rankChange > 0 ? 'text-success-500' : 'text-danger-500'
                  )}
                >
                  {rankingStats.rankChange > 0 ? (
                    <TrendingUp className="w-4 h-4" aria-hidden />
                  ) : (
                    <TrendingDown className="w-4 h-4" aria-hidden />
                  )}
                  {rankingStats.rankChange > 0 ? '+' : ''}
                  {rankingStats.rankChange} positions this month
                </div>
              )}
            </div>
          </Card>

          {/* Performance details */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-5 h-5 text-accent-400" aria-hidden />
              <h4 className="text-sm font-semibold text-white">Performance details</h4>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-2xl font-bold text-white">{performance.overallRating}</span>
              <span className="text-sm text-gray-400">/ 5</span>
              <span className="text-sm text-gray-500">— {performance.ratingLabel}</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Last review: {new Date(performance.lastReviewDate).toLocaleDateString()}
            </p>
            <p className="text-xs font-medium text-gray-400 mb-2">Goals</p>
            <ul className="space-y-2">
              {performance.goals.map((goal) => (
                <li key={goal.title} className="flex flex-col gap-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-white truncate">{goal.title}</span>
                    <span
                      className={cn(
                        'shrink-0 text-xs',
                        goal.status === 'complete' && 'text-success-500',
                        goal.status === 'on_track' && 'text-primary-400',
                        goal.status === 'at_risk' && 'text-warning-500'
                      )}
                    >
                      {goal.status === 'complete'
                        ? 'Complete'
                        : goal.status === 'on_track'
                          ? 'On track'
                          : 'At risk'}
                    </span>
                  </div>
                  <ProgressBar
                    value={goal.progress}
                    max={100}
                    variant={goal.status === 'complete' ? 'success' : 'default'}
                    size="sm"
                  />
                </li>
              ))}
            </ul>
          </Card>

          {/* Personal KPIs */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-5 h-5 text-warning-500" aria-hidden />
              <h4 className="text-sm font-semibold text-white">Personal KPIs</h4>
            </div>
            <dl className="grid gap-3">
              {personalKPIs.map((kpi) => (
                <div
                  key={kpi.label}
                  className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
                >
                  <dt className="text-sm text-gray-400">{kpi.label}</dt>
                  <dd className="flex items-center gap-2 text-sm font-medium text-white">
                    {typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value}
                    {kpi.unit && <span className="text-gray-500">{kpi.unit}</span>}
                    {kpi.change !== undefined && (
                      <span
                        className={cn(
                          'flex items-center text-xs',
                          kpi.change >= 0 ? 'text-success-500' : 'text-danger-500'
                        )}
                      >
                        {kpi.change >= 0 ? (
                          <TrendingUp className="w-3.5 h-3.5" />
                        ) : (
                          <TrendingDown className="w-3.5 h-3.5" />
                        )}
                        {kpi.change >= 0 ? '+' : ''}{kpi.change}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* Badges */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-5 h-5 text-accent-400" aria-hidden />
              <h4 className="text-sm font-semibold text-white">Badges</h4>
            </div>
            {user.badges && user.badges.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {user.badges.map((badge) => {
                  const rarity = (badge.rarity?.toLowerCase() || 'common') as RarityKey;
                  const theme = getRarityTheme(rarity);
                  const IconComponent = BADGE_ICON_MAP[badge.icon] ?? Trophy;
                  return (
                    <div
                      key={badge.id}
                      className="flex items-center gap-3 rounded-xl border-2 p-3 min-h-[80px] overflow-hidden"
                      style={{
                        background: `linear-gradient(135deg, rgba(${theme.rgb.r},${theme.rgb.g},${theme.rgb.b},0.15) 0%, rgba(20,20,28,0.9) 70%)`,
                        borderColor: `rgba(${theme.rgb.r}, ${theme.rgb.g}, ${theme.rgb.b}, 0.35)`,
                        boxShadow: `0 4px 16px rgba(0,0,0,0.3), 0 0 24px ${theme.glow}`,
                      }}
                      title={badge.description}
                    >
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          background: `radial-gradient(circle, rgba(${theme.rgb.r},${theme.rgb.g},${theme.rgb.b},0.35), rgba(${theme.rgb.r},${theme.rgb.g},${theme.rgb.b},0.1))`,
                          border: `2px solid rgba(${theme.rgb.r}, ${theme.rgb.g}, ${theme.rgb.b}, 0.5)`,
                          boxShadow: `0 0 20px ${theme.glow}`,
                        }}
                      >
                        <IconComponent className="w-5 h-5 text-white" strokeWidth={2} aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white truncate">{badge.name}</p>
                        <span
                          className="inline-block mt-1 text-[11px] font-medium uppercase tracking-wider rounded-full px-2 py-0.5"
                          style={{
                            color: theme.primary,
                            background: `rgba(${theme.rgb.r}, ${theme.rgb.g}, ${theme.rgb.b}, 0.2)`,
                            boxShadow: `0 0 8px ${theme.glow}`,
                          }}
                        >
                          {badge.rarity}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No badges yet. Complete tasks and goals to earn badges.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
