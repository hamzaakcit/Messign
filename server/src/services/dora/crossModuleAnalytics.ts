import { query } from '../../db/index.js';
import type { CallerContext } from '../../dal/types.js';

function orgClause(alias: string, index: number = 1): string {
  return `($${index}::uuid IS NULL OR ${alias}.organization_id = $${index}::uuid)`;
}

export async function getMarketingToRevenueCorrelation(ctx: CallerContext, period?: string) {
  const interval =
    period === 'year' ? "INTERVAL '1 year'" :
    period === 'quarter' ? "INTERVAL '3 months'" :
    "INTERVAL '1 month'";
  const result = await query(
    `SELECT
       c.id::text AS campaign_id,
       c.name AS campaign_name,
       COUNT(DISTINCT l.id)::int AS leads,
       COUNT(DISTINCT l.crm_deal_id)::int AS deals_created,
       COALESCE(SUM(d.amount), 0)::numeric AS deal_value,
       COALESCE(c.actual_spend_eur, 0)::numeric AS campaign_spend,
       CASE
         WHEN COALESCE(c.actual_spend_eur, 0) > 0
         THEN ROUND((COALESCE(SUM(d.amount), 0) / c.actual_spend_eur)::numeric, 2)
         ELSE 0
       END AS true_roi
     FROM marketing_campaigns c
     LEFT JOIN marketing_leads l ON l.campaign_id = c.id
     LEFT JOIN crm_deals d ON d.id = l.crm_deal_id
     WHERE ${orgClause('c')}
       AND c.created_at >= NOW() - ${interval}
     GROUP BY c.id, c.name, c.actual_spend_eur
     ORDER BY true_roi DESC, deal_value DESC`,
    [ctx.organizationId ?? null],
  );
  return result.rows;
}

export async function getSupportToProductCorrelation(ctx: CallerContext) {
  const result = await query(
    `SELECT
       COALESCE(sc.name, 'General') AS category,
       COUNT(*)::int AS ticket_count,
       COALESCE((
         SELECT COUNT(*)
         FROM tasks t
         WHERE (
           t.tags @> jsonb_build_array('bug')
           OR t.tags @> jsonb_build_array(lower(COALESCE(sc.name, 'general')))
         )
       ), 0)::int AS related_tasks,
       COALESCE((
         SELECT COUNT(*)
         FROM tasks t
         WHERE (
           t.tags @> jsonb_build_array('bug')
           OR t.tags @> jsonb_build_array(lower(COALESCE(sc.name, 'general')))
         )
           AND t.status NOT IN ('completed', 'done', 'cancelled')
       ), 0) = 0 AS is_being_fixed
     FROM support_tickets st
     LEFT JOIN support_categories sc ON sc.id = st.category_id
     WHERE ${orgClause('st')}
     GROUP BY COALESCE(sc.name, 'General')
     ORDER BY ticket_count DESC`,
    [ctx.organizationId ?? null],
  );
  return result.rows;
}

export async function getTimeToProjectProfitability(ctx: CallerContext) {
  const result = await query(
    `SELECT
       COALESCE(p.name, te.project_id::text, 'Unassigned project') AS project_name,
       ROUND(COALESCE(SUM(te.hours), 0)::numeric, 2) AS total_hours,
       ROUND(COALESCE(SUM(te.hours * COALESCE(te.hourly_rate, te.billing_rate, 0)), 0)::numeric, 2) AS cost,
       ROUND(COALESCE(SUM(CASE WHEN te.is_billable THEN te.revenue_amount ELSE 0 END), 0)::numeric, 2) AS revenue,
       ROUND(COALESCE(SUM(CASE WHEN te.is_billable THEN te.revenue_amount ELSE 0 END) - SUM(te.hours * COALESCE(te.hourly_rate, te.billing_rate, 0)), 0)::numeric, 2) AS margin,
       CASE
         WHEN COALESCE(SUM(CASE WHEN te.is_billable THEN te.revenue_amount ELSE 0 END), 0) > 0
         THEN ROUND(((SUM(CASE WHEN te.is_billable THEN te.revenue_amount ELSE 0 END) - SUM(te.hours * COALESCE(te.hourly_rate, te.billing_rate, 0))) / SUM(CASE WHEN te.is_billable THEN te.revenue_amount ELSE 0 END) * 100)::numeric, 2)
         ELSE 0
       END AS margin_percent
     FROM time_entries te
     LEFT JOIN projects p ON p.id = te.project_id::text
     WHERE ${orgClause('te')}
       AND te.project_id IS NOT NULL
     GROUP BY COALESCE(p.name, te.project_id::text, 'Unassigned project')
     ORDER BY margin DESC`,
    [ctx.organizationId ?? null],
  );
  return result.rows;
}

export async function getHiringNeedsForecast(ctx: CallerContext) {
  const result = await query(
    `SELECT
       COALESCE(pt.team_name, util.department, 'General') AS department,
       COUNT(DISTINCT ru.id)::int AS current_headcount,
       COALESCE(AVG(util.utilization_percent), 0)::numeric AS utilization,
       COALESCE((
         SELECT COUNT(*)
         FROM projects p
         WHERE p.status IN ('active', 'planning')
           AND p.due_date IS NOT NULL
           AND p.due_date <= NOW() + INTERVAL '60 days'
       ), 0)::int AS upcoming_projects,
       CASE
         WHEN COALESCE(AVG(util.utilization_percent), 0) >= 90 THEN 2
         WHEN COALESCE(AVG(util.utilization_percent), 0) >= 80 THEN 1
         ELSE 0
       END AS recommended_hires
     FROM mv_time_utilization util
     LEFT JOIN performance_teams pt ON pt.team_name = util.department
     LEFT JOIN performance_team_members ptm ON ptm.team_id = pt.id AND ptm.is_active = TRUE
     LEFT JOIN reimbursement_users ru ON ru.auth_user_id = ptm.employee_id
     WHERE ${orgClause('util')}
     GROUP BY COALESCE(pt.team_name, util.department, 'General')
     ORDER BY recommended_hires DESC, utilization DESC`,
    [ctx.organizationId ?? null],
  );
  return result.rows;
}

export async function getExecutiveSummary(ctx: CallerContext) {
  const [marketingRevenue, hiringNeeds, projectProfitability, ticketCorrelations, financeSummary, headcount] = await Promise.all([
    getMarketingToRevenueCorrelation(ctx),
    getHiringNeedsForecast(ctx),
    getTimeToProjectProfitability(ctx),
    getSupportToProductCorrelation(ctx),
    query(
      `SELECT
         COALESCE(SUM(grand_total), 0)::numeric AS paid_revenue,
         COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_invoices
       FROM invoices
       WHERE ${orgClause('invoices')}`,
      [ctx.organizationId ?? null],
    ),
    query(
      `SELECT COUNT(*)::int AS employees
       FROM reimbursement_users
       WHERE ${orgClause('reimbursement_users')}`,
      [ctx.organizationId ?? null],
    ),
  ]);

  return {
    revenue: financeSummary.rows[0] ?? {},
    headcount: Number(headcount.rows[0]?.employees ?? 0),
    topCampaigns: marketingRevenue.slice(0, 5),
    projectProfitability: projectProfitability.slice(0, 5),
    hiringNeeds: hiringNeeds.slice(0, 5),
    supportRisks: ticketCorrelations.slice(0, 5),
  };
}
