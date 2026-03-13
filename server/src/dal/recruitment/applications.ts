import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../middleware/tenantContext.js';
import { eventBus } from '../../events/index.js';
import type { CallerContext, PaginatedResult, SortOptions } from '../types.js';
import { paginationClause } from '../helpers.js';
import { getCandidateById } from './candidates.js';
import { ANALYTICS_VIEWS, refreshMaterializedViews } from '../../services/analytics/materializedViews.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

export type RecruitmentStage =
  | 'applied'
  | 'screening'
  | 'phone_screen'
  | 'interview'
  | 'assessment'
  | 'final_interview'
  | 'offer'
  | 'hired'
  | 'rejected'
  | 'withdrawn';

export interface RecruitmentApplication {
  id: string;
  job_id: string;
  candidate_id: string;
  stage: RecruitmentStage;
  match_score: number | null;
  match_details: Record<string, unknown>;
  screened_method: 'ai' | 'manual' | null;
  screened_at: string | null;
  cover_letter: string | null;
  status: string;
  rejection_reason: string | null;
  rejection_stage: string | null;
  source: string | null;
  applied_at: string;
  last_stage_change_at: string;
  created_at: string;
  updated_at: string;
  candidate?: Record<string, unknown>;
  interviews?: Record<string, unknown>[];
  offers?: Record<string, unknown>[];
  stage_history?: Record<string, unknown>[];
}

export interface ApplicationFilters {
  jobId?: string;
  stage?: string;
  scoreMin?: number;
  scoreMax?: number;
  search?: string;
}

export interface CreateApplicationInput {
  job_id: string;
  candidate_id: string;
  stage?: RecruitmentStage;
  cover_letter?: string;
  source?: string;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapApplication(row: Record<string, unknown>): RecruitmentApplication {
  return {
    id: String(row.id),
    job_id: String(row.job_id),
    candidate_id: String(row.candidate_id),
    stage: String(row.stage ?? 'applied') as RecruitmentStage,
    match_score: row.match_score == null ? null : toNumber(row.match_score),
    match_details:
      row.match_details && typeof row.match_details === 'object'
        ? (row.match_details as Record<string, unknown>)
        : {},
    screened_method:
      row.screened_method === 'ai' || row.screened_method === 'manual'
        ? row.screened_method
        : null,
    screened_at: row.screened_at ? String(row.screened_at) : null,
    cover_letter: row.cover_letter ? String(row.cover_letter) : null,
    status: String(row.status ?? 'active'),
    rejection_reason: row.rejection_reason ? String(row.rejection_reason) : null,
    rejection_stage: row.rejection_stage ? String(row.rejection_stage) : null,
    source: row.source ? String(row.source) : null,
    applied_at: String(row.applied_at),
    last_stage_change_at: String(row.last_stage_change_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function extractSkills(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[,\n]/)
        .map((part) => part.trim().toLowerCase())
        .filter((part) => part.length > 1),
    ),
  );
}

async function scoreAgainstJob(client: PoolClient, jobId: string, candidateId: string): Promise<{ matchScore: number; details: Record<string, unknown> }> {
  const [jobResult, candidateResult] = await Promise.all([
    client.query<{ requirements: unknown; nice_to_have: unknown; title: string }>(
      `SELECT requirements, nice_to_have, title FROM recruitment_jobs WHERE id = $1::uuid LIMIT 1`,
      [jobId],
    ),
    client.query<{ resume_text: string | null; resume_parsed: Record<string, unknown> | null }>(
      `SELECT resume_text, resume_parsed FROM recruitment_candidates WHERE id = $1::uuid LIMIT 1`,
      [candidateId],
    ),
  ]);
  const job = jobResult.rows[0];
  const candidate = candidateResult.rows[0];
  const requirements = Array.isArray(job?.requirements) ? (job.requirements as string[]) : [];
  const niceToHave = Array.isArray(job?.nice_to_have) ? (job.nice_to_have as string[]) : [];
  const resumeText = candidate?.resume_text ?? '';
  const parsedSkills = Array.isArray(candidate?.resume_parsed?.skills)
    ? (candidate?.resume_parsed?.skills as string[])
    : [];
  const allSkillText = `${resumeText}\n${parsedSkills.join('\n')}`.toLowerCase();
  const matchedSkills = requirements.filter((req) => allSkillText.includes(req.toLowerCase()));
  const missingSkills = requirements.filter((req) => !allSkillText.includes(req.toLowerCase()));
  const bonusSkills = niceToHave.filter((req) => allSkillText.includes(req.toLowerCase()));
  const fallbackSkills = extractSkills(allSkillText).slice(0, 20);
  const totalSignals = Math.max(requirements.length, 1);
  const baseScore = Math.round((matchedSkills.length / totalSignals) * 85);
  const bonus = Math.min(15, bonusSkills.length * 5);
  return {
    matchScore: Math.min(100, baseScore + bonus),
    details: {
      matched_skills: matchedSkills,
      missing_skills: missingSkills,
      bonus_skills: bonusSkills,
      inferred_skills: fallbackSkills,
      job_title: job?.title ?? null,
    },
  };
}

export async function listApplications(
  ctx: CallerContext,
  filters?: ApplicationFilters,
  sort?: SortOptions,
  page: number = 1,
  pageSize: number = 30,
): Promise<PaginatedResult<RecruitmentApplication>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listApplications');

  return runInTenant(tenantId, async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
      if (filters?.jobId) {
      conditions.push(`a.job_id = $${idx++}::uuid`);
      params.push(filters.jobId);
    }
    if (filters?.stage) {
      conditions.push(`a.stage = $${idx++}`);
      params.push(filters.stage);
    }
    if (filters?.scoreMin != null) {
      conditions.push(`COALESCE(a.match_score, 0) >= $${idx++}`);
      params.push(filters.scoreMin);
    }
    if (filters?.scoreMax != null) {
      conditions.push(`COALESCE(a.match_score, 0) <= $${idx++}`);
      params.push(filters.scoreMax);
    }
    if (filters?.search) {
      conditions.push(`(
        c.first_name ILIKE $${idx}
        OR COALESCE(c.last_name, '') ILIKE $${idx}
        OR c.email ILIKE $${idx}
        OR COALESCE(c.current_company, '') ILIKE $${idx}
      )`);
      params.push(`%${filters.search}%`);
      idx++;
    }
    const whereSQL = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
    const sortColumns: Record<string, string> = {
      applied_at: 'a.applied_at',
      stage: 'a.stage',
      score: 'a.match_score',
      created_at: 'a.created_at',
    };
    const orderBy = sortColumns[sort?.field ?? 'applied_at'] ?? 'a.applied_at';
    const direction = sort?.direction === 'asc' ? 'ASC' : 'DESC';
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count
       FROM recruitment_applications a
       JOIN recruitment_jobs j ON j.id = a.job_id
       JOIN recruitment_candidates c ON c.id = a.candidate_id
       WHERE ${whereSQL}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);
    const pg = paginationClause(page, pageSize, idx);
    const result = await client.query(
      `SELECT
         a.*,
         c.first_name,
         c.last_name,
         c.email,
         c.current_company,
         c.current_title,
         c.resume_url,
         c.resume_text,
         c.source AS candidate_source,
         j.title AS job_title
       FROM recruitment_applications a
       JOIN recruitment_jobs j ON j.id = a.job_id
       JOIN recruitment_candidates c ON c.id = a.candidate_id
       WHERE ${whereSQL}
       ORDER BY ${orderBy} ${direction} NULLS LAST
       ${pg.clause}`,
      [...params, ...pg.params],
    );
    return {
      data: result.rows.map((row) => {
        const app = mapApplication(row as Record<string, unknown>);
        app.candidate = {
          id: app.candidate_id,
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          current_company: row.current_company,
          current_title: row.current_title,
          resume_url: row.resume_url,
          resume_text: row.resume_text,
          source: row.candidate_source,
        };
        return app;
      }),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });
}

export async function getApplicationById(ctx: CallerContext, applicationId: string): Promise<RecruitmentApplication | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getApplicationById');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT a.*
       FROM recruitment_applications a
       JOIN recruitment_jobs j ON j.id = a.job_id
       WHERE a.id = $1::uuid
       LIMIT 1`,
      [applicationId],
    );
    if (!result.rows[0]) return null;
    const application = mapApplication(result.rows[0] as Record<string, unknown>);
    const [candidate, interviews, offers, history] = await Promise.all([
      getCandidateById(ctx, application.candidate_id),
      client.query(`SELECT * FROM recruitment_interviews WHERE application_id = $1::uuid ORDER BY scheduled_at DESC`, [applicationId]),
      client.query(`SELECT * FROM recruitment_offers WHERE application_id = $1::uuid ORDER BY created_at DESC`, [applicationId]),
      client.query(
        `SELECT h.*, ru.full_name AS moved_by_name
         FROM recruitment_stage_history h
         LEFT JOIN reimbursement_users ru ON ru.id = h.moved_by
         WHERE application_id = $1::uuid
         ORDER BY moved_at DESC`,
        [applicationId],
      ),
    ]);
    return {
      ...application,
      candidate: candidate ? (candidate as unknown as Record<string, unknown>) : undefined,
      interviews: interviews.rows as Record<string, unknown>[],
      offers: offers.rows as Record<string, unknown>[],
      stage_history: history.rows as Record<string, unknown>[],
    };
  });
}

export async function createApplication(ctx: CallerContext, data: CreateApplicationInput): Promise<RecruitmentApplication> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for createApplication');

  return runInTenant(tenantId, async (client) => {
    const scoring = await scoreAgainstJob(client, data.job_id, data.candidate_id);
    const result = await client.query(
    `INSERT INTO recruitment_applications (
       job_id, candidate_id, stage, match_score, match_details, screened_method, screened_at,
       cover_letter, source
     )
     VALUES ($1,$2,$3,$4,$5,'manual',NOW(),$6,$7)
     RETURNING *`,
    [
      data.job_id,
      data.candidate_id,
      data.stage ?? 'applied',
      scoring.matchScore,
      JSON.stringify(scoring.details),
      data.cover_letter ?? null,
      data.source ?? null,
    ],
  );
    const applicationId = String(result.rows[0].id);
    await client.query(
      `INSERT INTO recruitment_stage_history (application_id, from_stage, to_stage, moved_by, notes)
       VALUES ($1::uuid, NULL, $2, $3::uuid, 'Application created')`,
      [applicationId, data.stage ?? 'applied', ctx.userId],
    );
    await refreshMaterializedViews([ANALYTICS_VIEWS.recruitmentFunnel]);
    eventBus.emit('recruitment.application.received', {
      applicationId,
      jobId: data.job_id,
      candidateId: data.candidate_id,
      source: data.source ?? 'manual',
    });
    eventBus.emit('recruitment.candidate.screened', {
      applicationId,
      candidateId: data.candidate_id,
      matchScore: scoring.matchScore,
      screenedBy: ctx.userId,
      method: 'manual',
    });
    return (await getApplicationById(ctx, applicationId)) ?? mapApplication(result.rows[0] as Record<string, unknown>);
  });
}

export async function moveToStage(
  ctx: CallerContext,
  applicationId: string,
  newStage: RecruitmentStage,
  notes?: string,
): Promise<RecruitmentApplication> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for moveToStage');

  const existing = await getApplicationById(ctx, applicationId);
  if (!existing) throw new Error('Application not found');

  await runInTenant(tenantId, async (client) => {
    const status =
      newStage === 'hired' ? 'hired' :
      newStage === 'rejected' ? 'rejected' :
      newStage === 'withdrawn' ? 'withdrawn' :
      'active';
    await client.query(
      `UPDATE recruitment_applications
       SET stage = $1,
           status = $2,
           rejection_stage = CASE WHEN $1 = 'rejected' THEN $3 ELSE rejection_stage END,
           last_stage_change_at = NOW(),
           updated_at = NOW()
       WHERE id = $4::uuid`,
      [newStage, status, existing.stage, applicationId],
    );
    await client.query(
      `INSERT INTO recruitment_stage_history (application_id, from_stage, to_stage, moved_by, notes)
       VALUES ($1::uuid, $2, $3, $4::uuid, $5)`,
      [applicationId, existing.stage, newStage, ctx.userId, notes ?? null],
    );
  });
  const updated = await getApplicationById(ctx, applicationId);
  if (!updated) throw new Error('Application not found after update');
  await refreshMaterializedViews([ANALYTICS_VIEWS.recruitmentFunnel]);

  eventBus.emit('recruitment.candidate.stage_changed', {
    applicationId,
    candidateId: updated.candidate_id,
    jobId: updated.job_id,
    oldStage: existing.stage,
    newStage,
    movedBy: ctx.userId,
  });
  if (newStage === 'rejected') {
    eventBus.emit('recruitment.candidate.rejected', {
      applicationId,
      candidateId: updated.candidate_id,
      jobId: updated.job_id,
      reason: notes ?? updated.rejection_reason ?? 'Rejected',
      stage: existing.stage,
    });
  }
  if (newStage === 'hired') {
    const [job, offer] = await runInTenant(tenantId, async (client) => {
      const jobRes = await client.query<{ department_id: string | null; department: string | null; organization_id: string | null }>(
        `SELECT department_id::text, department, organization_id::text FROM recruitment_jobs WHERE id = $1::uuid`,
        [updated.job_id],
      );
      const offerRes = await client.query<{ salary: string | number | null; start_date: string | null }>(
        `SELECT salary, start_date::text
         FROM recruitment_offers
         WHERE application_id = $1::uuid AND status = 'accepted'
         ORDER BY created_at DESC
         LIMIT 1`,
        [applicationId],
      );
      return [jobRes, offerRes] as const;
    });
    eventBus.emit('recruitment.candidate.hired', {
      applicationId,
      candidateId: updated.candidate_id,
      jobId: updated.job_id,
      departmentId: job.rows[0]?.department_id ?? job.rows[0]?.department ?? '',
      startDate: offer.rows[0]?.start_date ?? new Date().toISOString().slice(0, 10),
      salary: toNumber(offer.rows[0]?.salary ?? 0),
      organizationId: job.rows[0]?.organization_id ?? undefined,
    });
  }
  return updated;
}

export async function rejectApplication(
  ctx: CallerContext,
  applicationId: string,
  reason: string,
): Promise<RecruitmentApplication> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for rejectApplication');

  await runInTenant(tenantId, async (client) => {
    await client.query(
      `UPDATE recruitment_applications
       SET rejection_reason = $1, updated_at = NOW()
       WHERE id = $2::uuid`,
      [reason, applicationId],
    );
  });
  return moveToStage(ctx, applicationId, 'rejected', reason);
}

export async function getApplicationsByStage(
  ctx: CallerContext,
  jobId?: string,
): Promise<Record<string, RecruitmentApplication[]>> {
  const stages: RecruitmentStage[] = [
    'applied',
    'screening',
    'phone_screen',
    'interview',
    'assessment',
    'final_interview',
    'offer',
    'hired',
  ];
  const results = await listApplications(ctx, { jobId }, { field: 'applied_at', direction: 'desc' }, 1, 500);
  return stages.reduce<Record<string, RecruitmentApplication[]>>((acc, stage) => {
    acc[stage] = results.data.filter((application) => application.stage === stage);
    return acc;
  }, {});
}

export async function updateApplicationScore(
  applicationId: string,
  matchScore: number,
  matchDetails: Record<string, unknown>,
  method: 'ai' | 'manual' = 'ai',
  tenantId?: string,
): Promise<void> {
  if (!tenantId) throw new Error('Tenant context required for updateApplicationScore');

  await runInTenant(tenantId, async (client) => {
    await client.query(
      `UPDATE recruitment_applications
       SET match_score = $1,
           match_details = $2,
           screened_method = $3,
           screened_at = NOW(),
           updated_at = NOW()
       WHERE id = $4::uuid`,
      [matchScore, JSON.stringify(matchDetails), method, applicationId],
    );
  });
  await refreshMaterializedViews([ANALYTICS_VIEWS.recruitmentFunnel]);
}
