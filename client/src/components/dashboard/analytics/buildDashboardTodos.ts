import { ROUTES } from '@/lib/routes';
import type { CommandCenterDTO } from '@/types/command-center';

/** Logical area for filtering / badges on the home todo rail. */
export type DashboardTodoModule =
  | 'delivery'
  | 'okr'
  | 'crm'
  | 'hr'
  | 'support'
  | 'marketing'
  | 'assets'
  | 'contracts'
  | 'chat'
  | 'knowledge'
  | 'dora'
  | 'culture'
  | 'general';

export interface DashboardTodoItem {
  id: string;
  label: string;
  module: DashboardTodoModule;
  /** In-app route when actionable; null for habits without a single screen. */
  href: string | null;
  priority: 'high' | 'normal' | 'low';
}

const MIN_TODOS = 20;

function slugId(prefix: string, raw: string, index: number): string {
  const compact = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `${prefix}-${index}-${compact || 'item'}`;
}

const FALLBACK_POOL: Omit<DashboardTodoItem, 'id'>[] = [
  { label: 'Scan project board for tasks stuck in review', module: 'delivery', href: ROUTES.PROJECTS, priority: 'normal' },
  { label: 'Confirm sprint goals align with OKR key results', module: 'okr', href: ROUTES.OKR, priority: 'normal' },
  { label: 'Update CRM deal stages for stale opportunities', module: 'crm', href: ROUTES.CRM, priority: 'normal' },
  { label: 'Review open reqs and candidate pipeline health', module: 'hr', href: ROUTES.RECRUITMENT_PIPELINE, priority: 'normal' },
  { label: 'Triage oldest support tickets by SLA risk', module: 'support', href: ROUTES.SUPPORT, priority: 'high' },
  { label: 'Check campaign performance and subject-line tests', module: 'marketing', href: ROUTES.MARKETING_CAMPAIGNS, priority: 'normal' },
  { label: 'Verify asset assignments vs. new hires', module: 'assets', href: ROUTES.ASSETS, priority: 'low' },
  { label: 'Review contracts expiring in the next 30 days', module: 'contracts', href: ROUTES.CONTRACTS, priority: 'normal' },
  { label: 'Catch up on team channels you have not opened this week', module: 'chat', href: ROUTES.CHAT, priority: 'low' },
  { label: 'Read one knowledge doc and leave a comment', module: 'knowledge', href: ROUTES.KNOWLEDGE_HUB, priority: 'low' },
  { label: 'Clear Dora briefing queue and archive done items', module: 'dora', href: ROUTES.DORA_BRIEFING, priority: 'normal' },
  { label: 'Share a win in culture / recognition channel', module: 'culture', href: ROUTES.CULTURE, priority: 'low' },
  { label: 'Export a snapshot of delivery metrics for leadership', module: 'general', href: ROUTES.DASHBOARD, priority: 'low' },
  { label: 'Pair on a blocker with the owning engineer', module: 'delivery', href: ROUTES.PROJECTS, priority: 'high' },
  { label: 'Reconcile OKR confidence scores with owners', module: 'okr', href: ROUTES.OKR, priority: 'normal' },
  { label: 'Log call notes on top CRM accounts', module: 'crm', href: ROUTES.CRM, priority: 'normal' },
  { label: 'Schedule debrief after latest candidate rounds', module: 'hr', href: ROUTES.RECRUITMENT_INTERVIEWS, priority: 'normal' },
  { label: 'Document a recurring support issue for the KB', module: 'support', href: ROUTES.SUPPORT, priority: 'low' },
  { label: 'Queue next week’s marketing experiments', module: 'marketing', href: ROUTES.MARKETING_EXPERIMENTS, priority: 'normal' },
  { label: 'Flag warranty-expiring hardware for replacement', module: 'assets', href: ROUTES.ASSETS, priority: 'normal' },
  { label: 'Confirm vendor renewals have owners assigned', module: 'contracts', href: ROUTES.CONTRACTS, priority: 'normal' },
  { label: 'Reply to threads where you are blocking others', module: 'chat', href: ROUTES.CHAT, priority: 'high' },
  { label: 'Bookmark two docs your team should standardize on', module: 'knowledge', href: ROUTES.KNOWLEDGE_HUB, priority: 'low' },
  { label: 'Run Dora automations health check', module: 'dora', href: ROUTES.DORA_AUTOMATIONS, priority: 'low' },
];

/**
 * Builds a dense actionable list for the home dashboard (minimum 20 items).
 * Merges live Command Center data with rotating best-practice tasks so the rail
 * stays useful when blockers and milestones are sparse.
 */
export function buildDashboardTodos(dto: CommandCenterDTO): DashboardTodoItem[] {
  const out: DashboardTodoItem[] = [];
  const seen = new Set<string>();

  const push = (item: DashboardTodoItem): void => {
    const key = item.label.trim().toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };

  for (let i = 0; i < dto.pulse.blockers.length; i++) {
    const b = dto.pulse.blockers[i];
    push({
      id: slugId('blocker', b.title, i),
      label: `Unblock: ${b.title}${b.projectName ? ` (${b.projectName})` : ''}`,
      module: 'delivery',
      href: ROUTES.PROJECTS,
      priority: 'high',
    });
  }

  dto.future.milestones.forEach((m, i) => {
    push({
      id: slugId('milestone', m.title, i),
      label: `OKR milestone: ${m.title}${m.dueDate ? ` · due ${m.dueDate.slice(0, 10)}` : ''}`,
      module: 'okr',
      href: ROUTES.OKR,
      priority: 'high',
    });
  });

  if (dto.brain.doraUnreadCount > 0) {
    push({
      id: 'dora-unread',
      label: `Read ${dto.brain.doraUnreadCount} unread Dora insight${dto.brain.doraUnreadCount === 1 ? '' : 's'}`,
      module: 'dora',
      href: ROUTES.DORA_BRIEFING,
      priority: 'normal',
    });
  }

  dto.brain.knowledgeRecent.slice(0, 6).forEach((doc) => {
    push({
      id: `kb-${doc.id}`,
      label: `Knowledge: skim “${doc.title}”`,
      module: 'knowledge',
      href: ROUTES.KNOWLEDGE_HUB,
      priority: 'low',
    });
  });

  const { workspace } = dto;

  if (workspace.crm.ok) {
    const c = workspace.crm.data;
    const winPct = c.winRate > 1 ? c.winRate : c.winRate * 100;
    push({
      id: 'crm-pipeline',
      label: `CRM: ${c.dealsWon} won · ${c.dealsLost} lost · ${Math.round(winPct)}% win rate`,
      module: 'crm',
      href: ROUTES.CRM,
      priority: 'normal',
    });
  }

  if (workspace.hr.ok) {
    const h = workspace.hr.data;
    if (h.openPositions > 0) {
      push({
        id: 'hr-open-roles',
        label: `HR: ${h.openPositions} open role${h.openPositions === 1 ? '' : 's'} · ${h.upcomingInterviewCount} interviews soon`,
        module: 'hr',
        href: ROUTES.RECRUITMENT_PIPELINE,
        priority: 'normal',
      });
    }
  }

  if (workspace.support.ok) {
    const s = workspace.support.data;
    if (s.openTickets > 0) {
      push({
        id: 'support-open',
        label: `Support: ${s.openTickets} open ticket${s.openTickets === 1 ? '' : 's'} · CSAT ${s.csatScore.toFixed(1)}`,
        module: 'support',
        href: ROUTES.SUPPORT,
        priority: 'high',
      });
    }
  }

  if (workspace.marketing.ok) {
    const m = workspace.marketing.data;
    const openPct = m.emailOpenRate > 1 ? m.emailOpenRate : m.emailOpenRate * 100;
    push({
      id: 'mkt-campaigns',
      label: `Marketing: ${m.activeCampaigns} campaigns · ${m.totalLeads} leads · ${Math.round(openPct)}% email open`,
      module: 'marketing',
      href: ROUTES.MARKETING_DASHBOARD,
      priority: 'normal',
    });
  }

  if (workspace.assets.ok) {
    const a = workspace.assets.data;
    if (a.warrantyExpiring > 0) {
      push({
        id: 'assets-warranty',
        label: `Assets: ${a.warrantyExpiring} item${a.warrantyExpiring === 1 ? '' : 's'} warranty expiring`,
        module: 'assets',
        href: ROUTES.ASSETS,
        priority: 'normal',
      });
    }
  }

  if (workspace.contracts.ok) {
    const c = workspace.contracts.data;
    if (c.expiringThisMonth > 0 || c.renewalsNeeded > 0) {
      push({
        id: 'contracts-renew',
        label: `Contracts: ${c.expiringThisMonth} expiring this month · ${c.renewalsNeeded} renewals needed`,
        module: 'contracts',
        href: ROUTES.CONTRACTS,
        priority: 'high',
      });
    }
  }

  if (workspace.okr.ok) {
    const o = workspace.okr.data;
    if (o.atRisk > 0 || o.behind > 0) {
      push({
        id: 'okr-at-risk',
        label: `OKRs: ${o.atRisk} at risk · ${o.behind} behind (${o.onTrack} on track)`,
        module: 'okr',
        href: ROUTES.OKR,
        priority: 'high',
      });
    }
  }

  if (workspace.chat.ok) {
    const ch = workspace.chat.data;
    push({
      id: 'chat-activity',
      label: `Chat: ${ch.messagesLast7Days} messages (7d) across ${ch.channelsJoined} channels`,
      module: 'chat',
      href: ROUTES.CHAT,
      priority: 'low',
    });
  }

  if (dto.growth.cultureHealth != null && dto.growth.cultureHealth < 70) {
    push({
      id: 'culture-health',
      label: `Culture health at ${dto.growth.cultureHealth.toFixed(0)} — check team sentiment`,
      module: 'culture',
      href: ROUTES.CULTURE,
      priority: 'normal',
    });
  }

  let fi = 0;
  while (out.length < MIN_TODOS && fi < FALLBACK_POOL.length) {
    const f = FALLBACK_POOL[fi];
    fi += 1;
    push({
      id: `habit-${fi}-${f.module}`,
      label: f.label,
      module: f.module,
      href: f.href,
      priority: f.priority,
    });
  }

  let extra = 0;
  while (out.length < MIN_TODOS) {
    extra += 1;
    push({
      id: `extra-${extra}`,
      label: `Weekly hygiene #${extra}: document one decision from today’s standup`,
      module: 'general',
      href: ROUTES.DASHBOARD,
      priority: 'low',
    });
  }

  return out;
}
