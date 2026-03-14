/**
 * Support Module — Tool registrations
 */
import { query } from '../../../db/index.js';
import type { ToolRegistration } from '../../types.js';
import type { ToolContext, ToolResult } from '../../../services/ai/types.js';
import type { CallerContext } from '../../../dal/types.js';
import * as supportMetrics from '../dal/metrics.js';
import * as supportSla from '../dal/sla.js';
import * as supportHealth from '../dal/customerHealth.js';
import * as crmCompanies from '../../crm/dal/companies.js';

function buildCtx(ctx: ToolContext, organizationId?: string): CallerContext {
  return {
    userId: ctx.userId,
    role: (ctx.userRole ?? 'employee') as CallerContext['role'],
    organizationId,
  };
}

async function resolveOrgId(): Promise<string | undefined> {
  const result = await query<{ id: string }>(
    'SELECT id FROM organizations WHERE slug = $1 LIMIT 1',
    ['messign'],
  );
  return result.rows[0]?.id;
}

export const getTicketOverview: ToolRegistration = {
  name: 'support:get_ticket_overview',
  namespace: 'support',
  summary: 'Support ticket overview: open, resolved, SLA, by priority.',
  tags: ['support', 'tickets', 'sla'],
  requiredRoles: ['manager', 'admin'],
  deferLoaded: true,
  parameterHints: 'status_filter?: string',

  llmSchema: {
    type: 'function',
    function: {
      name: 'support:get_ticket_overview',
      description: 'Get an overview of the current support ticket queue including open tickets, SLA status, and priority distribution.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },

  handler: async (_args, ctx): Promise<ToolResult> => {
    const organizationId = await resolveOrgId();
    if (!organizationId) {
      return { success: false, data: null, summary: 'Organization not found.' };
    }
    const callerCtx = buildCtx(ctx, organizationId);
    const [dashboard, slaReport] = await Promise.all([
      supportMetrics.getSupportDashboardMetrics(callerCtx),
      supportSla.checkSLACompliance(callerCtx),
    ]);
    const topCategories = dashboard.ticketsByCategory
      .slice(0, 3)
      .map((item) => `${item.label} (${item.count})`)
      .join(', ') || 'none';
    return {
      success: true,
      data: { dashboard, slaReport },
      summary: `Support queue overview:\nOpen tickets: ${dashboard.openTickets}\nAvg first response: ${dashboard.avgFirstResponseHours.toFixed(1)}h\nCSAT: ${dashboard.csatScore.toFixed(2)}\nSLA compliance: ${dashboard.slaCompliancePercent.toFixed(1)}%\nAt risk: ${slaReport.atRisk.length}\nBreached: ${slaReport.breached.length}\nTop categories: ${topCategories}`,
      metadata: { source: 'support_tickets, support_customer_health, support_csat_ratings', count: dashboard.openTickets },
    };
  },
};

export const getCustomerHealth: ToolRegistration = {
  name: 'support:get_customer_health',
  namespace: 'support',
  summary: 'Customer health: CSAT, ticket volume, sentiment.',
  tags: ['support', 'customer', 'health', 'csat'],
  requiredRoles: ['manager', 'admin'],
  deferLoaded: true,
  parameterHints: 'company_id?: string',

  llmSchema: {
    type: 'function',
    function: {
      name: 'support:get_customer_health',
      description: 'Get the health score and support history for a specific customer or list at-risk customers.',
      parameters: {
        type: 'object',
        properties: {
          companyName: { type: 'string', description: 'Optional company name to fuzzy match against CRM companies.' },
          onlyAtRisk: { type: 'boolean', description: 'Return only at-risk customers.' },
        },
        required: [],
      },
    },
  },

  handler: async (args, ctx): Promise<ToolResult> => {
    const organizationId = await resolveOrgId();
    if (!organizationId) {
      return { success: false, data: null, summary: 'Organization not found.' };
    }
    const callerCtx = buildCtx(ctx, organizationId);

    if (typeof args.companyName === 'string' && args.companyName.trim()) {
      const companies = await crmCompanies.listCompanies(
        callerCtx,
        { search: args.companyName.trim() },
        undefined,
        1,
        5,
      );
      const company = companies.data[0];
      if (!company) {
        return { success: true, data: null, summary: 'No matching customer found.' };
      }
      const health = await supportHealth.updateCustomerHealth(company.id);
      return {
        success: true,
        data: health,
        summary: `${health.company_name ?? company.name}: health score ${health.health_score}/100, ${health.open_ticket_count} open tickets, avg resolution ${health.avg_resolution_hours?.toFixed(1) ?? 'n/a'}h, CSAT ${health.avg_csat?.toFixed(2) ?? 'n/a'}, trend ${health.trend}.`,
        metadata: { source: 'crm_companies, support_customer_health', count: 1 },
      };
    }

    const onlyAtRisk = Boolean(args.onlyAtRisk);
    const customers = onlyAtRisk
      ? await supportHealth.getAtRiskCustomers(callerCtx)
      : await supportHealth.getHealthScores(callerCtx);

    const preview = customers.slice(0, 5)
      .map((item) => `${item.company_name ?? item.crm_company_id}: ${item.health_score}/100 (${item.trend})`)
      .join('\n');

    return {
      success: true,
      data: customers,
      summary: `${customers.length} customer health record(s) found.${preview ? `\n${preview}` : ''}`,
      metadata: { source: 'support_customer_health, crm_companies', count: customers.length },
    };
  },
};

export const getSupportMetrics: ToolRegistration = {
  name: 'support:get_support_metrics',
  namespace: 'support',
  summary: 'Support metrics: response time, resolution time, volume trends.',
  tags: ['support', 'metrics', 'sla'],
  requiredRoles: ['manager', 'admin'],
  deferLoaded: true,
  parameterHints: 'time_period?: string',

  llmSchema: {
    type: 'function',
    function: {
      name: 'support:get_support_metrics',
      description: 'Get support performance metrics including agent workload, ticket trends, and SLA performance.',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', description: 'Optional period: week, month, or quarter.', enum: ['week', 'month', 'quarter'] },
        },
        required: [],
      },
    },
  },

  handler: async (args, ctx): Promise<ToolResult> => {
    const organizationId = await resolveOrgId();
    if (!organizationId) {
      return { success: false, data: null, summary: 'Organization not found.' };
    }
    const callerCtx = buildCtx(ctx, organizationId);
    const period = typeof args.period === 'string' ? args.period : undefined;
    const [dashboard, workload] = await Promise.all([
      supportMetrics.getSupportDashboardMetrics(callerCtx, period),
      supportMetrics.getAgentWorkload(callerCtx),
    ]);

    const topAgents = workload.slice(0, 5)
      .map((agent) => `${agent.name}: ${agent.openTickets} open, ${agent.avgResponseTime.toFixed(1)}h avg response, CSAT ${agent.csatScore.toFixed(2)}`)
      .join('\n');

    return {
      success: true,
      data: { dashboard, workload },
      summary: `Support metrics${period ? ` (${period})` : ''}:\nOpen tickets: ${dashboard.openTickets}\nAvg response: ${dashboard.avgFirstResponseHours.toFixed(1)}h\nAvg resolution: ${dashboard.avgResolutionHours.toFixed(1)}h\nCSAT: ${dashboard.csatScore.toFixed(2)}\nSLA compliance: ${dashboard.slaCompliancePercent.toFixed(1)}%\n\nAgent workload:\n${topAgents || 'No workload data available.'}`,
      metadata: { source: 'support_tickets, support_csat_ratings', count: workload.length },
    };
  },
};
