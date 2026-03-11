import { query } from '../../db/index.js';
import type { CallerContext, PaginatedResult, SortOptions } from '../types.js';
import { paginationClause } from '../helpers.js';

export interface RecruitmentCandidate {
  id: string;
  organization_id: string | null;
  first_name: string;
  last_name: string | null;
  email: string;
  phone: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  current_company: string | null;
  current_title: string | null;
  location: string | null;
  resume_url: string | null;
  resume_file_name: string | null;
  resume_text: string | null;
  resume_parsed: Record<string, unknown>;
  source: string | null;
  referrer_id: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  referrer_name?: string | null;
}

export interface CandidateFilters {
  source?: string;
  search?: string;
}

export interface CreateCandidateInput {
  first_name: string;
  last_name?: string;
  email: string;
  phone?: string;
  linkedin_url?: string;
  portfolio_url?: string;
  current_company?: string;
  current_title?: string;
  location?: string;
  resume_url?: string;
  resume_file_name?: string;
  resume_text?: string;
  resume_parsed?: Record<string, unknown>;
  source?: string;
  referrer_id?: string;
  notes?: string;
  tags?: string[];
}

function mapCandidate(row: Record<string, unknown>): RecruitmentCandidate {
  return {
    id: String(row.id),
    organization_id: row.organization_id ? String(row.organization_id) : null,
    first_name: String(row.first_name),
    last_name: row.last_name ? String(row.last_name) : null,
    email: String(row.email),
    phone: row.phone ? String(row.phone) : null,
    linkedin_url: row.linkedin_url ? String(row.linkedin_url) : null,
    portfolio_url: row.portfolio_url ? String(row.portfolio_url) : null,
    current_company: row.current_company ? String(row.current_company) : null,
    current_title: row.current_title ? String(row.current_title) : null,
    location: row.location ? String(row.location) : null,
    resume_url: row.resume_url ? String(row.resume_url) : null,
    resume_file_name: row.resume_file_name ? String(row.resume_file_name) : null,
    resume_text: row.resume_text ? String(row.resume_text) : null,
    resume_parsed:
      row.resume_parsed && typeof row.resume_parsed === 'object'
        ? (row.resume_parsed as Record<string, unknown>)
        : {},
    source: row.source ? String(row.source) : null,
    referrer_id: row.referrer_id ? String(row.referrer_id) : null,
    notes: row.notes ? String(row.notes) : null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    referrer_name: row.referrer_name ? String(row.referrer_name) : null,
  };
}

export async function listCandidates(
  ctx: CallerContext,
  filters?: CandidateFilters,
  sort?: SortOptions,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<RecruitmentCandidate>> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (ctx.organizationId) {
    conditions.push(`c.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }
  if (filters?.source) {
    conditions.push(`c.source = $${idx++}`);
    params.push(filters.source);
  }
  if (filters?.search) {
    conditions.push(`(
      c.first_name ILIKE $${idx}
      OR COALESCE(c.last_name, '') ILIKE $${idx}
      OR c.email ILIKE $${idx}
      OR COALESCE(c.current_company, '') ILIKE $${idx}
      OR COALESCE(c.resume_text, '') ILIKE $${idx}
    )`);
    params.push(`%${filters.search}%`);
    idx++;
  }
  const whereSQL = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
  const sortColumns: Record<string, string> = {
    name: 'c.first_name',
    email: 'c.email',
    source: 'c.source',
    created_at: 'c.created_at',
  };
  const orderBy = sortColumns[sort?.field ?? 'created_at'] ?? 'c.created_at';
  const direction = sort?.direction === 'asc' ? 'ASC' : 'DESC';

  const countResult = await query<{ count: string }>(`SELECT COUNT(*)::int AS count FROM recruitment_candidates c WHERE ${whereSQL}`, params);
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);
  const pg = paginationClause(page, pageSize, idx);
  const result = await query(
    `SELECT c.*, ru.full_name AS referrer_name
     FROM recruitment_candidates c
     LEFT JOIN reimbursement_users ru ON ru.id = c.referrer_id
     WHERE ${whereSQL}
     ORDER BY ${orderBy} ${direction}
     ${pg.clause}`,
    [...params, ...pg.params],
  );
  return {
    data: result.rows.map((row) => mapCandidate(row as Record<string, unknown>)),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getCandidateById(ctx: CallerContext, candidateId: string): Promise<RecruitmentCandidate | null> {
  const result = await query(
    `SELECT c.*, ru.full_name AS referrer_name
     FROM recruitment_candidates c
     LEFT JOIN reimbursement_users ru ON ru.id = c.referrer_id
     WHERE c.id = $1::uuid
       AND ($2::uuid IS NULL OR c.organization_id = $2::uuid)
     LIMIT 1`,
    [candidateId, ctx.organizationId ?? null],
  );
  return result.rows[0] ? mapCandidate(result.rows[0] as Record<string, unknown>) : null;
}

export async function createCandidate(ctx: CallerContext, data: CreateCandidateInput): Promise<RecruitmentCandidate> {
  const result = await query(
    `INSERT INTO recruitment_candidates (
       organization_id, first_name, last_name, email, phone, linkedin_url, portfolio_url,
       current_company, current_title, location, resume_url, resume_file_name, resume_text,
       resume_parsed, source, referrer_id, notes, tags
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT (organization_id, email) DO UPDATE
     SET first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         phone = EXCLUDED.phone,
         linkedin_url = EXCLUDED.linkedin_url,
         portfolio_url = EXCLUDED.portfolio_url,
         current_company = EXCLUDED.current_company,
         current_title = EXCLUDED.current_title,
         location = EXCLUDED.location,
         resume_url = COALESCE(EXCLUDED.resume_url, recruitment_candidates.resume_url),
         resume_file_name = COALESCE(EXCLUDED.resume_file_name, recruitment_candidates.resume_file_name),
         resume_text = COALESCE(EXCLUDED.resume_text, recruitment_candidates.resume_text),
         resume_parsed = COALESCE(EXCLUDED.resume_parsed, recruitment_candidates.resume_parsed),
         source = COALESCE(EXCLUDED.source, recruitment_candidates.source),
         referrer_id = COALESCE(EXCLUDED.referrer_id, recruitment_candidates.referrer_id),
         notes = COALESCE(EXCLUDED.notes, recruitment_candidates.notes),
         tags = COALESCE(EXCLUDED.tags, recruitment_candidates.tags),
         updated_at = NOW()
     RETURNING *`,
    [
      ctx.organizationId ?? null,
      data.first_name,
      data.last_name ?? null,
      data.email,
      data.phone ?? null,
      data.linkedin_url ?? null,
      data.portfolio_url ?? null,
      data.current_company ?? null,
      data.current_title ?? null,
      data.location ?? null,
      data.resume_url ?? null,
      data.resume_file_name ?? null,
      data.resume_text ?? null,
      JSON.stringify(data.resume_parsed ?? {}),
      data.source ?? null,
      data.referrer_id ?? null,
      data.notes ?? null,
      JSON.stringify(data.tags ?? []),
    ],
  );
  return (await getCandidateById(ctx, String(result.rows[0].id))) ?? mapCandidate(result.rows[0] as Record<string, unknown>);
}

export async function updateCandidate(
  ctx: CallerContext,
  candidateId: string,
  data: Partial<CreateCandidateInput>,
): Promise<RecruitmentCandidate> {
  const fields: Array<[string, unknown]> = [
    ['first_name', data.first_name],
    ['last_name', data.last_name],
    ['email', data.email],
    ['phone', data.phone],
    ['linkedin_url', data.linkedin_url],
    ['portfolio_url', data.portfolio_url],
    ['current_company', data.current_company],
    ['current_title', data.current_title],
    ['location', data.location],
    ['resume_url', data.resume_url],
    ['resume_file_name', data.resume_file_name],
    ['resume_text', data.resume_text],
    ['source', data.source],
    ['referrer_id', data.referrer_id],
    ['notes', data.notes],
  ];
  if (data.resume_parsed !== undefined) fields.push(['resume_parsed', JSON.stringify(data.resume_parsed)]);
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
  params.push(candidateId, ctx.organizationId ?? null);

  const result = await query(
    `UPDATE recruitment_candidates
     SET ${sets.join(', ')}
     WHERE id = $${idx++}::uuid
       AND ($${idx}::uuid IS NULL OR organization_id = $${idx}::uuid)
     RETURNING *`,
    params,
  );
  if (!result.rows[0]) throw new Error('Candidate not found');
  return (await getCandidateById(ctx, candidateId)) ?? mapCandidate(result.rows[0] as Record<string, unknown>);
}

export async function searchCandidates(
  ctx: CallerContext,
  search: string,
  limit: number = 20,
): Promise<RecruitmentCandidate[]> {
  const result = await listCandidates(ctx, { search }, { field: 'created_at', direction: 'desc' }, 1, limit);
  return result.data;
}

export async function parseResume(resumeText: string): Promise<Record<string, unknown>> {
  const normalized = resumeText.toLowerCase();
  const knownSkills = [
    'react', 'typescript', 'javascript', 'node', 'python', 'sql', 'postgres',
    'docker', 'kubernetes', 'aws', 'figma', 'product', 'sales', 'marketing',
  ];
  const skills = knownSkills.filter((skill) => normalized.includes(skill));
  const yearsMatch = resumeText.match(/(\d+)\+?\s+years?/i);
  const emails = Array.from(resumeText.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)).map((match) => match[0]);
  return {
    skills,
    inferred_years_experience: yearsMatch ? Number(yearsMatch[1]) : null,
    email_mentions: emails,
    summary: resumeText.slice(0, 500),
  };
}

export async function persistParsedResume(
  ctx: CallerContext,
  candidateId: string,
  input: {
    resume_url?: string;
    resume_file_name?: string;
    resume_text: string;
  },
): Promise<RecruitmentCandidate> {
  const parsed = await parseResume(input.resume_text);
  return updateCandidate(ctx, candidateId, {
    resume_url: input.resume_url,
    resume_file_name: input.resume_file_name,
    resume_text: input.resume_text,
    resume_parsed: parsed,
  });
}
