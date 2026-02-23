import { useState, useMemo } from 'react';
import { Award, Pencil, Gift, Plus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@/admin/hooks/useAdminQuery';
import { adminAPI } from '@/lib/api';
import { getRarityTheme } from '@/lib/badgeRarity';
import type { Badge } from '@/types';
const RARITIES: Badge['rarity'][] = ['common', 'rare', 'epic', 'legendary'];

interface BadgeLibraryGridProps {
  totalEmployees: number;
  onEditBadge: (badge: Badge | null) => void;
  onAwardBadge: (badge: Badge) => void;
}

export function BadgeLibraryGrid({ totalEmployees, onEditBadge, onAwardBadge }: BadgeLibraryGridProps) {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [rarityFilter, setRarityFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { data: badgesData } = useQuery(
    ['admin-badges', userId],
    () => adminAPI.badges.getAll(userId) as Promise<Badge[]>,
    { enabled: !!userId }
  );

  const badges = useMemo(() => (Array.isArray(badgesData) ? badgesData : []) as Badge[], [badgesData]);

  const filtered = useMemo(() => {
    let list = badges;
    if (rarityFilter !== 'all') {
      list = list.filter((b) => (b.rarity ?? 'common') === rarityFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((b) => b.name.toLowerCase().includes(q) || (b.description ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [badges, rarityFilter, search]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" />
            Achievement library
          </CardTitle>
          <Button variant="primary" size="sm" className="gap-2" onClick={() => onEditBadge(null)}>
            <Plus className="w-4 h-4" />
            Create badge
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <select
            value={rarityFilter}
            onChange={(e) => setRarityFilter(e.target.value)}
            className="input-theme text-sm py-1.5"
          >
            <option value="all">All rarities</option>
            {RARITIES.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
          <input
            type="search"
            placeholder="Search badges..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-theme text-sm py-1.5 min-w-[160px]"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {filtered.map((badge) => {
            const theme = getRarityTheme(badge.rarity ?? 'common');
            const holders = badge.holders?.length ?? 0;
            return (
              <div
                key={badge.id}
                className="p-4 rounded-lg border border-app-border bg-app-surface-tertiary flex flex-col items-center text-center gap-2"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                  style={{ backgroundColor: `${theme.primary}22`, borderColor: theme.primary, borderWidth: 2, borderStyle: 'solid' }}
                >
                  <Award className="w-6 h-6" style={{ color: theme.primary }} />
                </div>
                <p className="font-medium text-app text-sm truncate w-full">{badge.name}</p>
                <p className="text-xs text-app-muted capitalize">{badge.rarity ?? 'common'}</p>
                <p className="text-xs text-app-muted">
                  {holders}/{totalEmployees} holders
                </p>
                <div className="flex gap-1 mt-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-1.5"
                    onClick={() => onEditBadge(badge)}
                    aria-label={`Edit ${badge.name}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-1.5"
                    onClick={() => onAwardBadge(badge)}
                    aria-label={`Award ${badge.name}`}
                  >
                    <Gift className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <p className="text-sm text-app-muted text-center py-4">No badges match. Create one or adjust filters.</p>
        )}
      </CardContent>
    </Card>
  );
}
