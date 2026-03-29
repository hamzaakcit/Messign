import { Trophy } from 'lucide-react';
import type { CommandCenterGrowth, CommandCenterDeepDiveKind } from '@/types/command-center';
import { BentoCard } from './BentoCard';
import { TeamRadarChart } from '@/components/command-center/charts/TeamRadarChart';

interface GrowthModuleProps {
  growth: CommandCenterGrowth;
  onOpenDeepDive: (kind: CommandCenterDeepDiveKind) => void;
  onOpenChat: () => void;
}

/**
 * Gamified XP / leaderboard teaser with radar chart.
 */
export function GrowthModule({ growth, onOpenDeepDive, onOpenChat }: GrowthModuleProps): JSX.Element {
  const rankLabel = growth.myRank != null ? `#${growth.myRank}` : '—';

  return (
    <BentoCard
      title="Performance · XP"
      headerRight={
        <button
          type="button"
          onClick={onOpenChat}
          className="text-[9px] text-app-muted hover:text-app-text"
          title="Team chat"
        >
          Chat
        </button>
      }
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="min-w-0">
          <p className="text-lg font-semibold text-app-text tabular-nums leading-none">{growth.myXp}</p>
          <p className="text-[9px] text-app-muted mt-0.5">Rank {rankLabel} org-wide</p>
        </div>
        <button
          type="button"
          onClick={() => onOpenDeepDive({ kind: 'growth_leaderboard' })}
          className="inline-flex items-center gap-0.5 shrink-0 text-[9px] font-medium text-primary-400 hover:text-primary-300"
        >
          <Trophy className="w-3 h-3" aria-hidden />
          Board
        </button>
      </div>
      <div
        className="relative h-[72px] w-full min-h-0 rounded-md border border-white/[0.05] bg-[#12141a]/80 cursor-pointer overflow-hidden"
        role="button"
        tabIndex={0}
        onClick={() => onOpenDeepDive({ kind: 'growth_radar' })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenDeepDive({ kind: 'growth_radar' });
          }
        }}
        title="XP distribution"
      >
        <TeamRadarChart data={growth.xpRadar} />
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-app-muted">
        <span className="truncate">Vibe {growth.vibeScore != null ? growth.vibeScore.toFixed(0) : '—'}</span>
        <span className="truncate">{growth.engagementTrend}</span>
      </div>
    </BentoCard>
  );
}
