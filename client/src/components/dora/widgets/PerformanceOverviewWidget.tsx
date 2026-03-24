import { TrendingUp } from 'lucide-react';
import { DoraWidgetShell } from './DoraWidgetShell';

interface PerformanceEmployee {
  full_name: string;
  tasks_completed?: number;
  tasks_assigned_period?: number;
  tasks_active?: number;
  tasks_overdue?: number;
  xp?: number;
  badges_earned_period?: number;
  total_badges?: number;
  activity_count?: number;
  docs_authored?: number;
}

interface PerformanceData {
  employees?: PerformanceEmployee[];
  teamAverage?: {
    avg_tasks_completed?: number | string;
    avg_activity_count?: number | string;
    avg_xp?: number | string;
  };
  period?: string;
}

/** Postgres ROUND / numeric often arrives as string — safe for .toFixed / math */
function num(v: unknown, fallback = 0): number {
  if (v == null) return fallback;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function MetricCard({
  label,
  value,
  sub,
  alert,
}: {
  label: string;
  value: string | number;
  sub: string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-md bg-white/5 p-2 text-center">
      <div className={`text-lg font-bold ${alert ? 'text-red-400' : 'text-app-text'}`}>{value}</div>
      <div className="text-[10px] text-app-text/40 uppercase tracking-wider">{label}</div>
      <div className="text-[10px] text-app-text/30">{sub}</div>
    </div>
  );
}

export default function PerformanceOverviewWidget({ data }: { data: PerformanceData }) {
  const employees = data?.employees ?? [];
  const teamAvg = data?.teamAverage;

  if (!employees.length) {
    return (
      <DoraWidgetShell
        title="Performance overview"
        icon={<TrendingUp size={14} className="text-amber-400" />}
        subtitle="No rows returned for this query"
      >
        <p className="text-sm text-app-text/50 mb-2">No performance data available for this view.</p>
        <p className="text-xs text-app-text/35">
          If you expected metrics, check the person exists and has tasks or activity in the chosen period.
        </p>
      </DoraWidgetShell>
    );
  }

  const avgTasks = num(teamAvg?.avg_tasks_completed);
  const avgXp = num(teamAvg?.avg_xp);

  return (
    <DoraWidgetShell
      title="Performance overview"
      icon={<TrendingUp size={14} className="text-amber-400" />}
      subtitle={data.period ? `Period: ${String(data.period).replace(/_/g, ' ')}` : undefined}
    >
    <div className="space-y-3">
      {employees.map((emp, i) => {
        const tasksCompleted = num(emp.tasks_completed);
        const tasksAssigned = num(emp.tasks_assigned_period);
        const completionRate =
          tasksAssigned > 0 ? Math.round((tasksCompleted / tasksAssigned) * 100) : 0;
        const xpVal = num(emp.xp);

        return (
          <div
            key={i}
            className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-app-text">{emp.full_name}</h4>
              <span className="text-xs px-2 py-1 rounded-full bg-primary-500/20 text-primary-300">
                {xpVal.toLocaleString()} XP
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard
                label="Completion"
                value={`${completionRate}%`}
                sub={`${tasksCompleted}/${tasksAssigned} tasks`}
              />
              <MetricCard
                label="Active"
                value={num(emp.tasks_active)}
                sub={`${num(emp.tasks_overdue)} overdue`}
                alert={num(emp.tasks_overdue) > 0}
              />
              <MetricCard
                label="Badges"
                value={num(emp.badges_earned_period)}
                sub={`${num(emp.total_badges)} total`}
              />
              <MetricCard
                label="Activities"
                value={num(emp.activity_count)}
                sub={`${num(emp.docs_authored)} docs`}
              />
            </div>

            <div className="w-full bg-white/10 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${Math.min(completionRate, 100)}%`,
                  backgroundColor:
                    completionRate >= 80 ? '#22c55e' : completionRate >= 50 ? '#eab308' : '#ef4444',
                }}
              />
            </div>

            {teamAvg && (
              <p className="text-xs text-app-text/40">
                Team avg: {avgTasks.toFixed(1)} tasks completed, {avgXp.toLocaleString()} XP
              </p>
            )}
          </div>
        );
      })}
    </div>
    </DoraWidgetShell>
  );
}
