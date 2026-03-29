import { Sparkles, MessageSquare } from 'lucide-react';
import type { CommandCenterBrain, CommandCenterDeepDiveKind } from '@/types/command-center';
import { BentoCard } from './BentoCard';

interface DoraCommandModuleProps {
  brain: CommandCenterBrain;
  onOpenDora: () => void;
  onOpenDeepDive: (kind: CommandCenterDeepDiveKind) => void;
}

/**
 * Compact Dora / daily focus strip with quick actions (no embedded chat state).
 */
export function DoraCommandModule({ brain, onOpenDora, onOpenDeepDive }: DoraCommandModuleProps): JSX.Element {
  return (
    <BentoCard
      title="Command · Dora"
      headerRight={
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={onOpenDora}
            className="inline-flex items-center gap-0.5 rounded-md border border-white/10 px-1.5 py-0.5 text-[9px] text-primary-400 hover:bg-white/5"
            title="Open Dora briefing"
          >
            <Sparkles className="w-3 h-3" aria-hidden />
            Briefing
          </button>
          <button
            type="button"
            onClick={() => onOpenDeepDive({ kind: 'brain_knowledge' })}
            className="inline-flex items-center gap-0.5 rounded-md border border-white/10 px-1.5 py-0.5 text-[9px] text-app-muted hover:text-app-text hover:bg-white/5"
            title="Knowledge deep dive"
          >
            <MessageSquare className="w-3 h-3" aria-hidden />
            Hub
          </button>
        </div>
      }
    >
      <p className="text-[10px] uppercase tracking-wide text-app-muted mb-0.5">Today&apos;s focus</p>
      <p className="text-[11px] text-app-text leading-snug line-clamp-3 min-h-[2.75rem]">
        {brain.todayFocus ?? 'Open Dora for your daily briefing and priorities.'}
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-2 pt-1.5 border-t border-white/[0.06]">
        <span className="text-[10px] text-app-muted tabular-nums">Unread {brain.doraUnreadCount}</span>
        <button
          type="button"
          onClick={onOpenDora}
          className="text-[10px] font-medium text-primary-400 hover:text-primary-300 truncate"
        >
          Open Dora →
        </button>
      </div>
    </BentoCard>
  );
}
