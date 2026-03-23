import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../middleware/tenantContext.js';
import type { CallerContext } from '../types.js';
import { reimbursementUsersPk } from '../reimbursementUsersPk.js';

export interface ApprovalQueueRow {
  id: string;
  organization_id: string;
  content_id: string;
  status: string;
  truth_validation: Record<string, unknown> | null;
  brand_voice_check: Record<string, unknown> | null;
  compliance_scan: Record<string, unknown> | null;
  reviewer_feedback: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: Record<string, unknown>): ApprovalQueueRow {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    content_id: String(row.content_id),
    status: String(row.status),
    truth_validation: row.truth_validation as Record<string, unknown> | null,
    brand_voice_check: row.brand_voice_check as Record<string, unknown> | null,
    compliance_scan: row.compliance_scan as Record<string, unknown> | null,
    reviewer_feedback: row.reviewer_feedback ? String(row.reviewer_feedback) : null,
    rejection_reason: row.rejection_reason ? String(row.rejection_reason) : null,
    reviewed_by: row.reviewed_by ? String(row.reviewed_by) : null,
    reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function upsertApprovalQueue(
  ctx: CallerContext,
  input: {
    content_id: string;
    truth_validation?: Record<string, unknown> | null;
    brand_voice_check?: Record<string, unknown> | null;
    compliance_scan?: Record<string, unknown> | null;
  },
): Promise<ApprovalQueueRow> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required');

  return withTenantQuery(tenantId, async (client: PoolClient) => {
    const result = await client.query(
      `INSERT INTO marketing_approval_queue (
         organization_id, content_id, status,
         truth_validation, brand_voice_check, compliance_scan, updated_at
       )
       VALUES ($1, $2, 'pending', $3, $4, $5, NOW())
       ON CONFLICT (organization_id, content_id)
       DO UPDATE SET
         status = 'pending',
         truth_validation = EXCLUDED.truth_validation,
         brand_voice_check = EXCLUDED.brand_voice_check,
         compliance_scan = EXCLUDED.compliance_scan,
         reviewer_feedback = NULL,
         rejection_reason = NULL,
         reviewed_by = NULL,
         reviewed_at = NULL,
         updated_at = NOW()
       RETURNING *`,
      [
        tenantId,
        input.content_id,
        input.truth_validation ?? null,
        input.brand_voice_check ?? null,
        input.compliance_scan ?? null,
      ],
    );
    return mapRow(result.rows[0] as Record<string, unknown>);
  });
}

/** Joined row for API / UI (content + campaign labels). */
export interface ApprovalQueueListRow extends ApprovalQueueRow {
  content_title: string;
  content_body: string | null;
  user_brief: string | null;
  content_type: string;
  content_channel: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  submitted_at: string;
  revision_history?: unknown;
}

function mapListRow(row: Record<string, unknown>): ApprovalQueueListRow {
  const base = mapRow(row);
  return {
    ...base,
    content_title: String(row.content_title ?? ''),
    content_body: row.content_body != null ? String(row.content_body) : null,
    user_brief: row.user_brief != null ? String(row.user_brief) : null,
    content_type: String(row.content_type ?? ''),
    content_channel: row.content_channel != null ? String(row.content_channel) : null,
    campaign_id: row.campaign_id ? String(row.campaign_id) : null,
    campaign_name: row.campaign_name ? String(row.campaign_name) : null,
    submitted_at: String(row.submitted_at ?? row.created_at ?? ''),
    revision_history: row.revision_history,
  };
}

export async function listApprovalsByStatus(
  ctx: CallerContext,
  status: 'pending' | 'approved' | 'rejected',
): Promise<ApprovalQueueListRow[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required');

  return withTenantQuery(tenantId, async (client: PoolClient) => {
    const result = await client.query(
      `SELECT q.*,
              c.title AS content_title,
              c.body AS content_body,
              c.user_brief,
              c.content_type,
              c.channel AS content_channel,
              c.campaign_id,
              c.revision_history,
              camp.name AS campaign_name,
              q.created_at AS submitted_at
       FROM marketing_approval_queue q
       INNER JOIN marketing_content c ON c.id = q.content_id
       LEFT JOIN marketing_campaigns camp ON camp.id = c.campaign_id
       WHERE q.organization_id = $1 AND q.status = $2
       ORDER BY q.updated_at DESC`,
      [tenantId, status],
    );
    return result.rows.map((r) => mapListRow(r as Record<string, unknown>));
  });
}

export async function getApprovalById(ctx: CallerContext, approvalId: string): Promise<ApprovalQueueRow | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required');

  return withTenantQuery(tenantId, async (client: PoolClient) => {
    const result = await client.query(
      `SELECT * FROM marketing_approval_queue WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [approvalId, tenantId],
    );
    return result.rows[0] ? mapRow(result.rows[0] as Record<string, unknown>) : null;
  });
}

export async function updateApprovalReview(
  ctx: CallerContext,
  approvalId: string,
  input: {
    status: 'approved' | 'rejected';
    reviewer_feedback?: string | null;
    rejection_reason?: string | null;
  },
): Promise<ApprovalQueueRow | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required');

  return withTenantQuery(tenantId, async (client: PoolClient) => {
    const result = await client.query(
      `UPDATE marketing_approval_queue
       SET status = $3,
           reviewer_feedback = $4,
           rejection_reason = $5,
           reviewed_by = $6,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        approvalId,
        tenantId,
        input.status,
        input.reviewer_feedback ?? null,
        input.rejection_reason ?? null,
        reimbursementUsersPk(ctx),
      ],
    );
    return result.rows[0] ? mapRow(result.rows[0] as Record<string, unknown>) : null;
  });
}
