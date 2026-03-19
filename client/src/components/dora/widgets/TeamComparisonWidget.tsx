import { Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { DoraWidgetShell } from './DoraWidgetShell';

export interface TeamMetricRow {
  id?: string;
  name?: string;
  memberCount?: number;
  completionRate?: number;
  activityCount?: number;
  taskStats?: Record<string, unknown> | null;
}

function num(v: unknown, fallback = 0): number {
  if (v == null) return fallback;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeTeams(data: unknown): TeamMetricRow[] {
  if (!Array.isArray(data)) return [];
  return data as TeamMetricRow[];
}

const BAR_COLORS = ['#38bdf8', '#8b5cf6', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4'];

export default function TeamComparisonWidget({
  data,
  title = 'Team comparison',
  delay = 0,
}: {
  data: unknown;
  title?: string;
  delay?: number;
}) {
  const teams = normalizeTeams(data);

  if (teams.length === 0) {
    return (
      <DoraWidgetShell
        title={title}
        icon={<Users size={14} className="text-sky-400" />}
        subtitle="No teams matched this query"
        delay={delay}
      >
        <p className="text-sm text-white/45 mb-3">
          Try asking with a specific team name, or ensure performance teams are set up for your organization.
        </p>
      </DoraWidgetShell>
    );
  }

  const chartData = teams.map((t) => ({
    name: (t.name ?? 'Team').slice(0, 18),
    fullName: t.name ?? 'Team',
    completion: num(t.completionRate),
    members: num(t.memberCount),
    activities: num(t.activityCount),
  }));

  return (
    <DoraWidgetShell
      title={title}
      icon={<Users size={14} className="text-sky-400" />}
      subtitle={`${teams.length} team${teams.length === 1 ? '' : 's'} · completion rate vs members`}
      delay={delay}
    >
      <div className="h-[200px] w-full mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#334155' }} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} domain={[0, 100]} />
            <Tooltip
              contentStyle={{
                background: 'rgba(15,23,42,0.95)',
                border: '1px solid rgba(148,163,184,0.2)',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="completion" name="completion" radius={[4, 4, 0, 0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/10 text-white/45 uppercase tracking-wide">
              <th className="py-2 px-2">Team</th>
              <th className="py-2 px-2">Members</th>
              <th className="py-2 px-2">Done / Total</th>
              <th className="py-2 px-2">Completion</th>
              <th className="py-2 px-2">Activities</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t, i) => {
              const ts = t.taskStats as Record<string, unknown> | null | undefined;
              const done = num(ts?.completed);
              const total = num(ts?.total);
              return (
                <tr key={t.id ?? i} className="border-b border-white/5 text-white/80">
                  <td className="py-2 px-2 font-medium text-white">{t.name}</td>
                  <td className="py-2 px-2">{num(t.memberCount)}</td>
                  <td className="py-2 px-2">
                    {done}/{total}
                  </td>
                  <td className="py-2 px-2">{num(t.completionRate)}%</td>
                  <td className="py-2 px-2">{num(t.activityCount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </DoraWidgetShell>
  );
}
