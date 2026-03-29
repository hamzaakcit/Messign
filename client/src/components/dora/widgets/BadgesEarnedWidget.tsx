import { useMemo } from 'react';
import { Award, Sparkles } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DoraWidgetShell } from './DoraWidgetShell';

interface BadgeRow {
  name?: string;
  description?: string;
  icon?: string;
  earned_at?: string;
}

interface BadgeAggregatesShape {
  count: number;
  byMonth: Record<string, number>;
}

interface BadgesEarnedData {
  badges?: BadgeRow[];
  points?: number;
  aggregates?: BadgeAggregatesShape | null;
}

function parseData(data: unknown): BadgesEarnedData {
  if (!data || typeof data !== 'object') return {};
  const o = data as Record<string, unknown>;
  return {
    badges: Array.isArray(o.badges) ? (o.badges as BadgeRow[]) : [],
    points: typeof o.points === 'number' ? o.points : Number(o.points ?? 0),
    aggregates: (o.aggregates as BadgeAggregatesShape) ?? null,
  };
}

export default function BadgesEarnedWidget({ data }: { data: unknown }): JSX.Element {
  const parsed = parseData(data);
  const badges = parsed.badges ?? [];
  const points = parsed.points;
  const aggregates = parsed.aggregates;
  const count = aggregates?.count ?? badges.length;

  const monthChart = useMemo(() => {
    const src = aggregates?.byMonth ?? {};
    const keys = Object.keys(src).sort();
    return keys.map((k) => ({ month: k, count: src[k] ?? 0 }));
  }, [aggregates]);

  if (badges.length === 0) {
    return (
      <DoraWidgetShell
        title="Your badges"
        icon={<Award size={14} className="text-amber-400" />}
        subtitle="No badges yet"
        accentGradient="linear-gradient(90deg, #eab308, #a855f7)"
      >
        <p className="text-sm text-app-text/50">You have not earned any badges yet.</p>
        <p className="text-xs text-app-text/35 mt-1">Complete tasks and milestones to unlock achievements.</p>
      </DoraWidgetShell>
    );
  }

  return (
    <DoraWidgetShell
      title="Your badges"
      icon={<Award size={14} className="text-amber-400" />}
      subtitle={`${count} badges · ${Number(points ?? 0).toLocaleString()} XP`}
      accentGradient="linear-gradient(90deg, #eab308, #a855f7)"
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-app-border/70 bg-app-bg/30 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-app-muted">Badges earned</div>
            <div className="text-lg font-bold text-app-text tabular-nums flex items-center gap-1">
              <Award size={16} className="text-amber-400" />
              {count}
            </div>
          </div>
          <div className="rounded-xl border border-app-border/70 bg-app-bg/30 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-app-muted">XP</div>
            <div className="text-lg font-bold text-app-text tabular-nums flex items-center gap-1">
              <Sparkles size={16} className="text-violet-400" />
              {Number(points ?? 0).toLocaleString()}
            </div>
          </div>
        </div>

        {monthChart.length > 0 && (
          <div className="rounded-xl border border-app-border/60 p-2" style={{ minHeight: 140 }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted mb-1 px-1">
              Earned by month
            </p>
            <div style={{ height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                  <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(15,23,42,0.95)',
                      border: '1px solid rgba(148,163,184,0.15)',
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                  />
                  <Bar dataKey="count" fill="#a855f7" radius={[4, 4, 0, 0]} name="Badges" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {badges.map((b, i) => (
            <div
              key={`${b.name ?? 'b'}-${i}`}
              className="rounded-lg border border-app-border/50 bg-app-surface-tertiary/60 px-3 py-2 flex gap-2 items-start"
            >
              <span className="text-lg shrink-0" aria-hidden>
                {b.icon || '🏅'}
              </span>
              <div className="min-w-0">
                <div className="font-medium text-app-text text-sm">{b.name ?? 'Badge'}</div>
                {b.description ? (
                  <p className="text-xs text-app-muted line-clamp-2 mt-0.5">{b.description}</p>
                ) : null}
                {b.earned_at ? (
                  <p className="text-[10px] text-app-muted/70 mt-1">
                    {new Date(b.earned_at).toLocaleDateString()}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </DoraWidgetShell>
  );
}
