import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../../../middleware/tenantContext.js';
import { eventBus } from '../../../../events/index.js';
import type { CallerContext, PaginatedResult } from '../../../../dal/types.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

export interface InterviewFilters {
  applicationId?: string;
  interviewerId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ScheduleInterviewInput {
  application_id: string;
  interviewer_id: string;
  interview_type?: string;
  scheduled_at: string;
  duration_minutes?: number;
  location?: string;
  notes?: string;
}

export interface CompleteInterviewInput {
  rating: number;
  recommendation: string;
  feedback?: string;
  skills_assessed?: Array<Record<string, unknown>>;
}

export async function listInterviews(
  ctx: CallerContext,
  filters?: InterviewFilters,
): Promise<PaginatedResult<Record<string, unknown>>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listInterviews');

  return runInTenant(tenantId, async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
      if (filters?.applicationId) {
      conditions.push(`i.application_id = $${idx++}::uuid`);
      params.push(filters.applicationId);
    }
    if (filters?.interviewerId) {
      conditions.push(`i.interviewer_id = $${idx++}::uuid`);
      params.push(filters.interviewerId);
    }
    if (filters?.dateFrom) {
      conditions.push(`i.scheduled_at >= $${idx++}::timestamptz`);
      params.push(filters.dateFrom);
    }
    if (filters?.dateTo) {
      conditions.push(`i.scheduled_at <= $${idx++}::timestamptz`);
      params.push(filters.dateTo);
    }
    const whereSQL = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
    const result = await client.query(
      `SELECT
         i.*,
         ru.full_name AS interviewer_name,
         a.candidate_id::text,
         c.first_name,
         c.last_name,
         j.title AS job_title
       FROM recruitment_interviews i
       JOIN recruitment_applications a ON a.id = i.application_id
       JOIN recruitment_jobs j ON j.id = a.job_id
       JOIN recruitment_candidates c ON c.id = a.candidate_id
       LEFT JOIN reimbursement_users ru ON ru.id = i.interviewer_id
       WHERE ${whereSQL}
       ORDER BY i.scheduled_at ASC`,
      params,
    );
    return {
      data: result.rows as Record<string, unknown>[],
      total: result.rows.length,
      page: 1,
      pageSize: result.rows.length || 1,
      totalPages: 1,
    };
  });
}

export async function scheduleInterview(ctx: CallerContext, data: ScheduleInterviewInput): Promise<Record<string, unknown>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for scheduleInterview');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
    `INSERT INTO recruitment_interviews (
       application_id, interviewer_id, interview_type, scheduled_at, duration_minutes, location, notes
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      data.application_id,
      data.interviewer_id,
      data.interview_type ?? 'video',
      data.scheduled_at,
      data.duration_minutes ?? 60,
      data.location ?? null,
      data.notes ?? null,
    ],
  );
    const interview = result.rows[0] as Record<string, unknown>;
    const appResult = await client.query<{ candidate_id: string }>(
      `SELECT candidate_id::text FROM recruitment_applications WHERE id = $1::uuid LIMIT 1`,
      [data.application_id],
    );
    eventBus.emit('recruitment.interview.scheduled', {
      interviewId: String(interview.id),
      applicationId: data.application_id,
      candidateId: appResult.rows[0]?.candidate_id ?? '',
      interviewerId: data.interviewer_id,
      scheduledAt: data.scheduled_at,
    });
    return interview;
  });
}

export async function completeInterview(
  ctx: CallerContext,
  interviewId: string,
  data: CompleteInterviewInput,
): Promise<Record<string, unknown>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for completeInterview');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
    `UPDATE recruitment_interviews
     SET status = 'completed',
         rating = $1,
         recommendation = $2,
         feedback = $3,
         skills_assessed = $4,
         completed_at = NOW()
     WHERE id = $5::uuid
     RETURNING *`,
    [
      data.rating,
      data.recommendation,
      data.feedback ?? null,
      JSON.stringify(data.skills_assessed ?? []),
      interviewId,
    ],
  );
    const interview = result.rows[0] as Record<string, unknown> | undefined;
    if (!interview) throw new Error('Interview not found');
    const appResult = await client.query<{ application_id: string; candidate_id: string }>(
      `SELECT i.application_id::text AS application_id, a.candidate_id::text AS candidate_id
       FROM recruitment_interviews i
       JOIN recruitment_applications a ON a.id = i.application_id
       WHERE i.id = $1::uuid`,
      [interviewId],
    );
    eventBus.emit('recruitment.interview.completed', {
      interviewId,
      applicationId: appResult.rows[0]?.application_id ?? '',
      candidateId: appResult.rows[0]?.candidate_id ?? '',
      rating: data.rating,
      recommendation: data.recommendation,
    });
    return interview;
  });
}

export async function cancelInterview(
  ctx: CallerContext,
  interviewId: string,
  notes?: string,
): Promise<Record<string, unknown>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for cancelInterview');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
    `UPDATE recruitment_interviews
     SET status = 'cancelled',
         notes = COALESCE($1, notes)
     WHERE id = $2::uuid
     RETURNING *`,
    [notes ?? null, interviewId],
  );
    if (!result.rows[0]) throw new Error('Interview not found');
    return result.rows[0] as Record<string, unknown>;
  });
}
