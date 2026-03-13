import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../middleware/tenantContext.js';
import type { CallerContext } from '../types.js';
import type { Campaign } from './campaigns.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

export interface DashboardMetrics {
  mqls: number;
  cac: number;
  cpl: number;
  roi: number;
  activeCampaigns: number;
  totalSpend: number;
  totalLeads: number;
  emailOpenRate: number;
  contentPublished: number;
  channelBreakdown: ChannelMetrics[];
  monthlyTrend: Array<{ month: string; spend: number; leads: number }>;
}

export interface ChannelMetrics {
  channel: string;
  spend: number;
  leads: number;
  cpl: number;
  roi: number;
}

export interface LeadFunnelMetrics {
  new: number;
  contacted: number;
  nurturing: number;
  qualified: number;
  converted: number;
  disqualified: number;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPeriodStart(period?: string): string | null {
  if (!period) return null;
  const now = new Date();
  if (period === 'year') {
    return new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  }
  if (period === 'quarter') {
    const quarterStart = Math.floor(now.getMonth() / 3) * 3;
    return new Date(now.getFullYear(), quarterStart, 1).toISOString().slice(0, 10);
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

export async function getChannelPerformance(
  ctx: CallerContext,
  period?: string,
): Promise<ChannelMetrics[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getChannelPerformance');

  const startDate = getPeriodStart(period);
  return runInTenant(tenantId, async (client) => {
    const result = await client.query<{ channel: string; spend: string; leads: string; roi: string }>(
      `SELECT
         c.channel,
         COALESCE(SUM(c.actual_spend_eur), 0)::numeric AS spend,
         COALESCE(SUM(c.leads_generated), 0)::int AS leads,
         COALESCE(AVG(NULLIF(c.roi, 0)), 0)::numeric AS roi
       FROM marketing_campaigns c
       WHERE ($1::date IS NULL OR c.created_at::date >= $1::date)
       GROUP BY c.channel
       ORDER BY spend DESC, c.channel ASC`,
      [startDate],
    );

    return result.rows.map((row) => {
      const spend = toNumber(row.spend);
      const leads = parseInt(row.leads, 10);
      return {
        channel: row.channel,
        spend,
        leads,
        cpl: leads > 0 ? Number((spend / leads).toFixed(2)) : 0,
        roi: toNumber(row.roi),
      };
    });
  });
}

export async function getLeadFunnel(
  ctx: CallerContext,
  period?: string,
): Promise<LeadFunnelMetrics> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getLeadFunnel');

  const startDate = getPeriodStart(period);
  return runInTenant(tenantId, async (client) => {
    const result = await client.query<Record<string, unknown>>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'new')::int AS new,
         COUNT(*) FILTER (WHERE status = 'contacted')::int AS contacted,
         COUNT(*) FILTER (WHERE status = 'nurturing')::int AS nurturing,
         COUNT(*) FILTER (WHERE status = 'qualified')::int AS qualified,
         COUNT(*) FILTER (WHERE status = 'converted')::int AS converted,
         COUNT(*) FILTER (WHERE status = 'disqualified')::int AS disqualified
       FROM marketing_leads
       WHERE ($1::date IS NULL OR created_at::date >= $1::date)`,
      [startDate],
    );

    const row = result.rows[0] ?? {};
    return {
    new: toNumber(row.new),
    contacted: toNumber(row.contacted),
    nurturing: toNumber(row.nurturing),
    qualified: toNumber(row.qualified),
    converted: toNumber(row.converted),
    disqualified: toNumber(row.disqualified),
  };
  });
}

export async function getDashboardMetrics(
  ctx: CallerContext,
  period?: string,
): Promise<DashboardMetrics> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getDashboardMetrics');

  const startDate = getPeriodStart(period);
  return runInTenant(tenantId, async (client) => {
    const [summaryResult, channelBreakdown, monthlyTrendResult] = await Promise.all([
      client.query<Record<string, unknown>>(
        `SELECT
           COUNT(*) FILTER (WHERE l.status IN ('qualified', 'converted'))::int AS mqls,
           COALESCE(SUM(c.actual_spend_eur), 0)::numeric AS total_spend,
           COALESCE(SUM(c.leads_generated), 0)::int AS total_leads,
           COUNT(*) FILTER (WHERE c.status = 'active')::int AS active_campaigns,
           COUNT(*) FILTER (WHERE mc.status = 'published')::int AS content_published,
           COUNT(*) FILTER (WHERE l.status = 'converted')::int AS converted_leads,
           COALESCE(MAX(NULLIF(c.roi, 0)), 0)::numeric AS best_roi,
           COALESCE(AVG(NULLIF(ec.open_rate, 0)), 0)::numeric AS email_open_rate
         FROM marketing_campaigns c
         LEFT JOIN marketing_leads l ON l.campaign_id = c.id
         LEFT JOIN marketing_content mc ON mc.campaign_id = c.id
         LEFT JOIN marketing_email_campaigns ec ON ec.campaign_id = c.id
         WHERE ($1::date IS NULL OR c.created_at::date >= $1::date)`,
        [startDate],
      ),
      getChannelPerformance(ctx, period),
      client.query<{ month: string; spend: string; leads: string }>(
        `SELECT
           TO_CHAR(date_trunc('month', c.created_at), 'YYYY-MM') AS month,
           COALESCE(SUM(c.actual_spend_eur), 0)::numeric AS spend,
           COALESCE(SUM(c.leads_generated), 0)::int AS leads
         FROM marketing_campaigns c
         WHERE c.created_at >= NOW() - INTERVAL '6 months'
         GROUP BY date_trunc('month', c.created_at)
         ORDER BY date_trunc('month', c.created_at) ASC`,
        [],
      ),
    ]);

    const summary = summaryResult.rows[0] ?? {};
    const totalSpend = toNumber(summary.total_spend);
    const totalLeads = toNumber(summary.total_leads);
    const convertedLeads = toNumber(summary.converted_leads);

    return {
      mqls: toNumber(summary.mqls),
      cac: convertedLeads > 0 ? Number((totalSpend / convertedLeads).toFixed(2)) : 0,
      cpl: totalLeads > 0 ? Number((totalSpend / totalLeads).toFixed(2)) : 0,
      roi: toNumber(summary.best_roi),
      activeCampaigns: toNumber(summary.active_campaigns),
      totalSpend,
      totalLeads,
      emailOpenRate: toNumber(summary.email_open_rate),
      contentPublished: toNumber(summary.content_published),
      channelBreakdown,
      monthlyTrend: monthlyTrendResult.rows.map((row) => ({
        month: row.month,
        spend: toNumber(row.spend),
        leads: parseInt(row.leads, 10),
      })),
    };
  });
}

export async function getCampaignComparison(
  ctx: CallerContext,
  campaignIds: string[],
): Promise<Campaign[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getCampaignComparison');
  if (campaignIds.length === 0) return [];

  return runInTenant(tenantId, async (client) => {
    const result = await client.query<Record<string, unknown>>(
      `SELECT
         c.*,
         ru.full_name AS owner_name
       FROM marketing_campaigns c
       LEFT JOIN reimbursement_users ru ON ru.id = c.owner_id
       WHERE c.id = ANY($1::uuid[])
       ORDER BY c.name ASC`,
      [campaignIds],
    );
    return result.rows as unknown as Campaign[];
  });
}
