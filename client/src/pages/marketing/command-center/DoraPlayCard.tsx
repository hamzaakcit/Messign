import type { CommandCenterStrategyPlay } from '@/lib/marketingApi';

export interface DoraPlayCardProps {
  play: CommandCenterStrategyPlay;
  onExecuteWithDora: (play: CommandCenterStrategyPlay) => void;
}

/**
 * AI strategy block with Execute with Lucy CTA.
 */
export function DoraPlayCard({ play, onExecuteWithDora }: DoraPlayCardProps): JSX.Element {
  const pri =
    play.priority === 'high'
      ? 'text-rose-400/90'
      : play.priority === 'medium'
        ? 'text-amber-400/90'
        : 'text-slate-500';

  return (
    <div className="rounded-lg border border-violet-500/20 bg-violet-950/20 px-2 py-1.5 space-y-1">
      <div className="flex items-center justify-between gap-1">
        <span className={`text-[9px] uppercase tracking-wide ${pri}`}>{play.priority}</span>
      </div>
      <p className="text-xs font-medium text-app-text leading-tight">{play.title}</p>
      <p className="text-[10px] text-app-muted leading-snug line-clamp-3">{play.snippet}</p>
      <button
        type="button"
        onClick={() => onExecuteWithDora(play)}
        className="w-full mt-0.5 rounded-md bg-violet-600/80 hover:bg-violet-500 text-[10px] font-medium text-white py-1 px-2 transition-colors"
      >
        Execute with Lucy
      </button>
    </div>
  );
}
