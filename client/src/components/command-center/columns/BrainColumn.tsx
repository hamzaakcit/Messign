import { memo } from 'react';
import { Brain, BookOpen } from 'lucide-react';
import type { CommandCenterBrain } from '@/types/command-center';
import type { CommandCenterDeepDiveKind } from '@/types/command-center';
import { CommandCenterColumnHeader } from '../CommandCenterColumnHeader';
import { CompactKpiCard } from '../cards/CompactKpiCard';
import { MiniSparkline } from '../charts/MiniSparkline';

interface BrainColumnProps {
  brain: CommandCenterBrain | null;
  insight: string;
  onOpenDeepDive: (kind: CommandCenterDeepDiveKind) => void;
  onOpenDora: () => void;
}

export const BrainColumn = memo(function BrainColumn({
  brain,
  insight,
  onOpenDeepDive,
  onOpenDora,
}: BrainColumnProps): JSX.Element {
  if (!brain) {
    return (
      <div className="flex flex-col gap-2 min-w-[280px] max-w-[320px] shrink-0">
        <CommandCenterColumnHeader title="The Brain" insight={insight} />
        <p className="text-xs text-app-muted">Loading Dora & Knowledge…</p>
      </div>
    );
  }

  const trend = brain.knowledgeRecent.slice(0, 7).map((_, i, arr) => arr.length - i);

  return (
    <div className="flex flex-col gap-2 min-w-[280px] max-w-[320px] shrink-0">
      <CommandCenterColumnHeader title="The Brain" insight={insight} icon={<Brain className="w-3.5 h-3.5 text-violet-400" />} />

      <div className="rounded-lg border border-white/[0.06] bg-[#12141a]/90 p-2.5">
        <p className="text-[10px] uppercase tracking-wide text-app-muted mb-1">Today&apos;s focus</p>
        <p className="text-xs text-app-text leading-snug line-clamp-4">
          {brain.todayFocus ?? 'Open Dora for your daily briefing and priorities.'}
        </p>
        <button
          type="button"
          onClick={onOpenDora}
          className="mt-2 text-[10px] font-semibold text-primary-400 hover:text-primary-300"
        >
          Open Dora briefing →
        </button>
      </div>

      <CompactKpiCard
        label="Dora insights"
        value={String(brain.doraUnreadCount)}
        sub="Unread"
        onClick={onOpenDora}
        chart={<MiniSparkline data={trend.length ? trend : [1]} color="#a78bfa" />}
      />

      <CompactKpiCard
        label="Knowledge Hub"
        value={String(brain.publishedDocCount)}
        sub="Published articles"
        onClick={() => onOpenDeepDive({ kind: 'brain_knowledge' })}
        chart={<MiniSparkline data={brain.knowledgeRecent.length ? [brain.knowledgeRecent.length, 1] : [0]} color="#34d399" />}
      />

      <div className="rounded-lg border border-white/[0.06] bg-[#12141a]/90 p-2">
        <div className="flex items-center gap-1 text-[10px] font-semibold text-app-muted mb-1">
          <BookOpen className="w-3 h-3" />
          Trending
        </div>
        <ul className="space-y-1">
          {brain.knowledgeRecent.slice(0, 4).map((d) => (
            <li key={d.id} className="text-[11px] text-app-text truncate" title={d.title}>
              • {d.title}
            </li>
          ))}
          {brain.knowledgeRecent.length === 0 && (
            <li className="text-[11px] text-app-muted">No recent docs</li>
          )}
        </ul>
        <button
          type="button"
          onClick={() => onOpenDeepDive({ kind: 'brain_knowledge' })}
          className="mt-2 w-full text-[10px] font-medium text-primary-400 hover:text-primary-300"
        >
          View all
        </button>
      </div>
    </div>
  );
});
