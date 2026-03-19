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
    avg_tasks_completed?: number;
    avg_activity_count?: number;
    avg_xp?: number;
  };
  period?: string;
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
      <div className={`text-lg font-bold ${alert ? 'text-red-400' : 'text-white'}`}>{value}</div>
      <div className="text-[10px] text-white/40 uppercase tracking-wider">{label}</div>
      <div className="text-[10px] text-white/30">{sub}</div>
    </div>
  );
}

export default function PerformanceOverviewWidget({ data }: { data: PerformanceData }) {
  const employees = data?.employees ?? [];
  const teamAvg = data?.teamAverage;

  if (!employees.length) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/50">
        No performance data available.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {employees.map((emp, i) => {
        const tasksCompleted = emp.tasks_completed ?? 0;
        const tasksAssigned = emp.tasks_assigned_period ?? 0;
        const completionRate =
          tasksAssigned > 0 ? Math.round((tasksCompleted / tasksAssigned) * 100) : 0;

        return (
          <div
            key={i}
            className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-white">{emp.full_name}</h4>
              <span className="text-xs px-2 py-1 rounded-full bg-primary-500/20 text-primary-300">
                {(emp.xp ?? 0).toLocaleString()} XP
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
                value={emp.tasks_active ?? 0}
                sub={`${emp.tasks_overdue ?? 0} overdue`}
                alert={(emp.tasks_overdue ?? 0) > 0}
              />
              <MetricCard
                label="Badges"
                value={emp.badges_earned_period ?? 0}
                sub={`${emp.total_badges ?? 0} total`}
              />
              <MetricCard
                label="Activities"
                value={emp.activity_count ?? 0}
                sub={`${emp.docs_authored ?? 0} docs`}
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
              <p className="text-xs text-white/40">
                Team avg: {teamAvg.avg_tasks_completed?.toFixed(1)} tasks completed,{' '}
                {teamAvg.avg_xp?.toLocaleString()} XP
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
