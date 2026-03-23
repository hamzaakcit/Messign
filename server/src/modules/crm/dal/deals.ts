import type { PoolClient } from 'pg';
import { query } from '../../../db/index.js';
import { withTenantQuery } from '../../../middleware/tenantContext.js';
import { eventBus } from '../../../events/index.js';
import type { CallerContext, PaginatedResult, SortOptions } from '../../../dal/types.js';
import { rbacWhereClause, paginationClause } from '../../../dal/helpers.js';

/** Run query within tenant context. RLS enforces tenant isolation — no manual WHERE tenant_id needed. */
async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

// ── Interfaces ──

export interface Deal {
  id: string;
  organization_id: string;
  pipeline_id: string;
  stage_id: string;
  company_id: string | null;
  contact_id: string | null;
  owner_id: string;
  title: string;
  amount: number;
  currency: string;
  amount_eur: number;
  probability: number;
  expected_close_date: string | null;
  actual_close_date: string | null;
  lost_reason: string | null;
  competitor: string | null;
  description: string | null;
  tags: string[];
  dora_score: number | null;
  dora_next_action: string | null;
  created_at: string;
  updated_at: string;
  stage_name?: string;
  stage_color?: string;
  company_name?: string;
  contact_name?: string;
  owner_name?: string;
  recent_activities?: unknown[];
}

export interface CreateDealInput {
  pipeline_id: string;
  stage_id: string;
  company_id?: string;
  contact_id?: string;
  title: string;
  amount?: number;
  currency?: string;
  probability?: number;
  expected_close_date?: string;
  competitor?: string;
  description?: string;
  tags?: string[];
}

export type UpdateDealInput = Partial<Omit<CreateDealInput, 'pipeline_id' | 'stage_id'>>;

export interface DealFilters {
  pipeline_id?: string;
  stage_id?: string;
  owner_id?: string;
  company_id?: string;
  search?: string;
  min_amount?: number;
  max_amount?: number;
  expected_close_from?: string;
  expected_close_to?: string;
  is_open?: boolean;
}

export interface StageHistoryEntry {
  id: string;
  deal_id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  moved_by: string | null;
  moved_at: string;
  time_in_previous_stage_hours: number | null;
  from_stage_name?: string;
  to_stage_name?: string;
  moved_by_name?: string;
}

export interface SalesMetrics {
  totalPipeline: number;
  weightedPipeline: number;
  dealsWon: number;
  dealsLost: number;
  avgDealSize: number;
  winRate: number;
  avgCycleTime: number;
}

// ── Functions ──

export async function listDeals(
  ctx: CallerContext,
  filters?: DealFilters,
  sort?: SortOptions,
  page: number = 1,
  pageSize: number = 50,
): Promise<PaginatedResult<Deal>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listDeals');

  return runInTenant(tenantId, async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const rbac = rbacWhereClause(ctx, 'd.owner_id', 'd.organization_id', idx);
    if (rbac.clause !== '1=1') {
      conditions.push(rbac.clause);
      params.push(...rbac.params);
      idx += rbac.params.length;
    }

    if (filters?.pipeline_id) {
      conditions.push(`d.pipeline_id = $${idx++}`);
      params.push(filters.pipeline_id);
    }
    if (filters?.stage_id) {
      conditions.push(`d.stage_id = $${idx++}`);
      params.push(filters.stage_id);
    }
    if (filters?.owner_id) {
      conditions.push(`d.owner_id = $${idx++}`);
      params.push(filters.owner_id);
    }
    if (filters?.company_id) {
      conditions.push(`d.company_id = $${idx++}`);
      params.push(filters.company_id);
    }
    if (filters?.min_amount != null) {
      conditions.push(`d.amount >= $${idx++}`);
      params.push(filters.min_amount);
    }
    if (filters?.max_amount != null) {
      conditions.push(`d.amount <= $${idx++}`);
      params.push(filters.max_amount);
    }
    if (filters?.expected_close_from) {
      conditions.push(`d.expected_close_date >= $${idx++}`);
      params.push(filters.expected_close_from);
    }
    if (filters?.expected_close_to) {
      conditions.push(`d.expected_close_date <= $${idx++}`);
      params.push(filters.expected_close_to);
    }
    if (filters?.is_open) {
      conditions.push('s.is_won = false AND s.is_lost = false');
    }
    if (filters?.search) {
      conditions.push(`(d.title ILIKE $${idx} OR co.name ILIKE $${idx})`);
      params.push(`%${filters.search}%`);
      idx++;
    }

    const whereSQL = conditions.length > 0 ? conditions.join(' AND ') : '1=1';

    const sortCol: Record<string, string> = {
      title: 'd.title', amount: 'd.amount', close_date: 'd.expected_close_date',
      created: 'd.created_at', probability: 'd.probability', dora_score: 'd.dora_score',
    };
    const orderBy = sortCol[sort?.field ?? 'created'] ?? 'd.created_at';
    const orderDir = sort?.direction === 'asc' ? 'ASC' : 'DESC';

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM crm_deals d
       JOIN crm_deal_stages s ON s.id = d.stage_id
       LEFT JOIN crm_companies co ON co.id = d.company_id
       WHERE ${whereSQL}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const pg = paginationClause(page, pageSize, idx);
    const dataResult = await client.query(
      `SELECT d.*,
              s.name as stage_name, s.color as stage_color,
              co.name as company_name,
              CONCAT(ct.first_name, ' ', ct.last_name) as contact_name,
              u.full_name as owner_name
       FROM crm_deals d
       JOIN crm_deal_stages s ON s.id = d.stage_id
       LEFT JOIN crm_companies co ON co.id = d.company_id
       LEFT JOIN crm_contacts ct ON ct.id = d.contact_id
       LEFT JOIN reimbursement_users u ON u.id = d.owner_id
       WHERE ${whereSQL}
       ORDER BY ${orderBy} ${orderDir}
       ${pg.clause}`,
      [...params, ...pg.params],
    );

    return { data: dataResult.rows as unknown as Deal[], total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  });
}

export async function getDealById(ctx: CallerContext, dealId: string): Promise<Deal | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getDealById');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT d.*,
              s.name as stage_name, s.color as stage_color,
              co.name as company_name,
              CONCAT(ct.first_name, ' ', ct.last_name) as contact_name,
              u.full_name as owner_name
       FROM crm_deals d
       JOIN crm_deal_stages s ON s.id = d.stage_id
       LEFT JOIN crm_companies co ON co.id = d.company_id
       LEFT JOIN crm_contacts ct ON ct.id = d.contact_id
       LEFT JOIN reimbursement_users u ON u.id = d.owner_id
       WHERE d.id = $1`,
      [dealId],
    );
    if (!result.rows[0]) return null;

    const activitiesResult = await client.query(
      `SELECT a.*, u.full_name as user_name
       FROM crm_activities a
       LEFT JOIN reimbursement_users u ON u.id = a.user_id
       WHERE a.deal_id = $1
       ORDER BY a.created_at DESC LIMIT 10`,
      [dealId],
    );

    return {
      ...result.rows[0],
      recent_activities: activitiesResult.rows,
    } as Deal;
  });
}

export async function createDeal(ctx: CallerContext, data: CreateDealInput): Promise<Deal> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for createDeal');

  return runInTenant(tenantId, async (client) => {
    const amount = data.amount ?? 0;
    const currency = data.currency ?? 'EUR';

    let probability = data.probability;
    if (probability == null) {
      const stageResult = await client.query<{ probability_default: number }>(
        'SELECT probability_default FROM crm_deal_stages WHERE id = $1',
        [data.stage_id],
      );
      probability = stageResult.rows[0]?.probability_default ?? 0;
    }

    const result = await client.query(
      `INSERT INTO crm_deals
       (organization_id, pipeline_id, stage_id, company_id, contact_id, owner_id,
        title, amount, currency, amount_eur, probability, expected_close_date,
        competitor, description, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        tenantId, data.pipeline_id, data.stage_id,
        data.company_id ?? null, data.contact_id ?? null, ctx.userId,
        data.title, amount, currency, amount,
        probability, data.expected_close_date ?? null,
        data.competitor ?? null, data.description ?? null,
        JSON.stringify(data.tags ?? []),
      ],
    );
    const deal = result.rows[0] as Deal;

    await client.query(
      'INSERT INTO crm_deal_stage_history (deal_id, to_stage_id, moved_by) VALUES ($1, $2, $3)',
      [deal.id, deal.stage_id, ctx.userId],
    );

    eventBus.emit('crm.deal.created', {
      dealId: deal.id,
      title: deal.title,
      amount: deal.amount,
      currency: deal.currency,
      ownerId: ctx.userId,
      companyId: deal.company_id ?? undefined,
      stageId: deal.stage_id,
      tenantId,
    });

    return deal;
  });
}

export async function updateDeal(
  ctx: CallerContext,
  dealId: string,
  data: UpdateDealInput,
): Promise<Deal> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for updateDeal');

  return runInTenant(tenantId, async (client) => {
    const fields: [string, unknown][] = [
      ['company_id', data.company_id], ['contact_id', data.contact_id],
      ['title', data.title], ['amount', data.amount], ['currency', data.currency],
      ['probability', data.probability], ['expected_close_date', data.expected_close_date],
      ['competitor', data.competitor], ['description', data.description],
    ];
    if (data.tags !== undefined) {
      fields.push(['tags', JSON.stringify(data.tags)]);
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    const changes: string[] = [];

    for (const [col, val] of fields) {
      if (val !== undefined) {
        sets.push(`${col} = $${idx++}`);
        params.push(val);
        changes.push(col);
      }
    }
    sets.push('updated_at = NOW()');
    params.push(dealId);

    const result = await client.query(
      `UPDATE crm_deals SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );
    if (!result.rows[0]) throw new Error('Deal not found');
    const deal = result.rows[0] as Deal;

    const emitPayload: {
      dealId: string;
      updatedBy: string;
      changes: string[];
      tenantId?: string;
      name?: string;
      value?: number;
      stage?: string;
      description?: string;
    } = { dealId, updatedBy: ctx.userId, changes };

    if (changes.includes('description') && tenantId && deal.description) {
      const stageRow = await client.query(
        'SELECT name FROM crm_deal_stages WHERE id = $1',
        [deal.stage_id],
      );
      emitPayload.tenantId = tenantId;
      emitPayload.name = deal.title;
      emitPayload.value = deal.amount;
      emitPayload.stage = (stageRow.rows[0] as { name: string })?.name ?? '';
      emitPayload.description = deal.description;
    }

    eventBus.emit('crm.deal.updated', emitPayload);

    return deal;
  });
}

export async function moveDealToStage(
  ctx: CallerContext,
  dealId: string,
  newStageId: string,
): Promise<Deal> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for moveDealToStage');

  return runInTenant(tenantId, async (client) => {
    const dealResult = await client.query(
      'SELECT d.*, s.name as old_stage_name FROM crm_deals d JOIN crm_deal_stages s ON s.id = d.stage_id WHERE d.id = $1',
      [dealId],
    );
    if (!dealResult.rows[0]) throw new Error('Deal not found');
    const deal = dealResult.rows[0] as Deal & { old_stage_name: string };

    const newStageResult = await client.query(
      'SELECT * FROM crm_deal_stages WHERE id = $1',
      [newStageId],
    );
    if (!newStageResult.rows[0]) throw new Error('Stage not found');
    const newStage = newStageResult.rows[0] as { id: string; name: string; probability_default: number; is_won: boolean; is_lost: boolean };

    const lastMove = await client.query(
      'SELECT moved_at FROM crm_deal_stage_history WHERE deal_id = $1 ORDER BY moved_at DESC LIMIT 1',
      [dealId],
    );
    const hoursInPrevStage = lastMove.rows[0]
      ? ((Date.now() - new Date(lastMove.rows[0].moved_at).getTime()) / 3600000).toFixed(1)
      : null;

    await client.query(
      `INSERT INTO crm_deal_stage_history (deal_id, from_stage_id, to_stage_id, moved_by, time_in_previous_stage_hours)
       VALUES ($1, $2, $3, $4, $5)`,
      [dealId, deal.stage_id, newStageId, ctx.userId, hoursInPrevStage],
    );

    const updates: string[] = ['stage_id = $1', 'probability = $2', 'updated_at = NOW()'];
    const updateParams: unknown[] = [newStageId, newStage.probability_default];

    if (newStage.is_won) {
      updates.push('actual_close_date = NOW()');
    }

    updateParams.push(dealId);
    await client.query(
      `UPDATE crm_deals SET ${updates.join(', ')} WHERE id = $${updateParams.length}`,
      updateParams,
    );

    eventBus.emit('crm.deal.stage_changed', {
      dealId, oldStage: deal.old_stage_name, newStage: newStage.name,
      amount: deal.amount, movedBy: ctx.userId,
    });

    if (newStage.is_won) {
      eventBus.emit('crm.deal.won', {
        dealId, amount: deal.amount, currency: deal.currency,
        companyId: deal.company_id ?? undefined, ownerId: deal.owner_id,
        closedAt: new Date().toISOString(),
        organizationId: deal.organization_id ?? undefined,
      });
      eventBus.emit('crm.deal.closed', {
        dealId,
        organizationId: deal.organization_id ?? undefined,
        tenantId,
        outcome: 'won',
      });
    }

    if (newStage.is_lost) {
      eventBus.emit('crm.deal.lost', {
        dealId, amount: deal.amount, reason: undefined, ownerId: deal.owner_id,
      });
      eventBus.emit('crm.deal.closed', {
        dealId,
        organizationId: deal.organization_id ?? undefined,
        tenantId,
        outcome: 'lost',
      });
    }

    const result = await client.query(
      `SELECT d.*,
              s.name as stage_name, s.color as stage_color,
              co.name as company_name,
              CONCAT(ct.first_name, ' ', ct.last_name) as contact_name,
              u.full_name as owner_name
       FROM crm_deals d
       JOIN crm_deal_stages s ON s.id = d.stage_id
       LEFT JOIN crm_companies co ON co.id = d.company_id
       LEFT JOIN crm_contacts ct ON ct.id = d.contact_id
       LEFT JOIN reimbursement_users u ON u.id = d.owner_id
       WHERE d.id = $1`,
      [dealId],
    );
    return result.rows[0] as Deal;
  });
}

export async function loseDeal(
  ctx: CallerContext,
  dealId: string,
  reason?: string,
): Promise<Deal> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for loseDeal');

  return runInTenant(tenantId, async (client) => {
    const stageResult = await client.query(
      `SELECT s.id FROM crm_deal_stages s
       JOIN crm_deals d ON d.pipeline_id = s.pipeline_id
       WHERE d.id = $1 AND s.is_lost = true LIMIT 1`,
      [dealId],
    );
    if (!stageResult.rows[0]) throw new Error('No lost stage configured for this pipeline');

    if (reason) {
      await client.query('UPDATE crm_deals SET lost_reason = $1 WHERE id = $2', [reason, dealId]);
    }

    return moveDealToStage(ctx, dealId, stageResult.rows[0].id);
  });
}

export async function getDealHistory(tenantId: string, dealId: string): Promise<StageHistoryEntry[]> {
  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT h.*,
              fs.name as from_stage_name,
              ts.name as to_stage_name,
              u.full_name as moved_by_name
       FROM crm_deal_stage_history h
       LEFT JOIN crm_deal_stages fs ON fs.id = h.from_stage_id
       JOIN crm_deal_stages ts ON ts.id = h.to_stage_id
       LEFT JOIN reimbursement_users u ON u.id = h.moved_by
       WHERE h.deal_id = $1
       ORDER BY h.moved_at`,
      [dealId],
    );
    return result.rows as StageHistoryEntry[];
  });
}

export async function deleteDeal(tenantId: string, dealId: string): Promise<void> {
  return runInTenant(tenantId, async (client) => {
    await client.query('DELETE FROM crm_deals WHERE id = $1', [dealId]);
  });
}

export async function getDealsByStage(
  ctx: CallerContext,
  pipelineId: string,
): Promise<Record<string, Deal[]>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getDealsByStage');

  return runInTenant(tenantId, async (client) => {
    const conditions = ['d.pipeline_id = $1'];
    const params: unknown[] = [pipelineId];
    let idx = 2;

    const rbac = rbacWhereClause(ctx, 'd.owner_id', 'd.organization_id', idx);
    if (rbac.clause !== '1=1') {
      conditions.push(rbac.clause);
      params.push(...rbac.params);
    }

    const result = await client.query(
      `SELECT d.*,
              s.name as stage_name, s.color as stage_color,
              co.name as company_name,
              CONCAT(ct.first_name, ' ', ct.last_name) as contact_name,
              u.full_name as owner_name
       FROM crm_deals d
       JOIN crm_deal_stages s ON s.id = d.stage_id
       LEFT JOIN crm_companies co ON co.id = d.company_id
       LEFT JOIN crm_contacts ct ON ct.id = d.contact_id
       LEFT JOIN reimbursement_users u ON u.id = d.owner_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.position, d.amount DESC`,
      params,
    );

    const grouped: Record<string, Deal[]> = {};
    for (const row of result.rows as Deal[]) {
      if (!grouped[row.stage_id]) grouped[row.stage_id] = [];
      grouped[row.stage_id].push(row);
    }
    return grouped;
  });
}

export async function getSalesMetrics(
  ctx: CallerContext,
  period?: string,
): Promise<SalesMetrics> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getSalesMetrics');

  return runInTenant(tenantId, async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (period) {
      conditions.push(`d.created_at >= $${idx++}::date`);
      params.push(period);
    }

    const whereSQL = conditions.length > 0 ? conditions.join(' AND ') : '1=1';

    const pipelineResult = await client.query<{
      total_pipeline: string; weighted_pipeline: string;
    }>(
      `SELECT
         COALESCE(SUM(d.amount), 0)::numeric as total_pipeline,
         COALESCE(SUM(d.amount * d.probability / 100.0), 0)::numeric as weighted_pipeline
       FROM crm_deals d
       JOIN crm_deal_stages s ON s.id = d.stage_id
       WHERE ${whereSQL} AND s.is_won = false AND s.is_lost = false`,
      params,
    );

    const wonLostResult = await client.query<{
      deals_won: string; deals_lost: string; won_total: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE s.is_won = true)::int as deals_won,
         COUNT(*) FILTER (WHERE s.is_lost = true)::int as deals_lost,
         COALESCE(SUM(d.amount) FILTER (WHERE s.is_won = true), 0)::numeric as won_total
       FROM crm_deals d
       JOIN crm_deal_stages s ON s.id = d.stage_id
       WHERE ${whereSQL}`,
      params,
    );

    const cycleResult = await client.query<{ avg_hours: string }>(
      `SELECT COALESCE(AVG(
         EXTRACT(EPOCH FROM (d.actual_close_date::timestamp - d.created_at)) / 86400
       ), 0)::numeric as avg_hours
       FROM crm_deals d
       JOIN crm_deal_stages s ON s.id = d.stage_id
       WHERE ${whereSQL} AND s.is_won = true AND d.actual_close_date IS NOT NULL`,
      params,
    );

    const dealsWon = parseInt(wonLostResult.rows[0]?.deals_won ?? '0', 10);
    const dealsLost = parseInt(wonLostResult.rows[0]?.deals_lost ?? '0', 10);
    const wonTotal = Number(wonLostResult.rows[0]?.won_total ?? 0);
    const totalClosed = dealsWon + dealsLost;

    return {
      totalPipeline: Number(pipelineResult.rows[0]?.total_pipeline ?? 0),
      weightedPipeline: Number(pipelineResult.rows[0]?.weighted_pipeline ?? 0),
      dealsWon,
      dealsLost,
      avgDealSize: dealsWon > 0 ? wonTotal / dealsWon : 0,
      winRate: totalClosed > 0 ? (dealsWon / totalClosed) * 100 : 0,
      avgCycleTime: Number(cycleResult.rows[0]?.avg_hours ?? 0),
    };
  });
}
