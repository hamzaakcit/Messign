import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../../../middleware/tenantContext.js';
import { eventBus } from '../../../../events/index.js';
import type { CallerContext, PaginatedResult, SortOptions } from '../../../../dal/types.js';
import { paginationClause } from '../../../../dal/helpers.js';
import { ANALYTICS_VIEWS, refreshMaterializedViews } from '../../../../services/analytics/materializedViews.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

export interface RecruitmentJob {
  id: string;
  organization_id: string | null;
  title: string;
  department: string | null;
  department_id: string | null;
  location: string | null;
  location_type: string;
  employment_type: string;
  description: string | null;
  description_html: string | null;
  requirements: string[];
  nice_to_have: string[];
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  status: string;
  hiring_manager_id: string | null;
  recruiter_id: string | null;
  positions_count: number;
  positions_filled: number;
  published_at: string | null;
  closed_at: string | null;
  dora_description_generated: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
  hiring_manager_name?: string | null;
  recruiter_name?: string | null;
  applicant_count?: number;
  applicants?: unknown[];
}

export interface JobFilters {
  status?: string;
  department?: string;
  recruiterId?: string;
  hiringManagerId?: string;
  search?: string;
}

export interface CreateJobInput {
  title: string;
  department?: string;
  department_id?: string;
  location?: string;
  location_type?: string;
  employment_type?: string;
  description?: string;
  description_html?: string;
  requirements?: string[];
  nice_to_have?: string[];
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  status?: string;
  hiring_manager_id?: string;
  recruiter_id?: string;
  positions_count?: number;
  tags?: string[];
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapJob(row: Record<string, unknown>): RecruitmentJob {
  return {
    id: String(row.id),
    organization_id: row.organization_id ? String(row.organization_id) : null,
    title: String(row.title),
    department: row.department ? String(row.department) : null,
    department_id: row.department_id ? String(row.department_id) : null,
    location: row.location ? String(row.location) : null,
    location_type: String(row.location_type ?? 'hybrid'),
    employment_type: String(row.employment_type ?? 'full_time'),
    description: row.description ? String(row.description) : null,
    description_html: row.description_html ? String(row.description_html) : null,
    requirements: Array.isArray(row.requirements) ? (row.requirements as string[]) : [],
    nice_to_have: Array.isArray(row.nice_to_have) ? (row.nice_to_have as string[]) : [],
    salary_min: row.salary_min == null ? null : toNumber(row.salary_min),
    salary_max: row.salary_max == null ? null : toNumber(row.salary_max),
    salary_currency: String(row.salary_currency ?? 'EUR'),
    status: String(row.status ?? 'draft'),
    hiring_manager_id: row.hiring_manager_id ? String(row.hiring_manager_id) : null,
    recruiter_id: row.recruiter_id ? String(row.recruiter_id) : null,
    positions_count: toNumber(row.positions_count),
    positions_filled: toNumber(row.positions_filled),
    published_at: row.published_at ? String(row.published_at) : null,
    closed_at: row.closed_at ? String(row.closed_at) : null,
    dora_description_generated: Boolean(row.dora_description_generated),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    hiring_manager_name: row.hiring_manager_name ? String(row.hiring_manager_name) : null,
    recruiter_name: row.recruiter_name ? String(row.recruiter_name) : null,
    applicant_count: row.applicant_count == null ? undefined : toNumber(row.applicant_count),
  };
}

function departmentEventValue(job: RecruitmentJob): string {
  return job.department_id ?? job.department ?? '';
}

export async function listJobs(
  ctx: CallerContext,
  filters?: JobFilters,
  sort?: SortOptions,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<RecruitmentJob>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listJobs');

  return runInTenant(tenantId, async (client) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters?.status) {
      conditions.push(`j.status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters?.department) {
      conditions.push(`(j.department = $${idx++} OR j.department_id::text = $${idx++})`);
      params.push(filters.department, filters.department);
    }
    if (filters?.recruiterId) {
      conditions.push(`j.recruiter_id = $${idx++}::uuid`);
      params.push(filters.recruiterId);
    }
    if (filters?.hiringManagerId) {
      conditions.push(`j.hiring_manager_id = $${idx++}::uuid`);
      params.push(filters.hiringManagerId);
    }
    if (filters?.search) {
      conditions.push(`(j.title ILIKE $${idx} OR COALESCE(j.department, '') ILIKE $${idx})`);
      params.push(`%${filters.search}%`);
      idx++;
    }

    const whereSQL = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
    const sortColumns: Record<string, string> = {
      title: 'j.title',
      department: 'j.department',
      status: 'j.status',
      published_at: 'j.published_at',
      created_at: 'j.created_at',
      positions_filled: 'j.positions_filled',
    };
    const orderBy = sortColumns[sort?.field ?? 'created_at'] ?? 'j.created_at';
    const direction = sort?.direction === 'asc' ? 'ASC' : 'DESC';

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM recruitment_jobs j WHERE ${whereSQL}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);
    const pg = paginationClause(page, pageSize, idx);

    const result = await client.query(
      `SELECT
         j.*,
         hm.full_name AS hiring_manager_name,
         rc.full_name AS recruiter_name,
         COALESCE(app_counts.applicant_count, 0)::int AS applicant_count
       FROM recruitment_jobs j
       LEFT JOIN reimbursement_users hm ON hm.id = j.hiring_manager_id
       LEFT JOIN reimbursement_users rc ON rc.id = j.recruiter_id
       LEFT JOIN (
         SELECT job_id, COUNT(*)::int AS applicant_count
         FROM recruitment_applications
         GROUP BY job_id
       ) app_counts ON app_counts.job_id = j.id
       WHERE ${whereSQL}
       ORDER BY ${orderBy} ${direction} NULLS LAST
       ${pg.clause}`,
      [...params, ...pg.params],
    );

    return {
      data: result.rows.map((row) => mapJob(row as Record<string, unknown>)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });
}

export async function getJobById(ctx: CallerContext, jobId: string): Promise<RecruitmentJob | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getJobById');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT
         j.*,
         hm.full_name AS hiring_manager_name,
         rc.full_name AS recruiter_name,
         COALESCE(app_counts.applicant_count, 0)::int AS applicant_count
       FROM recruitment_jobs j
       LEFT JOIN reimbursement_users hm ON hm.id = j.hiring_manager_id
       LEFT JOIN reimbursement_users rc ON rc.id = j.recruiter_id
       LEFT JOIN (
         SELECT job_id, COUNT(*)::int AS applicant_count
         FROM recruitment_applications
         GROUP BY job_id
       ) app_counts ON app_counts.job_id = j.id
       WHERE j.id = $1::uuid
       LIMIT 1`,
      [jobId],
    );
    if (!result.rows[0]) return null;

    const applicants = await client.query(
    `SELECT
       a.id::text,
       a.stage,
       a.match_score,
       a.status,
       a.applied_at::text,
       c.id::text AS candidate_id,
       c.first_name,
       c.last_name,
       c.email
     FROM recruitment_applications a
     JOIN recruitment_candidates c ON c.id = a.candidate_id
     WHERE a.job_id = $1::uuid
     ORDER BY a.applied_at DESC`,
      [jobId],
    );

    return {
      ...mapJob(result.rows[0] as Record<string, unknown>),
      applicants: applicants.rows,
    };
  });
}

export async function createJob(ctx: CallerContext, data: CreateJobInput): Promise<RecruitmentJob> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for createJob');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
    `INSERT INTO recruitment_jobs (
       organization_id, title, department, department_id, location, location_type, employment_type,
       description, description_html, requirements, nice_to_have, salary_min, salary_max,
       salary_currency, status, hiring_manager_id, recruiter_id, positions_count, tags
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING *`,
    [
      tenantId,
      data.title,
      data.department ?? null,
      data.department_id ?? null,
      data.location ?? null,
      data.location_type ?? 'hybrid',
      data.employment_type ?? 'full_time',
      data.description ?? null,
      data.description_html ?? null,
      JSON.stringify(data.requirements ?? []),
      JSON.stringify(data.nice_to_have ?? []),
      data.salary_min ?? null,
      data.salary_max ?? null,
      data.salary_currency ?? 'EUR',
      data.status ?? 'draft',
      data.hiring_manager_id ?? null,
      data.recruiter_id ?? ctx.userId,
      data.positions_count ?? 1,
      JSON.stringify(data.tags ?? []),
    ],
  );
    const job = (await getJobById(ctx, String(result.rows[0].id))) ?? mapJob(result.rows[0] as Record<string, unknown>);
    await refreshMaterializedViews([ANALYTICS_VIEWS.recruitmentFunnel]);

    eventBus.emit('recruitment.job.posted', {
      jobId: job.id,
      title: job.title,
      departmentId: departmentEventValue(job),
      postedBy: ctx.userId,
    });
    return job;
  });
}

export async function updateJob(
  ctx: CallerContext,
  jobId: string,
  data: Partial<CreateJobInput> & { positions_filled?: number },
): Promise<RecruitmentJob> {
  const fields: Array<[string, unknown]> = [
    ['title', data.title],
    ['department', data.department],
    ['department_id', data.department_id],
    ['location', data.location],
    ['location_type', data.location_type],
    ['employment_type', data.employment_type],
    ['description', data.description],
    ['description_html', data.description_html],
    ['salary_min', data.salary_min],
    ['salary_max', data.salary_max],
    ['salary_currency', data.salary_currency],
    ['status', data.status],
    ['hiring_manager_id', data.hiring_manager_id],
    ['recruiter_id', data.recruiter_id],
    ['positions_count', data.positions_count],
    ['positions_filled', data.positions_filled],
  ];
  if (data.requirements !== undefined) fields.push(['requirements', JSON.stringify(data.requirements)]);
  if (data.nice_to_have !== undefined) fields.push(['nice_to_have', JSON.stringify(data.nice_to_have)]);
  if (data.tags !== undefined) fields.push(['tags', JSON.stringify(data.tags)]);

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
  params.push(jobId);

  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for updateJob');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `UPDATE recruitment_jobs
       SET ${sets.join(', ')}
       WHERE id = $${idx}::uuid
       RETURNING *`,
      params,
    );
    if (!result.rows[0]) throw new Error('Job not found');
    await refreshMaterializedViews([ANALYTICS_VIEWS.recruitmentFunnel]);
    return (await getJobById(ctx, jobId)) ?? mapJob(result.rows[0] as Record<string, unknown>);
  });
}

export async function publishJob(ctx: CallerContext, jobId: string): Promise<RecruitmentJob> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for publishJob');

  const job = await updateJob(ctx, jobId, { status: 'open' });
  await runInTenant(tenantId, async (client) => {
    await client.query(
      `UPDATE recruitment_jobs
       SET published_at = COALESCE(published_at, NOW()), updated_at = NOW()
       WHERE id = $1::uuid`,
      [jobId],
    );
  });
  const refreshed = (await getJobById(ctx, jobId)) ?? job;
  eventBus.emit('recruitment.job.posted', {
    jobId: refreshed.id,
    title: refreshed.title,
    departmentId: departmentEventValue(refreshed),
    postedBy: ctx.userId,
  });
  return refreshed;
}

export async function closeJob(ctx: CallerContext, jobId: string, reason: string = 'closed'): Promise<RecruitmentJob> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for closeJob');

  const job = await updateJob(ctx, jobId, { status: 'closed' });
  await runInTenant(tenantId, async (client) => {
    await client.query(
      `UPDATE recruitment_jobs
       SET closed_at = NOW(), updated_at = NOW()
       WHERE id = $1::uuid`,
      [jobId],
    );
  });
  const refreshed = (await getJobById(ctx, jobId)) ?? job;
  eventBus.emit('recruitment.job.closed', {
    jobId: refreshed.id,
    title: refreshed.title,
    reason,
    hiredCount: refreshed.positions_filled,
  });
  return refreshed;
}

export async function getJobMetrics(ctx: CallerContext, jobId?: string): Promise<Record<string, unknown>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getJobMetrics');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query<Record<string, unknown>>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'open')::int AS open_positions,
         COALESCE(SUM(positions_count - positions_filled) FILTER (WHERE status IN ('open', 'paused')), 0)::int AS vacancies,
         COALESCE(SUM(total_applicants), 0)::int AS applicants,
         COALESCE(AVG(avg_match_score), 0)::numeric AS avg_match_score
       FROM mv_recruitment_funnel f
       JOIN recruitment_jobs j ON j.id = f.job_id
       WHERE ($1::uuid IS NULL OR f.job_id = $1::uuid)
         AND j.organization_id = $2::uuid`,
      [jobId ?? null, tenantId],
    );
    return result.rows[0] ?? {};
  });
}
