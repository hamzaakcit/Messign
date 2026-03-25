import { memo } from 'react';
import { Orbit } from 'lucide-react';
import type { CommandCenterDeepDiveKind, CommandCenterFuture } from '@/types/command-center';
import { CommandCenterColumnHeader } from '../CommandCenterColumnHeader';
import { CompactKpiCard } from '../cards/CompactKpiCard';
import { MiniSparkline } from '../charts/MiniSparkline';

interface FutureColumnProps {
  future: CommandCenterFuture | null;
  insight: string;
  onOpenDeepDive: (kind: CommandCenterDeepDiveKind) => void;
  onOpenOkr: () => void;
}

export const FutureColumn = memo(function FutureColumn({
  future,
  insight,
  onOpenDeepDive,
  onOpenOkr,
}: FutureColumnProps): JSX.Element {
  if (!future) {
    return (
      <div className="flex flex-col gap-2 min-w-[280px] max-w-[320px] shrink-0">
        <CommandCenterColumnHeader title="The Future" insight={insight} />
        <p className="text-xs text-app-muted">Loading OKRs…</p>
      </div>
    );
  }

  const { okrs } = future;
  const spark = [okrs.overallProgress, okrs.onTrack * 5, okrs.atRisk * 5, okrs.behind * 5].map((n) =>
    Math.min(100, Math.max(0, n)),
  );

  return (
    <div className="flex flex-col gap-2 min-w-[280px] max-w-[320px] shrink-0">
      <CommandCenterColumnHeader title="The Future" insight={insight} icon={<Orbit className="w-3.5 h-3.5 text-amber-400" />} />

      <CompactKpiCard
        label="OKR progress"
        value={`${okrs.overallProgress.toFixed(0)}%`}
        sub="Org average"
        onClick={() => onOpenDeepDive({ kind: 'future_okrs' })}
        onQuickAdd={onOpenOkr}
        chart={<MiniSparkline data={spark} color="#fbbf24" />}
      />

      <div className="grid grid-cols-3 gap-1">
        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-1.5 text-center">
          <p className="text-[9px] text-emerald-300/80">On track</p>
          <p className="text-sm font-bold text-emerald-200">{okrs.onTrack}</p>
        </div>
        <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-1.5 text-center">
          <p className="text-[9px] text-amber-300/80">At risk</p>
          <p className="text-sm font-bold text-amber-200">{okrs.atRisk}</p>
        </div>
        <div className="rounded-md bg-rose-500/10 border border-rose-500/20 p-1.5 text-center">
          <p className="text-[9px] text-rose-300/80">Behind</p>
          <p className="text-sm font-bold text-rose-200">{okrs.behind}</p>
        </div>
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-[#12141a]/90 p-2">
        <p className="text-[10px] uppercase text-app-muted mb-1">Milestones</p>
        <ul className="space-y-1 max-h-[120px] overflow-y-auto">
          {future.milestones.map((m, i) => (
            <li key={`${m.title}-${i}`} className="text-[11px] text-app-text flex justify-between gap-2">
              <span className="truncate">{m.title}</span>
              {m.dueDate && <span className="text-app-muted shrink-0">{m.dueDate}</span>}
            </li>
          ))}
          {future.milestones.length === 0 && <li className="text-[11px] text-app-muted">No upcoming period ends</li>}
        </ul>
        <button
          type="button"
          onClick={() => onOpenDeepDive({ kind: 'future_milestones' })}
          className="mt-2 w-full text-[10px] font-medium text-primary-400 hover:text-primary-300"
        >
          Horizon details
        </button>
      </div>

      <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-2 min-h-[72px]">
        <p className="text-[10px] uppercase text-app-muted mb-1">Sandbox ideas</p>
        {future.sandboxIdeas.length === 0 ? (
          <p className="text-[11px] text-app-muted">Capture strategic ideas here (coming soon).</p>
        ) : (
          <ul className="text-[11px] text-app-text space-y-0.5">
            {future.sandboxIdeas.map((s) => (
              <li key={s.id}>• {s.title}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
});
