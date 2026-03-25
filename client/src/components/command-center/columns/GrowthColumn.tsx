import { memo } from 'react';
import { TrendingUp } from 'lucide-react';
import type { CommandCenterDeepDiveKind, CommandCenterGrowth } from '@/types/command-center';
import { CommandCenterColumnHeader } from '../CommandCenterColumnHeader';
import { CompactKpiCard } from '../cards/CompactKpiCard';
import { TeamRadarChart } from '../charts/TeamRadarChart';
import { MiniSparkline } from '../charts/MiniSparkline';

interface GrowthColumnProps {
  growth: CommandCenterGrowth | null;
  insight: string;
  onOpenDeepDive: (kind: CommandCenterDeepDiveKind) => void;
  onOpenChat: () => void;
}

export const GrowthColumn = memo(function GrowthColumn({
  growth,
  insight,
  onOpenDeepDive,
  onOpenChat,
}: GrowthColumnProps): JSX.Element {
  if (!growth) {
    return (
      <div className="flex flex-col gap-2 min-w-[280px] max-w-[320px] shrink-0">
        <CommandCenterColumnHeader title="The Growth" insight={insight} />
        <p className="text-xs text-app-muted">Loading gamification…</p>
      </div>
    );
  }

  const lbSpark = growth.leaderboard.slice(0, 7).map((e) => e.xp);

  return (
    <div className="flex flex-col gap-2 min-w-[280px] max-w-[320px] shrink-0">
      <CommandCenterColumnHeader title="The Growth" insight={insight} icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-400" />} />

      <CompactKpiCard
        label="Your XP"
        value={String(growth.myXp)}
        sub={growth.myRank != null ? `Rank #${growth.myRank} org-wide` : 'Not ranked yet'}
        onClick={() => onOpenDeepDive({ kind: 'growth_leaderboard' })}
        onQuickAdd={onOpenChat}
        chart={<MiniSparkline data={lbSpark.length ? lbSpark : [0]} color="#34d399" />}
      />

      <CompactKpiCard
        label="Vibe index"
        value={growth.vibeScore != null ? growth.vibeScore.toFixed(0) : '—'}
        sub={`Sentiment · ${growth.engagementTrend}`}
        onClick={() => onOpenDeepDive({ kind: 'growth_radar' })}
      />

      <CompactKpiCard
        label="Culture health"
        value={growth.cultureHealth != null ? growth.cultureHealth.toFixed(0) : '—'}
        sub="Team heart score"
        onClick={() => onOpenDeepDive({ kind: 'growth_radar' })}
      />

      <div
        className="rounded-lg border border-white/[0.06] bg-[#12141a]/90 p-2 h-[140px]"
        role="button"
        tabIndex={0}
        onClick={() => onOpenDeepDive({ kind: 'growth_radar' })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenDeepDive({ kind: 'growth_radar' });
          }
        }}
      >
        <p className="text-[10px] uppercase text-app-muted mb-1">XP distribution</p>
        <div className="h-[108px]">
          <TeamRadarChart data={growth.xpRadar} />
        </div>
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-[#12141a]/90 p-2">
        <p className="text-[10px] uppercase text-app-muted mb-1">Leaderboard</p>
        <ul className="space-y-0.5">
          {growth.leaderboard.slice(0, 5).map((r) => (
            <li key={r.userId} className="flex justify-between text-[11px] text-app-text">
              <span className="truncate pr-2">
                {r.rank}. {r.name}
              </span>
              <span className="tabular-nums text-app-muted">{r.xp} XP</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => onOpenDeepDive({ kind: 'growth_leaderboard' })}
          className="mt-2 w-full text-[10px] font-medium text-primary-400 hover:text-primary-300"
        >
          Full leaderboard
        </button>
      </div>
    </div>
  );
});
