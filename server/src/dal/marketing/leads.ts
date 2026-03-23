import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../middleware/tenantContext.js';
import { eventBus } from '../../events/index.js';
import type { CallerContext, PaginatedResult, SortOptions } from '../types.js';
import { reimbursementUsersPk } from '../reimbursementUsersPk.js';
import { paginationClause } from '../helpers.js';
import { ANALYTICS_VIEWS, refreshMaterializedViews } from '../../services/analytics/materializedViews.js';
import * as crmContacts from '../../modules/crm/dal/contacts.js';
import * as crmDeals from '../../modules/crm/dal/deals.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

export interface Lead {
  id: string;
  organization_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  job_title: string | null;
  phone: string | null;
  source: string;
  campaign_id: string | null;
  content_id: string | null;
  score: number;
  score_factors: Record<string, number>;
  status: string;
  crm_contact_id: string | null;
  crm_deal_id: string | null;
  converted_at: string | null;
  converted_by: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing_page_url: string | null;
  ip_country: string | null;
  tags: string[];
  notes: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
  campaign_name?: string | null;
  content_title?: string | null;
  crm_contact_name?: string | null;
  crm_deal_title?: string | null;
}

export interface LeadFilters {
  status?: string;
  scoreMin?: number;
  scoreMax?: number;
  source?: string;
  campaignId?: string;
  search?: string;
}

export interface CaptureLeadInput {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  job_title?: string;
  phone?: string;
  source: string;
  campaign_id?: string;
  content_id?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  landing_page_url?: string;
  ip_country?: string;
  tags?: string[];
  notes?: string;
}

export type UpdateLeadInput = Partial<CaptureLeadInput> & {
  status?: string;
  score?: number;
  score_factors?: Record<string, number>;
  crm_contact_id?: string | null;
  crm_deal_id?: string | null;
  converted_at?: string | null;
  converted_by?: string | null;
  last_activity_at?: string | null;
};

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function mapLead(row: Record<string, unknown>): Lead {
  return {
    id: String(row.id),
    organization_id: row.organization_id ? String(row.organization_id) : null,
    email: String(row.email),
    first_name: row.first_name ? String(row.first_name) : null,
    last_name: row.last_name ? String(row.last_name) : null,
    company_name: row.company_name ? String(row.company_name) : null,
    job_title: row.job_title ? String(row.job_title) : null,
    phone: row.phone ? String(row.phone) : null,
    source: String(row.source),
    campaign_id: row.campaign_id ? String(row.campaign_id) : null,
    content_id: row.content_id ? String(row.content_id) : null,
    score: toNumber(row.score),
    score_factors:
      row.score_factors && typeof row.score_factors === 'object' ? (row.score_factors as Record<string, number>) : {},
    status: String(row.status),
    crm_contact_id: row.crm_contact_id ? String(row.crm_contact_id) : null,
    crm_deal_id: row.crm_deal_id ? String(row.crm_deal_id) : null,
    converted_at: row.converted_at ? String(row.converted_at) : null,
    converted_by: row.converted_by ? String(row.converted_by) : null,
    utm_source: row.utm_source ? String(row.utm_source) : null,
    utm_medium: row.utm_medium ? String(row.utm_medium) : null,
    utm_campaign: row.utm_campaign ? String(row.utm_campaign) : null,
    landing_page_url: row.landing_page_url ? String(row.landing_page_url) : null,
    ip_country: row.ip_country ? String(row.ip_country) : null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    notes: row.notes ? String(row.notes) : null,
    last_activity_at: row.last_activity_at ? String(row.last_activity_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    campaign_name: row.campaign_name ? String(row.campaign_name) : null,
    content_title: row.content_title ? String(row.content_title) : null,
    crm_contact_name: row.crm_contact_name ? String(row.crm_contact_name) : null,
    crm_deal_title: row.crm_deal_title ? String(row.crm_deal_title) : null,
  };
}

async function refreshRoiView(): Promise<void> {
  await refreshMaterializedViews([ANALYTICS_VIEWS.marketingRoi]);
}

async function getScoringRulePoints(client: PoolClient, organizationId: string | undefined, signal: string): Promise<number> {
  const result = await client.query<{ points: string }>(
    `SELECT points::text
     FROM marketing_scoring_rules
     WHERE signal = $1 AND is_active = true
     ORDER BY CASE WHEN organization_id = $2::uuid THEN 0 ELSE 1 END
     LIMIT 1`,
    [signal, organizationId ?? null],
  );
  return parseInt(result.rows[0]?.points ?? '0', 10);
}

async function maybeLinkCrmContact(client: PoolClient, email: string): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `SELECT id::text
     FROM crm_contacts
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [email],
  );
  return result.rows[0]?.id ?? null;
}

async function getDefaultPipelineAndStage(client: PoolClient): Promise<{ pipelineId: string; stageId: string } | null> {
  const pipelineResult = await client.query<{ id: string }>(
    `SELECT id::text
     FROM crm_pipelines
     ORDER BY is_default DESC, created_at ASC
     LIMIT 1`,
    [],
  );
  const pipelineId = pipelineResult.rows[0]?.id;
  if (!pipelineId) return null;

  const stageResult = await client.query<{ id: string }>(
    `SELECT id::text
     FROM crm_deal_stages
     WHERE pipeline_id = $1 AND is_won = false AND is_lost = false
     ORDER BY position ASC
     LIMIT 1`,
    [pipelineId],
  );
  const stageId = stageResult.rows[0]?.id;
  return stageId ? { pipelineId, stageId } : null;
}

async function findOrCreateCompany(client: PoolClient, tenantId: string, companyName: string): Promise<string | null> {
  const existing = await client.query<{ id: string }>(
    `SELECT id::text
     FROM crm_companies
     WHERE LOWER(name) = LOWER($1)
     LIMIT 1`,
    [companyName],
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const created = await client.query<{ id: string }>(
    `INSERT INTO crm_companies (organization_id, name, created_by)
     VALUES ($1, $2, NULL)
     RETURNING id::text`,
    [tenantId, companyName],
  );
  return created.rows[0]?.id ?? null;
}

async function updateCampaignLeadCount(client: PoolClient, campaignId?: string): Promise<void> {
  if (!campaignId) return;
  await client.query(
    `UPDATE marketing_campaigns c
     SET leads_generated = COALESCE(src.leads_generated, 0),
         cost_per_lead = CASE
           WHEN COALESCE(src.leads_generated, 0) > 0
             THEN ROUND((c.actual_spend_eur / src.leads_generated)::numeric, 2)
           ELSE 0
         END,
         updated_at = NOW()
     FROM (
       SELECT campaign_id, COUNT(*)::int AS leads_generated
       FROM marketing_leads
       WHERE campaign_id = $1
       GROUP BY campaign_id
     ) src
     WHERE c.id = $1`,
    [campaignId],
  );
}

async function getLeadInternal(client: PoolClient, leadId: string): Promise<Lead | null> {
  const result = await client.query(
    `SELECT
       l.*,
       c.name AS campaign_name,
       mc.title AS content_title,
       CONCAT(ct.first_name, ' ', COALESCE(ct.last_name, '')) AS crm_contact_name,
       d.title AS crm_deal_title
     FROM marketing_leads l
     LEFT JOIN marketing_campaigns c ON c.id = l.campaign_id
     LEFT JOIN marketing_content mc ON mc.id = l.content_id
     LEFT JOIN crm_contacts ct ON ct.id = l.crm_contact_id
     LEFT JOIN crm_deals d ON d.id = l.crm_deal_id
     WHERE l.id = $1
     LIMIT 1`,
    [leadId],
  );
  return result.rows[0] ? mapLead(result.rows[0] as Record<string, unknown>) : null;
}

function buildLeadName(lead: Lead): string {
  const full = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim();
  return full || lead.email;
}

function getSourceSignals(source: string): string[] {
  const normalized = source.toLowerCase();
  const mapping: Record<string, string[]> = {
    webinar: ['webinar_register'],
    content_download: ['content_download'],
    pricing_page: ['pricing_view'],
    demo_request: ['demo_request'],
    landing_page: ['form_submit'],
    website: ['form_submit'],
    referral: ['return_visit'],
  };
  return mapping[normalized] ?? ['form_submit'];
}

export async function listLeads(
  ctx: CallerContext,
  filters?: LeadFilters,
  sort?: SortOptions,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<Lead>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listLeads');

  return runInTenant(tenantId, async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

      if (filters?.status) {
      conditions.push(`l.status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters?.source) {
      conditions.push(`l.source = $${idx++}`);
      params.push(filters.source);
    }
    if (filters?.campaignId) {
      conditions.push(`l.campaign_id = $${idx++}`);
      params.push(filters.campaignId);
    }
    if (filters?.scoreMin != null) {
      conditions.push(`l.score >= $${idx++}`);
      params.push(filters.scoreMin);
    }
    if (filters?.scoreMax != null) {
      conditions.push(`l.score <= $${idx++}`);
      params.push(filters.scoreMax);
    }
    if (filters?.search) {
      conditions.push(`(
        l.email ILIKE $${idx}
        OR COALESCE(l.first_name, '') ILIKE $${idx}
        OR COALESCE(l.last_name, '') ILIKE $${idx}
        OR COALESCE(l.company_name, '') ILIKE $${idx}
      )`);
      params.push(`%${filters.search}%`);
      idx++;
    }

    const whereSQL = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
    const sortColumns: Record<string, string> = {
      email: 'l.email',
      score: 'l.score',
      status: 'l.status',
      source: 'l.source',
      last_activity_at: 'l.last_activity_at',
      created: 'l.created_at',
    };
    const orderBy = sortColumns[sort?.field ?? 'created'] ?? 'l.created_at';
    const direction = sort?.direction === 'asc' ? 'ASC' : 'DESC';

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count
       FROM marketing_leads l
       WHERE ${whereSQL}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const pg = paginationClause(page, pageSize, idx);
    const result = await client.query(
      `SELECT
         l.*,
         c.name AS campaign_name,
         mc.title AS content_title,
         CONCAT(ct.first_name, ' ', COALESCE(ct.last_name, '')) AS crm_contact_name,
         d.title AS crm_deal_title
       FROM marketing_leads l
       LEFT JOIN marketing_campaigns c ON c.id = l.campaign_id
       LEFT JOIN marketing_content mc ON mc.id = l.content_id
       LEFT JOIN crm_contacts ct ON ct.id = l.crm_contact_id
       LEFT JOIN crm_deals d ON d.id = l.crm_deal_id
       WHERE ${whereSQL}
       ORDER BY ${orderBy} ${direction} NULLS LAST, l.created_at DESC
       ${pg.clause}`,
      [...params, ...pg.params],
    );

    return {
      data: result.rows.map((row) => mapLead(row as Record<string, unknown>)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });
}

export async function getLeadById(ctx: CallerContext, leadId: string): Promise<Lead | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getLeadById');
  return runInTenant(tenantId, (client) => getLeadInternal(client, leadId));
}

export async function captureLead(ctx: CallerContext, data: CaptureLeadInput): Promise<Lead> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for captureLead');

  return runInTenant(tenantId, async (client) => {
    const signals = getSourceSignals(data.source);
    const pointsList = await Promise.all(signals.map((signal) => getScoringRulePoints(client, ctx.organizationId, signal)));
    const scoreFactors: Record<string, number> = {};
    for (let i = 0; i < signals.length; i += 1) {
      scoreFactors[signals[i]] = pointsList[i];
    }
    const totalScore = clampScore(pointsList.reduce((sum, value) => sum + value, 0));
    const crmContactId = await maybeLinkCrmContact(client, data.email);

    const result = await client.query(
    `INSERT INTO marketing_leads (
       organization_id, email, first_name, last_name, company_name, job_title, phone,
       source, campaign_id, content_id, score, score_factors, status, crm_contact_id,
       utm_source, utm_medium, utm_campaign, landing_page_url, ip_country, tags, notes,
       last_activity_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'new',$13,$14,$15,$16,$17,$18,$19,$20,NOW())
     RETURNING *`,
    [
      tenantId,
      data.email,
      data.first_name ?? null,
      data.last_name ?? null,
      data.company_name ?? null,
      data.job_title ?? null,
      data.phone ?? null,
      data.source,
      data.campaign_id ?? null,
      data.content_id ?? null,
      totalScore,
      JSON.stringify(scoreFactors),
      crmContactId,
      data.utm_source ?? null,
      data.utm_medium ?? null,
      data.utm_campaign ?? null,
      data.landing_page_url ?? null,
      data.ip_country ?? null,
      JSON.stringify(data.tags ?? []),
      data.notes ?? null,
    ],
  );

    const lead = (await getLeadInternal(client, String(result.rows[0].id))) ?? mapLead(result.rows[0] as Record<string, unknown>);
    await updateCampaignLeadCount(client, lead.campaign_id ?? undefined);
    if (lead.content_id) {
      await client.query(
        `UPDATE marketing_content
         SET leads_attributed = COALESCE(leads_attributed, 0) + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [lead.content_id],
      );
    }

    eventBus.emit('marketing.lead.captured', {
      leadId: lead.id,
      email: lead.email,
      source: lead.source,
      campaignId: lead.campaign_id ?? undefined,
      score: lead.score,
    });

    if (lead.score >= 70) {
      eventBus.emit('marketing.lead.scored', {
        leadId: lead.id,
        oldScore: 0,
        newScore: lead.score,
        isHot: true,
      });
    }

    await refreshRoiView();
    return lead;
  });
}

export async function updateLead(ctx: CallerContext, leadId: string, data: UpdateLeadInput): Promise<Lead> {
  const fields: Array<[string, unknown]> = [
    ['email', data.email],
    ['first_name', data.first_name],
    ['last_name', data.last_name],
    ['company_name', data.company_name],
    ['job_title', data.job_title],
    ['phone', data.phone],
    ['source', data.source],
    ['campaign_id', data.campaign_id],
    ['content_id', data.content_id],
    ['score', data.score],
    ['status', data.status],
    ['crm_contact_id', data.crm_contact_id],
    ['crm_deal_id', data.crm_deal_id],
    ['converted_at', data.converted_at],
    ['converted_by', data.converted_by],
    ['utm_source', data.utm_source],
    ['utm_medium', data.utm_medium],
    ['utm_campaign', data.utm_campaign],
    ['landing_page_url', data.landing_page_url],
    ['ip_country', data.ip_country],
    ['notes', data.notes],
    ['last_activity_at', data.last_activity_at],
  ];
  if (data.tags !== undefined) {
    fields.push(['tags', JSON.stringify(data.tags)]);
  }
  if (data.score_factors !== undefined) {
    fields.push(['score_factors', JSON.stringify(data.score_factors)]);
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
  params.push(leadId);

  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for updateLead');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `UPDATE marketing_leads
       SET ${sets.join(', ')}
       WHERE id = $${idx}
       RETURNING *`,
      params,
    );
    if (!result.rows[0]) throw new Error('Lead not found');

    const lead = (await getLeadInternal(client, leadId)) ?? mapLead(result.rows[0] as Record<string, unknown>);
    await updateCampaignLeadCount(client, lead.campaign_id ?? undefined);
    await refreshRoiView();
    return lead;
  });
}

export async function scoreLead(ctx: CallerContext, leadId: string, signal: string): Promise<Lead> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for scoreLead');

  const lead = await getLeadById(ctx, leadId);
  if (!lead) throw new Error('Lead not found');

  const points = await runInTenant(tenantId, (client) => getScoringRulePoints(client, tenantId, signal));
  const nextFactors = { ...(lead.score_factors ?? {}) };
  nextFactors[signal] = (nextFactors[signal] ?? 0) + points;
  const oldScore = lead.score;
  const newScore = clampScore(oldScore + points);
  const status = oldScore < 70 && newScore >= 70 ? 'qualified' : lead.status;

  const updated = await updateLead(ctx, leadId, {
    score: newScore,
    score_factors: nextFactors,
    status,
    last_activity_at: new Date().toISOString(),
  });

  eventBus.emit('marketing.lead.scored', {
    leadId,
    oldScore,
    newScore,
    isHot: newScore >= 70,
  });
  return updated;
}

export async function qualifyLead(ctx: CallerContext, leadId: string): Promise<Lead> {
  const lead = await updateLead(ctx, leadId, {
    status: 'qualified',
    last_activity_at: new Date().toISOString(),
  });
  eventBus.emit('marketing.lead.qualified', {
    leadId,
    qualifiedBy: reimbursementUsersPk(ctx),
    crmDealId: lead.crm_deal_id ?? undefined,
  });
  return lead;
}

export async function convertLeadToCRM(
  ctx: CallerContext,
  leadId: string,
): Promise<{ lead: Lead; contact: crmContacts.Contact; deal: crmDeals.Deal }> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for convertLeadToCRM');

  const lead = await getLeadById(ctx, leadId);
  if (!lead) throw new Error('Lead not found');

  const pipeline = await runInTenant(tenantId, async (client) => getDefaultPipelineAndStage(client));
  if (!pipeline) throw new Error('No CRM pipeline/stage configured');

  let companyId: string | null = null;
  if (lead.company_name) {
    companyId = await runInTenant(tenantId, (client) => findOrCreateCompany(client, tenantId, lead.company_name!));
  }

  let contact = lead.crm_contact_id ? await crmContacts.getContactById(ctx, lead.crm_contact_id) : null;
  if (!contact) {
    contact = await crmContacts.createContact(ctx, {
      company_id: companyId ?? undefined,
      first_name: lead.first_name ?? lead.email.split('@')[0],
      last_name: lead.last_name ?? undefined,
      email: lead.email,
      phone: lead.phone ?? undefined,
      job_title: lead.job_title ?? undefined,
      source: `marketing:${lead.source}`,
      notes: lead.notes ?? undefined,
      tags: lead.tags,
    });
  }

  const deal = await crmDeals.createDeal(ctx, {
    pipeline_id: pipeline.pipelineId,
    stage_id: pipeline.stageId,
    company_id: companyId ?? contact.company_id ?? undefined,
    contact_id: contact.id,
    title: `${lead.company_name ?? buildLeadName(lead)} - Marketing Lead`,
    amount: 0,
    currency: 'EUR',
    description: `Converted from marketing lead ${lead.id} (${lead.source}).`,
    tags: Array.from(new Set(['marketing', lead.source, ...lead.tags])),
  });

  const updatedLead = await updateLead(ctx, leadId, {
    status: 'converted',
    crm_contact_id: contact.id,
    crm_deal_id: deal.id,
    converted_at: new Date().toISOString(),
    converted_by: reimbursementUsersPk(ctx),
    last_activity_at: new Date().toISOString(),
  });

  eventBus.emit('marketing.lead.routed_to_crm', {
    leadId,
    crmContactId: contact.id,
    crmDealId: deal.id,
    pipelineId: pipeline.pipelineId,
  });
  await refreshRoiView();
  return { lead: updatedLead, contact, deal };
}

export async function getHotLeads(ctx: CallerContext): Promise<Lead[]> {
  const result = await listLeads(
    ctx,
    { scoreMin: 70 },
    { field: 'score', direction: 'desc' },
    1,
    100,
  );
  return result.data.filter((lead) => lead.status === 'new' || lead.status === 'contacted');
}
