import { useMemo } from 'react';
import { Activity, CalendarClock, Gauge, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui';
import { ProgressBar } from '@/components/ui';
import { formatDate } from '@/pages/projects/types';
import type { MarketplaceProject } from '@/lib/projectsApi';
import type { Task } from '@/types';
import { cn } from '@/lib/utils';
import { dispatchProjectsMission } from '@/lib/projectsMissionEvents';

export interface MissionControlVitalsColumnProps {
  /** Active marketplace projects (recruitment active). */
  activeProjects: MarketplaceProject[];
  /** Selected project id for vitals focus, or null for aggregate. */
  focusProjectId: string | null;
  onFocusProject: (projectId: string | null) => void;
  tasks: Task[];
  taskProjectIds: Set<string>;
  className?: string;
}

/**
 * Left rail: progress, derived milestones (due dates), Dora health score, optimization CTA.
 */
export function MissionControlVitalsColumn({
  activeProjects,
  focusProjectId,
  onFocusProject,
  tasks,
  taskProjectIds,
  className,
}: MissionControlVitalsColumnProps): JSX.Element {
  const scopedTasks = useMemo(
    () => tasks.filter((t) => taskProjectIds.has(t.projectId)),
    [tasks, taskProjectIds],
  );

  const focusProject = useMemo(
    () => (focusProjectId ? activeProjects.find((p) => p.id === focusProjectId) ?? null : null),
    [activeProjects, focusProjectId],
  );

  const aggregateProgress = useMemo(() => {
    if (activeProjects.length === 0) return 0;
    const sum = activeProjects.reduce((acc, p) => acc + (p.progress ?? 0), 0);
    return Math.round(sum / activeProjects.length);
  }, [activeProjects]);

  const displayProgress = focusProject ? focusProject.progress ?? 0 : aggregateProgress;

  const health = useMemo(() => {
    const total = scopedTasks.length;
    if (total === 0) return { score: 100, label: 'No tasks' };
    const done = scopedTasks.filter((t) => t.status === 'done').length;
    const overdue = scopedTasks.filter((t) => {
      if (!t.dueDate || t.status === 'done') return false;
      return new Date(t.dueDate) < new Date(new Date().toDateString());
    }).length;
    const reviewStuck = scopedTasks.filter((t) => t.status === 'review').length;
    const wip = scopedTasks.filter((t) => t.status === 'in_progress').length;
    let score = Math.round((done / total) * 60 + 40);
    score -= Math.min(20, overdue * 5);
    score -= Math.min(10, reviewStuck * 2);
    score -= wip > 5 ? 5 : 0;
    score = Math.max(0, Math.min(100, score));
    let label = 'On track';
    if (overdue > 0) label = `${overdue} overdue`;
    else if (reviewStuck > 3) label = 'Review queue';
    else if (done === total && total > 0) label = 'All clear';
    return { score, label };
  }, [scopedTasks]);

  const milestones = useMemo(() => {
    const rows: { label: string; date: string; kind: 'project' | 'task' }[] = [];
    const pool = focusProject ? [focusProject] : activeProjects;
    for (const p of pool) {
      if (p.due_date) {
        rows.push({ label: p.name.slice(0, 28) + (p.name.length > 28 ? '…' : ''), date: p.due_date, kind: 'project' });
      }
    }
    const taskDates = scopedTasks
      .filter((t) => t.dueDate && t.status !== 'done')
      .map((t) => ({ title: t.title, due: t.dueDate! }))
      .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())
      .slice(0, 5);
    for (const td of taskDates) {
      rows.push({
        label: td.title.slice(0, 32) + (td.title.length > 32 ? '…' : ''),
        date: td.due,
        kind: 'task',
      });
    }
    return rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 6);
  }, [activeProjects, focusProject, scopedTasks]);

  return (
    <aside
      className={cn(
        'flex flex-col min-h-0 min-w-0 border-r border-app-border bg-app-surface-tertiary/40 backdrop-blur-[2px]',
        className,
      )}
      aria-label="Project vitals"
    >
      <div className="shrink-0 px-3 py-2 border-b border-app-border">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">Vitals</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4 text-[13px]">
        {activeProjects.length > 1 && (
          <div>
            <label className="text-[10px] text-app-muted block mb-1">Focus</label>
            <select
              value={focusProjectId ?? ''}
              onChange={(e) => onFocusProject(e.target.value === '' ? null : e.target.value)}
              className="w-full h-8 rounded-md bg-app-surface-tertiary border border-app-border px-2 text-[12px] text-app"
            >
              <option value="">All projects</option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] text-app-muted uppercase tracking-wide">Progress</span>
            <span className="text-[11px] text-app-muted tabular-nums">{displayProgress}%</span>
          </div>
          <ProgressBar value={displayProgress} size="sm" />
        </div>

        <div className="rounded-lg border border-app-border bg-app-sidebar/80 p-2.5">
          <div className="flex items-center gap-2 mb-1">
            <Gauge className="w-3.5 h-3.5 text-primary-400 shrink-0" aria-hidden />
            <span className="text-[10px] font-medium text-app-muted uppercase tracking-wide">Dora health</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-app">{health.score}</span>
            <span className="text-[11px] text-app-muted">/ 100</span>
          </div>
          <p className="text-[11px] text-app-muted mt-0.5">{health.label}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full mt-2 h-7 text-[11px] gap-1.5 border border-app-border"
            onClick={() => dispatchProjectsMission({ action: 'open-optimize' })}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Suggest optimization
          </Button>
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <CalendarClock className="w-3.5 h-3.5 text-app-muted" aria-hidden />
            <span className="text-[10px] font-medium text-app-muted uppercase tracking-wide">Upcoming</span>
          </div>
          {milestones.length === 0 ? (
            <p className="text-[11px] text-app-muted flex items-center gap-1">
              <Activity className="w-3 h-3 shrink-0" /> No dates yet
            </p>
          ) : (
            <ul className="space-y-1.5">
              {milestones.map((m, i) => (
                <li
                  key={`${m.kind}-${m.date}-${i}`}
                  className="flex justify-between gap-2 text-[11px] border-b border-app-border/50 pb-1 last:border-0"
                >
                  <span className="text-app truncate min-w-0" title={m.label}>
                    {m.label}
                  </span>
                  <span className="text-app-muted shrink-0 tabular-nums">{formatDate(m.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
