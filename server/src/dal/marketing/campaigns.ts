import { query } from '../../db/index.js';
import { eventBus } from '../../events/index.js';
import type { CallerContext, DateRange, PaginatedResult, SortOptions } from '../types.js';
import { paginationClause } from '../helpers.js';
import { ANALYTICS_VIEWS, refreshMaterializedViews } from '../../services/analytics/materializedViews.js';

export interface Campaign {
  id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  channel: string;
  status: string;
  budget: number;
  actual_spend: number;
  currency: string;
  budget_eur: number;
  actual_spend_eur: number;
  start_date: string | null;
  end_date: string | null;
  target_audience: string | null;
  goals: string | null;
  owner_id: string | null;
  impressions: number;
  clicks: number;
  conversions: number;
  leads_generated: number;
  cost_per_lead: number | null;
  roi: number | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  owner_name?: string | null;
  spend_entries?: SpendEntry[];
  spend_count?: number;
  lead_count?: number;
  content_count?: number;
  deal_value?: number;
}

export interface SpendEntry {
  id: string;
  campaign_id: string;
  amount: number;
  currency: string;
  amount_eur: number | null;
  category: string | null;
  description: string | null;
  date: string;
  vendor: string | null;
  finance_expense_id: string | null;
  receipt_url: string | null;
  created_by: string | null;
  created_at: string;
  created_by_name?: string | null;
}

export interface CampaignFilters {
  status?: string;
  channel?: string;
  ownerId?: string;
  dateRange?: DateRange;
  search?: string;
}

export interface CreateCampaignInput {
  name: string;
  description?: string;
  channel: string;
  status?: string;
  budget?: number;
  currency?: string;
  start_date?: string;
  end_date?: string;
  target_audience?: string;
  goals?: string;
  owner_id?: string;
  tags?: string[];
}

export type UpdateCampaignInput = Partial<CreateCampaignInput> & {
  actual_spend?: number;
  actual_spend_eur?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  leads_generated?: number;
  cost_per_lead?: number | null;
  roi?: number | null;
};

export interface SpendInput {
  amount: number;
  currency?: string;
  amount_eur?: number;
  category?: string;
  description?: string;
  date: string;
  vendor?: string;
  receipt_url?: string;
}

export interface ChannelMetrics {
  channel: string;
  campaigns: number;
  spend: number;
  leads: number;
  cpl: number;
  roi: number;
}

export interface CampaignMetricsSummary {
  activeCampaigns: number;
  totalSpend: number;
  totalLeads: number;
  avgCPL: number;
  avgROI: number;
  byChannel: ChannelMetrics[];
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapCampaign(row: Record<string, unknown>): Campaign {
  return {
    id: String(row.id),
    organization_id: row.organization_id ? String(row.organization_id) : null,
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    channel: String(row.channel),
    status: String(row.status),
    budget: toNumber(row.budget),
    actual_spend: toNumber(row.actual_spend),
    currency: String(row.currency ?? 'EUR'),
    budget_eur: toNumber(row.budget_eur),
    actual_spend_eur: toNumber(row.actual_spend_eur),
    start_date: row.start_date ? String(row.start_date) : null,
    end_date: row.end_date ? String(row.end_date) : null,
    target_audience: row.target_audience ? String(row.target_audience) : null,
    goals: row.goals ? String(row.goals) : null,
    owner_id: row.owner_id ? String(row.owner_id) : null,
    impressions: toNumber(row.impressions),
    clicks: toNumber(row.clicks),
    conversions: toNumber(row.conversions),
    leads_generated: toNumber(row.leads_generated),
    cost_per_lead: row.cost_per_lead == null ? null : toNumber(row.cost_per_lead),
    roi: row.roi == null ? null : toNumber(row.roi),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    owner_name: row.owner_name ? String(row.owner_name) : null,
    spend_count: row.spend_count == null ? undefined : toNumber(row.spend_count),
    lead_count: row.lead_count == null ? undefined : toNumber(row.lead_count),
    content_count: row.content_count == null ? undefined : toNumber(row.content_count),
    deal_value: row.deal_value == null ? undefined : toNumber(row.deal_value),
  };
}

function mapSpendEntry(row: Record<string, unknown>): SpendEntry {
  return {
    id: String(row.id),
    campaign_id: String(row.campaign_id),
    amount: toNumber(row.amount),
    currency: String(row.currency ?? 'EUR'),
    amount_eur: row.amount_eur == null ? null : toNumber(row.amount_eur),
    category: row.category ? String(row.category) : null,
    description: row.description ? String(row.description) : null,
    date: String(row.date),
    vendor: row.vendor ? String(row.vendor) : null,
    finance_expense_id: row.finance_expense_id ? String(row.finance_expense_id) : null,
    receipt_url: row.receipt_url ? String(row.receipt_url) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
    created_by_name: row.created_by_name ? String(row.created_by_name) : null,
  };
}

async function refreshRoiView(): Promise<void> {
  await refreshMaterializedViews([ANALYTICS_VIEWS.marketingRoi]);
}

async function getCampaignBase(ctx: CallerContext, campaignId: string): Promise<Campaign | null> {
  const result = await query(
    `SELECT
       c.*,
       ru.full_name AS owner_name,
       COALESCE(sp.spend_count, 0)::int AS spend_count,
       COALESCE(ld.lead_count, 0)::int AS lead_count,
       COALESCE(ct.content_count, 0)::int AS content_count,
       COALESCE(dv.deal_value, 0)::numeric AS deal_value
     FROM marketing_campaigns c
     LEFT JOIN reimbursement_users ru ON ru.id = c.owner_id
     LEFT JOIN (
       SELECT campaign_id, COUNT(*)::int AS spend_count
       FROM marketing_campaign_spend
       GROUP BY campaign_id
     ) sp ON sp.campaign_id = c.id
     LEFT JOIN (
       SELECT campaign_id, COUNT(*)::int AS lead_count
       FROM marketing_leads
       GROUP BY campaign_id
     ) ld ON ld.campaign_id = c.id
     LEFT JOIN (
       SELECT campaign_id, COUNT(*)::int AS content_count
       FROM marketing_content
       GROUP BY campaign_id
     ) ct ON ct.campaign_id = c.id
     LEFT JOIN (
       SELECT l.campaign_id, COALESCE(SUM(d.amount_eur), 0)::numeric AS deal_value
       FROM marketing_leads l
       JOIN crm_deals d ON d.id = l.crm_deal_id
       GROUP BY l.campaign_id
     ) dv ON dv.campaign_id = c.id
     WHERE c.id = $1
       AND ($2::uuid IS NULL OR c.organization_id = $2::uuid)
     LIMIT 1`,
    [campaignId, ctx.organizationId ?? null],
  );

  return result.rows[0] ? mapCampaign(result.rows[0] as Record<string, unknown>) : null;
}

export async function listCampaigns(
  ctx: CallerContext,
  filters?: CampaignFilters,
  sort?: SortOptions,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<Campaign>> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (ctx.organizationId) {
    conditions.push(`c.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }
  if (filters?.status) {
    conditions.push(`c.status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters?.channel) {
    conditions.push(`c.channel = $${idx++}`);
    params.push(filters.channel);
  }
  if (filters?.ownerId) {
    conditions.push(`c.owner_id = $${idx++}`);
    params.push(filters.ownerId);
  }
  if (filters?.dateRange?.from) {
    conditions.push(`COALESCE(c.start_date, c.created_at::date) >= $${idx++}::date`);
    params.push(filters.dateRange.from);
  }
  if (filters?.dateRange?.to) {
    conditions.push(`COALESCE(c.end_date, c.created_at::date) <= $${idx++}::date`);
    params.push(filters.dateRange.to);
  }
  if (filters?.search) {
    conditions.push(`(c.name ILIKE $${idx} OR COALESCE(c.description, '') ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }

  const whereSQL = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
  const sortColumns: Record<string, string> = {
    name: 'c.name',
    channel: 'c.channel',
    status: 'c.status',
    budget: 'c.budget_eur',
    spend: 'c.actual_spend_eur',
    leads: 'c.leads_generated',
    roi: 'c.roi',
    created: 'c.created_at',
    start_date: 'c.start_date',
  };
  const orderBy = sortColumns[sort?.field ?? 'created'] ?? 'c.created_at';
  const direction = sort?.direction === 'asc' ? 'ASC' : 'DESC';

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*)::int AS count
     FROM marketing_campaigns c
     WHERE ${whereSQL}`,
    params,
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  const pg = paginationClause(page, pageSize, idx);
  const result = await query(
    `SELECT
       c.*,
       ru.full_name AS owner_name,
       COALESCE(sp.spend_count, 0)::int AS spend_count,
       COALESCE(ld.lead_count, 0)::int AS lead_count,
       COALESCE(ct.content_count, 0)::int AS content_count
     FROM marketing_campaigns c
     LEFT JOIN reimbursement_users ru ON ru.id = c.owner_id
     LEFT JOIN (
       SELECT campaign_id, COUNT(*)::int AS spend_count
       FROM marketing_campaign_spend
       GROUP BY campaign_id
     ) sp ON sp.campaign_id = c.id
     LEFT JOIN (
       SELECT campaign_id, COUNT(*)::int AS lead_count
       FROM marketing_leads
       GROUP BY campaign_id
     ) ld ON ld.campaign_id = c.id
     LEFT JOIN (
       SELECT campaign_id, COUNT(*)::int AS content_count
       FROM marketing_content
       GROUP BY campaign_id
     ) ct ON ct.campaign_id = c.id
     WHERE ${whereSQL}
     ORDER BY ${orderBy} ${direction}
     ${pg.clause}`,
    [...params, ...pg.params],
  );

  return {
    data: result.rows.map((row) => mapCampaign(row as Record<string, unknown>)),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getCampaignById(ctx: CallerContext, campaignId: string): Promise<Campaign | null> {
  const campaign = await getCampaignBase(ctx, campaignId);
  if (!campaign) {
    return null;
  }

  const spendEntries = await listSpendEntries(ctx, campaignId);
  return {
    ...campaign,
    spend_entries: spendEntries,
  };
}

export async function createCampaign(ctx: CallerContext, data: CreateCampaignInput): Promise<Campaign> {
  const budget = toNumber(data.budget);
  const result = await query(
    `INSERT INTO marketing_campaigns (
       organization_id, name, description, channel, status, budget, actual_spend,
       currency, budget_eur, actual_spend_eur, start_date, end_date, target_audience,
       goals, owner_id, tags
     )
     VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,0,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      ctx.organizationId ?? null,
      data.name,
      data.description ?? null,
      data.channel,
      data.status ?? 'draft',
      budget,
      (data.currency ?? 'EUR').toUpperCase(),
      budget,
      data.start_date ?? null,
      data.end_date ?? null,
      data.target_audience ?? null,
      data.goals ?? null,
      data.owner_id ?? ctx.userId,
      JSON.stringify(data.tags ?? []),
    ],
  );

  const campaign = mapCampaign(result.rows[0] as Record<string, unknown>);
  eventBus.emit('marketing.campaign.created', {
    campaignId: campaign.id,
    name: campaign.name,
    channel: campaign.channel,
    budget: campaign.budget,
    currency: campaign.currency,
    createdBy: ctx.userId,
  });
  await refreshRoiView();
  return (await getCampaignBase(ctx, campaign.id)) ?? campaign;
}

export async function updateCampaign(
  ctx: CallerContext,
  campaignId: string,
  data: UpdateCampaignInput,
): Promise<Campaign> {
  const fields: Array<[string, unknown]> = [
    ['name', data.name],
    ['description', data.description],
    ['channel', data.channel],
    ['status', data.status],
    ['budget', data.budget],
    ['actual_spend', data.actual_spend],
    ['currency', data.currency?.toUpperCase()],
    ['budget_eur', data.budget],
    ['actual_spend_eur', data.actual_spend_eur ?? data.actual_spend],
    ['start_date', data.start_date],
    ['end_date', data.end_date],
    ['target_audience', data.target_audience],
    ['goals', data.goals],
    ['owner_id', data.owner_id],
    ['impressions', data.impressions],
    ['clicks', data.clicks],
    ['conversions', data.conversions],
    ['leads_generated', data.leads_generated],
    ['cost_per_lead', data.cost_per_lead],
    ['roi', data.roi],
  ];
  if (data.tags !== undefined) {
    fields.push(['tags', JSON.stringify(data.tags)]);
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  for (const [field, value] of fields) {
    if (value !== undefined) {
      sets.push(`${field} = $${idx++}`);
      params.push(value);
    }
  }
  sets.push('updated_at = NOW()');
  params.push(campaignId, ctx.organizationId ?? null);

  const result = await query(
    `UPDATE marketing_campaigns
     SET ${sets.join(', ')}
     WHERE id = $${idx++}
       AND ($${idx}::uuid IS NULL OR organization_id = $${idx}::uuid)
     RETURNING *`,
    params,
  );
  if (!result.rows[0]) {
    throw new Error('Campaign not found');
  }

  await refreshRoiView();
  return (await getCampaignBase(ctx, campaignId)) ?? mapCampaign(result.rows[0] as Record<string, unknown>);
}

export async function launchCampaign(ctx: CallerContext, campaignId: string): Promise<Campaign> {
  const campaign = await updateCampaign(ctx, campaignId, {
    status: 'active',
    start_date: new Date().toISOString().slice(0, 10),
  });

  eventBus.emit('marketing.campaign.launched', {
    campaignId: campaign.id,
    name: campaign.name,
    channel: campaign.channel,
    startDate: campaign.start_date ?? new Date().toISOString().slice(0, 10),
  });
  return campaign;
}

export async function pauseCampaign(ctx: CallerContext, campaignId: string, reason?: string): Promise<Campaign> {
  const campaign = await updateCampaign(ctx, campaignId, { status: 'paused' });
  eventBus.emit('marketing.campaign.paused', {
    campaignId: campaign.id,
    pausedBy: ctx.userId,
    reason,
  });
  return campaign;
}

export async function completeCampaign(ctx: CallerContext, campaignId: string): Promise<Campaign> {
  const base = await getCampaignBase(ctx, campaignId);
  if (!base) {
    throw new Error('Campaign not found');
  }

  const roiResult = await query<{ deal_value: string; deal_count: string }>(
    `SELECT
       COALESCE(SUM(d.amount_eur), 0)::numeric AS deal_value,
       COUNT(DISTINCT l.crm_deal_id)::int AS deal_count
     FROM marketing_leads l
     LEFT JOIN crm_deals d ON d.id = l.crm_deal_id
     WHERE l.campaign_id = $1`,
    [campaignId],
  );
  const dealValue = toNumber(roiResult.rows[0]?.deal_value);
  const roi = base.actual_spend_eur > 0 ? Number((dealValue / base.actual_spend_eur).toFixed(2)) : 0;
  const campaign = await updateCampaign(ctx, campaignId, {
    status: 'completed',
    end_date: new Date().toISOString().slice(0, 10),
    roi,
    cost_per_lead: base.leads_generated > 0 ? Number((base.actual_spend_eur / base.leads_generated).toFixed(2)) : 0,
  });

  eventBus.emit('marketing.campaign.completed', {
    campaignId: campaign.id,
    name: campaign.name,
    leads: campaign.leads_generated,
    spend: campaign.actual_spend_eur,
    roi,
  });
  return campaign;
}

export async function recordSpend(
  ctx: CallerContext,
  campaignId: string,
  data: SpendInput,
): Promise<SpendEntry> {
  const campaign = await getCampaignBase(ctx, campaignId);
  if (!campaign) {
    throw new Error('Campaign not found');
  }

  const amount = toNumber(data.amount);
  const amountEur = data.amount_eur != null ? toNumber(data.amount_eur) : amount;
  const result = await query(
    `INSERT INTO marketing_campaign_spend (
       campaign_id, amount, currency, amount_eur, category, description, date,
       vendor, receipt_url, created_by
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      campaignId,
      amount,
      (data.currency ?? campaign.currency ?? 'EUR').toUpperCase(),
      amountEur,
      data.category ?? null,
      data.description ?? null,
      data.date,
      data.vendor ?? null,
      data.receipt_url ?? null,
      ctx.userId,
    ],
  );

  const actualSpend = campaign.actual_spend + amount;
  const actualSpendEur = campaign.actual_spend_eur + amountEur;
  const leadCount = campaign.leads_generated || 0;

  await updateCampaign(ctx, campaignId, {
    actual_spend: actualSpend,
    actual_spend_eur: actualSpendEur,
    cost_per_lead: leadCount > 0 ? Number((actualSpendEur / leadCount).toFixed(2)) : 0,
  });

  eventBus.emit('marketing.spend.recorded', {
    campaignId,
    amount,
    currency: (data.currency ?? campaign.currency ?? 'EUR').toUpperCase(),
    category: data.category ?? 'other',
    date: data.date,
  });

  if (campaign.budget_eur > 0 && actualSpendEur > campaign.budget_eur) {
    eventBus.emit('marketing.campaign.budget_exceeded', {
      campaignId,
      name: campaign.name,
      budget: campaign.budget_eur,
      actualSpend: actualSpendEur,
      percentOver: Number((((actualSpendEur - campaign.budget_eur) / campaign.budget_eur) * 100).toFixed(2)),
    });
  }

  await refreshRoiView();
  return mapSpendEntry(result.rows[0] as Record<string, unknown>);
}

export async function listSpendEntries(ctx: CallerContext, campaignId: string): Promise<SpendEntry[]> {
  const result = await query(
    `SELECT s.*, ru.full_name AS created_by_name
     FROM marketing_campaign_spend s
     JOIN marketing_campaigns c ON c.id = s.campaign_id
     LEFT JOIN reimbursement_users ru ON ru.id = s.created_by
     WHERE s.campaign_id = $1
       AND ($2::uuid IS NULL OR c.organization_id = $2::uuid)
     ORDER BY s.date DESC, s.created_at DESC`,
    [campaignId, ctx.organizationId ?? null],
  );
  return result.rows.map((row) => mapSpendEntry(row as Record<string, unknown>));
}

export async function getCampaignMetrics(
  ctx: CallerContext,
  period?: string,
): Promise<CampaignMetricsSummary> {
  const interval =
    period === 'year' ? "INTERVAL '1 year'" : period === 'quarter' ? "INTERVAL '3 months'" : "INTERVAL '1 month'";
  const dateFilter = period ? `AND c.created_at >= NOW() - ${interval}` : '';

  const [summaryResult, channelResult] = await Promise.all([
    query<{
      active_campaigns: string;
      total_spend: string;
      total_leads: string;
      avg_cpl: string;
      avg_roi: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE c.status = 'active')::int AS active_campaigns,
         COALESCE(SUM(c.actual_spend_eur), 0)::numeric AS total_spend,
         COALESCE(SUM(c.leads_generated), 0)::int AS total_leads,
         COALESCE(AVG(NULLIF(c.cost_per_lead, 0)), 0)::numeric AS avg_cpl,
         COALESCE(AVG(NULLIF(c.roi, 0)), 0)::numeric AS avg_roi
       FROM marketing_campaigns c
       WHERE ($1::uuid IS NULL OR c.organization_id = $1::uuid)
       ${dateFilter}`,
      [ctx.organizationId ?? null],
    ),
    query<{ channel: string; campaigns: string; spend: string; leads: string; roi: string }>(
      `SELECT
         c.channel,
         COUNT(*)::int AS campaigns,
         COALESCE(SUM(c.actual_spend_eur), 0)::numeric AS spend,
         COALESCE(SUM(c.leads_generated), 0)::int AS leads,
         COALESCE(AVG(NULLIF(c.roi, 0)), 0)::numeric AS roi
       FROM marketing_campaigns c
       WHERE ($1::uuid IS NULL OR c.organization_id = $1::uuid)
       ${dateFilter}
       GROUP BY c.channel
       ORDER BY spend DESC, c.channel ASC`,
      [ctx.organizationId ?? null],
    ),
  ]);

  const summary = summaryResult.rows[0];
  return {
    activeCampaigns: parseInt(summary?.active_campaigns ?? '0', 10),
    totalSpend: toNumber(summary?.total_spend),
    totalLeads: parseInt(summary?.total_leads ?? '0', 10),
    avgCPL: toNumber(summary?.avg_cpl),
    avgROI: toNumber(summary?.avg_roi),
    byChannel: channelResult.rows.map((row) => ({
      channel: row.channel,
      campaigns: parseInt(row.campaigns, 10),
      spend: toNumber(row.spend),
      leads: parseInt(row.leads, 10),
      cpl: parseInt(row.leads, 10) > 0 ? Number((toNumber(row.spend) / parseInt(row.leads, 10)).toFixed(2)) : 0,
      roi: toNumber(row.roi),
    })),
  };
}
