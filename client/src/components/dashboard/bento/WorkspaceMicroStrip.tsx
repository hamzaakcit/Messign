import { Briefcase, Megaphone, Headphones, Users, Target, MessageSquare, Package, FileText } from 'lucide-react';
import type { WorkspaceModuleKey, WorkspaceModuleSnapshots } from '@/types/command-center';
import { formatMaybePercent } from '@/components/command-center/WorkspaceOverviewGrid';
import { cn } from '@/lib/utils';

const MODULE_ORDER: WorkspaceModuleKey[] = [
  'crm',
  'marketing',
  'support',
  'hr',
  'okr',
  'chat',
  'assets',
  'contracts',
];

const ICONS: Record<WorkspaceModuleKey, typeof Briefcase> = {
  crm: Briefcase,
  marketing: Megaphone,
  support: Headphones,
  hr: Users,
  okr: Target,
  chat: MessageSquare,
  assets: Package,
  contracts: FileText,
};

const SHORT: Record<WorkspaceModuleKey, string> = {
  crm: 'CRM',
  marketing: 'Mkt',
  support: 'Sup',
  hr: 'HR',
  okr: 'OKR',
  chat: 'Chat',
  assets: 'Ast',
  contracts: 'Ctr',
};

function headlineFor(key: WorkspaceModuleKey, workspace: WorkspaceModuleSnapshots): string {
  switch (key) {
    case 'crm': {
      const d = workspace.crm;
      return d.ok ? `${d.data.dealsWon} won` : '—';
    }
    case 'marketing': {
      const d = workspace.marketing;
      return d.ok ? `${d.data.activeCampaigns} cmp` : '—';
    }
    case 'support': {
      const d = workspace.support;
      return d.ok ? `${d.data.openTickets} tix` : '—';
    }
    case 'hr': {
      const d = workspace.hr;
      return d.ok ? `${d.data.openPositions} roles` : '—';
    }
    case 'okr': {
      const d = workspace.okr;
      return d.ok ? `${d.data.avgProgress.toFixed(0)}%` : '—';
    }
    case 'chat': {
      const d = workspace.chat;
      return d.ok ? `${d.data.messagesLast7Days} msg` : '—';
    }
    case 'assets': {
      const d = workspace.assets;
      return d.ok ? `${d.data.totalAssets} tot` : '—';
    }
    case 'contracts': {
      const d = workspace.contracts;
      return d.ok ? `${d.data.totalActive} act` : '—';
    }
    default:
      return '—';
  }
}

function sublineFor(key: WorkspaceModuleKey, workspace: WorkspaceModuleSnapshots): string | null {
  switch (key) {
    case 'marketing': {
      const d = workspace.marketing;
      if (!d.ok) return d.error.slice(0, 18);
      return `${formatMaybePercent(d.data.emailOpenRate)}% open`;
    }
    case 'support': {
      const d = workspace.support;
      if (!d.ok) return d.error.slice(0, 18);
      return `CSAT ${d.data.csatScore.toFixed(1)}`;
    }
    case 'chat': {
      const d = workspace.chat;
      if (!d.ok) return d.error.slice(0, 18);
      return `${d.data.channelsJoined} ch`;
    }
    default:
      return null;
  }
}

interface WorkspaceMicroStripProps {
  workspace: WorkspaceModuleSnapshots;
  onOpenDetail: (key: WorkspaceModuleKey) => void;
  onRetryModule?: () => void;
}

/**
 * Single-row icon + headline tiles; opens WorkspaceModuleSlideOver on click.
 */
export function WorkspaceMicroStrip({ workspace, onOpenDetail, onRetryModule }: WorkspaceMicroStripProps): JSX.Element {
  const hasError = Object.values(workspace).some((m) => !m.ok);

  return (
    <section className="min-h-0 shrink-0 border-t border-white/[0.06] pt-2" aria-label="Workspace modules">
      <div className="flex items-center justify-between gap-2 mb-1.5 px-0.5">
        <h2 className="text-[10px] font-semibold text-app-text uppercase tracking-wide">Workspace</h2>
        {hasError && onRetryModule ? (
          <button
            type="button"
            onClick={onRetryModule}
            className="text-[9px] text-amber-400/95 hover:underline shrink-0"
          >
            Retry failed
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 min-h-0">
        {MODULE_ORDER.map((key) => {
          const Icon = ICONS[key];
          const ok = workspace[key].ok;
          const headline = headlineFor(key, workspace);
          const sub = sublineFor(key, workspace);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onOpenDetail(key)}
              title={`${SHORT[key]} — ${headline}`}
              className={cn(
                'rounded-lg border border-white/[0.08] bg-app-sidebar/40 backdrop-blur-sm',
                'px-1 py-1.5 text-left min-w-0 overflow-hidden',
                'hover:bg-white/[0.06] focus:outline-none focus-visible:ring-1 focus-visible:ring-primary-500/50',
                !ok && 'border-rose-500/30',
              )}
            >
              <div className="flex items-center gap-0.5 mb-0.5">
                <Icon className="w-3 h-3 shrink-0 text-primary-400/90" aria-hidden />
                <span className="text-[9px] font-semibold text-app-muted uppercase truncate">{SHORT[key]}</span>
              </div>
              <p className="text-[10px] font-mono text-app-text tabular-nums truncate leading-tight">{headline}</p>
              {sub ? <p className="text-[8px] text-app-muted truncate leading-tight mt-0.5">{sub}</p> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
