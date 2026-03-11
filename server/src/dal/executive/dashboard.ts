import { query } from '../../db/index.js';
import type { CallerContext } from '../types.js';

export interface ExecutiveDashboard {
  revenue: {
    totalYTD: number;
    monthlyTrend: { month: string; value: number }[];
    pipelineValue: number;
    weightedPipeline: number;
    dealsWonThisMonth: number;
    winRate: number;
  };
  finance: {
    totalExpensesQTD: number;
    pendingApprovals: number;
    overdueInvoices: number;
    overdueAmount: number;
    budgetHealthAvg: number;
    criticalBudgets: number;
  };
  support: {
    openTickets: number;
    avgResponseHours: number;
    csatScore: number;
    slaCompliance: number;
    ticketsResolvedThisWeek: number;
    atRiskCustomers: number;
  };
  marketing: {
    mqls: number;
    activeCampaigns: number;
    avgROI: number;
    topCampaign: { name: string; roi: number } | null;
    leadsThisMonth: number;
  };
  people: {
    totalEmployees: number;
    openPositions: number;
    avgUtilization: number;
    newHiresThisMonth: number;
    pendingTimesheets: number;
  };
  projects: {
    activeProjects: number;
    tasksCompletedThisWeek: number;
    blockedTasks: number;
    avgSprintVelocity: number;
  };
  okrs: {
    overallProgress: number;
    onTrack: number;
    atRisk: number;
    behind: number;
  };
  culture: { healthScore: number; engagementTrend: string; sentimentAvg: number } | null;
  operations: {
    contractsExpiringThisMonth: number;
    licensesExpiringThisMonth: number;
    assetsUnassigned: number;
  };
  recentActivity: {
    id: string;
    module: string;
    type: string;
    title: string;
    actor: string;
    timestamp: string;
    color: string;
  }[];
  doraInsights: {
    criticalCount: number;
    warningCount: number;
    totalUnread: number;
  };
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function orgParams(ctx: CallerContext): [string | null] {
  return [ctx.organizationId ?? null];
}

export async function getExecutiveDashboard(ctx: CallerContext): Promise<ExecutiveDashboard> {
  const [
    revenueData,
    financeData,
    supportData,
    marketingData,
    peopleData,
    projectsData,
    okrData,
    operationsData,
    activityData,
    insightCounts,
  ] = await Promise.all([
    getRevenueMetrics(ctx),
    getFinanceMetrics(ctx),
    getSupportMetrics(ctx),
    getMarketingMetrics(ctx),
    getPeopleMetrics(ctx),
    getProjectMetrics(ctx),
    getOKRMetrics(ctx),
    getOperationsMetrics(ctx),
    getRecentActivity(ctx),
    getInsightCounts(ctx),
  ]);

  return {
    revenue: revenueData,
    finance: financeData,
    support: supportData,
    marketing: marketingData,
    people: peopleData,
    projects: projectsData,
    okrs: okrData,
    culture: null,
    operations: operationsData,
    recentActivity: activityData,
    doraInsights: insightCounts,
  };
}

export async function getRevenueMetrics(ctx: CallerContext): Promise<ExecutiveDashboard['revenue']> {
  const [pipeline, dealsWon, trend] = await Promise.all([
    query(
      `SELECT
         COALESCE(SUM(total_value), 0)::numeric AS pipeline_value,
         COALESCE(SUM(weighted_value), 0)::numeric AS weighted_pipeline
       FROM mv_pipeline_summary`,
    ),
    query(
      `SELECT
         COUNT(*) FILTER (
           WHERE status = 'won'
             AND date_trunc('month', closed_at) = date_trunc('month', NOW())
         )::int AS deals_won_this_month,
         CASE WHEN COUNT(*) FILTER (WHERE status IN ('won', 'lost')) > 0
           THEN ROUND(
             COUNT(*) FILTER (WHERE status = 'won')::numeric
             / COUNT(*) FILTER (WHERE status IN ('won', 'lost'))::numeric
             * 100, 1
           )
           ELSE 0
         END AS win_rate,
         COALESCE(SUM(amount) FILTER (WHERE status = 'won' AND date_part('year', closed_at) = date_part('year', NOW())), 0)::numeric AS total_ytd
       FROM crm_deals
       WHERE ($1::uuid IS NULL OR organization_id = $1::uuid)`,
      orgParams(ctx),
    ),
    query(
      `SELECT to_char(date_trunc('month', closed_at), 'Mon YY') AS month,
              COALESCE(SUM(amount), 0)::numeric AS value
       FROM crm_deals
       WHERE status = 'won'
         AND ($1::uuid IS NULL OR organization_id = $1::uuid)
         AND closed_at >= date_trunc('month', NOW()) - INTERVAL '11 months'
       GROUP BY 1
       ORDER BY MIN(date_trunc('month', closed_at))`,
      orgParams(ctx),
    ),
  ]);

  return {
    totalYTD: num(dealsWon.rows[0]?.total_ytd),
    monthlyTrend: trend.rows.map((r) => ({ month: String(r.month), value: num(r.value) })),
    pipelineValue: num(pipeline.rows[0]?.pipeline_value),
    weightedPipeline: num(pipeline.rows[0]?.weighted_pipeline),
    dealsWonThisMonth: num(dealsWon.rows[0]?.deals_won_this_month),
    winRate: num(dealsWon.rows[0]?.win_rate),
  };
}

export async function getFinanceMetrics(ctx: CallerContext): Promise<ExecutiveDashboard['finance']> {
  const [budgets, approvals, overdue, qtdExpenses] = await Promise.all([
    query(
      `SELECT
         COALESCE(AVG(percent_consumed), 0)::numeric AS budget_health_avg,
         COUNT(*) FILTER (WHERE health_status = 'critical')::int AS critical_budgets
       FROM mv_budget_health`,
    ),
    query(
      `SELECT COUNT(*)::int AS pending_approvals
       FROM mv_approval_pipeline`,
    ),
    query(
      `SELECT
         COUNT(*)::int AS overdue_invoices,
         COALESCE(SUM(grand_total), 0)::numeric AS overdue_amount
       FROM invoices
       WHERE status = 'overdue'
         AND ($1::uuid IS NULL OR organization_id = $1::uuid)
         AND (is_deleted IS NULL OR is_deleted = FALSE)`,
      orgParams(ctx),
    ),
    query(
      `SELECT COALESCE(SUM(original_amount), 0)::numeric AS total_expenses_qtd
       FROM reimbursement_requests
       WHERE ($1::uuid IS NULL OR organization_id = $1::uuid)
         AND (is_deleted IS NULL OR is_deleted = FALSE)
         AND status IN ('approved', 'ai_approved', 'manager_approved', 'finance_approved', 'paid', 'reimbursed')
         AND created_at >= date_trunc('quarter', NOW())`,
      orgParams(ctx),
    ),
  ]);

  return {
    totalExpensesQTD: num(qtdExpenses.rows[0]?.total_expenses_qtd),
    pendingApprovals: num(approvals.rows[0]?.pending_approvals),
    overdueInvoices: num(overdue.rows[0]?.overdue_invoices),
    overdueAmount: num(overdue.rows[0]?.overdue_amount),
    budgetHealthAvg: num(budgets.rows[0]?.budget_health_avg),
    criticalBudgets: num(budgets.rows[0]?.critical_budgets),
  };
}

export async function getSupportMetrics(ctx: CallerContext): Promise<ExecutiveDashboard['support']> {
  const [tickets, health, csat] = await Promise.all([
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed'))::int AS open_tickets,
         COUNT(*) FILTER (WHERE status = 'resolved' AND updated_at >= NOW() - INTERVAL '7 days')::int AS resolved_week,
         CASE WHEN COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed')) > 0
           THEN ROUND(
             100 - (
               COUNT(*) FILTER (
                 WHERE status NOT IN ('resolved', 'closed')
                   AND sla_resolution_due IS NOT NULL
                   AND sla_resolution_due < NOW()
               )::numeric
               / COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed'))::numeric
               * 100
             ), 1
           )
           ELSE 100
         END AS sla_compliance,
         COALESCE(AVG(first_response_time_hours) FILTER (WHERE status = 'resolved' AND updated_at >= NOW() - INTERVAL '30 days'), 0)::numeric AS avg_response
       FROM support_tickets
       WHERE ($1::uuid IS NULL OR organization_id = $1::uuid)`,
      orgParams(ctx),
    ),
    query(
      `SELECT COUNT(*) FILTER (WHERE health_status IN ('at_risk', 'critical'))::int AS at_risk
       FROM mv_customer_health`,
    ),
    query(
      `SELECT COALESCE(AVG(rating), 0)::numeric AS csat
       FROM support_csat_ratings r
       JOIN support_tickets t ON t.id = r.ticket_id
       WHERE ($1::uuid IS NULL OR t.organization_id = $1::uuid)`,
      orgParams(ctx),
    ),
  ]);

  return {
    openTickets: num(tickets.rows[0]?.open_tickets),
    avgResponseHours: num(tickets.rows[0]?.avg_response),
    csatScore: num(csat.rows[0]?.csat),
    slaCompliance: num(tickets.rows[0]?.sla_compliance, 100),
    ticketsResolvedThisWeek: num(tickets.rows[0]?.resolved_week),
    atRiskCustomers: num(health.rows[0]?.at_risk),
  };
}

export async function getMarketingMetrics(ctx: CallerContext): Promise<ExecutiveDashboard['marketing']> {
  const [roi, leads] = await Promise.all([
    query(
      `SELECT
         COUNT(*) FILTER (WHERE campaign_status IN ('active', 'running'))::int AS active_campaigns,
         COALESCE(AVG(roi_percent), 0)::numeric AS avg_roi
       FROM mv_marketing_roi`,
    ),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', NOW()))::int AS leads_this_month,
         COUNT(*) FILTER (WHERE is_mql = TRUE AND date_trunc('month', created_at) = date_trunc('month', NOW()))::int AS mqls
       FROM marketing_leads
       WHERE ($1::uuid IS NULL OR organization_id = $1::uuid)`,
      orgParams(ctx),
    ),
  ]);

  const topCampaign = await query(
    `SELECT campaign_name, roi_percent
     FROM mv_marketing_roi
     ORDER BY roi_percent DESC NULLS LAST
     LIMIT 1`,
  );

  return {
    mqls: num(leads.rows[0]?.mqls),
    activeCampaigns: num(roi.rows[0]?.active_campaigns),
    avgROI: num(roi.rows[0]?.avg_roi),
    topCampaign: topCampaign.rows[0]
      ? { name: String(topCampaign.rows[0].campaign_name), roi: num(topCampaign.rows[0].roi_percent) }
      : null,
    leadsThisMonth: num(leads.rows[0]?.leads_this_month),
  };
}

export async function getPeopleMetrics(ctx: CallerContext): Promise<ExecutiveDashboard['people']> {
  const [people, util, timesheets] = await Promise.all([
    query(
      `SELECT
         COUNT(*)::int AS total_employees,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS new_hires
       FROM reimbursement_users
       WHERE ($1::uuid IS NULL OR organization_id = $1::uuid)`,
      orgParams(ctx),
    ),
    query(`SELECT COALESCE(AVG(utilization_percent), 0)::numeric AS avg_utilization FROM mv_time_utilization`),
    query(
      `SELECT COUNT(*)::int AS pending_timesheets
       FROM time_timesheets
       WHERE status = 'submitted'
         AND ($1::uuid IS NULL OR organization_id = $1::uuid)`,
      orgParams(ctx),
    ),
  ]);

  const openPositions = await query(
    `SELECT COUNT(*)::int AS open_positions
     FROM recruitment_jobs
     WHERE status IN ('published', 'open')
       AND ($1::uuid IS NULL OR organization_id = $1::uuid)`,
    orgParams(ctx),
  );

  return {
    totalEmployees: num(people.rows[0]?.total_employees),
    openPositions: num(openPositions.rows[0]?.open_positions),
    avgUtilization: num(util.rows[0]?.avg_utilization),
    newHiresThisMonth: num(people.rows[0]?.new_hires),
    pendingTimesheets: num(timesheets.rows[0]?.pending_timesheets),
  };
}

export async function getProjectMetrics(ctx: CallerContext): Promise<ExecutiveDashboard['projects']> {
  const [velocity, tasks] = await Promise.all([
    query(
      `SELECT
         COUNT(*)::int AS active_projects,
         COALESCE(AVG(completion_rate), 0)::numeric AS avg_velocity
       FROM mv_project_velocity`,
    ),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('completed', 'done') AND completed_at >= NOW() - INTERVAL '7 days')::int AS completed_week,
         COUNT(*) FILTER (WHERE status = 'blocked')::int AS blocked_tasks
       FROM tasks`,
    ),
  ]);

  return {
    activeProjects: num(velocity.rows[0]?.active_projects),
    tasksCompletedThisWeek: num(tasks.rows[0]?.completed_week),
    blockedTasks: num(tasks.rows[0]?.blocked_tasks),
    avgSprintVelocity: num(velocity.rows[0]?.avg_velocity),
  };
}

export async function getOKRMetrics(ctx: CallerContext): Promise<ExecutiveDashboard['okrs']> {
  const result = await query(
    `SELECT
       COALESCE(AVG(progress), 0)::numeric AS overall_progress,
       COUNT(*) FILTER (WHERE status = 'on_track')::int AS on_track,
       COUNT(*) FILTER (WHERE status = 'at_risk')::int AS at_risk,
       COUNT(*) FILTER (WHERE status IN ('behind', 'off_track'))::int AS behind
     FROM okr_goals
     WHERE is_archived = FALSE
       AND ($1::uuid IS NULL OR organization_id = $1::uuid)`,
    orgParams(ctx),
  );
  return {
    overallProgress: num(result.rows[0]?.overall_progress),
    onTrack: num(result.rows[0]?.on_track),
    atRisk: num(result.rows[0]?.at_risk),
    behind: num(result.rows[0]?.behind),
  };
}

export async function getOperationsMetrics(ctx: CallerContext): Promise<ExecutiveDashboard['operations']> {
  const [contracts, licenses, assets] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS contracts_expiring
       FROM contracts
       WHERE end_date >= CURRENT_DATE
         AND end_date <= CURRENT_DATE + INTERVAL '30 days'
         AND ($1::uuid IS NULL OR organization_id = $1::uuid)`,
      orgParams(ctx),
    ),
    query(
      `SELECT COUNT(*)::int AS licenses_expiring
       FROM licenses
       WHERE expiry_date >= CURRENT_DATE
         AND expiry_date <= CURRENT_DATE + INTERVAL '30 days'
         AND ($1::uuid IS NULL OR organization_id = $1::uuid)`,
      orgParams(ctx),
    ),
    query(
      `SELECT COUNT(*)::int AS unassigned_assets
       FROM assets
       WHERE assignee_id IS NULL
         AND status IN ('available', 'in_stock')
         AND ($1::uuid IS NULL OR organization_id = $1::uuid)`,
      orgParams(ctx),
    ),
  ]);

  return {
    contractsExpiringThisMonth: num(contracts.rows[0]?.contracts_expiring),
    licensesExpiringThisMonth: num(licenses.rows[0]?.licenses_expiring),
    assetsUnassigned: num(assets.rows[0]?.unassigned_assets),
  };
}

export async function getRecentActivity(ctx: CallerContext): Promise<ExecutiveDashboard['recentActivity']> {
  const result = await query(
    `SELECT * FROM (
       SELECT
         e.id::text AS id,
         'finance'::text AS module,
         CASE WHEN e.status IN ('approved', 'manager_approved', 'finance_approved') THEN 'expense.approved' ELSE 'expense.created' END AS type,
         COALESCE(e.title, 'Expense update') AS title,
         COALESCE(u.full_name, 'System') AS actor,
         e.updated_at AS timestamp,
         '#10b981'::text AS color
       FROM reimbursement_requests e
       LEFT JOIN reimbursement_users u ON u.id = e.submitted_by
       WHERE ($1::uuid IS NULL OR e.organization_id = $1::uuid)
       ORDER BY e.updated_at DESC
       LIMIT 6
     ) finance_events
     UNION ALL
     SELECT * FROM (
       SELECT
         d.id::text AS id,
         'sales'::text AS module,
         CASE WHEN d.status = 'won' THEN 'deal.won' ELSE 'deal.updated' END AS type,
         d.title::text AS title,
         COALESCE(u.full_name, 'System') AS actor,
         d.updated_at AS timestamp,
         '#3b82f6'::text AS color
       FROM crm_deals d
       LEFT JOIN reimbursement_users u ON u.id = d.owner_id
       WHERE ($1::uuid IS NULL OR d.organization_id = $1::uuid)
       ORDER BY d.updated_at DESC
       LIMIT 6
     ) sales_events
     UNION ALL
     SELECT * FROM (
       SELECT
         t.id::text AS id,
         'support'::text AS module,
         CASE WHEN t.status IN ('resolved', 'closed') THEN 'ticket.resolved' ELSE 'ticket.created' END AS type,
         COALESCE(t.subject, t.ticket_number)::text AS title,
         COALESCE(u.full_name, 'System') AS actor,
         t.updated_at AS timestamp,
         '#f59e0b'::text AS color
       FROM support_tickets t
       LEFT JOIN reimbursement_users u ON u.id = t.assignee_id
       WHERE ($1::uuid IS NULL OR t.organization_id = $1::uuid)
       ORDER BY t.updated_at DESC
       LIMIT 6
     ) support_events
     ORDER BY timestamp DESC
     LIMIT 20`,
    orgParams(ctx),
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    module: String(row.module),
    type: String(row.type),
    title: String(row.title),
    actor: String(row.actor),
    timestamp: new Date(row.timestamp as string).toISOString(),
    color: String(row.color),
  }));
}

export async function getInsightCounts(ctx: CallerContext): Promise<ExecutiveDashboard['doraInsights']> {
  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE severity = 'critical' AND is_read = FALSE)::int AS critical_count,
       COUNT(*) FILTER (WHERE severity = 'warning' AND is_read = FALSE)::int AS warning_count,
       COUNT(*) FILTER (WHERE is_read = FALSE)::int AS total_unread
     FROM dora_insights
     WHERE ($1::uuid IS NULL OR organization_id = $1::uuid)
       AND (
         target_user_id = $2::uuid
         OR target_user_id IS NULL
       )`,
    [ctx.organizationId ?? null, ctx.userId],
  );
  return {
    criticalCount: num(result.rows[0]?.critical_count),
    warningCount: num(result.rows[0]?.warning_count),
    totalUnread: num(result.rows[0]?.total_unread),
  };
}
