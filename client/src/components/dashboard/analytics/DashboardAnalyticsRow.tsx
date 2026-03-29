import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CommandCenterDTO } from '@/types/command-center';
import { BentoCard } from '@/components/dashboard/bento/BentoCard';

const AXIS = { tick: { fill: '#94a3b8', fontSize: 9 } as const };
const GRID = { stroke: 'rgba(148,163,184,0.12)' } as const;
const TOOLTIP = {
  contentStyle: {
    backgroundColor: '#0f1117',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    fontSize: 11,
  },
  labelStyle: { color: '#e2e8f0' },
} as const;

interface DashboardAnalyticsRowProps {
  data: CommandCenterDTO;
}

function EmptyChart({ label }: { label: string }): JSX.Element {
  return (
    <div className="flex flex-1 min-h-[100px] items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.02] text-[10px] text-app-muted px-2 text-center">
      {label}
    </div>
  );
}

/**
 * Data-dense infographic row: delivery velocity, OKRs, workspace modules, and team XP.
 * Uses the same Command Center payload as the top bento — no extra API calls.
 */
export function DashboardAnalyticsRow({ data }: DashboardAnalyticsRowProps): JSX.Element {
  const velocityPts = useMemo(
    () =>
      data.pulse.velocityTrend.map((p) => ({
        day: p.date.slice(5),
        tasks: p.count,
      })),
    [data.pulse.velocityTrend],
  );

  const okrBars = useMemo(
    () => [
      { name: 'On track', v: data.future.okrs.onTrack, fill: '#34d399' },
      { name: 'At risk', v: data.future.okrs.atRisk, fill: '#fbbf24' },
      { name: 'Behind', v: data.future.okrs.behind, fill: '#f87171' },
    ],
    [data.future.okrs],
  );

  const chatPts = useMemo(() => {
    if (!data.workspace.chat.ok) return [];
    return data.workspace.chat.data.messagesByDay.map((d) => ({
      day: d.date.slice(5),
      msgs: d.count,
    }));
  }, [data.workspace.chat]);

  const marketingPts = useMemo(() => {
    if (!data.workspace.marketing.ok) return [];
    return data.workspace.marketing.data.monthlyLeadsTrend.map((m) => ({
      month: m.month,
      leads: m.leads,
    }));
  }, [data.workspace.marketing]);

  const supportPts = useMemo(() => {
    if (!data.workspace.support.ok) return [];
    return data.workspace.support.data.ticketTrend.map((t) => ({
      day: t.date.slice(5),
      open: t.openCount,
      resolved: t.resolvedCount,
    }));
  }, [data.workspace.support]);

  const hrFunnel = useMemo(() => {
    if (!data.workspace.hr.ok) return [];
    const f = data.workspace.hr.data.funnel;
    return [
      { stage: 'Applied', n: f.applied },
      { stage: 'Screen', n: f.screening },
      { stage: 'Interview', n: f.interviewing },
      { stage: 'Offer', n: f.offer },
      { stage: 'Hired', n: f.hired },
    ];
  }, [data.workspace.hr]);

  const crmWin = useMemo(() => {
    if (!data.workspace.crm.ok) return [];
    const c = data.workspace.crm.data;
    return [
      { name: 'Won', v: c.dealsWon, fill: '#22c55e' },
      { name: 'Lost', v: c.dealsLost, fill: '#64748b' },
    ];
  }, [data.workspace.crm]);

  const leaderboardBars = useMemo(
    () =>
      data.growth.leaderboard.slice(0, 8).map((e) => ({
        name: e.name.split(' ')[0] ?? e.name,
        xp: e.xp,
      })),
    [data.growth.leaderboard],
  );

  const delta = data.pulse.velocityDeltaPct;

  return (
    <div className="flex flex-col gap-2 min-h-0 w-full">
      <div className="grid grid-cols-12 gap-2 shrink-0">
        <BentoCard className="col-span-12 lg:col-span-5 min-h-[200px]" title="Delivery · velocity">
          <p className="text-[9px] text-app-muted mb-1">
            Tasks completed per day (14d)
            {delta != null ? (
              <span className="ml-1 tabular-nums text-app-text">
                · WoW {delta >= 0 ? '+' : ''}
                {delta}%
              </span>
            ) : null}
          </p>
          {velocityPts.length === 0 ? (
            <EmptyChart label="No completions in the last 14 days — push work through to done." />
          ) : (
            <div className="h-[140px] w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={velocityPts} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="velFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID} strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={AXIS.tick} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS.tick} axisLine={false} tickLine={false} width={28} />
                  <Tooltip {...TOOLTIP} />
                  <Area
                    type="monotone"
                    dataKey="tasks"
                    stroke="#c4b5fd"
                    strokeWidth={2}
                    fill="url(#velFill)"
                    name="Done"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </BentoCard>

        <BentoCard className="col-span-12 lg:col-span-4 min-h-[200px]" title="OKRs · health mix">
          <p className="text-[9px] text-app-muted mb-1 tabular-nums">
            Org progress {data.future.okrs.overallProgress.toFixed(0)}% weighted
          </p>
          <div className="h-[140px] w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={okrBars} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid {...GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis type="category" dataKey="name" tick={AXIS.tick} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS.tick} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                <Tooltip {...TOOLTIP} />
                <Bar dataKey="v" radius={[4, 4, 0, 0]} name="Goals">
                  {okrBars.map((e, i) => (
                    <Cell key={`c-${i}`} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </BentoCard>

        <BentoCard className="col-span-12 lg:col-span-3 min-h-[200px]" title="Team · XP ladder">
          <p className="text-[9px] text-app-muted mb-1">
            You: <span className="text-app-text tabular-nums">{data.growth.myXp} XP</span>
            {data.growth.myRank != null ? (
              <span className="ml-1">· rank #{data.growth.myRank}</span>
            ) : null}
          </p>
          {leaderboardBars.length === 0 ? (
            <EmptyChart label="No XP data for this org yet." />
          ) : (
            <div className="h-[140px] w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={leaderboardBars}
                  margin={{ top: 2, right: 8, left: 4, bottom: 0 }}
                >
                  <CartesianGrid {...GRID} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={AXIS.tick} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={52} tick={AXIS.tick} axisLine={false} tickLine={false} />
                  <Tooltip {...TOOLTIP} />
                  <Bar dataKey="xp" fill="#818cf8" radius={[0, 3, 3, 0]} name="XP" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </BentoCard>
      </div>

      <div className="grid grid-cols-12 gap-2 shrink-0">
        <BentoCard className="col-span-12 md:col-span-6 xl:col-span-3 min-h-[180px]" title="Chat · activity">
          {chatPts.length === 0 ? (
            <EmptyChart label={data.workspace.chat.ok ? 'No messages in range.' : data.workspace.chat.error} />
          ) : (
            <div className="h-[120px] w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chatPts} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid {...GRID} strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={AXIS.tick} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS.tick} axisLine={false} tickLine={false} width={28} />
                  <Tooltip {...TOOLTIP} />
                  <Line type="monotone" dataKey="msgs" stroke="#22d3ee" strokeWidth={2} dot={false} name="Msgs" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </BentoCard>

        <BentoCard className="col-span-12 md:col-span-6 xl:col-span-3 min-h-[180px]" title="Marketing · lead trend">
          {marketingPts.length === 0 ? (
            <EmptyChart label={data.workspace.marketing.ok ? 'No lead history.' : data.workspace.marketing.error} />
          ) : (
            <div className="h-[120px] w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={marketingPts} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mktFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e879f9" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#e879f9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID} strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={AXIS.tick} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS.tick} axisLine={false} tickLine={false} width={28} />
                  <Tooltip {...TOOLTIP} />
                  <Area
                    type="monotone"
                    dataKey="leads"
                    stroke="#f0abfc"
                    strokeWidth={2}
                    fill="url(#mktFill)"
                    name="Leads"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </BentoCard>

        <BentoCard className="col-span-12 md:col-span-6 xl:col-span-3 min-h-[180px]" title="Support · tickets">
          {supportPts.length === 0 ? (
            <EmptyChart label={data.workspace.support.ok ? 'No ticket trend rows.' : data.workspace.support.error} />
          ) : (
            <div className="h-[120px] w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={supportPts} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid {...GRID} strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={AXIS.tick} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS.tick} axisLine={false} tickLine={false} width={28} />
                  <Tooltip {...TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 9 }} />
                  <Line type="monotone" dataKey="open" stroke="#fb7185" strokeWidth={2} dot={false} name="Open" />
                  <Line type="monotone" dataKey="resolved" stroke="#4ade80" strokeWidth={2} dot={false} name="Resolved" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </BentoCard>

        <BentoCard className="col-span-12 md:col-span-6 xl:col-span-3 min-h-[180px]" title="HR · funnel">
          {hrFunnel.length === 0 || !data.workspace.hr.ok ? (
            <EmptyChart label={data.workspace.hr.ok ? 'No funnel data.' : data.workspace.hr.error} />
          ) : (
            <div className="h-[120px] w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hrFunnel} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid {...GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="stage" tick={AXIS.tick} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS.tick} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                  <Tooltip {...TOOLTIP} />
                  <Bar dataKey="n" fill="#2dd4bf" radius={[4, 4, 0, 0]} name="Candidates" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </BentoCard>
      </div>

      <div className="grid grid-cols-12 gap-2 shrink-0">
        <BentoCard className="col-span-12 lg:col-span-6 min-h-[160px]" title="CRM · outcomes">
          {!data.workspace.crm.ok ? (
            <EmptyChart label={data.workspace.crm.error} />
          ) : crmWin.every((x) => x.v === 0) ? (
            <EmptyChart label="No closed deals yet — keep the pipeline warm." />
          ) : (
            <div className="h-[100px] w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={crmWin} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid {...GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis type="category" dataKey="name" tick={AXIS.tick} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS.tick} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                  <Tooltip {...TOOLTIP} />
                  <Bar dataKey="v" radius={[4, 4, 0, 0]} name="Deals">
                    {crmWin.map((e, i) => (
                      <Cell key={`crm-${i}`} fill={e.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {data.workspace.crm.ok ? (
            <p className="text-[9px] text-app-muted mt-1 tabular-nums">
              Cycle ~{data.workspace.crm.data.avgCycleTimeDays.toFixed(0)}d · win{' '}
              {Math.round(
                data.workspace.crm.data.winRate > 1
                  ? data.workspace.crm.data.winRate
                  : data.workspace.crm.data.winRate * 100,
              )}
              %
            </p>
          ) : null}
        </BentoCard>

        <BentoCard className="col-span-12 lg:col-span-6 min-h-[160px]" title="Company pulse · snapshot">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-2 py-2">
              <p className="text-[8px] uppercase tracking-wide text-app-muted">Projects</p>
              <p className="text-lg font-semibold text-app-text tabular-nums">{data.pulse.activeProjects}</p>
            </div>
            <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-2 py-2">
              <p className="text-[8px] uppercase tracking-wide text-app-muted">Done 7d</p>
              <p className="text-lg font-semibold text-app-text tabular-nums">{data.pulse.tasksCompletedThisWeek}</p>
            </div>
            <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-2 py-2">
              <p className="text-[8px] uppercase tracking-wide text-app-muted">Blocked</p>
              <p className="text-lg font-semibold text-amber-300 tabular-nums">{data.pulse.blockedTasks}</p>
            </div>
            <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-2 py-2">
              <p className="text-[8px] uppercase tracking-wide text-app-muted">Vibe</p>
              <p className="text-lg font-semibold text-app-text tabular-nums">
                {data.growth.vibeScore != null ? data.growth.vibeScore.toFixed(0) : '—'}
              </p>
            </div>
          </div>
          <p className="text-[9px] text-app-muted mt-2 leading-snug">
            Culture {data.growth.cultureHealth != null ? `${data.growth.cultureHealth.toFixed(0)} / 100` : '—'} ·{' '}
            {data.growth.engagementTrend}
          </p>
        </BentoCard>
      </div>
    </div>
  );
}
