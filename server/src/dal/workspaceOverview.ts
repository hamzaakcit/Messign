/**
 * Non-sensitive aggregates for the home dashboard "workspace" strip.
 * Each module loads independently; failures are isolated per {@link WorkspaceResult}.
 */
import { query } from '../db/index.js';
import { getCanonicalChatUserId } from '../db/chatDb.js';
import type { CallerContext } from './types.js';
import * as dealsDal from '../modules/crm/dal/deals.js';
import * as recruitmentMetrics from '../modules/hr/dal/recruitment/metrics.js';
import * as supportMetrics from '../modules/support/dal/metrics.js';
import * as marketingMetrics from './marketing/metrics.js';
import * as assetsDal from './assets/assets.js';
import * as contractsDal from './contracts/contracts.js';
import * as okrsDal from './okrs.js';

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export type WorkspaceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface WorkspaceCrmSnapshot {
  dealsWon: number;
  dealsLost: number;
  winRate: number;
  avgCycleTimeDays: number;
}

export interface WorkspaceHrSnapshot {
  openPositions: number;
  activeApplicants: number;
  offerAcceptanceRate: number;
  avgTimeToHireDays: number;
  funnel: {
    applied: number;
    screening: number;
    interviewing: number;
    offer: number;
    hired: number;
  };
  upcomingInterviewCount: number;
}

export interface WorkspaceSupportSnapshot {
  openTickets: number;
  avgResolutionHours: number;
  csatScore: number;
  slaCompliancePercent: number;
  ticketTrend: { date: string; openCount: number; resolvedCount: number }[];
}

/** No spend/CAC — leads and engagement only. */
export interface WorkspaceMarketingSnapshot {
  activeCampaigns: number;
  totalLeads: number;
  contentPublished: number;
  emailOpenRate: number;
  monthlyLeadsTrend: { month: string; leads: number }[];
}

export interface WorkspaceAssetsSnapshot {
  totalAssets: number;
  assigned: number;
  available: number;
  warrantyExpiring: number;
}

/** Excludes total contract value (EUR). */
export interface WorkspaceContractsSnapshot {
  totalActive: number;
  expiringThisMonth: number;
  renewalsNeeded: number;
  complianceDue: number;
}

export interface WorkspaceOkrSnapshot {
  totalGoals: number;
  onTrack: number;
  atRisk: number;
  behind: number;
  completed: number;
  avgProgress: number;
}

export interface WorkspaceChatSnapshot {
  channelsJoined: number;
  messagesLast7Days: number;
  messagesByDay: { date: string; count: number }[];
}

export interface WorkspaceModuleSnapshots {
  crm: WorkspaceResult<WorkspaceCrmSnapshot>;
  hr: WorkspaceResult<WorkspaceHrSnapshot>;
  support: WorkspaceResult<WorkspaceSupportSnapshot>;
  marketing: WorkspaceResult<WorkspaceMarketingSnapshot>;
  assets: WorkspaceResult<WorkspaceAssetsSnapshot>;
  contracts: WorkspaceResult<WorkspaceContractsSnapshot>;
  okr: WorkspaceResult<WorkspaceOkrSnapshot>;
  chat: WorkspaceResult<WorkspaceChatSnapshot>;
}

async function safe<T>(label: string, fn: () => Promise<T>): Promise<WorkspaceResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    console.warn(`[workspaceOverview] ${label}:`, e instanceof Error ? e.message : e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function loadCrm(ctx: CallerContext): Promise<WorkspaceCrmSnapshot> {
  const m = await dealsDal.getSalesMetrics(ctx);
  return {
    dealsWon: m.dealsWon,
    dealsLost: m.dealsLost,
    winRate: m.winRate,
    avgCycleTimeDays: m.avgCycleTime,
  };
}

async function loadHr(ctx: CallerContext): Promise<WorkspaceHrSnapshot> {
  const raw = (await recruitmentMetrics.getDashboardMetrics(ctx)) as Record<string, unknown>;
  const pipeline = raw.pipelineByStage as
    | {
        applied?: number;
        screening?: number;
        interviewing?: number;
        offer?: number;
        hired?: number;
      }
    | undefined;
  const interviews = raw.upcomingInterviews as unknown[] | undefined;
  return {
    openPositions: num(raw.openPositions),
    activeApplicants: num(raw.activeApplicants),
    offerAcceptanceRate: num(raw.offerAcceptanceRate),
    avgTimeToHireDays: num(raw.avgTimeToHire),
    funnel: {
      applied: num(pipeline?.applied),
      screening: num(pipeline?.screening),
      interviewing: num(pipeline?.interviewing),
      offer: num(pipeline?.offer),
      hired: num(pipeline?.hired),
    },
    upcomingInterviewCount: Array.isArray(interviews) ? interviews.length : 0,
  };
}

async function loadSupport(ctx: CallerContext): Promise<WorkspaceSupportSnapshot> {
  const m = await supportMetrics.getSupportDashboardMetrics(ctx);
  return {
    openTickets: m.openTickets,
    avgResolutionHours: m.avgResolutionHours,
    csatScore: m.csatScore,
    slaCompliancePercent: m.slaCompliancePercent,
    ticketTrend: m.ticketTrend.map((t) => ({
      date: t.date,
      openCount: t.openCount,
      resolvedCount: t.resolvedCount,
    })),
  };
}

async function loadMarketing(ctx: CallerContext): Promise<WorkspaceMarketingSnapshot> {
  const m = await marketingMetrics.getDashboardMetrics(ctx);
  return {
    activeCampaigns: m.activeCampaigns,
    totalLeads: m.totalLeads,
    contentPublished: m.contentPublished,
    emailOpenRate: m.emailOpenRate,
    monthlyLeadsTrend: m.monthlyTrend.map((row) => ({ month: row.month, leads: row.leads })),
  };
}

async function loadAssets(ctx: CallerContext): Promise<WorkspaceAssetsSnapshot> {
  const m = await assetsDal.getAssetMetrics(ctx);
  return {
    totalAssets: m.totalAssets,
    assigned: m.assigned,
    available: m.available,
    warrantyExpiring: m.warrantyExpiring,
  };
}

async function loadContracts(ctx: CallerContext): Promise<WorkspaceContractsSnapshot> {
  const m = await contractsDal.getContractMetrics(ctx);
  return {
    totalActive: m.totalActive,
    expiringThisMonth: m.expiringThisMonth,
    renewalsNeeded: m.renewalsNeeded,
    complianceDue: m.complianceDue,
  };
}

async function loadOkr(ctx: CallerContext): Promise<WorkspaceOkrSnapshot> {
  const m = await okrsDal.getOKRMetrics(ctx);
  return {
    totalGoals: m.totalGoals,
    onTrack: m.onTrack,
    atRisk: m.atRisk,
    behind: m.behind,
    completed: m.completed,
    avgProgress: m.avgProgress,
  };
}

async function loadChat(ctx: CallerContext): Promise<WorkspaceChatSnapshot> {
  const chatUserId = await getCanonicalChatUserId(ctx.userId);
  const u1 = chatUserId ?? ctx.userId;
  const ids = await query<{ channel_id: string }>(
    `SELECT channel_id::text AS channel_id FROM channel_members WHERE user_id = $1 OR user_id = $2`,
    [u1, ctx.userId],
  );
  const channelIds = ids.rows.map((r) => r.channel_id);
  const channelsJoined = channelIds.length;
  if (channelsJoined === 0) {
    return { channelsJoined: 0, messagesLast7Days: 0, messagesByDay: [] };
  }
  const msgCount = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM messages
     WHERE channel_id = ANY($1::uuid[])
       AND created_at >= NOW() - INTERVAL '7 days'`,
    [channelIds],
  );
  const trend = await query<{ d: string; n: string }>(
    `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS d, COUNT(*)::text AS n
     FROM messages
     WHERE channel_id = ANY($1::uuid[])
       AND created_at >= NOW() - INTERVAL '7 days'
     GROUP BY 1 ORDER BY 1 ASC`,
    [channelIds],
  );
  return {
    channelsJoined,
    messagesLast7Days: num(msgCount.rows[0]?.c),
    messagesByDay: trend.rows.map((row) => ({
      date: String(row.d),
      count: num(row.n),
    })),
  };
}

/**
 * Loads all workspace module snapshots in parallel with isolated error handling.
 * When `organizationId` is missing, tenant-scoped modules return `ok: false`.
 */
/** For tests and tooling that build a partial {@link CommandCenterDTO}. */
export function emptyWorkspaceSnapshots(): WorkspaceModuleSnapshots {
  const err = 'stub';
  return {
    crm: { ok: false, error: err },
    hr: { ok: false, error: err },
    support: { ok: false, error: err },
    marketing: { ok: false, error: err },
    assets: { ok: false, error: err },
    contracts: { ok: false, error: err },
    okr: { ok: false, error: err },
    chat: { ok: false, error: err },
  };
}

export async function gatherWorkspaceModules(ctx: CallerContext): Promise<WorkspaceModuleSnapshots> {
  if (!ctx.organizationId) {
    const err = 'Missing organization context';
    return {
      crm: { ok: false, error: err },
      hr: { ok: false, error: err },
      support: { ok: false, error: err },
      marketing: { ok: false, error: err },
      assets: { ok: false, error: err },
      contracts: { ok: false, error: err },
      okr: { ok: false, error: err },
      chat: { ok: false, error: err },
    };
  }

  const [
    crm,
    hr,
    support,
    marketing,
    assets,
    contracts,
    okr,
    chat,
  ] = await Promise.all([
    safe('crm', () => loadCrm(ctx)),
    safe('hr', () => loadHr(ctx)),
    safe('support', () => loadSupport(ctx)),
    safe('marketing', () => loadMarketing(ctx)),
    safe('assets', () => loadAssets(ctx)),
    safe('contracts', () => loadContracts(ctx)),
    safe('okr', () => loadOkr(ctx)),
    safe('chat', () => loadChat(ctx)),
  ]);

  return { crm, hr, support, marketing, assets, contracts, okr, chat };
}
