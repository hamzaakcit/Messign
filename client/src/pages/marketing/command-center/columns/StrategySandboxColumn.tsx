import { Sparkles } from 'lucide-react';
import type { CommandCenterStrategyPlay } from '@/lib/marketingApi';
import { DoraPlayCard } from '../DoraPlayCard';

export interface StrategySandboxColumnProps {
  plays: CommandCenterStrategyPlay[];
  onExecuteWithDora: (play: CommandCenterStrategyPlay) => void;
}

/**
 * Column 4: Dora strategy sandbox — AI plays.
 */
export function StrategySandboxColumn({ plays, onExecuteWithDora }: StrategySandboxColumnProps): JSX.Element {
  return (
    <div className="flex flex-col gap-2 min-w-0 w-full min-h-0">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-1 shrink-0">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Dora Sandbox</h2>
        <Sparkles className="h-3.5 w-3.5 text-violet-400/80" aria-hidden />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5 max-h-[min(52vh,480px)]">
        {plays.map((play) => (
          <DoraPlayCard key={play.id} play={play} onExecuteWithDora={onExecuteWithDora} />
        ))}
      </div>
    </div>
  );
}
