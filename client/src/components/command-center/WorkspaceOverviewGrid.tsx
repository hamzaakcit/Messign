import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import type { WorkspaceModuleKey, WorkspaceModuleSnapshots } from '@/types/command-center';
import { ROUTES } from '@/lib/routes';
import { ModuleMetricTile } from './ModuleMetricTile';
import { SparklineBlock } from './SparklineBlock';

/** DB may store 0–1 or 0–100 for rates. */
export function formatMaybePercent(n: number): string {
  if (n <= 1 && n >= 0) return (n * 100).toFixed(1);
  return n.toFixed(1);
}

function StatRow({ label, value }: { label: string; value: string | number }): JSX.Element {
  return (
    <div className="flex justify-between gap-2 text-[11px] leading-tight">
      <span className="text-app-muted truncate">{label}</span>
      <span className="font-mono text-app-text tabular-nums shrink-0">{value}</span>
    </div>
  );
}

export function MiniSupportTrend({
  points,
  height = 88,
}: {
  points: { date: string; openCount: number; resolvedCount: number }[];
  height?: number;
}): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setW(Math.max(0, Math.floor(entries[0]?.contentRect.width ?? 0)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (points.length === 0) return null;
  const data = points.map((p) => ({
    name: p.date.length >= 10 ? p.date.slice(5, 10) : p.date,
    open: p.openCount,
    res: p.resolvedCount,
  }));
  const tt = {
    backgroundColor: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '6px',
    fontSize: '11px',
  };
  return (
    <div ref={ref} className="w-full min-w-0 mt-1" style={{ height }} aria-hidden>
      {w > 0 ? (
        <ResponsiveContainer width={w} height={height}>
          <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <Tooltip contentStyle={tt} />
            <Line type="monotone" dataKey="open" name="Open" stroke="#94a3b8" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="res" name="Resolved" stroke="#34d399" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="w-full h-full rounded bg-app-bg/30" />
      )}
    </div>
  );
}

export function MiniMarketingBars({
  points,
  height = 88,
}: {
  points: { month: string; leads: number }[];
  height?: number;
}): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setW(Math.max(0, Math.floor(entries[0]?.contentRect.width ?? 0)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (points.length === 0) return null;
  const data = points.slice(-6).map((p) => ({ name: p.month.slice(5), leads: p.leads }));
  return (
    <div ref={ref} className="w-full min-w-0 mt-1" style={{ height }} aria-hidden>
      {w > 0 ? (
        <ResponsiveContainer width={w} height={height}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.5} />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '6px',
                fontSize: '11px',
              }}
            />
            <Bar dataKey="leads" fill="#8b5cf6" radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="w-full h-full rounded bg-app-bg/30" />
      )}
    </div>
  );
}

interface WorkspaceOverviewGridProps {
  workspace: WorkspaceModuleSnapshots;
  /** Refetch full dashboard (reloads failed module slices). */
  onRetryModule?: () => void;
  /** Opens expanded metrics slide-over for a module. */
  onOpenDetail?: (key: WorkspaceModuleKey) => void;
}

/**
 * Dense bento of cross-module KPIs (non-sensitive aggregates) with deep links.
 */
export function WorkspaceOverviewGrid({
  workspace,
  onRetryModule,
  onOpenDetail,
}: WorkspaceOverviewGridProps): JSX.Element {
  const navigate = useNavigate();
  const retry = onRetryModule;

  return (
    <section className="space-y-3" aria-label="Workspace performance overview">
      <div className="px-1">
        <h2 className="text-xs font-semibold text-app-text uppercase tracking-wide">Workspace performance</h2>
        <p className="text-[10px] text-app-muted mt-0.5">
          Counts and rates across CRM, hiring, support, marketing, assets, contracts, OKRs, and chat.
          {Object.values(workspace).some((m) => !m.ok) && retry ? (
            <button
              type="button"
              onClick={retry}
              className="ml-2 text-primary-400 hover:underline"
            >
              Retry failed
            </button>
          ) : null}
        </p>
      </div>

      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <ModuleMetricTile
          title="CRM pipeline"
          onOpen={() => { navigate(ROUTES.CRM); }}
          error={workspace.crm.ok ? undefined : workspace.crm.error}
          onRetry={retry}
          onDetails={onOpenDetail ? () => onOpenDetail('crm') : undefined}
        >
          {workspace.crm.ok && (
            <>
              <StatRow label="Won / lost" value={`${workspace.crm.data.dealsWon} / ${workspace.crm.data.dealsLost}`} />
              <StatRow label="Win rate" value={`${workspace.crm.data.winRate.toFixed(1)}%`} />
              <StatRow label="Avg cycle (d)" value={workspace.crm.data.avgCycleTimeDays.toFixed(1)} />
            </>
          )}
        </ModuleMetricTile>

        <ModuleMetricTile
          title="Marketing"
          onOpen={() => { navigate(ROUTES.MARKETING_DASHBOARD); }}
          error={workspace.marketing.ok ? undefined : workspace.marketing.error}
          onRetry={retry}
          onDetails={onOpenDetail ? () => onOpenDetail('marketing') : undefined}
        >
          {workspace.marketing.ok && (
            <>
              <StatRow label="Active campaigns" value={workspace.marketing.data.activeCampaigns} />
              <StatRow label="Leads" value={workspace.marketing.data.totalLeads} />
              <StatRow label="Content published" value={workspace.marketing.data.contentPublished} />
              <StatRow label="Email open %" value={`${formatMaybePercent(workspace.marketing.data.emailOpenRate)}%`} />
              <MiniMarketingBars points={workspace.marketing.data.monthlyLeadsTrend} />
            </>
          )}
        </ModuleMetricTile>

        <ModuleMetricTile
          title="Support"
          onOpen={() => { navigate(ROUTES.SUPPORT); }}
          error={workspace.support.ok ? undefined : workspace.support.error}
          onRetry={retry}
          onDetails={onOpenDetail ? () => onOpenDetail('support') : undefined}
        >
          {workspace.support.ok && (
            <>
              <StatRow label="Open tickets" value={workspace.support.data.openTickets} />
              <StatRow label="Avg resolution (h)" value={workspace.support.data.avgResolutionHours.toFixed(1)} />
              <StatRow label="CSAT" value={workspace.support.data.csatScore.toFixed(2)} />
              <StatRow label="SLA %" value={`${workspace.support.data.slaCompliancePercent.toFixed(1)}%`} />
              <MiniSupportTrend points={workspace.support.data.ticketTrend} />
            </>
          )}
        </ModuleMetricTile>

        <ModuleMetricTile
          title="Recruiting"
          onOpen={() => { navigate(ROUTES.RECRUITMENT); }}
          error={workspace.hr.ok ? undefined : workspace.hr.error}
          onRetry={retry}
          onDetails={onOpenDetail ? () => onOpenDetail('hr') : undefined}
        >
          {workspace.hr.ok && (
            <>
              <StatRow label="Open roles" value={workspace.hr.data.openPositions} />
              <StatRow label="Applicants" value={workspace.hr.data.activeApplicants} />
              <StatRow label="Offer accept %" value={`${(workspace.hr.data.offerAcceptanceRate * 100).toFixed(1)}%`} />
              <StatRow label="Interviews (7d)" value={workspace.hr.data.upcomingInterviewCount} />
              <StatRow label="TTH (d)" value={workspace.hr.data.avgTimeToHireDays.toFixed(1)} />
              <div className="text-[10px] text-app-muted pt-1 border-t border-white/[0.06]">
                Funnel: {workspace.hr.data.funnel.applied}→{workspace.hr.data.funnel.screening}→
                {workspace.hr.data.funnel.interviewing}→{workspace.hr.data.funnel.offer}→{workspace.hr.data.funnel.hired}
              </div>
            </>
          )}
        </ModuleMetricTile>

        <ModuleMetricTile
          title="OKRs"
          onOpen={() => { navigate(ROUTES.OKR); }}
          error={workspace.okr.ok ? undefined : workspace.okr.error}
          onRetry={retry}
          onDetails={onOpenDetail ? () => onOpenDetail('okr') : undefined}
        >
          {workspace.okr.ok && (
            <>
              <StatRow label="Goals" value={workspace.okr.data.totalGoals} />
              <StatRow label="On track" value={workspace.okr.data.onTrack} />
              <StatRow label="At risk" value={workspace.okr.data.atRisk} />
              <StatRow label="Behind" value={workspace.okr.data.behind} />
              <StatRow label="Completed" value={workspace.okr.data.completed} />
              <StatRow label="Avg progress" value={`${workspace.okr.data.avgProgress.toFixed(1)}%`} />
            </>
          )}
        </ModuleMetricTile>

        <ModuleMetricTile
          title="Chat"
          onOpen={() => { navigate(ROUTES.CHAT); }}
          error={workspace.chat.ok ? undefined : workspace.chat.error}
          onRetry={retry}
          onDetails={onOpenDetail ? () => onOpenDetail('chat') : undefined}
        >
          {workspace.chat.ok && (
            <>
              <StatRow label="Channels" value={workspace.chat.data.channelsJoined} />
              <StatRow label="Messages (7d)" value={workspace.chat.data.messagesLast7Days} />
              <SparklineBlock
                points={workspace.chat.data.messagesByDay.map((d) => ({ label: d.date.slice(5), value: d.count }))}
                color="#22d3ee"
              />
            </>
          )}
        </ModuleMetricTile>

        <ModuleMetricTile
          title="Assets"
          onOpen={() => { navigate(ROUTES.ASSETS); }}
          error={workspace.assets.ok ? undefined : workspace.assets.error}
          onRetry={retry}
          onDetails={onOpenDetail ? () => onOpenDetail('assets') : undefined}
        >
          {workspace.assets.ok && (
            <>
              <StatRow label="Total" value={workspace.assets.data.totalAssets} />
              <StatRow label="Assigned" value={workspace.assets.data.assigned} />
              <StatRow label="Available" value={workspace.assets.data.available} />
              <StatRow label="Warranty 30d" value={workspace.assets.data.warrantyExpiring} />
            </>
          )}
        </ModuleMetricTile>

        <ModuleMetricTile
          title="Contracts"
          onOpen={() => { navigate(ROUTES.CONTRACTS); }}
          error={workspace.contracts.ok ? undefined : workspace.contracts.error}
          onRetry={retry}
          onDetails={onOpenDetail ? () => onOpenDetail('contracts') : undefined}
        >
          {workspace.contracts.ok && (
            <>
              <StatRow label="Active" value={workspace.contracts.data.totalActive} />
              <StatRow label="Expiring 30d" value={workspace.contracts.data.expiringThisMonth} />
              <StatRow label="Renewals due" value={workspace.contracts.data.renewalsNeeded} />
              <StatRow label="Compliance due" value={workspace.contracts.data.complianceDue} />
            </>
          )}
        </ModuleMetricTile>
      </div>
    </section>
  );
}
