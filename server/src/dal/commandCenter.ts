import type { PoolClient } from 'pg';
import { query } from '../db/index.js';
import { withTenantQuery } from '../middleware/tenantContext.js';
import type { CallerContext } from './types.js';
import { isUuidString, reimbursementUsersPk } from './reimbursementUsersPk.js';
import {
  getCultureMetrics,
  getOKRMetrics,
  getProjectMetrics,
} from './executive/dashboard.js';
import { gatherWorkspaceModules, type WorkspaceModuleSnapshots } from './workspaceOverview.js';

export type { WorkspaceModuleSnapshots } from './workspaceOverview.js';

async function getCultureMetricsSafe(
  ctx: CallerContext,
): Promise<Awaited<ReturnType<typeof getCultureMetrics>> | null> {
  try {
    return await getCultureMetrics(ctx);
  } catch (e) {
    console.warn('[commandCenter] getCultureMetrics skipped:', e instanceof Error ? e.message : e);
    return null;
  }
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function requireOrganizationId(ctx: CallerContext): string {
  if (!ctx.organizationId) {
    throw new Error('Missing organization context');
  }
  return ctx.organizationId;
}

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

/** Public contract for GET /api/dashboard/command-center */
export interface CommandCenterPulse {
  activeProjects: number;
  tasksCompletedThisWeek: number;
  blockedTasks: number;
  avgSprintVelocity: number;
  velocityDeltaPct: number | null;
  velocityTrend: { date: string; count: number }[];
  blockers: { id: string; title: string; projectName: string | null }[];
}

export interface CommandCenterBrain {
  todayFocus: string | null;
  doraUnreadCount: number;
  knowledgeRecent: { id: string; title: string; slug: string; updatedAt: string }[];
  publishedDocCount: number;
}

export interface CommandCenterGrowth {
  leaderboard: { rank: number; userId: string; name: string; xp: number; avatar: string | null }[];
  myRank: number | null;
  myXp: number;
  vibeScore: number | null;
  engagementTrend: string;
  cultureHealth: number | null;
  xpRadar: { label: string; value: number }[];
}

export interface CommandCenterFuture {
  okrs: {
    overallProgress: number;
    onTrack: number;
    atRisk: number;
    behind: number;
  };
  milestones: { title: string; dueDate: string | null }[];
  sandboxIdeas: { id: string; title: string; createdAt: string }[];
}

export interface CommandCenterDTO {
  generatedAt: string;
  pulse: CommandCenterPulse;
  brain: CommandCenterBrain;
  growth: CommandCenterGrowth;
  future: CommandCenterFuture;
  /** Dense cross-module rollup (non-sensitive aggregates). */
  workspace: WorkspaceModuleSnapshots;
}

async function getBriefingSummaryForUser(ctx: CallerContext): Promise<string | null> {
  const ruId = reimbursementUsersPk(ctx);
  try {
    const r = await query<{ summary: string | null }>(
      `SELECT payload->>'summary' AS summary
       FROM daily_briefings
       WHERE user_id = $1::uuid
         AND briefing_date = CURRENT_DATE
       LIMIT 1`,
      [ruId],
    );
    const s = r.rows[0]?.summary;
    return s && s.length > 0 ? s : null;
  } catch {
    return null;
  }
}

async function getDoraUnreadTotal(ctx: CallerContext): Promise<number> {
  const tenantId = requireOrganizationId(ctx);
  const uid = reimbursementUsersPk(ctx);
  if (!isUuidString(uid)) {
    return 0;
  }
  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT COUNT(*)::int AS c
       FROM dora_insights
       WHERE is_read = FALSE
         AND (
           target_user_id = $1::uuid
           OR target_user_id IS NULL
         )`,
      [uid],
    );
    return num(result.rows[0]?.c);
  });
}

async function getPulseExtras(
  ctx: CallerContext,
): Promise<Pick<CommandCenterPulse, 'velocityDeltaPct' | 'velocityTrend' | 'blockers'>> {
  const tenantId = requireOrganizationId(ctx);

  return runInTenant(tenantId, async (client) => {
    const [trend, prevWeek, blockers] = await Promise.all([
      client.query<{ d: string; n: string }>(
        `SELECT
           to_char(date_trunc('day', t.completed_at), 'YYYY-MM-DD') AS d,
           COUNT(*)::text AS n
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         WHERE t.status IN ('completed', 'done')
           AND t.completed_at IS NOT NULL
           AND t.completed_at >= NOW() - INTERVAL '14 days'
         GROUP BY 1
         ORDER BY 1 ASC`,
      ),
      client.query<{ cur: string; prev: string }>(
        `SELECT
           COUNT(*) FILTER (
             WHERE t.completed_at >= date_trunc('week', NOW())
               AND t.completed_at < date_trunc('week', NOW()) + INTERVAL '7 days'
           )::text AS cur,
           COUNT(*) FILTER (
             WHERE t.completed_at >= date_trunc('week', NOW()) - INTERVAL '7 days'
               AND t.completed_at < date_trunc('week', NOW())
           )::text AS prev
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         WHERE t.status IN ('completed', 'done')`,
      ),
      client.query<{ id: string; title: string; project_name: string | null }>(
        `SELECT t.id::text, t.title, p.name AS project_name
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         WHERE t.status = 'blocked'
         ORDER BY t.created_at DESC NULLS LAST
         LIMIT 12`,
      ),
    ]);

    const cur = num(prevWeek.rows[0]?.cur);
    const prev = num(prevWeek.rows[0]?.prev);
    let velocityDeltaPct: number | null = null;
    if (prev > 0) velocityDeltaPct = Math.round(((cur - prev) / prev) * 1000) / 10;
    else if (cur > 0 && prev === 0) velocityDeltaPct = 100;

    const velocityTrend = trend.rows.map((row) => ({
      date: String(row.d),
      count: num(row.n),
    }));

    const blockersList = blockers.rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      projectName: row.project_name ? String(row.project_name) : null,
    }));

    return { velocityDeltaPct, velocityTrend, blockers: blockersList };
  });
}

async function getKnowledgeBrain(ctx: CallerContext): Promise<{
  knowledgeRecent: CommandCenterBrain['knowledgeRecent'];
  publishedDocCount: number;
}> {
  const tenantId = requireOrganizationId(ctx);

  return runInTenant(tenantId, async (client) => {
    const [recent, countRow] = await Promise.all([
      client.query<{ id: string; title: string; slug: string; updated_at: string }>(
        `SELECT id::text, title, slug, updated_at::text
         FROM knowledge_documents
         WHERE status = 'published'
         ORDER BY updated_at DESC
         LIMIT 8`,
      ),
      client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM knowledge_documents WHERE status = 'published'`,
      ),
    ]);

    return {
      knowledgeRecent: recent.rows.map((r) => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        updatedAt: r.updated_at,
      })),
      publishedDocCount: num(countRow.rows[0]?.c),
    };
  });
}

async function getGrowthLeaderboard(ctx: CallerContext): Promise<{
  leaderboard: CommandCenterGrowth['leaderboard'];
  myRank: number | null;
  myXp: number;
  xpRadar: CommandCenterGrowth['xpRadar'];
}> {
  const tenantId = requireOrganizationId(ctx);
  const ruId = reimbursementUsersPk(ctx);

  return runInTenant(tenantId, async (client) => {
    const top = await client.query<{ id: string; full_name: string; avatar: string | null; xp: string }>(
      `SELECT id::text, full_name, avatar, xp::text
       FROM reimbursement_users
       WHERE organization_id = $1::uuid
       ORDER BY xp DESC NULLS LAST
       LIMIT 10`,
      [tenantId],
    );

    const leaderboard = top.rows.map((row, index) => ({
      rank: index + 1,
      userId: String(row.id),
      name: String(row.full_name ?? 'User'),
      xp: num(row.xp),
      avatar: row.avatar,
    }));

    let myXp = 0;
    let myRank: number | null = null;
    if (isUuidString(ruId)) {
      const me = await client.query<{ xp: string; rk: string }>(
        `WITH ranked AS (
           SELECT id, xp, RANK() OVER (ORDER BY xp DESC NULLS LAST) AS rk
           FROM reimbursement_users
           WHERE organization_id = $1::uuid
         )
         SELECT xp::text, rk::text FROM ranked WHERE id = $2::uuid`,
        [tenantId, ruId],
      );
      myXp = num(me.rows[0]?.xp);
      myRank = me.rows[0]?.rk ? num(me.rows[0].rk) : null;
    }

    const top5 = leaderboard.slice(0, 5);
    const maxXp = Math.max(1, ...top5.map((e) => e.xp));
    const xpRadar = top5.map((e) => ({
      label: e.name.split(' ')[0] ?? e.name,
      value: Math.round((e.xp / maxXp) * 100),
    }));

    return { leaderboard, myRank, myXp, xpRadar };
  });
}

const DEFAULT_OKR_BLOCK: CommandCenterFuture['okrs'] = {
  overallProgress: 0,
  onTrack: 0,
  atRisk: 0,
  behind: 0,
};

const DEFAULT_PULSE_EXTRAS: Pick<CommandCenterPulse, 'velocityDeltaPct' | 'velocityTrend' | 'blockers'> = {
  velocityDeltaPct: null,
  velocityTrend: [],
  blockers: [],
};

type ProjectMetricsSlice = Pick<
  CommandCenterPulse,
  'activeProjects' | 'tasksCompletedThisWeek' | 'blockedTasks' | 'avgSprintVelocity'
>;

const DEFAULT_PROJECT_METRICS: ProjectMetricsSlice = {
  activeProjects: 0,
  tasksCompletedThisWeek: 0,
  blockedTasks: 0,
  avgSprintVelocity: 0,
};

const EMPTY_PULSE: CommandCenterPulse = {
  ...DEFAULT_PROJECT_METRICS,
  ...DEFAULT_PULSE_EXTRAS,
};

const EMPTY_BRAIN: CommandCenterBrain = {
  todayFocus: null,
  doraUnreadCount: 0,
  knowledgeRecent: [],
  publishedDocCount: 0,
};

const EMPTY_GROWTH: CommandCenterGrowth = {
  leaderboard: [],
  myRank: null,
  myXp: 0,
  vibeScore: null,
  engagementTrend: 'stable',
  cultureHealth: null,
  xpRadar: [],
};

const EMPTY_KNOWLEDGE = { knowledgeRecent: EMPTY_BRAIN.knowledgeRecent, publishedDocCount: 0 };

const EMPTY_GROWTH_LB = {
  leaderboard: EMPTY_GROWTH.leaderboard,
  myRank: null as number | null,
  myXp: 0,
  xpRadar: EMPTY_GROWTH.xpRadar,
};

async function safeCore<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.warn(`[commandCenter] ${label} skipped:`, e instanceof Error ? e.message : e);
    return fallback;
  }
}

async function getFutureMilestones(ctx: CallerContext): Promise<CommandCenterFuture['milestones']> {
  const tenantId = requireOrganizationId(ctx);

  return runInTenant(tenantId, async (client) => {
    const r = await client.query<{ title: string; end_date: string | null }>(
      `SELECT g.title, p.end_date::text
       FROM okr_goals g
       JOIN okr_periods p ON p.id = g.period_id
       WHERE (g.is_archived IS NULL OR g.is_archived = FALSE)
         AND p.end_date >= CURRENT_DATE
       ORDER BY p.end_date ASC
       LIMIT 8`,
    );
    return r.rows.map((row) => ({
      title: String(row.title),
      dueDate: row.end_date,
    }));
  });
}

/**
 * Aggregates tenant-safe metrics for the home Command Center dashboard.
 * Core loaders are isolated: one failing query does not fail the entire payload.
 */
export async function getCommandCenterData(ctx: CallerContext): Promise<CommandCenterDTO> {
  const generatedAt = new Date().toISOString();

  if (!ctx.organizationId) {
    const workspace = await gatherWorkspaceModules(ctx);
    return {
      generatedAt,
      pulse: { ...EMPTY_PULSE },
      brain: { ...EMPTY_BRAIN },
      growth: { ...EMPTY_GROWTH },
      future: { okrs: { ...DEFAULT_OKR_BLOCK }, milestones: [], sandboxIdeas: [] },
      workspace,
    };
  }

  const [
    projects,
    okrs,
    culture,
    briefingSummary,
    pulseExtras,
    knowledgeBrain,
    growthLb,
    doraUnread,
    milestones,
    workspace,
  ] = await Promise.all([
    safeCore('projects', DEFAULT_PROJECT_METRICS, () => getProjectMetrics(ctx)),
    safeCore('okrs', DEFAULT_OKR_BLOCK, () => getOKRMetrics(ctx)),
    getCultureMetricsSafe(ctx),
    getBriefingSummaryForUser(ctx),
    safeCore('pulse_extras', DEFAULT_PULSE_EXTRAS, () => getPulseExtras(ctx)),
    safeCore('knowledge', EMPTY_KNOWLEDGE, () => getKnowledgeBrain(ctx)),
    safeCore('growth_leaderboard', EMPTY_GROWTH_LB, () => getGrowthLeaderboard(ctx)),
    safeCore('dora_unread', 0, () => getDoraUnreadTotal(ctx)),
    safeCore('milestones', [], () => getFutureMilestones(ctx)),
    gatherWorkspaceModules(ctx),
  ]);

  return {
    generatedAt,
    pulse: {
      ...projects,
      velocityDeltaPct: pulseExtras.velocityDeltaPct,
      velocityTrend: pulseExtras.velocityTrend,
      blockers: pulseExtras.blockers,
    },
    brain: {
      todayFocus: briefingSummary,
      doraUnreadCount: doraUnread,
      knowledgeRecent: knowledgeBrain.knowledgeRecent,
      publishedDocCount: knowledgeBrain.publishedDocCount,
    },
    growth: {
      leaderboard: growthLb.leaderboard,
      myRank: growthLb.myRank,
      myXp: growthLb.myXp,
      vibeScore: culture?.sentimentAvg ?? null,
      engagementTrend: culture?.engagementTrend ?? 'stable',
      cultureHealth: culture?.healthScore ?? null,
      xpRadar: growthLb.xpRadar,
    },
    future: {
      okrs,
      milestones,
      sandboxIdeas: [],
    },
    workspace,
  };
}
