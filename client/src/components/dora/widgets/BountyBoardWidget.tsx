import { useMemo } from 'react';
import { Coins, Target } from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DoraWidgetShell } from './DoraWidgetShell';

export interface BountyRow {
  id?: string;
  title?: string;
  description?: string;
  status?: string;
  urgency?: string;
  xp_reward?: number;
  expires_at?: string | null;
  creator_name?: string | null;
  claimer_name?: string | null;
}

interface BountyAggregatesShape {
  byStatus: Record<string, number>;
  byUrgency: Record<string, number>;
  totalXp: number;
  avgXp: number;
  count: number;
}

interface BountyBoardData {
  bounties?: BountyRow[];
  filter?: string;
  stats?: { count?: number; totalXp?: number; avgXp?: number };
  aggregates?: BountyAggregatesShape | null;
}

const URGENCY_COLORS: Record<string, string> = {
  HIGH: '#ef4444',
  NORMAL: '#38bdf8',
  LOW: '#22c55e',
};

function parseData(data: unknown): BountyBoardData {
  if (!data || typeof data !== 'object') return {};
  const o = data as Record<string, unknown>;
  if (Array.isArray(o.bounties)) {
    return {
      bounties: o.bounties as BountyRow[],
      filter: typeof o.filter === 'string' ? o.filter : undefined,
      stats: o.stats as BountyBoardData['stats'],
      aggregates: (o.aggregates as BountyAggregatesShape) ?? null,
    };
  }
  if (Array.isArray(data)) {
    return { bounties: data as BountyRow[] };
  }
  return {};
}

export default function BountyBoardWidget({ data }: { data: unknown }): JSX.Element {
  const { bounties: rawBounties, filter, stats, aggregates } = parseData(data);
  const bounties = rawBounties ?? [];

  const urgencyPie = useMemo(() => {
    const src = aggregates?.byUrgency && Object.keys(aggregates.byUrgency).length > 0
      ? aggregates.byUrgency
      : bounties.reduce<Record<string, number>>((acc, b) => {
          const u = (b.urgency ?? 'NORMAL').toString();
          acc[u] = (acc[u] ?? 0) + 1;
          return acc;
        }, {});
    return Object.entries(src)
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0);
  }, [aggregates, bounties]);

  const topByXp = useMemo(() => {
    return [...bounties]
      .sort((a, b) => (Number(b.xp_reward) || 0) - (Number(a.xp_reward) || 0))
      .slice(0, 6)
      .map((b) => ({
        name: (b.title ?? '—').length > 28 ? `${(b.title ?? '').slice(0, 25)}…` : (b.title ?? '—'),
        xp: Number(b.xp_reward) || 0,
      }));
  }, [bounties]);

  const count = stats?.count ?? aggregates?.count ?? bounties.length;
  const totalXp = stats?.totalXp ?? aggregates?.totalXp ?? 0;
  const avgXp = stats?.avgXp ?? aggregates?.avgXp ?? 0;

  if (bounties.length === 0) {
    return (
      <DoraWidgetShell
        title="Bounty board"
        icon={<Target size={14} className="text-rose-400" />}
        subtitle={filter ? `Filter: ${filter}` : undefined}
        accentGradient="linear-gradient(90deg, #f43f5e, #a855f7)"
      >
        <p className="text-sm text-app-text/50">No bounties match this view.</p>
        <p className="text-xs text-app-text/35 mt-1">Try open bounties or check back later.</p>
      </DoraWidgetShell>
    );
  }

  return (
    <DoraWidgetShell
      title="Bounty board"
      icon={<Target size={14} className="text-rose-400" />}
      subtitle={filter ? `Filter: ${String(filter).replace(/_/g, ' ')} · ${count} shown` : `${count} bounties`}
      accentGradient="linear-gradient(90deg, #f43f5e, #a855f7)"
    >
      <div className="space-y-3">
        <div
          className="grid grid-cols-2 gap-2"
          style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
        >
          <div className="rounded-xl border border-app-border/70 bg-app-bg/30 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-app-muted">Total XP pool</div>
            <div className="text-lg font-bold text-app-text tabular-nums flex items-center gap-1">
              <Coins size={16} className="text-amber-400" />
              {totalXp.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl border border-app-border/70 bg-app-bg/30 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-app-muted">Avg reward</div>
            <div className="text-lg font-bold text-app-text tabular-nums">{avgXp.toLocaleString()} XP</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {urgencyPie.length > 0 && (
            <div className="rounded-xl border border-app-border/60 p-2 min-h-[140px]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted mb-1 px-1">
                By urgency
              </p>
              <div style={{ height: 130 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={urgencyPie}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={28}
                      outerRadius={48}
                      paddingAngle={2}
                    >
                      {urgencyPie.map((entry, i) => (
                        <Cell key={i} fill={URGENCY_COLORS[entry.name] ?? '#64748b'} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(15,23,42,0.95)',
                        border: '1px solid rgba(148,163,184,0.15)',
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {topByXp.length > 0 && (
            <div className="rounded-xl border border-app-border/60 p-2 min-h-[140px]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted mb-1 px-1">
                Top rewards
              </p>
              <div style={{ height: 130 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topByXp} layout="vertical" margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={88}
                      tick={{ fontSize: 9, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(15,23,42,0.95)',
                        border: '1px solid rgba(148,163,184,0.15)',
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                      formatter={(v: number) => [`${v} XP`, 'Reward']}
                    />
                    <Bar dataKey="xp" fill="#f43f5e" radius={[0, 4, 4, 0]} name="XP" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border border-app-border/50">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-app-border/40 text-app-muted uppercase tracking-wide">
                <th className="p-2 font-medium">Bounty</th>
                <th className="p-2 font-medium">XP</th>
                <th className="p-2 font-medium">Status</th>
                <th className="p-2 font-medium hidden sm:table-cell">Urgency</th>
              </tr>
            </thead>
            <tbody>
              {bounties.map((b, i) => (
                <tr key={b.id ?? i} className="border-b border-app-border/30 hover:bg-app-surface-tertiary/50">
                  <td className="p-2 text-app-text max-w-[200px]">
                    <div className="line-clamp-2 font-medium">{b.title ?? '—'}</div>
                  </td>
                  <td className="p-2 tabular-nums text-amber-300">{Number(b.xp_reward ?? 0)}</td>
                  <td className="p-2 text-app-muted">{b.status ?? '—'}</td>
                  <td className="p-2 text-app-muted hidden sm:table-cell">{b.urgency ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DoraWidgetShell>
  );
}
