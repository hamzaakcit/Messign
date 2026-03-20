import crypto from 'crypto';
import { query } from '../../db/index.js';
import type { CallerContext } from '../../dal/types.js';

export interface DailyBriefing {
  id: string;
  userId: string;
  date: string;
  greeting: string;
  summary: string;
  sections: BriefingSection[];
  generatedAt: string;
}

export interface BriefingSection {
  module: string;
  icon: string;
  title: string;
  items: BriefingItem[];
  priority: 'high' | 'medium' | 'low';
}

export interface BriefingItem {
  text: string;
  actionUrl?: string;
  actionLabel?: string;
  severity?: 'info' | 'warning' | 'critical' | 'success';
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

function hasRole(ctx: CallerContext, roles: string[]): boolean {
  return roles.includes(String(ctx.role));
}

function today(): string {
  return new Date().toISOString().split('T')[0] as string;
}

export async function getOrGenerateBriefing(ctx: CallerContext, date = today()): Promise<DailyBriefing> {
  const cached = await getCachedBriefing(ctx.userId, date);
  if (cached) return cached;
  return generateBriefing(ctx, date);
}

export async function getBriefingByDate(ctx: CallerContext, date: string): Promise<DailyBriefing | null> {
  return getCachedBriefing(ctx.userId, date);
}

export async function generateBriefing(ctx: CallerContext, targetDate = today()): Promise<DailyBriefing> {
  const sections: BriefingSection[] = [];

  const pendingActions = await getPendingActionsForUser(ctx);
  if (pendingActions.length > 0) {
    sections.push({
      module: 'actions',
      icon: '⚡',
      title: 'Needs Your Attention',
      items: pendingActions,
      priority: 'high',
    });
  }

  if (hasRole(ctx, ['manager', 'dept_head', 'system_admin', 'admin']) || await userHasDeals(ctx)) {
    const salesItems = await getSalesBriefingItems(ctx);
    if (salesItems.length > 0) {
      sections.push({ module: 'sales', icon: '📈', title: 'Sales Pipeline', items: salesItems, priority: 'medium' });
    }
  }

  if (hasRole(ctx, ['manager', 'dept_head', 'system_admin', 'admin']) || await userHasTickets(ctx)) {
    const supportItems = await getSupportBriefingItems(ctx);
    if (supportItems.length > 0) {
      sections.push({ module: 'support', icon: '🎧', title: 'Support Queue', items: supportItems, priority: 'medium' });
    }
  }

  if (hasRole(ctx, ['manager', 'dept_head', 'finance_admin', 'system_admin', 'finance', 'admin'])) {
    const financeItems = await getFinanceBriefingItems(ctx);
    if (financeItems.length > 0) {
      sections.push({ module: 'finance', icon: '💰', title: 'Finance', items: financeItems, priority: 'medium' });
    }
  }

  const projectItems = await getProjectBriefingItems(ctx);
  if (projectItems.length > 0) {
    sections.push({ module: 'projects', icon: '📋', title: 'Your Tasks', items: projectItems, priority: 'medium' });
  }

  const okrItems = await getOKRBriefingItems(ctx);
  if (okrItems.length > 0) {
    sections.push({ module: 'okr', icon: '🎯', title: 'Goals & OKRs', items: okrItems, priority: 'low' });
  }

  const recruitItems = await getRecruitmentBriefingItems(ctx);
  if (recruitItems.length > 0) {
    sections.push({ module: 'recruitment', icon: '👥', title: 'Hiring', items: recruitItems, priority: 'low' });
  }

  const timeItems = await getTimeBriefingItems(ctx);
  if (timeItems.length > 0) {
    sections.push({ module: 'time', icon: '⏱', title: 'Time Tracking', items: timeItems, priority: 'low' });
  }

  const insightItems = await getInsightBriefingItems(ctx);
  if (insightItems.length > 0) {
    sections.push({ module: 'dora', icon: '✦', title: 'Dora Insights', items: insightItems, priority: 'high' });
  }

  sections.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  const summary = await generateAISummary(ctx, sections);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const briefing: DailyBriefing = {
    id: crypto.randomUUID(),
    userId: ctx.userId,
    date: targetDate,
    greeting: `${greeting}, ${await getUserFirstName(ctx)}`,
    summary,
    sections,
    generatedAt: new Date().toISOString(),
  };

  await cacheBriefing(briefing);
  return briefing;
}

async function getCachedBriefing(userId: string, date: string): Promise<DailyBriefing | null> {
  try {
    const result = await query<{ payload: DailyBriefing }>(
      `SELECT payload
       FROM daily_briefings
       WHERE user_id = $1::uuid
         AND briefing_date = $2::date
       LIMIT 1`,
      [userId, date],
    );
    return (result.rows[0]?.payload as DailyBriefing | undefined) ?? null;
  } catch {
    return null;
  }
}

async function getPendingActionsForUser(ctx: CallerContext): Promise<BriefingItem[]> {
  const items: BriefingItem[] = [];
  const managerLike = hasRole(ctx, ['manager', 'dept_head', 'system_admin', 'admin', 'finance']);

  if (managerLike) {
    const [expenseApprovals, timesheetApprovals] = await Promise.all([
      query(
        `SELECT COUNT(*)::int AS c
         FROM approval_steps
         WHERE status = 'pending'
           AND (assigned_to = $1::uuid OR assigned_to IS NULL)`,
        [ctx.userId],
      ),
      query(
        `SELECT COUNT(*)::int AS c
         FROM time_timesheets
         WHERE status = 'submitted'
           AND ($1::uuid IS NULL OR organization_id = $1::uuid)`,
        [ctx.organizationId ?? null],
      ),
    ]);
    const expenseCount = Number(expenseApprovals.rows[0]?.c ?? 0);
    const timesheetCount = Number(timesheetApprovals.rows[0]?.c ?? 0);
    if (expenseCount > 0) items.push({ text: `${expenseCount} expense approvals are waiting`, actionUrl: '/finance/expenses', actionLabel: 'Review', severity: 'warning' });
    if (timesheetCount > 0) items.push({ text: `${timesheetCount} timesheets need approval`, actionUrl: '/time', actionLabel: 'Review', severity: 'warning' });
  }

  if (hasRole(ctx, ['finance_admin', 'finance', 'admin', 'system_admin'])) {
    const overdue = await query(
      `SELECT COUNT(*)::int AS c, COALESCE(SUM(grand_total), 0)::numeric AS total
       FROM invoices
       WHERE status = 'overdue'
         AND ($1::uuid IS NULL OR organization_id = $1::uuid)
         AND (is_deleted IS NULL OR is_deleted = FALSE)`,
      [ctx.organizationId ?? null],
    );
    const c = Number(overdue.rows[0]?.c ?? 0);
    if (c > 0) {
      items.push({
        text: `${c} overdue invoices (€${Number(overdue.rows[0]?.total ?? 0).toFixed(0)})`,
        actionUrl: '/finance/invoices',
        actionLabel: 'View',
        severity: 'critical',
      });
    }
  }

  const slaBreaches = await query(
    `SELECT COUNT(*)::int AS c
     FROM support_tickets
     WHERE assignee_id = $1::uuid
       AND status NOT IN ('resolved', 'closed')
       AND sla_resolution_due IS NOT NULL
       AND sla_resolution_due < NOW()`,
    [ctx.userId],
  );
  const breached = Number(slaBreaches.rows[0]?.c ?? 0);
  if (breached > 0) {
    items.push({ text: `${breached} assigned tickets breached SLA`, actionUrl: '/support', actionLabel: 'Open', severity: 'critical' });
  }

  const hitl = await query(
    `SELECT COUNT(*)::int AS c
     FROM pending_actions
     WHERE user_id = $1::uuid
       AND status = 'pending'`,
    [ctx.userId],
  );
  const hitlCount = Number(hitl.rows[0]?.c ?? 0);
  if (hitlCount > 0) {
    items.push({ text: `${hitlCount} Dora actions are awaiting confirmation`, actionUrl: '/dora', actionLabel: 'Review', severity: 'info' });
  }

  return items.slice(0, 5);
}

async function getSalesBriefingItems(ctx: CallerContext): Promise<BriefingItem[]> {
  const [staleDeals, closingDeals, routedLeads] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS c
       FROM crm_deals d
       JOIN crm_deal_stages s ON s.id = d.stage_id
       WHERE d.owner_id = $1::uuid
         AND NOT s.is_won AND NOT s.is_lost
         AND d.updated_at < NOW() - INTERVAL '7 days'`,
      [ctx.userId],
    ),
    query(
      `SELECT COUNT(*)::int AS c
       FROM crm_deals d
       JOIN crm_deal_stages s ON s.id = d.stage_id
       WHERE d.owner_id = $1::uuid
         AND NOT s.is_won AND NOT s.is_lost
         AND d.expected_close_date <= CURRENT_DATE + INTERVAL '7 days'`,
      [ctx.userId],
    ),
    query(
      `SELECT COUNT(*)::int AS c
       FROM marketing_leads l
       INNER JOIN marketing_campaigns mc ON mc.id = l.campaign_id
       WHERE mc.owner_id = $1::uuid
         AND l.created_at >= NOW() - INTERVAL '7 days'`,
      [ctx.userId],
    ),
  ]);

  const items: BriefingItem[] = [];
  const stale = Number(staleDeals.rows[0]?.c ?? 0);
  const closing = Number(closingDeals.rows[0]?.c ?? 0);
  const leads = Number(routedLeads.rows[0]?.c ?? 0);
  if (stale > 0) items.push({ text: `${stale} deals need follow-up (7+ days inactive)`, actionUrl: '/crm', actionLabel: 'Follow up', severity: 'warning' });
  if (closing > 0) items.push({ text: `${closing} deals are projected to close this week`, actionUrl: '/crm/forecast', actionLabel: 'Review', severity: 'info' });
  if (leads > 0) items.push({ text: `${leads} new leads were routed from marketing`, actionUrl: '/crm/contacts', actionLabel: 'Open', severity: 'success' });
  return items.slice(0, 4);
}

async function getSupportBriefingItems(ctx: CallerContext): Promise<BriefingItem[]> {
  const [assigned, atRisk, csatTrend] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS c
       FROM support_tickets
       WHERE assignee_id = $1::uuid
         AND status NOT IN ('resolved', 'closed')`,
      [ctx.userId],
    ),
    query(
      `SELECT COUNT(*)::int AS c
       FROM support_tickets
       WHERE assignee_id = $1::uuid
         AND status NOT IN ('resolved', 'closed')
         AND sla_resolution_due IS NOT NULL
         AND sla_resolution_due <= NOW() + INTERVAL '4 hours'`,
      [ctx.userId],
    ),
    query(
      `WITH this_week AS (
         SELECT AVG(r.rating)::numeric AS score
         FROM support_csat_ratings r
         JOIN support_tickets t ON t.id = r.ticket_id
         WHERE t.assignee_id = $1::uuid
           AND r.created_at >= NOW() - INTERVAL '7 days'
       ),
       prev_week AS (
         SELECT AVG(r.rating)::numeric AS score
         FROM support_csat_ratings r
         JOIN support_tickets t ON t.id = r.ticket_id
         WHERE t.assignee_id = $1::uuid
           AND r.created_at >= NOW() - INTERVAL '14 days'
           AND r.created_at < NOW() - INTERVAL '7 days'
       )
       SELECT COALESCE((SELECT score FROM this_week), 0)::numeric AS current_score,
              COALESCE((SELECT score FROM prev_week), 0)::numeric AS prev_score`,
      [ctx.userId],
    ),
  ]);

  const items: BriefingItem[] = [];
  const assignedCount = Number(assigned.rows[0]?.c ?? 0);
  const riskCount = Number(atRisk.rows[0]?.c ?? 0);
  const current = Number(csatTrend.rows[0]?.current_score ?? 0);
  const prev = Number(csatTrend.rows[0]?.prev_score ?? 0);
  if (assignedCount > 0) items.push({ text: `${assignedCount} tickets currently assigned to you`, actionUrl: '/support', actionLabel: 'Open queue', severity: 'info' });
  if (riskCount > 0) items.push({ text: `${riskCount} tickets are SLA at-risk/breached`, actionUrl: '/support/sla', actionLabel: 'Act now', severity: 'critical' });
  if (current > 0) items.push({ text: `CSAT trend is ${current >= prev ? 'up' : 'down'} (${current.toFixed(1)} vs ${prev.toFixed(1)})`, actionUrl: '/support/dashboard', actionLabel: 'View trend', severity: current >= prev ? 'success' : 'warning' });
  return items.slice(0, 4);
}

async function getFinanceBriefingItems(ctx: CallerContext): Promise<BriefingItem[]> {
  const [pendingApprovals, overdueInvoices, budgetWarnings] = await Promise.all([
    query(`SELECT COUNT(*)::int AS c FROM mv_approval_pipeline`),
    query(
      `SELECT COUNT(*)::int AS c, COALESCE(SUM(grand_total), 0)::numeric AS total
       FROM invoices
       WHERE status = 'overdue'
         AND ($1::uuid IS NULL OR organization_id = $1::uuid)
         AND (is_deleted IS NULL OR is_deleted = FALSE)`,
      [ctx.organizationId ?? null],
    ),
    query(
      `SELECT COUNT(*)::int AS c
       FROM mv_budget_health
       WHERE health_status IN ('warning', 'critical')`,
    ),
  ]);

  const items: BriefingItem[] = [];
  const p = Number(pendingApprovals.rows[0]?.c ?? 0);
  const o = Number(overdueInvoices.rows[0]?.c ?? 0);
  const b = Number(budgetWarnings.rows[0]?.c ?? 0);
  if (p > 0) items.push({ text: `${p} approvals are pending in the pipeline`, actionUrl: '/finance/expenses', actionLabel: 'Review', severity: 'warning' });
  if (o > 0) items.push({ text: `${o} overdue invoices (€${Number(overdueInvoices.rows[0]?.total ?? 0).toFixed(0)})`, actionUrl: '/finance/invoices', actionLabel: 'View', severity: 'critical' });
  if (b > 0) items.push({ text: `${b} budgets are nearing or past threshold`, actionUrl: '/finance/budgets', actionLabel: 'Inspect', severity: 'warning' });
  return items.slice(0, 4);
}

async function getProjectBriefingItems(ctx: CallerContext): Promise<BriefingItem[]> {
  const [dueToday, overdue, sprint] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS c
       FROM tasks t
       WHERE EXISTS (
         SELECT 1
         FROM jsonb_array_elements_text(t.assignees) a
         WHERE a = $1
       )
       AND t.status NOT IN ('done', 'completed')
       AND t.due_date = CURRENT_DATE`,
      [ctx.userId],
    ),
    query(
      `SELECT COUNT(*)::int AS c
       FROM tasks t
       WHERE EXISTS (
         SELECT 1
         FROM jsonb_array_elements_text(t.assignees) a
         WHERE a = $1
       )
       AND t.status NOT IN ('done', 'completed')
       AND t.due_date < CURRENT_DATE`,
      [ctx.userId],
    ),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('done', 'completed'))::int AS completed,
         COUNT(*)::int AS total
       FROM tasks t
       WHERE EXISTS (
         SELECT 1
         FROM jsonb_array_elements_text(t.assignees) a
         WHERE a = $1
       )`,
      [ctx.userId],
    ),
  ]);

  const items: BriefingItem[] = [];
  const due = Number(dueToday.rows[0]?.c ?? 0);
  const over = Number(overdue.rows[0]?.c ?? 0);
  const completed = Number(sprint.rows[0]?.completed ?? 0);
  const total = Number(sprint.rows[0]?.total ?? 0);
  if (due > 0) items.push({ text: `${due} tasks are due today`, actionUrl: '/projects', actionLabel: 'Open tasks', severity: 'warning' });
  if (over > 0) items.push({ text: `${over} tasks are overdue`, actionUrl: '/projects', actionLabel: 'Prioritize', severity: 'critical' });
  if (total > 0) items.push({ text: `Your completion progress is ${Math.round((completed / total) * 100)}% (${completed}/${total})`, actionUrl: '/projects', actionLabel: 'Track', severity: 'info' });
  return items.slice(0, 4);
}

async function getOKRBriefingItems(ctx: CallerContext): Promise<BriefingItem[]> {
  const [atRisk, dueCheckins] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS c
       FROM okr_goals
       WHERE owner_id = $1::uuid
         AND status IN ('at_risk', 'behind', 'off_track')
         AND is_archived = FALSE`,
      [ctx.userId],
    ),
    query(
      `SELECT COUNT(*)::int AS c
       FROM okr_key_results
       WHERE owner_id = $1::uuid
         AND (last_check_in_at IS NULL OR last_check_in_at < NOW() - INTERVAL '14 days')`,
      [ctx.userId],
    ),
  ]);
  const items: BriefingItem[] = [];
  const risk = Number(atRisk.rows[0]?.c ?? 0);
  const due = Number(dueCheckins.rows[0]?.c ?? 0);
  if (risk > 0) items.push({ text: `${risk} goals are currently at risk/behind`, actionUrl: '/okr', actionLabel: 'Update', severity: 'warning' });
  if (due > 0) items.push({ text: `${due} key results need a check-in`, actionUrl: '/okr', actionLabel: 'Check in', severity: 'info' });
  return items.slice(0, 3);
}

async function getRecruitmentBriefingItems(ctx: CallerContext): Promise<BriefingItem[]> {
  const interviews = await query(
    `SELECT COUNT(*)::int AS c
     FROM recruitment_interviews
     WHERE interviewer_id = $1::uuid
       AND scheduled_at >= date_trunc('day', NOW())
       AND scheduled_at < date_trunc('day', NOW()) + INTERVAL '2 days'
       AND status IN ('scheduled', 'confirmed')`,
    [ctx.userId],
  );
  const highMatches = await query(
    `SELECT COUNT(*)::int AS c
     FROM recruitment_applications
     WHERE match_score >= 80
       AND stage IN ('applied', 'screening')
       AND created_at >= NOW() - INTERVAL '7 days'`,
  );
  const items: BriefingItem[] = [];
  const i = Number(interviews.rows[0]?.c ?? 0);
  const m = Number(highMatches.rows[0]?.c ?? 0);
  if (i > 0) items.push({ text: `${i} interviews are scheduled for today/tomorrow`, actionUrl: '/recruitment/interviews', actionLabel: 'Prepare', severity: 'info' });
  if (m > 0 && hasRole(ctx, ['manager', 'dept_head', 'admin', 'system_admin'])) {
    items.push({ text: `${m} new high-match applications are waiting review`, actionUrl: '/recruitment/pipeline', actionLabel: 'Review', severity: 'success' });
  }
  return items.slice(0, 3);
}

async function getTimeBriefingItems(ctx: CallerContext): Promise<BriefingItem[]> {
  const [weekHours, pendingTimesheet] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(hours), 0)::numeric AS total
       FROM time_entries
       WHERE user_id = $1::uuid
         AND date >= date_trunc('week', CURRENT_DATE)::date`,
      [ctx.userId],
    ),
    query(
      `SELECT COUNT(*)::int AS c
       FROM time_timesheets
       WHERE user_id = $1::uuid
         AND status IN ('draft', 'rejected')
         AND week_start_date >= date_trunc('week', CURRENT_DATE)::date - INTERVAL '7 days'`,
      [ctx.userId],
    ),
  ]);
  const total = Number(weekHours.rows[0]?.total ?? 0);
  const pending = Number(pendingTimesheet.rows[0]?.c ?? 0);
  const items: BriefingItem[] = [];
  items.push({ text: `You have logged ${total.toFixed(1)} hours this week`, actionUrl: '/time', actionLabel: 'Open time', severity: total >= 40 ? 'success' : 'info' });
  if (pending > 0) items.push({ text: `${pending} timesheet(s) still need submission/rework`, actionUrl: '/time/timesheets', actionLabel: 'Submit', severity: 'warning' });
  return items.slice(0, 3);
}

async function getInsightBriefingItems(ctx: CallerContext): Promise<BriefingItem[]> {
  const result = await query(
    `SELECT title, message, action_url, action_label, severity
     FROM dora_insights
     WHERE is_read = FALSE
       AND severity IN ('critical', 'warning')
       AND (
         target_user_id = $1::uuid
         OR target_user_id IS NULL
       )
       AND ($2::uuid IS NULL OR organization_id = $2::uuid)
     ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END, created_at DESC
     LIMIT 5`,
    [ctx.userId, ctx.organizationId ?? null],
  );
  return result.rows.map((r) => ({
    text: `${String(r.title)}: ${String(r.message)}`,
    actionUrl: (r.action_url as string | null) ?? '/dora',
    actionLabel: (r.action_label as string | null) ?? 'View',
    severity: String(r.severity) as BriefingItem['severity'],
  }));
}

async function generateAISummary(_ctx: CallerContext, sections: BriefingSection[]): Promise<string> {
  const actionCount = sections.find((s) => s.module === 'actions')?.items.length || 0;
  const criticalCount = sections
    .filter((s) => s.priority === 'high')
    .reduce((sum, s) => sum + s.items.length, 0);
  return `You have ${actionCount} items needing attention today. ${criticalCount > 0 ? `${criticalCount} are high priority.` : 'Nothing critical.'} Here's your overview across all departments.`;
}

async function getUserFirstName(ctx: CallerContext): Promise<string> {
  const result = await query('SELECT full_name FROM reimbursement_users WHERE id = $1::uuid', [ctx.userId]);
  return String(result.rows[0]?.full_name ?? 'there').split(' ')[0] || 'there';
}

async function cacheBriefing(briefing: DailyBriefing): Promise<void> {
  try {
    await query(
      `INSERT INTO daily_briefings (id, user_id, briefing_date, payload, generated_at)
       VALUES ($1::uuid, $2::uuid, $3::date, $4::jsonb, $5::timestamptz)
       ON CONFLICT (user_id, briefing_date)
       DO UPDATE SET payload = EXCLUDED.payload, generated_at = EXCLUDED.generated_at`,
      [briefing.id, briefing.userId, briefing.date, JSON.stringify(briefing), briefing.generatedAt],
    );
  } catch (error) {
    console.log('[DailyBriefing] cache unavailable, returning generated response', error instanceof Error ? error.message : error);
  }
}

async function userHasDeals(ctx: CallerContext): Promise<boolean> {
  const r = await query('SELECT 1 FROM crm_deals WHERE owner_id = $1::uuid LIMIT 1', [ctx.userId]);
  return r.rows.length > 0;
}

async function userHasTickets(ctx: CallerContext): Promise<boolean> {
  const r = await query('SELECT 1 FROM support_tickets WHERE assignee_id = $1::uuid LIMIT 1', [ctx.userId]);
  return r.rows.length > 0;
}
