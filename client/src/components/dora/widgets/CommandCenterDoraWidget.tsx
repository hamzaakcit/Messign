import { Activity, BookOpen, Layers, Target, TrendingUp } from 'lucide-react';
import type { CommandCenterDTO } from '@/types/command-center';
import { cn } from '@/lib/utils';

function isCommandCenterDto(data: unknown): data is CommandCenterDTO {
  if (!data || typeof data !== 'object') return false;
  const o = data as Record<string, unknown>;
  return (
    typeof o.generatedAt === 'string' &&
    o.pulse != null &&
    typeof o.pulse === 'object' &&
    o.brain != null &&
    typeof o.brain === 'object' &&
    o.growth != null &&
    typeof o.growth === 'object' &&
    o.future != null &&
    typeof o.future === 'object' &&
    o.workspace != null &&
    typeof o.workspace === 'object'
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }): JSX.Element {
  return (
    <div className="rounded-lg bg-app-bg/40 px-2 py-1.5 min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-app-muted truncate">{label}</div>
      <div className="text-sm font-semibold text-app-text tabular-nums">{value}</div>
      {sub ? <div className="text-[10px] text-app-muted mt-0.5">{sub}</div> : null}
    </div>
  );
}

const WS_KEYS = ['crm', 'hr', 'support', 'marketing', 'assets', 'contracts', 'okr', 'chat'] as const;

/**
 * Rich Command Center snapshot for Dora — mirrors home dashboard columns with minimal prose.
 */
export function CommandCenterDoraWidget({ data }: { data: unknown }): JSX.Element {
  if (!isCommandCenterDto(data)) {
    return (
      <p className="text-xs text-app-muted italic mt-2">Dashboard data could not be displayed.</p>
    );
  }

  const { generatedAt, pulse, brain, growth, future, workspace } = data;
  const vel =
    pulse.velocityDeltaPct === null ? '—' : `${pulse.velocityDeltaPct > 0 ? '+' : ''}${pulse.velocityDeltaPct}%`;

  return (
    <div
      className="dora-glass mt-3 overflow-hidden border border-app-border/80"
      style={{ borderRadius: 'var(--dora-r-widget, 16px)' }}
    >
      <div className="px-3 py-2 border-b border-app-border/60 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-app-text">Command Center</div>
        <div className="text-[10px] text-app-muted tabular-nums">
          {generatedAt.length >= 10 ? generatedAt.slice(0, 10) : generatedAt}
        </div>
      </div>

      <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <section className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-2.5 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-300">
            <Activity className="w-3.5 h-3.5" />
            The Pulse
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Kpi label="Active projects" value={pulse.activeProjects} />
            <Kpi label="Tasks this week" value={pulse.tasksCompletedThisWeek} />
            <Kpi label="Blocked" value={pulse.blockedTasks} />
            <Kpi label="Velocity Δ" value={vel} sub="vs last week" />
          </div>
          {pulse.blockers.length > 0 ? (
            <ul className="text-[11px] text-app-muted space-y-0.5 max-h-24 overflow-y-auto">
              {pulse.blockers.slice(0, 6).map((b) => (
                <li key={b.id} className="truncate" title={b.title}>
                  · {b.title}
                  {b.projectName ? ` — ${b.projectName}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[10px] text-app-muted">No blockers listed.</p>
          )}
        </section>

        <section className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-2.5 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-300">
            <BookOpen className="w-3.5 h-3.5" />
            The Brain
          </div>
          <p className="text-[11px] text-app-text leading-snug">
            <span className="text-app-muted">Today: </span>
            {brain.todayFocus ?? 'Not set'}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <Kpi label="Dora unread" value={brain.doraUnreadCount} />
            <Kpi label="Published docs" value={brain.publishedDocCount} />
          </div>
          {brain.knowledgeRecent.length > 0 ? (
            <ul className="text-[10px] text-app-muted space-y-0.5 max-h-20 overflow-y-auto">
              {brain.knowledgeRecent.slice(0, 4).map((d) => (
                <li key={d.id} className="truncate">
                  · {d.title}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
            <TrendingUp className="w-3.5 h-3.5" />
            The Growth
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Kpi label="Your XP" value={growth.myXp} />
            <Kpi label="Rank" value={growth.myRank != null ? `#${growth.myRank}` : '—'} />
            <Kpi label="Culture" value={growth.cultureHealth != null ? growth.cultureHealth : '—'} />
            <Kpi label="Vibe" value={growth.vibeScore != null ? growth.vibeScore : '—'} />
          </div>
          {growth.leaderboard.length > 0 ? (
            <div className="text-[10px] text-app-muted space-y-0.5">
              <div className="text-app-text/80 font-medium mb-0.5">Leaderboard</div>
              {growth.leaderboard.slice(0, 5).map((e) => (
                <div key={`${e.rank}-${e.userId}`} className="flex justify-between gap-2 tabular-nums">
                  <span>
                    {e.rank}. {e.name}
                  </span>
                  <span>{e.xp} XP</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
            <Target className="w-3.5 h-3.5" />
            The Future
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Kpi label="OKR progress" value={`${future.okrs.overallProgress}%`} />
            <Kpi label="On track / at risk / behind" value={`${future.okrs.onTrack} / ${future.okrs.atRisk} / ${future.okrs.behind}`} />
          </div>
          {future.milestones.length > 0 ? (
            <ul className="text-[10px] text-app-muted space-y-0.5 max-h-20 overflow-y-auto">
              {future.milestones.slice(0, 5).map((m, i) => (
                <li key={`${m.title}-${i}`} className="truncate">
                  · {m.title}
                  {m.dueDate ? ` — ${m.dueDate}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[10px] text-app-muted">No upcoming milestones.</p>
          )}
        </section>
      </div>

      <div className="px-3 pb-3">
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-app-muted mb-1.5">
          <Layers className="w-3 h-3" />
          Workspace modules
        </div>
        <div className="flex flex-wrap gap-1">
          {WS_KEYS.map((k) => {
            const cell = workspace[k];
            const ok = cell && typeof cell === 'object' && 'ok' in cell && cell.ok === true;
            return (
              <span
                key={k}
                className={cn(
                  'px-2 py-0.5 rounded-md text-[10px] font-mono uppercase border',
                  ok ? 'border-emerald-500/30 text-emerald-400/90' : 'border-rose-500/25 text-rose-400/80',
                )}
              >
                {k}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
