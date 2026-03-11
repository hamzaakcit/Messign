import { query } from '../../db/index.js';
import type { CallerContext } from '../types.js';
import { getExecutiveDashboard } from '../executive/dashboard.js';

export type ReportType =
  | 'executive_summary'
  | 'financial_overview'
  | 'sales_pipeline'
  | 'sales_forecast'
  | 'support_performance'
  | 'marketing_roi'
  | 'recruitment_funnel'
  | 'team_utilization'
  | 'okr_progress'
  | 'budget_health'
  | 'customer_health'
  | 'project_status'
  | 'expense_report'
  | 'invoice_aging'
  | 'time_billing'
  | 'department_comparison'
  | 'cross_module_correlation'
  | 'dora_automation_summary'
  | 'contract_renewals'
  | 'asset_inventory'
  | 'financial_flow';

export interface ReportRequest {
  type: ReportType;
  period?: { from: string; to: string };
  departmentId?: string;
  format: 'json' | 'csv' | 'pdf';
  filters?: Record<string, any>;
}

export interface ReportResult {
  type: ReportType;
  title: string;
  description: string;
  generatedAt: string;
  period: { from: string; to: string };
  data: Record<string, any>;
  sections: ReportSection[];
  aiSummary?: string;
}

export interface ReportSection {
  title: string;
  type: 'kpis' | 'table' | 'chart_data' | 'narrative';
  data: any;
}

function getDefaultPeriod(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setMonth(to.getMonth() - 3);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function withPeriod(request: ReportRequest): { from: string; to: string } {
  return request.period ?? getDefaultPeriod();
}

function requireOrganizationId(ctx: CallerContext): string {
  if (!ctx.organizationId) {
    throw new Error('Missing organization context');
  }
  return ctx.organizationId;
}

function orgParam(ctx: CallerContext): [string] {
  return [requireOrganizationId(ctx)];
}

export async function generateReport(ctx: CallerContext, request: ReportRequest): Promise<ReportResult> {
  switch (request.type) {
    case 'executive_summary': return generateExecutiveSummaryReport(ctx, request);
    case 'financial_overview': return generateFinancialOverviewReport(ctx, request);
    case 'sales_pipeline': return generateSalesPipelineReport(ctx, request);
    case 'support_performance': return generateSupportPerformanceReport(ctx, request);
    case 'marketing_roi': return generateMarketingROIReport(ctx, request);
    case 'recruitment_funnel': return generateRecruitmentFunnelReport(ctx, request);
    case 'team_utilization': return generateTeamUtilizationReport(ctx, request);
    case 'okr_progress': return generateOKRProgressReport(ctx, request);
    case 'budget_health': return generateBudgetHealthReport(ctx, request);
    case 'customer_health': return generateCustomerHealthReport(ctx, request);
    case 'expense_report': return generateExpenseReport(ctx, request);
    case 'time_billing': return generateTimeBillingReport(ctx, request);
    case 'cross_module_correlation': return generateCrossModuleReport(ctx, request);
    case 'dora_automation_summary': return generateAutomationSummaryReport(ctx, request);
    case 'financial_flow': return generateFinancialFlowReport(ctx, request);
    default: return placeholderReport(request);
  }
}

async function generateExecutiveSummaryReport(ctx: CallerContext, req: ReportRequest): Promise<ReportResult> {
  const period = withPeriod(req);
  const dashboard = await getExecutiveDashboard(ctx);
  return {
    type: 'executive_summary',
    title: 'Executive Summary',
    description: 'Company-wide overview across all operating modules.',
    generatedAt: new Date().toISOString(),
    period,
    data: dashboard as unknown as Record<string, any>,
    sections: [
      {
        title: 'KPI Overview',
        type: 'kpis',
        data: {
          revenueYTD: dashboard.revenue.totalYTD,
          weightedPipeline: dashboard.revenue.weightedPipeline,
          openTickets: dashboard.support.openTickets,
          okrProgress: dashboard.okrs.overallProgress,
          budgetHealth: dashboard.finance.budgetHealthAvg,
        },
      },
      {
        title: 'Revenue Trend',
        type: 'chart_data',
        data: dashboard.revenue.monthlyTrend,
      },
      {
        title: 'Department Performance',
        type: 'table',
        data: [
          { department: 'Sales', valueA: dashboard.revenue.pipelineValue, valueB: dashboard.revenue.dealsWonThisMonth },
          { department: 'Support', valueA: dashboard.support.openTickets, valueB: dashboard.support.csatScore },
          { department: 'Finance', valueA: dashboard.finance.pendingApprovals, valueB: dashboard.finance.overdueInvoices },
          { department: 'Marketing', valueA: dashboard.marketing.mqls, valueB: dashboard.marketing.avgROI },
          { department: 'People', valueA: dashboard.people.openPositions, valueB: dashboard.people.avgUtilization },
          { department: 'Projects', valueA: dashboard.projects.activeProjects, valueB: dashboard.projects.avgSprintVelocity },
        ],
      },
    ],
    aiSummary: `Revenue is €${dashboard.revenue.totalYTD.toFixed(0)} YTD with ${dashboard.revenue.dealsWonThisMonth} wins this month. Operations risk remains around ${dashboard.finance.overdueInvoices} overdue invoices and ${dashboard.support.openTickets} open support tickets.`,
  };
}

async function generateFinancialOverviewReport(ctx: CallerContext, req: ReportRequest): Promise<ReportResult> {
  const period = withPeriod(req);
  const orgId = requireOrganizationId(ctx);
  const [spendByMonth, overdue, budgets] = await Promise.all([
    query(
      `SELECT to_char(date_trunc('month', created_at), 'Mon YY') AS month,
              COALESCE(SUM(original_amount), 0)::numeric AS amount
       FROM reimbursement_requests
       WHERE ($1::uuid IS NULL OR organization_id = $1::uuid)
         AND (is_deleted IS NULL OR is_deleted = FALSE)
         AND created_at::date BETWEEN $2::date AND $3::date
       GROUP BY 1
       ORDER BY MIN(date_trunc('month', created_at))`,
      [orgId, period.from, period.to],
    ),
    query(
      `SELECT COUNT(*)::int AS overdue_count, COALESCE(SUM(grand_total), 0)::numeric AS overdue_total
       FROM invoices
       WHERE status = 'overdue'
         AND ($1::uuid IS NULL OR organization_id = $1::uuid)
         AND (is_deleted IS NULL OR is_deleted = FALSE)`,
      [orgId],
    ),
    query(
      `SELECT
         CASE
           WHEN b.allocated_amount > 0 AND COALESCE(spend.total_spent, 0) / b.allocated_amount > 0.9 THEN 'critical'
           WHEN b.allocated_amount > 0 AND COALESCE(spend.total_spent, 0) / b.allocated_amount > 0.75 THEN 'warning'
           ELSE 'healthy'
         END AS health_status,
         COUNT(*)::int AS count
       FROM finance_budgets b
       LEFT JOIN (
         SELECT budget_id, COALESCE(SUM(COALESCE(converted_amount, original_amount)), 0)::numeric AS total_spent
         FROM reimbursement_requests
         WHERE budget_id IS NOT NULL
           AND (is_deleted IS NULL OR is_deleted = FALSE)
           AND status NOT IN ('voided', 'draft', 'rejected')
         GROUP BY budget_id
       ) spend ON spend.budget_id = b.id
       WHERE b.organization_id = $1::uuid
       GROUP BY health_status`,
      [orgId],
    ),
  ]);

  return {
    type: 'financial_overview',
    title: 'Financial Overview',
    description: 'Expense, invoice, and budget health summary.',
    generatedAt: new Date().toISOString(),
    period,
    data: { spendByMonth: spendByMonth.rows, overdue: overdue.rows[0], budgets: budgets.rows },
    sections: [
      { title: 'Finance KPIs', type: 'kpis', data: overdue.rows[0] },
      { title: 'Spending Trend', type: 'chart_data', data: spendByMonth.rows },
      { title: 'Budget Health Distribution', type: 'table', data: budgets.rows },
    ],
  };
}

async function generateSalesPipelineReport(ctx: CallerContext, req: ReportRequest): Promise<ReportResult> {
  const period = withPeriod(req);
  const orgId = requireOrganizationId(ctx);
  const [pipelineByStage, wins] = await Promise.all([
    query(
      `SELECT
         s.name AS stage_name,
         COALESCE(SUM(COALESCE(d.amount_eur, d.amount, 0)), 0)::numeric AS total_value,
         COALESCE(SUM(COALESCE(d.amount_eur, d.amount, 0) * COALESCE(d.probability, 0) / 100.0), 0)::numeric AS weighted_value,
         COUNT(d.id)::int AS deal_count
       FROM crm_deal_stages s
       LEFT JOIN crm_deals d ON d.stage_id = s.id
         AND d.organization_id = s.organization_id
         AND d.status NOT IN ('won', 'lost')
       WHERE s.organization_id = $1::uuid
       GROUP BY s.id
       ORDER BY s.position ASC`,
      [orgId],
    ),
    query(
      `SELECT COUNT(*)::int AS won_count, COALESCE(SUM(amount), 0)::numeric AS won_total
       FROM crm_deals
       WHERE status = 'won'
         AND ($1::uuid IS NULL OR organization_id = $1::uuid)
         AND closed_at::date BETWEEN $2::date AND $3::date`,
      [orgId, period.from, period.to],
    ),
  ]);
  return {
    type: 'sales_pipeline',
    title: 'Sales Pipeline',
    description: 'Pipeline stage analysis and won deals.',
    generatedAt: new Date().toISOString(),
    period,
    data: { pipelineByStage: pipelineByStage.rows, wins: wins.rows[0] },
    sections: [
      { title: 'Sales KPIs', type: 'kpis', data: wins.rows[0] },
      { title: 'Pipeline by Stage', type: 'table', data: pipelineByStage.rows },
      { title: 'Pipeline Chart Data', type: 'chart_data', data: pipelineByStage.rows.map((r) => ({ stage: r.stage_name, value: Number(r.total_value) })) },
    ],
  };
}

async function generateSupportPerformanceReport(ctx: CallerContext, req: ReportRequest): Promise<ReportResult> {
  const period = withPeriod(req);
  const [ticketStats, csatStats] = await Promise.all([
    query(
      `SELECT
         COUNT(*)::int AS total_tickets,
         COUNT(*) FILTER (WHERE status IN ('resolved', 'closed'))::int AS resolved_tickets,
         COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed'))::int AS open_tickets
       FROM support_tickets
       WHERE ($1::uuid IS NULL OR organization_id = $1::uuid)
         AND created_at::date BETWEEN $2::date AND $3::date`,
      [requireOrganizationId(ctx), period.from, period.to],
    ),
    query(
      `SELECT COALESCE(AVG(rating), 0)::numeric AS avg_csat
       FROM support_csat_ratings r
       JOIN support_tickets t ON t.id = r.ticket_id
       WHERE ($1::uuid IS NULL OR t.organization_id = $1::uuid)
         AND r.created_at::date BETWEEN $2::date AND $3::date`,
      [requireOrganizationId(ctx), period.from, period.to],
    ),
  ]);
  return {
    type: 'support_performance',
    title: 'Support Performance',
    description: 'Support volume, resolution and CSAT.',
    generatedAt: new Date().toISOString(),
    period,
    data: { ...ticketStats.rows[0], ...csatStats.rows[0] },
    sections: [
      { title: 'Support KPIs', type: 'kpis', data: { ...ticketStats.rows[0], ...csatStats.rows[0] } },
    ],
  };
}

async function generateMarketingROIReport(ctx: CallerContext, req: ReportRequest): Promise<ReportResult> {
  const period = withPeriod(req);
  const roi = await query(
    `SELECT
       c.name AS campaign_name,
       c.channel,
       c.status,
       c.leads_generated,
       CASE
         WHEN c.actual_spend_eur > 0
           THEN COALESCE(SUM(d.amount_eur), 0) / c.actual_spend_eur
         ELSE 0
       END AS roi_multiplier
     FROM marketing_campaigns c
     LEFT JOIN marketing_leads l ON l.campaign_id = c.id
     LEFT JOIN crm_deals d ON d.id = l.crm_deal_id
     WHERE c.organization_id = $1::uuid
     GROUP BY c.id
     ORDER BY roi_multiplier DESC`,
    [requireOrganizationId(ctx)],
  );
  const leads = await query(
    `SELECT COUNT(*)::int AS leads_total, COUNT(*) FILTER (WHERE is_mql = TRUE)::int AS mql_total
     FROM marketing_leads
     WHERE ($1::uuid IS NULL OR organization_id = $1::uuid)
       AND created_at::date BETWEEN $2::date AND $3::date`,
    [requireOrganizationId(ctx), period.from, period.to],
  );
  return {
    type: 'marketing_roi',
    title: 'Marketing ROI',
    description: 'Campaign ROI and lead quality summary.',
    generatedAt: new Date().toISOString(),
    period,
    data: { roi: roi.rows, leads: leads.rows[0] },
    sections: [
      { title: 'Marketing KPIs', type: 'kpis', data: leads.rows[0] },
      { title: 'Campaign ROI', type: 'table', data: roi.rows },
    ],
  };
}

async function generateRecruitmentFunnelReport(_ctx: CallerContext, req: ReportRequest): Promise<ReportResult> {
  const period = withPeriod(req);
  const funnel = await query(`SELECT * FROM mv_recruitment_funnel ORDER BY total_applicants DESC`);
  return {
    type: 'recruitment_funnel',
    title: 'Recruitment Funnel',
    description: 'Applications-to-hire funnel by role.',
    generatedAt: new Date().toISOString(),
    period,
    data: { funnel: funnel.rows },
    sections: [
      { title: 'Recruitment Funnel', type: 'table', data: funnel.rows },
    ],
  };
}

async function generateTeamUtilizationReport(ctx: CallerContext, req: ReportRequest): Promise<ReportResult> {
  const period = withPeriod(req);
  const util = await query(
    `SELECT user_id, full_name, total_hours_30d, billable_hours_30d, utilization_percent
     FROM (
       SELECT
         u.id AS user_id,
         u.full_name,
         COALESCE(SUM(te.hours), 0)::numeric AS total_hours_30d,
         COALESCE(SUM(te.hours) FILTER (WHERE te.is_billable), 0)::numeric AS billable_hours_30d,
         CASE WHEN COALESCE(SUM(te.hours), 0) > 0
           THEN ROUND((SUM(te.hours) FILTER (WHERE te.is_billable) / SUM(te.hours) * 100)::numeric, 1)
           ELSE 0
         END AS utilization_percent
       FROM reimbursement_users u
       LEFT JOIN time_entries te ON te.user_id = u.id
         AND te.date >= CURRENT_DATE - INTERVAL '30 days'
         AND te.status != 'rejected'
       WHERE u.organization_id = $1::uuid
       GROUP BY u.id, u.full_name
     ) util
     ORDER BY utilization_percent DESC`,
    [requireOrganizationId(ctx)],
  );
  return {
    type: 'team_utilization',
    title: 'Team Utilization',
    description: 'Weekly utilization and workload distribution.',
    generatedAt: new Date().toISOString(),
    period,
    data: { utilization: util.rows },
    sections: [
      { title: 'Utilization Table', type: 'table', data: util.rows },
      { title: 'Utilization Chart', type: 'chart_data', data: util.rows.map((r) => ({ userId: r.user_id, utilization: Number(r.utilization_percent), hours30d: Number(r.total_hours_30d) })) },
    ],
  };
}

async function generateOKRProgressReport(ctx: CallerContext, req: ReportRequest): Promise<ReportResult> {
  const period = withPeriod(req);
  const goals = await query(
    `SELECT title, progress, status
     FROM okr_goals
     WHERE is_archived = FALSE
       AND ($1::uuid IS NULL OR organization_id = $1::uuid)
     ORDER BY progress DESC
     LIMIT 20`,
    orgParam(ctx),
  );
  return {
    type: 'okr_progress',
    title: 'OKR Progress',
    description: 'Goal progress by status and completion.',
    generatedAt: new Date().toISOString(),
    period,
    data: { goals: goals.rows },
    sections: [
      { title: 'Goals', type: 'table', data: goals.rows },
      { title: 'Progress Chart Data', type: 'chart_data', data: goals.rows.map((g) => ({ goal: g.title, progress: Number(g.progress) })) },
    ],
  };
}

async function generateBudgetHealthReport(ctx: CallerContext, req: ReportRequest): Promise<ReportResult> {
  const period = withPeriod(req);
  const rows = await query(
    `SELECT
       b.name AS budget_name,
       b.department AS department_id,
       CASE WHEN b.allocated_amount > 0
         THEN ROUND((COALESCE(spend.total_spent, 0) / b.allocated_amount * 100)::numeric, 1)
         ELSE 0
       END AS percent_consumed,
       CASE
         WHEN b.allocated_amount > 0 AND COALESCE(spend.total_spent, 0) / b.allocated_amount > 0.9 THEN 'critical'
         WHEN b.allocated_amount > 0 AND COALESCE(spend.total_spent, 0) / b.allocated_amount > 0.75 THEN 'warning'
         ELSE 'healthy'
       END AS health_status
     FROM finance_budgets b
     LEFT JOIN (
       SELECT budget_id, COALESCE(SUM(COALESCE(converted_amount, original_amount)), 0)::numeric AS total_spent
       FROM reimbursement_requests
       WHERE budget_id IS NOT NULL
         AND (is_deleted IS NULL OR is_deleted = FALSE)
         AND status NOT IN ('voided', 'draft', 'rejected')
       GROUP BY budget_id
     ) spend ON spend.budget_id = b.id
     WHERE b.organization_id = $1::uuid
     ORDER BY percent_consumed DESC`,
    [requireOrganizationId(ctx)],
  );
  return {
    type: 'budget_health',
    title: 'Budget Health',
    description: 'Budget consumption and health status.',
    generatedAt: new Date().toISOString(),
    period,
    data: { budgets: rows.rows },
    sections: [{ title: 'Budget Health', type: 'table', data: rows.rows }],
  };
}

async function generateCustomerHealthReport(ctx: CallerContext, req: ReportRequest): Promise<ReportResult> {
  const period = withPeriod(req);
  const rows = await query(
    `SELECT
       sch.crm_company_id,
       c.name AS company_name,
       sch.health_score,
       sch.open_ticket_count,
       sch.avg_resolution_hours,
       sch.avg_csat,
       sch.trend,
       sch.calculated_at
     FROM support_customer_health sch
     JOIN crm_companies c ON c.id = sch.crm_company_id
     WHERE c.organization_id = $1::uuid
     ORDER BY sch.health_score ASC`,
    [requireOrganizationId(ctx)],
  );
  return {
    type: 'customer_health',
    title: 'Customer Health',
    description: 'At-risk customer indicators from support + CRM.',
    generatedAt: new Date().toISOString(),
    period,
    data: { customers: rows.rows },
    sections: [{ title: 'Customer Health Table', type: 'table', data: rows.rows }],
  };
}

async function generateExpenseReport(ctx: CallerContext, req: ReportRequest): Promise<ReportResult> {
  const period = withPeriod(req);
  const rows = await query(
    `SELECT title, original_amount, status, created_at
     FROM reimbursement_requests
     WHERE ($1::uuid IS NULL OR organization_id = $1::uuid)
       AND created_at::date BETWEEN $2::date AND $3::date
       AND (is_deleted IS NULL OR is_deleted = FALSE)
     ORDER BY created_at DESC
     LIMIT 500`,
    [requireOrganizationId(ctx), period.from, period.to],
  );
  return {
    type: 'expense_report',
    title: 'Expense Report',
    description: 'Expense detail listing for selected period.',
    generatedAt: new Date().toISOString(),
    period,
    data: { expenses: rows.rows },
    sections: [{ title: 'Expense Details', type: 'table', data: rows.rows }],
  };
}

async function generateTimeBillingReport(ctx: CallerContext, req: ReportRequest): Promise<ReportResult> {
  const period = withPeriod(req);
  const rows = await query(
    `SELECT user_id, project_id, SUM(hours)::numeric AS total_hours, SUM(COALESCE(billable_amount, 0))::numeric AS billable_total
     FROM time_entries
     WHERE ($1::uuid IS NULL OR organization_id = $1::uuid)
       AND date BETWEEN $2::date AND $3::date
     GROUP BY user_id, project_id
     ORDER BY billable_total DESC`,
    [requireOrganizationId(ctx), period.from, period.to],
  );
  return {
    type: 'time_billing',
    title: 'Time & Billing',
    description: 'Billable time and amount by user/project.',
    generatedAt: new Date().toISOString(),
    period,
    data: { rows: rows.rows },
    sections: [{ title: 'Billing Rows', type: 'table', data: rows.rows }],
  };
}

async function generateCrossModuleReport(ctx: CallerContext, req: ReportRequest): Promise<ReportResult> {
  const period = withPeriod(req);
  const [dealsWon, ticketCount, hires] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS c
       FROM crm_deals
       WHERE status = 'won'
         AND ($1::uuid IS NULL OR organization_id = $1::uuid)
         AND closed_at::date BETWEEN $2::date AND $3::date`,
      [requireOrganizationId(ctx), period.from, period.to],
    ),
    query(
      `SELECT COUNT(*)::int AS c
       FROM support_tickets
       WHERE ($1::uuid IS NULL OR organization_id = $1::uuid)
         AND created_at::date BETWEEN $2::date AND $3::date`,
      [requireOrganizationId(ctx), period.from, period.to],
    ),
    query(
      `SELECT COUNT(*)::int AS c
       FROM recruitment_applications a
       JOIN recruitment_jobs j ON j.id = a.job_id
       WHERE a.stage = 'hired'
         AND ($1::uuid IS NULL OR j.organization_id = $1::uuid)
         AND a.updated_at::date BETWEEN $2::date AND $3::date`,
      [requireOrganizationId(ctx), period.from, period.to],
    ),
  ]);
  const corr = {
    dealsWon: Number(dealsWon.rows[0]?.c ?? 0),
    supportVolume: Number(ticketCount.rows[0]?.c ?? 0),
    hires: Number(hires.rows[0]?.c ?? 0),
  };
  return {
    type: 'cross_module_correlation',
    title: 'Cross-Module Correlation',
    description: 'Correlation-style snapshot across sales, support, and hiring.',
    generatedAt: new Date().toISOString(),
    period,
    data: corr,
    sections: [{ title: 'Cross-module KPIs', type: 'kpis', data: corr }],
  };
}

async function generateFinancialFlowReport(ctx: CallerContext, req: ReportRequest): Promise<ReportResult> {
  const period = withPeriod(req);
  const orgId = requireOrganizationId(ctx);

  const [revenueByBucket, budgetByDept] = await Promise.all([
    query(
      `SELECT
         CASE
           WHEN COALESCE(d.amount_eur, d.amount, 0) < 10000 THEN 'Small'
           WHEN COALESCE(d.amount_eur, d.amount, 0) < 50000 THEN 'Medium'
           ELSE 'Large'
         END AS bucket,
         COALESCE(SUM(COALESCE(d.amount_eur, d.amount, 0)), 0)::numeric AS total
       FROM crm_deals d
       JOIN crm_deal_stages s ON s.id = d.stage_id
       WHERE d.organization_id = $1::uuid AND s.is_won = true
         AND d.actual_close_date IS NOT NULL
         AND d.actual_close_date::date BETWEEN $2::date AND $3::date
       GROUP BY 1`,
      [orgId, period.from, period.to],
    ),
    query(
      `SELECT department, COALESCE(SUM(allocated_amount), 0)::numeric AS allocated
       FROM finance_budgets
       WHERE organization_id = $1::uuid
         AND period_start <= $3::date AND period_end >= $2::date
       GROUP BY department`,
      [orgId, period.from, period.to],
    ),
  ]);

  const revenueRows = revenueByBucket.rows as Array<{ bucket: string; total: number }>;
  const budgetRows = budgetByDept.rows as Array<{ department: string; allocated: number }>;

  const expenseByCat = await query(
    `SELECT COALESCE(category_slug, 'Other') AS category,
            COALESCE(SUM(COALESCE(converted_amount, original_amount)), 0)::numeric AS total
     FROM reimbursement_requests
     WHERE organization_id = $1::uuid
       AND (is_deleted IS NULL OR is_deleted = FALSE)
       AND status NOT IN ('voided', 'draft', 'rejected')
       AND created_at::date BETWEEN $2::date AND $3::date
     GROUP BY COALESCE(category_slug, 'Other')`,
    [orgId, period.from, period.to],
  );
  const expenseRows = expenseByCat.rows as Array<{ category: string; total: number }>;

  const nodes: Array<{ id: string; name: string; color: string }> = [];
  const links: Array<{ source: string; target: string; value: number }> = [];

  const revColors: Record<string, string> = { Small: '#10B981', Medium: '#26A641', Large: '#39D353' };
  const deptColors: Record<string, string> = {
    Engineering: '#3B82F6', Sales: '#8B5CF6', Marketing: '#EC4899',
    Operations: '#F59E0B', HR: '#06B6D4', Finance: '#6366F1',
  };
  const expColors: Record<string, string> = {
    Salaries: '#1B6FA0', Tools: '#3B9DD1', 'Marketing Spend': '#EC4899',
    Office: '#F59E0B', Travel: '#06B6D4', Vendors: '#6366F1', Other: '#64748B',
  };

  const nodeIds: Record<string, string> = {};

  for (const r of revenueRows) {
    const id = `rev-${r.bucket}`;
    if (!nodeIds[id]) nodeIds[id] = id;
    nodes.push({ id, name: `Deals Won (${r.bucket})`, color: revColors[r.bucket] ?? '#10B981' });
  }
  for (const b of budgetRows) {
    const id = `dept-${b.department}`;
    if (!nodeIds[id]) nodeIds[id] = id;
    nodes.push({ id, name: b.department, color: deptColors[b.department] ?? '#64748B' });
  }
  for (const e of expenseRows) {
    const id = `exp-${e.category}`;
    if (!nodeIds[id]) nodeIds[id] = id;
    nodes.push({ id, name: e.category, color: expColors[e.category] ?? '#64748B' });
  }

  const totalRevenue = revenueRows.reduce((s, r) => s + Number(r.total), 0);
  const totalBudget = budgetRows.reduce((s, b) => s + Number(b.allocated), 0);
  const totalExpense = expenseRows.reduce((s, e) => s + Number(e.total), 0);

  for (const r of revenueRows) {
    const val = Number(r.total);
    if (val <= 0) continue;
    for (const b of budgetRows) {
      const alloc = Number(b.allocated);
      if (alloc <= 0) continue;
      const share = totalBudget > 0 ? (alloc / totalBudget) * val : 0;
      if (share > 0) {
        links.push({ source: `rev-${r.bucket}`, target: `dept-${b.department}`, value: Math.round(share) });
      }
    }
  }

  for (const b of budgetRows) {
    const alloc = Number(b.allocated);
    if (alloc <= 0) continue;
    for (const e of expenseRows) {
      const expTotal = Number(e.total);
      if (expTotal <= 0) continue;
      const share = totalExpense > 0 ? (expTotal / totalExpense) * alloc : 0;
      if (share > 0) {
        links.push({ source: `dept-${b.department}`, target: `exp-${e.category}`, value: Math.round(share) });
      }
    }
  }

  const sankeyData = { nodes, links };

  return {
    type: 'financial_flow',
    title: 'Financial Flow',
    description: 'Money flow from revenue through departments to expense categories.',
    generatedAt: new Date().toISOString(),
    period,
    data: sankeyData,
    sections: [
      { title: 'Sankey Data', type: 'chart_data', data: sankeyData },
    ],
  };
}

async function generateAutomationSummaryReport(ctx: CallerContext, req: ReportRequest): Promise<ReportResult> {
  const period = withPeriod(req);
  const rows = await query(
    `SELECT action_type, result, COUNT(*)::int AS count
     FROM dora_automation_runs
     WHERE ($1::uuid IS NULL OR organization_id = $1::uuid)
       AND created_at::date BETWEEN $2::date AND $3::date
     GROUP BY action_type, result
     ORDER BY count DESC`,
    [requireOrganizationId(ctx), period.from, period.to],
  );
  return {
    type: 'dora_automation_summary',
    title: 'Dora Automation Summary',
    description: 'Automation outcomes by action type and result.',
    generatedAt: new Date().toISOString(),
    period,
    data: { rows: rows.rows },
    sections: [{ title: 'Automation Outcomes', type: 'table', data: rows.rows }],
  };
}

function placeholderReport(req: ReportRequest): ReportResult {
  return {
    type: req.type,
    title: req.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    description: 'Report structure is available; detailed query implementation is pending.',
    generatedAt: new Date().toISOString(),
    period: withPeriod(req),
    data: {},
    sections: [
      {
        title: 'Pending Implementation',
        type: 'narrative',
        data: 'This report type is scaffolded and ready for richer data extraction.',
      },
    ],
  };
}

export const AVAILABLE_REPORT_TYPES: Array<{ type: ReportType; description: string; permission: string }> = [
  { type: 'executive_summary', description: 'Company-wide KPI and risk overview', permission: 'manager' },
  { type: 'financial_overview', description: 'Expense/invoice/budget overview', permission: 'finance' },
  { type: 'sales_pipeline', description: 'Pipeline by stage and won deals', permission: 'manager' },
  { type: 'sales_forecast', description: 'Projected sales outlook', permission: 'manager' },
  { type: 'support_performance', description: 'Support throughput and CSAT', permission: 'manager' },
  { type: 'marketing_roi', description: 'Campaign performance and ROI', permission: 'manager' },
  { type: 'recruitment_funnel', description: 'Applications-to-hire conversion', permission: 'manager' },
  { type: 'team_utilization', description: 'Time utilization by team members', permission: 'manager' },
  { type: 'okr_progress', description: 'Goal and key result progress', permission: 'manager' },
  { type: 'budget_health', description: 'Budget threshold and spend health', permission: 'finance' },
  { type: 'customer_health', description: 'At-risk customer and support indicators', permission: 'manager' },
  { type: 'project_status', description: 'Project delivery and blockages', permission: 'manager' },
  { type: 'expense_report', description: 'Detailed expense line-item report', permission: 'finance' },
  { type: 'invoice_aging', description: 'Outstanding invoice aging buckets', permission: 'finance' },
  { type: 'time_billing', description: 'Billable time and amount report', permission: 'finance' },
  { type: 'department_comparison', description: 'Cross-department KPI comparison', permission: 'manager' },
  { type: 'cross_module_correlation', description: 'Correlation snapshot across modules', permission: 'manager' },
  { type: 'dora_automation_summary', description: 'Automation actions and outcomes', permission: 'manager' },
  { type: 'contract_renewals', description: 'Contract renewal timeline report', permission: 'manager' },
  { type: 'asset_inventory', description: 'Asset and license inventory report', permission: 'manager' },
  { type: 'financial_flow', description: 'Sankey diagram of money flow through the organization', permission: 'finance' },
];
