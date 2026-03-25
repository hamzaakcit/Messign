import { Link } from 'react-router-dom';
import type { WorkspaceModuleKey, WorkspaceModuleSnapshots } from '@/types/command-center';
import { ROUTES } from '@/lib/routes';
import { GlassSlideOver } from './GlassSlideOver';
import { MiniSupportTrend, MiniMarketingBars, formatMaybePercent } from './WorkspaceOverviewGrid';
import { SparklineBlock } from './SparklineBlock';

const MODULE_TITLE: Record<WorkspaceModuleKey, string> = {
  crm: 'CRM pipeline',
  marketing: 'Marketing',
  support: 'Support',
  hr: 'Recruiting',
  okr: 'OKRs',
  chat: 'Chat',
  assets: 'Assets',
  contracts: 'Contracts',
};

const MODULE_ROUTE: Record<WorkspaceModuleKey, string> = {
  crm: ROUTES.CRM,
  marketing: ROUTES.MARKETING_DASHBOARD,
  support: ROUTES.SUPPORT,
  hr: ROUTES.RECRUITMENT,
  okr: ROUTES.OKR,
  chat: ROUTES.CHAT,
  assets: ROUTES.ASSETS,
  contracts: ROUTES.CONTRACTS,
};

function BigStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[10px] uppercase text-app-muted">{label}</p>
      <p className="text-xl font-semibold text-app-text tabular-nums">{value}</p>
    </div>
  );
}

function FooterLink({ href, label, onNavigate }: { href: string; label: string; onNavigate: (path: string) => void }): JSX.Element {
  return (
    <Link
      to={href}
      onClick={() => onNavigate(href)}
      className="inline-block text-sm font-medium text-primary-400 hover:text-primary-300 pt-2"
    >
      {label} →
    </Link>
  );
}

interface WorkspaceModuleSlideOverProps {
  workspace: WorkspaceModuleSnapshots;
  active: WorkspaceModuleKey | null;
  onClose: () => void;
  /** Called when user follows a deep link (caller may navigate + close). */
  onNavigate: (path: string) => void;
  onRetry?: () => void;
}

/**
 * Expanded workspace metrics in the same glass slide-over shell as column deep-dives.
 */
export function WorkspaceModuleSlideOver({
  workspace,
  active,
  onClose,
  onNavigate,
  onRetry,
}: WorkspaceModuleSlideOverProps): JSX.Element {
  const title = active ? `${MODULE_TITLE[active]} · details` : '';

  return (
    <GlassSlideOver isOpen={active != null} onClose={onClose} title={title} width={580}>
      {active ? <SlideBody module={active} workspace={workspace} onNavigate={onNavigate} onRetry={onRetry} /> : null}
    </GlassSlideOver>
  );
}

function SlideBody({
  module,
  workspace,
  onNavigate,
  onRetry,
}: {
  module: WorkspaceModuleKey;
  workspace: WorkspaceModuleSnapshots;
  onNavigate: (path: string) => void;
  onRetry?: () => void;
}): JSX.Element | null {
  const slice = workspace[module];
  const route = MODULE_ROUTE[module];

  if (!slice.ok) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-400" role="alert">
          {slice.error}
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={() => {
              onRetry();
            }}
            className="text-sm text-amber-400 hover:underline"
          >
            Retry load
          </button>
        ) : null}
        <FooterLink href={route} label={`Open ${MODULE_TITLE[module]}`} onNavigate={onNavigate} />
      </div>
    );
  }

  switch (module) {
    case 'crm': {
      const c = workspace.crm;
      if (!c.ok) return null;
      const d = c.data;
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <BigStat label="Deals won" value={String(d.dealsWon)} />
            <BigStat label="Deals lost" value={String(d.dealsLost)} />
            <BigStat label="Win rate" value={`${d.winRate.toFixed(1)}%`} />
            <BigStat label="Avg cycle (days)" value={d.avgCycleTimeDays.toFixed(1)} />
          </div>
          <p className="text-xs text-app-muted">
            Non-sensitive sales velocity snapshot. Open CRM for pipeline value and deal lists.
          </p>
          <FooterLink href={route} label="Open CRM" onNavigate={onNavigate} />
        </div>
      );
    }
    case 'marketing': {
      const m = workspace.marketing;
      if (!m.ok) return null;
      const d = m.data;
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <BigStat label="Active campaigns" value={String(d.activeCampaigns)} />
            <BigStat label="Leads" value={String(d.totalLeads)} />
            <BigStat label="Content published" value={String(d.contentPublished)} />
            <BigStat label="Email open %" value={`${formatMaybePercent(d.emailOpenRate)}%`} />
          </div>
          <div className="h-52">
            <MiniMarketingBars points={d.monthlyLeadsTrend} height={200} />
          </div>
          <FooterLink href={route} label="Marketing dashboard" onNavigate={onNavigate} />
        </div>
      );
    }
    case 'support': {
      const s = workspace.support;
      if (!s.ok) return null;
      const d = s.data;
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <BigStat label="Open tickets" value={String(d.openTickets)} />
            <BigStat label="Avg resolution (h)" value={d.avgResolutionHours.toFixed(1)} />
            <BigStat label="CSAT" value={d.csatScore.toFixed(2)} />
            <BigStat label="SLA %" value={`${d.slaCompliancePercent.toFixed(1)}%`} />
          </div>
          <div className="h-52">
            <MiniSupportTrend points={d.ticketTrend} height={200} />
          </div>
          <FooterLink href={route} label="Support workspace" onNavigate={onNavigate} />
        </div>
      );
    }
    case 'hr': {
      const h = workspace.hr;
      if (!h.ok) return null;
      const d = h.data;
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <BigStat label="Open roles" value={String(d.openPositions)} />
            <BigStat label="Applicants" value={String(d.activeApplicants)} />
            <BigStat label="Offer accept %" value={`${(d.offerAcceptanceRate * 100).toFixed(1)}%`} />
            <BigStat label="Interviews (7d)" value={String(d.upcomingInterviewCount)} />
            <BigStat label="TTH (days)" value={d.avgTimeToHireDays.toFixed(1)} />
          </div>
          <div className="text-sm text-app-muted space-y-1">
            <p>Funnel</p>
            <p className="font-mono text-app-text text-xs">
              {d.funnel.applied} → {d.funnel.screening} → {d.funnel.interviewing} → {d.funnel.offer} → {d.funnel.hired}
            </p>
          </div>
          <FooterLink href={route} label="Recruiting" onNavigate={onNavigate} />
        </div>
      );
    }
    case 'okr': {
      const o = workspace.okr;
      if (!o.ok) return null;
      const d = o.data;
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <BigStat label="Goals" value={String(d.totalGoals)} />
            <BigStat label="On track" value={String(d.onTrack)} />
            <BigStat label="At risk" value={String(d.atRisk)} />
            <BigStat label="Behind" value={String(d.behind)} />
            <BigStat label="Completed" value={String(d.completed)} />
            <BigStat label="Avg progress" value={`${d.avgProgress.toFixed(1)}%`} />
          </div>
          <FooterLink href={route} label="OKR workspace" onNavigate={onNavigate} />
        </div>
      );
    }
    case 'chat': {
      const ch = workspace.chat;
      if (!ch.ok) return null;
      const d = ch.data;
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <BigStat label="Channels joined" value={String(d.channelsJoined)} />
            <BigStat label="Messages (7d)" value={String(d.messagesLast7Days)} />
          </div>
          <div className="h-40">
            <SparklineBlock
              points={d.messagesByDay.map((x) => ({ label: x.date.slice(5), value: x.count }))}
              color="#22d3ee"
              height={140}
            />
          </div>
          <FooterLink href={route} label="Open chat" onNavigate={onNavigate} />
        </div>
      );
    }
    case 'assets': {
      const a = workspace.assets;
      if (!a.ok) return null;
      const d = a.data;
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <BigStat label="Total assets" value={String(d.totalAssets)} />
            <BigStat label="Assigned" value={String(d.assigned)} />
            <BigStat label="Available" value={String(d.available)} />
            <BigStat label="Warranty (30d)" value={String(d.warrantyExpiring)} />
          </div>
          <FooterLink href={route} label="Assets" onNavigate={onNavigate} />
        </div>
      );
    }
    case 'contracts': {
      const ct = workspace.contracts;
      if (!ct.ok) return null;
      const d = ct.data;
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <BigStat label="Active" value={String(d.totalActive)} />
            <BigStat label="Expiring 30d" value={String(d.expiringThisMonth)} />
            <BigStat label="Renewals due" value={String(d.renewalsNeeded)} />
            <BigStat label="Compliance due" value={String(d.complianceDue)} />
          </div>
          <p className="text-xs text-app-muted">Values exclude contract amounts for privacy on this dashboard.</p>
          <FooterLink href={route} label="Contracts" onNavigate={onNavigate} />
        </div>
      );
    }
    default:
      return <p className="text-app-muted text-sm">Unknown module.</p>;
  }
}
