import { useState, useMemo, useCallback } from 'react';
import {
  Trophy,
  Star,
  Zap,
  Award,
  Shield,
  Target,
  Rocket,
  CheckCircle,
  Bug,
  Sunrise,
  Moon,
  Code,
  Server,
  Palette,
  PenTool,
  BarChart,
  Users,
  Heart,
  MessageCircle,
  Crown,
  Search,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { useAuthStore } from '@/stores/authStore';
import type { Badge as BadgeType } from '@/types';
import { BadgeCard, BadgeDetailModal, BadgeUnlockCelebration } from '@/components/achievements';
import { useUsersStore } from '@/stores/usersStore';
import { cn } from '@/lib/utils';

const iconMap: Record<string, LucideIcon> = {
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

type FilterTab = 'all' | 'earned' | 'locked' | 'rare';
type SortOption = 'rarity' | 'recent' | 'alphabetical';

const RARITY_ORDER: Record<string, number> = {
  legendary: 4,
  epic: 3,
  rare: 2,
  common: 1,
};

export function AchievementsView() {
  const { badges } = useGameStore();
  const { user } = useAuthStore();
  const { getUserById } = useUsersStore();

  const [filter, setFilter] = useState<FilterTab>('all');
  const [sort, setSort] = useState<SortOption>('rarity');
  const [search, setSearch] = useState('');
  const [selectedBadge, setSelectedBadge] = useState<BadgeType | null>(null);
  const [celebrationBadge, setCelebrationBadge] = useState<BadgeType | null>(null);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

  const userId = user?.id ?? '';
  const earnedCount = badges.filter((b) => b.holders.includes(userId)).length;
  const totalCount = badges.length;
  const percentComplete = totalCount ? Math.round((earnedCount / totalCount) * 100) : 0;

  const lockedBadges = badges.filter((b) => !b.holders.includes(userId));
  const nextBadge = lockedBadges[0] ?? null;
  const nextBadgeXpAway = 5;

  const filteredAndSortedBadges = useMemo(() => {
    let list = badges;

    if (filter === 'earned') {
      list = list.filter((b) => b.holders.includes(userId));
    } else if (filter === 'locked') {
      list = list.filter((b) => !b.holders.includes(userId));
    } else if (filter === 'rare') {
      list = list.filter((b) => b.rarity === 'epic' || b.rarity === 'legendary');
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.description.toLowerCase().includes(q) ||
          b.rarity.toLowerCase().includes(q)
      );
    }

    if (sort === 'rarity') {
      list = [...list].sort((a, b) => (RARITY_ORDER[b.rarity] ?? 0) - (RARITY_ORDER[a.rarity] ?? 0));
    } else if (sort === 'alphabetical') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'recent') {
      list = [...list].sort((a, b) => {
        const aH = a.holders.length;
        const bH = b.holders.length;
        return bH - aH;
      });
    }

    return list;
  }, [badges, userId, filter, search, sort]);

  const handleBadgeClick = useCallback((badge: BadgeType) => {
    setSelectedBadge(badge);
  }, []);

  const holderUsers = useMemo(() => {
    if (!selectedBadge) return [];
    return selectedBadge.holders
      .slice(0, 12)
      .map((id) => getUserById(id))
      .filter(Boolean) as { id: string; name: string; avatar: string }[];
  }, [selectedBadge, getUserById]);

  const selectedIcon = selectedBadge ? iconMap[selectedBadge.icon] ?? Trophy : Trophy;
  const celebrationIcon = celebrationBadge ? iconMap[celebrationBadge.icon] ?? Trophy : Trophy;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-app transition-colors duration-200">
      {/* Page Header */}
      <header className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-app">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="flex items-center justify-center w-12 h-12 rounded-xl shrink-0"
              style={{
                background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)',
                boxShadow: '0 0 24px rgba(245, 158, 11, 0.4)',
              }}
            >
              <Trophy className="w-7 h-7 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-app">
                Badges
              </h1>
              <p className="text-sm text-app-muted mt-0.5">Collect achievements and level up</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCelebrationBadge(badges.find((b) => b.holders.includes(userId)) ?? badges[0] ?? null)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-app-hover hover:bg-app-hover/80 text-app-muted hover:text-app text-sm font-medium border border-app transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Try celebration
          </button>
        </div>

        {/* Stats Bar */}
        <div className="flex flex-wrap items-center gap-6 mt-6 text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10">
              <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke="rgba(59, 130, 246, 0.8)"
                  strokeWidth="3"
                  strokeDasharray={`${percentComplete * 1.005} 100`}
                  strokeLinecap="round"
                  className="transition-all duration-500"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                {percentComplete}%
              </span>
            </div>
            <span>
              <strong className="text-white font-semibold">{earnedCount}</strong> / {totalCount} Collected
            </span>
          </div>
          <span>{percentComplete}% Complete</span>
          {nextBadge && (
            <span>
              Next: <strong className="text-primary-400">{nextBadge.name}</strong> ({nextBadgeXpAway} MP away)
            </span>
          )}
        </div>

        {/* Filter & Sort */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-6">
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'earned', 'locked', 'rare'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium transition-all',
                  filter === tab
                    ? 'bg-primary-500/20 text-primary-400 border border-primary-500/40'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80 border border-transparent'
                )}
              >
                {tab === 'all' && 'All'}
                {tab === 'earned' && 'Earned'}
                {tab === 'locked' && 'Locked'}
                {tab === 'rare' && 'Rare+'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setSortDropdownOpen((o) => !o)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/80 text-sm font-medium hover:bg-white/10 transition-colors"
              >
                Sort: {sort === 'rarity' ? 'Rarity' : sort === 'recent' ? 'Recent' : 'Alphabetical'}
                <ChevronDown className={cn('w-4 h-4 transition-transform', sortDropdownOpen && 'rotate-180')} />
              </button>
              {sortDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setSortDropdownOpen(false)} aria-hidden />
                  <div className="absolute right-0 top-full mt-1 py-1 rounded-xl bg-dark-700 border border-white/10 shadow-xl z-20 min-w-[160px]">
                    {(['rarity', 'recent', 'alphabetical'] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          setSort(opt);
                          setSortDropdownOpen(false);
                        }}
                        className={cn(
                          'w-full px-4 py-2 text-left text-sm transition-colors',
                          sort === opt ? 'bg-primary-500/20 text-primary-400' : 'text-white/80 hover:bg-white/10'
                        )}
                      >
                        {opt === 'rarity' && 'Rarity'}
                        {opt === 'recent' && 'Recent'}
                        {opt === 'alphabetical' && 'Alphabetical'}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
              <input
                type="search"
                placeholder="Search badges..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-48 pl-9 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50"
                aria-label="Search badges"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Badge Grid */}
      <div className="flex-1 overflow-auto p-6">
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mx-auto"
          style={{ maxWidth: '1400px' }}
        >
          {filteredAndSortedBadges.map((badge, index) => {
            const Icon = iconMap[badge.icon] ?? Trophy;
            const isEarned = userId ? badge.holders.includes(userId) : false;
            const progress = badge.criteria
              ? { current: Math.min(3, Math.floor(Math.random() * 5)), total: 5 }
              : undefined;

            return (
              <BadgeCard
                key={badge.id}
                badge={badge}
                icon={Icon}
                isEarned={isEarned}
                onClick={handleBadgeClick}
                index={index}
                progress={!isEarned ? progress : undefined}
              />
            );
          })}
        </div>

        {filteredAndSortedBadges.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-24 h-24 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
              <Trophy className="w-12 h-12 text-white/30" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No badges match</h3>
            <p className="text-white/50 text-sm max-w-sm">
              Try changing filters or search. Start your journey to unlock badges!
            </p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedBadge && (
        <BadgeDetailModal
          badge={selectedBadge}
          icon={selectedIcon}
          isEarned={selectedBadge.holders.includes(userId)}
          onClose={() => setSelectedBadge(null)}
          holderUsers={holderUsers}
        />
      )}

      {/* Unlock Celebration */}
      <BadgeUnlockCelebration
        badge={celebrationBadge}
        icon={celebrationIcon}
        isOpen={!!celebrationBadge}
        onClose={() => setCelebrationBadge(null)}
      />
    </div>
  );
}
