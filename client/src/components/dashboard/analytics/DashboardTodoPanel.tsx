import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, ListChecks } from 'lucide-react';
import type { CommandCenterDTO } from '@/types/command-center';
import { buildDashboardTodos, type DashboardTodoItem } from './buildDashboardTodos';
import { BentoCard } from '@/components/dashboard/bento/BentoCard';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'messign.dashboard.todos.checked.v1';

function readChecked(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function writeChecked(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore quota */
  }
}

const MODULE_BADGE: Record<DashboardTodoItem['module'], string> = {
  delivery: 'bg-amber-500/15 text-amber-200/95',
  okr: 'bg-violet-500/15 text-violet-200/95',
  crm: 'bg-sky-500/15 text-sky-200/95',
  hr: 'bg-emerald-500/15 text-emerald-200/95',
  support: 'bg-rose-500/15 text-rose-200/95',
  marketing: 'bg-fuchsia-500/15 text-fuchsia-200/95',
  assets: 'bg-slate-500/20 text-slate-200/90',
  contracts: 'bg-orange-500/15 text-orange-200/95',
  chat: 'bg-cyan-500/15 text-cyan-200/95',
  knowledge: 'bg-indigo-500/15 text-indigo-200/95',
  dora: 'bg-primary-500/20 text-primary-200/95',
  culture: 'bg-pink-500/15 text-pink-200/95',
  general: 'bg-white/10 text-app-muted',
};

interface DashboardTodoPanelProps {
  dto: CommandCenterDTO;
}

/**
 * Scrollable checklist (20+ items) sourced from Command Center data plus habits.
 * Checked state persists per browser via `localStorage`.
 */
export function DashboardTodoPanel({ dto }: DashboardTodoPanelProps): JSX.Element {
  const items = useMemo(() => buildDashboardTodos(dto), [dto]);
  const [checked, setChecked] = useState<Set<string>>(() => readChecked());

  useEffect(() => {
    setChecked(readChecked());
  }, [dto.generatedAt]);

  const toggle = useCallback((id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeChecked(next);
      return next;
    });
  }, []);

  const doneCount = useMemo(() => items.filter((i) => checked.has(i.id)).length, [items, checked]);

  return (
    <BentoCard
      className="h-full min-h-[280px] lg:min-h-0"
      title="Action queue"
      headerRight={
        <span className="text-[9px] text-app-muted tabular-nums" title="Items completed this session">
          {doneCount}/{items.length}
        </span>
      }
    >
      <p className="text-[9px] text-app-muted mb-1.5 flex items-center gap-1">
        <ListChecks className="w-3 h-3 shrink-0 opacity-80" aria-hidden />
        Integrated with CRM, HR, support, marketing, assets, contracts, OKRs, and chat snapshots.
      </p>
      <ul
        className="space-y-0.5 overflow-y-auto flex-1 min-h-0 pr-0.5 -mr-0.5 max-h-[min(52vh,420px)] lg:max-h-none"
        aria-label="Dashboard action items"
      >
        {items.map((item) => {
          const isDone = checked.has(item.id);
          const row = (
            <div className="flex items-start gap-1.5 min-w-0 w-full">
              <button
                type="button"
                onClick={() => toggle(item.id)}
                className="shrink-0 mt-0.5 text-app-muted hover:text-app-text"
                aria-pressed={isDone}
                aria-label={isDone ? 'Mark not done' : 'Mark done'}
              >
                {isDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/90" aria-hidden />
                ) : (
                  <Circle className="w-3.5 h-3.5" aria-hidden />
                )}
              </button>
              <span className={cn('min-w-0 flex-1 text-[10px] leading-snug', isDone && 'line-through opacity-55')}>
                <span
                  className={cn(
                    'inline-block align-middle rounded px-1 py-0 mr-1 text-[8px] font-semibold uppercase tracking-wide',
                    MODULE_BADGE[item.module],
                  )}
                >
                  {item.module}
                </span>
                {item.href ? (
                  <Link
                    to={item.href}
                    className="text-app-text hover:text-primary-300 underline-offset-2 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {item.label}
                  </Link>
                ) : (
                  item.label
                )}
              </span>
            </div>
          );

          return (
            <li
              key={item.id}
              className={cn(
                'rounded-md px-1 py-0.5 border border-transparent',
                item.priority === 'high' && !isDone && 'border-amber-500/25 bg-amber-500/[0.06]',
              )}
            >
              {row}
            </li>
          );
        })}
      </ul>
    </BentoCard>
  );
}
