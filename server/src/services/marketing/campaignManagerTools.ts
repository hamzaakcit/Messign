/**
 * Campaign Manager tool services — lifecycle, calendar, budget + finance boundary, HITL gates.
 *
 * Human confirmation: mutating operations expect `confirmed === true` (LLM must obtain approval first).
 * If missing, returns `{ ok: true, requires_confirmation: true, pending_action, preview }` — do not persist.
 *
 * DB: `organization_id` on legacy tables = `workspace_id` on 075 tables (same UUID).
 */
import { withTenantQuery } from '../../middleware/tenantContext.js';
import type { CallerContext } from '../../dal/types.js';
import * as campaignDal from '../../dal/marketing/campaigns.js';
import { mapCampaign } from '../../dal/marketing/campaigns.js';
import * as contentDal from '../../dal/marketing/content.js';
import { upsertBudgetAllocation } from '../../dal/marketing/budgetAllocations.js';
import { upsertContentCalendar } from '../../dal/marketing/contentCalendar.js';
import { fetchCampaignOperationsMetrics } from '../../dal/marketing/campaignMetrics.js';
import { createFinanceJournalEntry } from '../finance/marketingJournalBridge.js';
import { eventBus } from '../../events/index.js';

// ─── Result shape (orchestrator / tool runner can branch on requires_confirmation) ───

export type CampaignManagerResult<T> =
  | { ok: true; data: T }
  | { ok: true; requires_confirmation: true; pending_action: string; preview?: unknown }
  | { ok: false; error: string };

/** When `confirmed !== true`, return this instead of mutating. */
function needsConfirmation(
  action: string,
  preview: unknown,
): CampaignManagerResult<never> {
  return {
    ok: true,
    requires_confirmation: true,
    pending_action: action,
    preview,
  };
}

function parseDateOnly(s: string): string {
  return s.trim().slice(0, 10);
}

/** HH:MM or HH:MM:SS → HH:MM:SS (UTC components for timestamptz) */
function normalizeTime(t?: string): string {
  if (!t?.trim()) return '12:00:00';
  const s = t.trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return '12:00:00';
}

/** `end_date > start_date` when both present. */
function assertDateRange(start?: string | null, end?: string | null): void {
  if (!start || !end) return;
  const a = parseDateOnly(start);
  const b = parseDateOnly(end);
  if (a >= b) {
    throw new Error('Invalid date range: end_date must be after start_date.');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1) Campaign lifecycle
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateCampaignPayload {
  name: string;
  objective?: string;
  target_audience?: string;
  start_date?: string;
  end_date?: string;
  /** Maps to `marketing_campaigns.budget` (total budget). */
  total_budget?: number;
  channel: string;
  currency?: string;
  /** Required for any INSERT — set true after human approves in UI. */
  confirmed?: boolean;
}

/**
 * Insert a new campaign row. Validates date ordering; stores objective + budget when migration 075 applied.
 */
export async function createCampaignToolService(
  ctx: CallerContext,
  payload: CreateCampaignPayload,
): Promise<CampaignManagerResult<{ campaign_id: string }>> {
  const preview = {
    name: payload.name,
    objective: payload.objective,
    channel: payload.channel,
    total_budget: payload.total_budget,
    start_date: payload.start_date,
    end_date: payload.end_date,
  };
  if (payload.confirmed !== true) {
    return needsConfirmation('create_campaign', preview);
  }

  try {
    assertDateRange(payload.start_date, payload.end_date);
    const c = await campaignDal.createCampaign(ctx, {
      name: payload.name,
      objective: payload.objective,
      channel: payload.channel,
      status: 'draft',
      budget: payload.total_budget,
      currency: payload.currency,
      start_date: payload.start_date,
      end_date: payload.end_date,
      target_audience: payload.target_audience,
    });
    return { ok: true, data: { campaign_id: c.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'create_campaign failed' };
  }
}

export interface PauseCampaignPayload {
  confirmed?: boolean;
  reason?: string;
}

export async function pauseCampaignToolService(
  ctx: CallerContext,
  campaignId: string,
  payload: PauseCampaignPayload = {},
): Promise<CampaignManagerResult<{ campaign_id: string; status: string }>> {
  if (payload.confirmed !== true) {
    return needsConfirmation('pause_campaign', { campaignId });
  }
  const tenantId = ctx.organizationId;
  if (!tenantId) {
    return { ok: false, error: 'Missing workspace context' };
  }
  try {
    const c = await withTenantQuery(tenantId, async (client) => {
      const up = await client.query(
        `UPDATE marketing_campaigns
         SET status = 'paused', updated_at = NOW()
         WHERE id = $1 AND organization_id = $2
         RETURNING *`,
        [campaignId, tenantId],
      );
      if (!up.rows[0]) throw new Error('Campaign not found');
      await client.query(
        `UPDATE marketing_content_calendar
         SET status = 'paused', updated_at = NOW()
         WHERE workspace_id = $1 AND campaign_id = $2 AND status = 'scheduled'`,
        [tenantId, campaignId],
      );
      return mapCampaign(up.rows[0] as Record<string, unknown>);
    });
    eventBus.emit('marketing.campaign.paused', {
      campaignId: c.id,
      pausedBy: ctx.userId,
      reason: payload.reason,
    });
    return { ok: true, data: { campaign_id: c.id, status: c.status } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'pause_campaign failed' };
  }
}

export interface CloneCampaignPayload {
  confirmed?: boolean;
}

/**
 * Clone campaign + copy `marketing_budget_allocations` rows with spent reset via upsert amounts only.
 */
export async function cloneCampaignToolService(
  ctx: CallerContext,
  campaignId: string,
  payload: CloneCampaignPayload = {},
): Promise<CampaignManagerResult<{ campaign_id: string }>> {
  if (payload.confirmed !== true) {
    return needsConfirmation('clone_campaign', { source_campaign_id: campaignId });
  }
  try {
    const c = await campaignDal.cloneCampaign(ctx, campaignId);
    return { ok: true, data: { campaign_id: c.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'clone_campaign failed' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2) Finance boundary — single transaction: allocation upsert + journal stub
// ═══════════════════════════════════════════════════════════════════════════

export interface CampaignBudgetAllocatePayload {
  channel: string;
  amount: number;
  isPrepaid: boolean;
  currency?: string;
  confirmed?: boolean;
}

/**
 * Upsert `marketing_budget_allocations`, then call finance OS hook.
 * If `createFinanceJournalEntry` throws, `withTenantQuery` rolls back the allocation write.
 */
export async function campaignBudgetAllocateToolService(
  ctx: CallerContext,
  campaignId: string,
  payload: CampaignBudgetAllocatePayload,
): Promise<
  CampaignManagerResult<{
    campaign_id: string;
    channel: string;
    allocated_amount: number;
    finance_journal_entry_id: string;
  }>
> {
  const tenantId = ctx.organizationId;
  if (!tenantId) {
    return { ok: false, error: 'Missing workspace context' };
  }

  const preview = {
    campaignId,
    channel: payload.channel,
    amount: payload.amount,
    isPrepaid: payload.isPrepaid,
  };
  if (payload.confirmed !== true) {
    return needsConfirmation('campaign_budget_allocate', preview);
  }

  const existing = await campaignDal.getCampaignById(ctx, campaignId);
  if (!existing) {
    return { ok: false, error: 'Campaign not found' };
  }

  const currency = (payload.currency ?? existing.currency ?? 'EUR').toUpperCase();

  try {
    const result = await withTenantQuery(tenantId, async (client) => {
      const row = await upsertBudgetAllocation(
        client,
        tenantId,
        campaignId,
        payload.channel,
        payload.amount,
        currency,
      );

      const journal = await createFinanceJournalEntry(
        {
          workspaceId: tenantId,
          amount: payload.amount,
          currency,
          isPrepaid: payload.isPrepaid,
          description: `Marketing Expense for Campaign ${campaignId} (${payload.channel})`,
          campaignId,
          channel: payload.channel,
        },
        client,
      );

      return {
        campaign_id: campaignId,
        channel: row.channel,
        allocated_amount: row.allocated_amount,
        finance_journal_entry_id: journal.journalEntryId,
      };
    });

    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'campaign_budget_allocate failed' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3) Calendar — strict approval gate
// ═══════════════════════════════════════════════════════════════════════════

export interface ScheduleContentPayload {
  scheduled_date: string;
  channel: string;
  campaign_id?: string;
  /** ISO time optional; default midday UTC */
  scheduled_time?: string;
  confirmed?: boolean;
}

/** Payload for {@link scheduleContentOperation} (no HITL `confirmed` flag). */
export type ScheduleContentOperationInput = Omit<ScheduleContentPayload, 'confirmed'>;

/**
 * Strict scheduling gate: only `marketing_content.status === 'approved'` may enter the calendar.
 * Throws `Error("Cannot schedule unapproved content.")` otherwise (Phase 4 matrix / tests).
 * Inserts `marketing_content_calendar` with status `scheduled` and updates content schedule fields.
 */
export async function scheduleContentOperation(
  ctx: CallerContext,
  contentId: string,
  payload: ScheduleContentOperationInput,
): Promise<{ content_id: string; calendar_id: string }> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Missing workspace context');

  const content = await contentDal.getContentById(ctx, contentId);
  if (!content) {
    throw new Error('Content not found');
  }
  if (content.status !== 'approved') {
    throw new Error('Cannot schedule unapproved content.');
  }

  const datePart = parseDateOnly(payload.scheduled_date);
  const timeForDb = normalizeTime(payload.scheduled_time);
  const [Y, M, D] = datePart.split('-').map((x) => parseInt(x, 10));
  const [hh, mm, ss] = timeForDb.split(':').map((x) => parseInt(x, 10));
  const scheduledAtIso = new Date(Date.UTC(Y, M - 1, D, hh, mm, ss || 0)).toISOString();

  return withTenantQuery(tenantId, async (client) => {
    const cal = await upsertContentCalendar(
      client,
      tenantId,
      contentId,
      payload.campaign_id ?? content.campaign_id ?? null,
      scheduledAtIso,
      payload.channel,
      'scheduled',
    );

    const upd = await client.query(
      `UPDATE marketing_content
       SET status = 'scheduled',
           scheduled_date = $1::date,
           scheduled_time = $2::time,
           channel = $3,
           updated_at = NOW()
       WHERE id = $4 AND organization_id = $5
       RETURNING id`,
      [datePart, timeForDb, payload.channel, contentId, tenantId],
    );
    if (upd.rowCount === 0) {
      throw new Error('Content update failed (tenant or id mismatch)');
    }

    return { content_id: contentId, calendar_id: cal.id };
  });
}

/**
 * HITL wrapper: requires `confirmed === true`, otherwise returns preview only.
 * Maps {@link scheduleContentOperation} errors to `{ ok: false, error }` for tool runners.
 */
export async function scheduleContentToolService(
  ctx: CallerContext,
  contentId: string,
  payload: ScheduleContentPayload,
): Promise<CampaignManagerResult<{ content_id: string; calendar_id: string }>> {
  if (payload.confirmed !== true) {
    return needsConfirmation('schedule_content', { contentId, ...payload });
  }

  try {
    const { confirmed: _confirmed, ...opPayload } = payload;
    const result = await scheduleContentOperation(ctx, contentId, opPayload);
    return { ok: true, data: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'schedule_content failed';
    if (msg === 'Cannot schedule unapproved content.') {
      return { ok: false, error: 'Cannot schedule unapproved content.' };
    }
    return { ok: false, error: msg };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4) Metrics (read-only — no confirmation)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aggregates budget allocation sums + published pieces + pending human approvals for one campaign.
 */
export async function trackCampaignMetricsToolService(
  ctx: CallerContext,
  campaignId: string,
): Promise<CampaignManagerResult<Record<string, unknown>>> {
  try {
    const m = await fetchCampaignOperationsMetrics(ctx, campaignId);
    return {
      ok: true,
      data: {
        campaign_id: m.campaign_id,
        allocated_vs_spent: {
          total_allocated: m.total_allocated,
          total_spent: m.total_spent,
          remaining: m.total_allocated - m.total_spent,
        },
        published_content_count: m.published_content_count,
        pending_approval_count: m.pending_approval_count,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'track_campaign_metrics failed' };
  }
}
