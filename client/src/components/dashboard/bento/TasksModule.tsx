import { ListTodo } from 'lucide-react';
import type { CommandCenterFuture, CommandCenterPulse, CommandCenterDeepDiveKind } from '@/types/command-center';
import { BentoCard } from './BentoCard';

interface TasksModuleProps {
  pulse: CommandCenterPulse;
  future: CommandCenterFuture;
  onOpenDeepDive: (kind: CommandCenterDeepDiveKind) => void;
  onQuickAddTask: () => void;
}

type TaskRow =
  | { kind: 'blocker'; id: string; title: string; sub: string | null }
  | { kind: 'milestone'; id: string; title: string; sub: string | null };

function buildRows(pulse: CommandCenterPulse, future: CommandCenterFuture): TaskRow[] {
  const blockers = pulse.blockers.slice(0, 5).map((b) => ({
    kind: 'blocker' as const,
    id: b.id,
    title: b.title,
    sub: b.projectName,
  }));
  if (blockers.length >= 5) return blockers;
  const need = 5 - blockers.length;
  const milestones = future.milestones.slice(0, need).map((m, i) => ({
    kind: 'milestone' as const,
    id: `milestone-${i}-${m.title}`,
    title: m.title,
    sub: m.dueDate,
  }));
  return [...blockers, ...milestones];
}

/**
 * Top priority blockers (and milestone fallback) with drill-down to blocked-work slide-over.
 */
export function TasksModule({ pulse, future, onOpenDeepDive, onQuickAddTask }: TasksModuleProps): JSX.Element {
  const rows = buildRows(pulse, future);

  return (
    <BentoCard
      title="Tasks · priority"
      headerRight={
        <button
          type="button"
          onClick={onQuickAddTask}
          className="text-[9px] text-primary-400 hover:text-primary-300"
          title="Projects"
        >
          + Board
        </button>
      }
    >
      <ul className="space-y-0.5 min-h-0">
        {rows.length === 0 ? (
          <li className="text-[10px] text-app-muted py-1">No blockers or milestones in view.</li>
        ) : (
          rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onOpenDeepDive({ kind: 'pulse_blockers' })}
                className="w-full text-left flex items-start gap-1 rounded-md px-1 py-0.5 hover:bg-white/[0.04] min-w-0"
              >
                <ListTodo className="w-3 h-3 text-amber-400/90 shrink-0 mt-0.5" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[10px] text-app-text truncate" title={r.title}>
                    {r.title}
                  </span>
                  {r.sub ? (
                    <span className="block text-[9px] text-app-muted truncate" title={r.sub}>
                      {r.sub}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
      <button
        type="button"
        onClick={() => onOpenDeepDive({ kind: 'pulse_blockers' })}
        className="mt-1 w-full text-[9px] font-medium text-primary-400 hover:text-primary-300 pt-1 border-t border-white/[0.06]"
      >
        Blocked work →
      </button>
    </BentoCard>
  );
}
