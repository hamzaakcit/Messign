import { FlaskConical } from 'lucide-react';
import type { CommandCenterExperimentRow } from '@/lib/marketingApi';

export interface ExperimentsColumnProps {
  experiments: CommandCenterExperimentRow[];
  onOpenCampaign: (id: string) => void;
  onOpenEmail: (id: string) => void;
}

/**
 * Column 3: Campaign & content lab — experiments list with live / rates.
 */
export function ExperimentsColumn({ experiments, onOpenCampaign, onOpenEmail }: ExperimentsColumnProps): JSX.Element {
  return (
    <div className="flex flex-col gap-2 min-w-[260px] min-h-0">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-1 shrink-0">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Campaigns & Lab</h2>
        <FlaskConical className="h-3.5 w-3.5 text-amber-400/80" aria-hidden />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-0.5 max-h-[min(52vh,420px)]">
        {experiments.length === 0 && (
          <p className="text-[10px] text-app-muted py-2">No recent experiments in this window.</p>
        )}
        {experiments.map((ex) => (
          <button
            key={`${ex.kind}-${ex.id}`}
            type="button"
            onClick={() => (ex.kind === 'email' ? onOpenEmail(ex.id) : onOpenCampaign(ex.id))}
            className="w-full text-left rounded-lg border border-white/[0.06] bg-app-surface-tertiary/40 hover:bg-app-surface-tertiary px-2 py-1 transition-colors"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-medium text-app-text truncate">{ex.name}</span>
              {ex.isLive && (
                <span className="flex items-center gap-0.5 shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-2 text-[9px] text-app-muted mt-0.5">
              <span className="capitalize">{ex.kind}</span>
              <span>·</span>
              <span className="capitalize">{ex.status}</span>
              {ex.openRate != null && (
                <>
                  <span>·</span>
                  <span>Open {(ex.openRate * 100).toFixed(1)}%</span>
                </>
              )}
              {ex.clickRate != null && (
                <>
                  <span>·</span>
                  <span>CTR {(ex.clickRate * 100).toFixed(2)}%</span>
                </>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
