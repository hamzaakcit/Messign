/**
 * Marketing operational tools — business logic for LLM-triggered / API workflows.
 * Returns plain results; HTTP layer wraps in `{ success, data?, error? }`.
 */
import { eventBus } from '../events/index.js';
import type { CallerContext } from '../dal/types.js';
import * as campaignDal from '../dal/marketing/campaigns.js';
import * as contentDal from '../dal/marketing/content.js';
import * as approvalsDal from '../dal/marketing/approvalsQueue.js';
import type { ApprovalQueueListRow } from '../dal/marketing/approvalsQueue.js';
import { executeContentWorkflow } from '../services/ai/marketing/marketingContentWorkflow.js';
import type {
  AssignApprovalInput,
  CampaignBudgetAllocateInput,
  CreateCampaignToolInput,
  ScheduleContentInput,
  SubmitReviewInput,
} from './marketingToolsSchemas.js';

export type ToolControllerResult<T> = { ok: true; data: T } | { ok: false; error: string };

function financeJournalStub(campaignId: string, amount: number, currency: string, note?: string): void {
  // TODO(Finance integration): createJournalEntry({
  //   debitAccount: 'Marketing Expense',
  //   creditAccount: 'Cash' | 'Accrued Expenses',
  //   amount,
  //   currency,
  //   memo: `Campaign budget allocation ${campaignId}`,
  //   sourceModule: 'marketing',
  //   referenceId: campaignId,
  // });
  void campaignId;
  void amount;
  void currency;
  void note;
}

export async function createCampaignTool(
  ctx: CallerContext,
  payload: CreateCampaignToolInput,
): Promise<ToolControllerResult<{ campaign_id: string; campaign: campaignDal.Campaign }>> {
  try {
    const composedGoals = [payload.objective, payload.channel_mix?.length ? `Channel mix: ${payload.channel_mix.join(', ')}` : '']
      .filter(Boolean)
      .join('\n\n');

    const campaign = await campaignDal.createCampaign(ctx, {
      name: payload.name,
      description: payload.description,
      channel: payload.channel,
      status: payload.status ?? 'draft',
      budget: payload.budget,
      currency: payload.currency,
      start_date: payload.timeline_start,
      end_date: payload.timeline_end,
      target_audience: payload.target_audience,
      goals: payload.goals?.trim() || composedGoals || undefined,
      tags: payload.tags,
      owner_id: payload.owner_id,
    });

    return { ok: true, data: { campaign_id: campaign.id, campaign } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'create_campaign failed' };
  }
}

export async function campaignBudgetAllocate(
  ctx: CallerContext,
  campaignId: string,
  payload: CampaignBudgetAllocateInput,
): Promise<ToolControllerResult<{ campaign_id: string; budget: number; finance_stub: true }>> {
  try {
    const existing = await campaignDal.getCampaignById(ctx, campaignId);
    if (!existing) {
      return { ok: false, error: 'Campaign not found' };
    }

    const currency = (payload.currency ?? existing.currency ?? 'EUR').toUpperCase();
    financeJournalStub(campaignId, payload.amount, currency, payload.note);

    const updated = await campaignDal.updateCampaign(ctx, campaignId, {
      budget: payload.amount,
      currency,
    });

    return {
      ok: true,
      data: { campaign_id: updated.id, budget: updated.budget, finance_stub: true },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'campaign_budget_allocate failed' };
  }
}

export async function pauseCampaignTool(
  ctx: CallerContext,
  campaignId: string,
  reason?: string,
): Promise<ToolControllerResult<{ campaign_id: string; status: string }>> {
  try {
    const c = await campaignDal.pauseCampaign(ctx, campaignId, reason);
    return { ok: true, data: { campaign_id: c.id, status: c.status } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'pause_campaign failed' };
  }
}

export async function assignApproval(
  ctx: CallerContext,
  payload: AssignApprovalInput,
): Promise<ToolControllerResult<{ approval_id: string; content_id: string }>> {
  try {
    const content = await contentDal.getContentById(ctx, payload.content_id);
    if (!content) {
      return { ok: false, error: 'Content not found' };
    }

    const row = await approvalsDal.upsertApprovalQueue(ctx, {
      content_id: payload.content_id,
      truth_validation: (payload.validation_scores.truth_validation ?? null) as Record<string, unknown> | null,
      brand_voice_check: (payload.validation_scores.brand_voice_check ?? null) as Record<string, unknown> | null,
      compliance_scan: (payload.validation_scores.compliance_scan ?? null) as Record<string, unknown> | null,
    });

    await contentDal.updateContent(ctx, payload.content_id, {
      status: 'in_review',
    });

    return { ok: true, data: { approval_id: row.id, content_id: row.content_id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'assign_approval failed' };
  }
}

export async function listApprovals(
  ctx: CallerContext,
  status: 'pending' | 'approved' | 'rejected',
): Promise<ToolControllerResult<{ items: ApprovalQueueListRow[] }>> {
  try {
    const items = await approvalsDal.listApprovalsByStatus(ctx, status);
    return { ok: true, data: { items } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'list_approvals failed' };
  }
}

export async function submitReview(
  ctx: CallerContext,
  approvalId: string,
  payload: SubmitReviewInput,
): Promise<ToolControllerResult<{ approval_id: string; content_id: string; content_status: string }>> {
  try {
    const row = await approvalsDal.getApprovalById(ctx, approvalId);
    if (!row) {
      return { ok: false, error: 'Approval not found' };
    }

    const updated = await approvalsDal.updateApprovalReview(ctx, approvalId, {
      status: payload.status,
      reviewer_feedback: payload.feedback ?? null,
      rejection_reason: payload.rejection_reason ?? null,
    });
    if (!updated) {
      return { ok: false, error: 'Failed to update approval' };
    }

    if (payload.status === 'approved') {
      const c = await contentDal.updateContent(ctx, row.content_id, { status: 'approved' });
      return {
        ok: true,
        data: { approval_id: updated.id, content_id: row.content_id, content_status: c.status },
      };
    }

    const contentBefore = await contentDal.getContentById(ctx, row.content_id);
    const priorRevisions = Array.isArray(contentBefore?.revision_history) ? contentBefore.revision_history : [];
    const snapshot = contentBefore
      ? {
          version: priorRevisions.length + 1,
          label: 'Before AI revision',
          savedAt: new Date().toISOString(),
          body: contentBefore.body ?? '',
          feedback: payload.feedback ?? '',
          rejection_reason: payload.rejection_reason ?? null,
        }
      : null;

    await contentDal.updateContent(ctx, row.content_id, {
      status: 'draft',
      ...(snapshot ? { revision_history: [...priorRevisions, snapshot] } : {}),
    });

    eventBus.emit('marketing.content.revision_requested', {
      organizationId: ctx.organizationId ?? '',
      contentId: row.content_id,
      approvalId: updated.id,
      feedback: payload.feedback ?? '',
      rejectionReason: payload.rejection_reason ?? 'other',
      requestedBy: ctx.userId,
    });

    const orgId = ctx.organizationId;
    if (orgId && contentBefore) {
      const baseBrief = contentBefore.user_brief?.trim() || contentBefore.title;
      const instruction = `The human reviewer rejected this draft. Reason: ${payload.rejection_reason ?? 'other'}. Specific feedback: ${payload.feedback ?? ''}. Rewrite it.`;
      const brief = `${baseBrief}\n\n---\n\n${instruction}`;
      void executeContentWorkflow(brief, {
        organizationId: orgId,
        tenantId: orgId,
        caller: ctx,
        contentId: row.content_id,
        userRole: 'marketing',
      }).catch((err) => console.error('[submitReview] executeContentWorkflow (revision) failed', err));
    }

    return {
      ok: true,
      data: { approval_id: updated.id, content_id: row.content_id, content_status: 'draft' },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'submit_review failed' };
  }
}

export async function scheduleContent(
  ctx: CallerContext,
  payload: ScheduleContentInput,
): Promise<ToolControllerResult<{ content_id: string; scheduled_date: string; status: string }>> {
  try {
    const content = await contentDal.getContentById(ctx, payload.content_id);
    if (!content) {
      return { ok: false, error: 'Content not found' };
    }
    if (content.status !== 'approved') {
      return {
        ok: false,
        error: `Content must be approved before scheduling (current: ${content.status})`,
      };
    }

    const updated = await contentDal.updateContent(ctx, payload.content_id, {
      status: 'scheduled',
      scheduled_date: payload.scheduled_date,
      ...(payload.scheduled_time !== undefined ? { scheduled_time: payload.scheduled_time } : {}),
      channel: payload.channel ?? content.channel ?? undefined,
    });

    return {
      ok: true,
      data: {
        content_id: updated.id,
        scheduled_date: payload.scheduled_date,
        status: updated.status,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'schedule_content failed' };
  }
}
