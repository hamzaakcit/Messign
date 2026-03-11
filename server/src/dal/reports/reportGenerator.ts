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
  | 'asset_inventory';

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

function orgParam(ctx: CallerContext): [string | null] {
  return [ctx.organizationId ?? null];
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
      [ctx.organizationId ?? null, period.from, period.to],
    ),
    query(
      `SELECT COUNT(*)::int AS overdue_count, COALESCE(SUM(grand_total), 0)::numeric AS overdue_total
       FROM invoices
       WHERE status = 'overdue'
         AND ($1::uuid IS NULL OR organization_id = $1::uuid)
         AND (is_deleted IS NULL OR is_deleted = FALSE)`,
      orgParam(ctx),
    ),
    query(`SELECT health_status, COUNT(*)::int AS count FROM mv_budget_health GROUP BY health_status`),
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
  const [pipelineByStage, wins] = await Promise.all([
    query(`SELECT stage_name, total_value, weighted_value, deal_count FROM mv_pipeline_summary ORDER BY total_value DESC`),
    query(
      `SELECT COUNT(*)::int AS won_count, COALESCE(SUM(amount), 0)::numeric AS won_total
       FROM crm_deals
       WHERE status = 'won'
         AND ($1::uuid IS NULL OR organization_id = $1::uuid)
         AND closed_at::date BETWEEN $2::date AND $3::date`,
      [ctx.organizationId ?? null, period.from, period.to],
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
      [ctx.organizationId ?? null, period.from, period.to],
    ),
    query(
      `SELECT COALESCE(AVG(rating), 0)::numeric AS avg_csat
       FROM support_csat_ratings r
       JOIN support_tickets t ON t.id = r.ticket_id
       WHERE ($1::uuid IS NULL OR t.organization_id = $1::uuid)
         AND r.created_at::date BETWEEN $2::date AND $3::date`,
      [ctx.organizationId ?? null, period.from, period.to],
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
  const roi = await query(`SELECT campaign_name, channel, roi_percent, lead_count FROM mv_marketing_roi ORDER BY roi_percent DESC`);
  const leads = await query(
    `SELECT COUNT(*)::int AS leads_total, COUNT(*) FILTER (WHERE is_mql = TRUE)::int AS mql_total
     FROM marketing_leads
     WHERE ($1::uuid IS NULL OR organization_id = $1::uuid)
       AND created_at::date BETWEEN $2::date AND $3::date`,
    [ctx.organizationId ?? null, period.from, period.to],
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
  const funnel = await query(`SELECT * FROM mv_recruitment_funnel ORDER BY applications_count DESC`);
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

async function generateTeamUtilizationReport(_ctx: CallerContext, req: ReportRequest): Promise<ReportResult> {
  const period = withPeriod(req);
  const util = await query(`SELECT user_id, total_hours_week, target_hours_week, utilization_percent FROM mv_time_utilization ORDER BY utilization_percent DESC`);
  return {
    type: 'team_utilization',
    title: 'Team Utilization',
    description: 'Weekly utilization and workload distribution.',
    generatedAt: new Date().toISOString(),
    period,
    data: { utilization: util.rows },
    sections: [
      { title: 'Utilization Table', type: 'table', data: util.rows },
      { title: 'Utilization Chart', type: 'chart_data', data: util.rows.map((r) => ({ userId: r.user_id, utilization: Number(r.utilization_percent) })) },
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

async function generateBudgetHealthReport(_ctx: CallerContext, req: ReportRequest): Promise<ReportResult> {
  const period = withPeriod(req);
  const rows = await query(`SELECT budget_name, department_id, percent_consumed, health_status FROM mv_budget_health ORDER BY percent_consumed DESC`);
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

async function generateCustomerHealthReport(_ctx: CallerContext, req: ReportRequest): Promise<ReportResult> {
  const period = withPeriod(req);
  const rows = await query(`SELECT * FROM mv_customer_health ORDER BY health_score ASC`);
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
    [ctx.organizationId ?? null, period.from, period.to],
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
    [ctx.organizationId ?? null, period.from, period.to],
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
      [ctx.organizationId ?? null, period.from, period.to],
    ),
    query(
      `SELECT COUNT(*)::int AS c
       FROM support_tickets
       WHERE ($1::uuid IS NULL OR organization_id = $1::uuid)
         AND created_at::date BETWEEN $2::date AND $3::date`,
      [ctx.organizationId ?? null, period.from, period.to],
    ),
    query(
      `SELECT COUNT(*)::int AS c
       FROM recruitment_applications a
       JOIN recruitment_jobs j ON j.id = a.job_id
       WHERE a.stage = 'hired'
         AND ($1::uuid IS NULL OR j.organization_id = $1::uuid)
         AND a.updated_at::date BETWEEN $2::date AND $3::date`,
      [ctx.organizationId ?? null, period.from, period.to],
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

async function generateAutomationSummaryReport(ctx: CallerContext, req: ReportRequest): Promise<ReportResult> {
  const period = withPeriod(req);
  const rows = await query(
    `SELECT action_type, result, COUNT(*)::int AS count
     FROM dora_automation_runs
     WHERE ($1::uuid IS NULL OR organization_id = $1::uuid)
       AND created_at::date BETWEEN $2::date AND $3::date
     GROUP BY action_type, result
     ORDER BY count DESC`,
    [ctx.organizationId ?? null, period.from, period.to],
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
];
