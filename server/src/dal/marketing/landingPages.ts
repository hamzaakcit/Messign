import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../middleware/tenantContext.js';
import type { CallerContext, PaginatedResult } from '../types.js';
import { reimbursementUsersPk } from '../reimbursementUsersPk.js';
import { paginationClause } from '../helpers.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

export interface LandingPage {
  id: string;
  organization_id: string;
  name: string;
  slug: string | null;
  body_html: string;
  body_design: Record<string, unknown> | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LandingPageFilters {
  status?: string;
}

export interface CreateLandingPageInput {
  name: string;
  slug?: string | null;
  body_html: string;
  body_design?: Record<string, unknown> | null;
  status?: string;
}

export type UpdateLandingPageInput = Partial<CreateLandingPageInput>;

function mapLandingPage(row: Record<string, unknown>): LandingPage {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    name: String(row.name),
    slug: row.slug ? String(row.slug) : null,
    body_html: String(row.body_html),
    body_design:
      row.body_design != null && typeof row.body_design === 'object'
        ? (row.body_design as Record<string, unknown>)
        : null,
    status: String(row.status),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listLandingPages(
  ctx: CallerContext,
  filters?: LandingPageFilters,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<LandingPage>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listLandingPages');

  return runInTenant(tenantId, async (client) => {
    const conditions: string[] = ['mlp.organization_id = $1'];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (filters?.status) {
      conditions.push(`mlp.status = $${idx++}`);
      params.push(filters.status);
    }

    const whereSQL = conditions.join(' AND ');
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM marketing_landing_pages mlp WHERE ${whereSQL}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const pg = paginationClause(page, pageSize, idx);
    const result = await client.query(
      `SELECT mlp.*
       FROM marketing_landing_pages mlp
       WHERE ${whereSQL}
       ORDER BY mlp.updated_at DESC
       ${pg.clause}`,
      [...params, ...pg.params],
    );

    return {
      data: result.rows.map((row) => mapLandingPage(row as Record<string, unknown>)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });
}

export async function getLandingPageById(ctx: CallerContext, id: string): Promise<LandingPage | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getLandingPageById');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT * FROM marketing_landing_pages mlp
       WHERE mlp.id = $1 AND mlp.organization_id = $2
       LIMIT 1`,
      [id, tenantId],
    );
    return result.rows[0] ? mapLandingPage(result.rows[0] as Record<string, unknown>) : null;
  });
}

export async function createLandingPage(ctx: CallerContext, data: CreateLandingPageInput): Promise<LandingPage> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for createLandingPage');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `INSERT INTO marketing_landing_pages (
         organization_id, name, slug, body_html, body_design, status, created_by
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        tenantId,
        data.name,
        data.slug?.trim() ? data.slug.trim() : null,
        data.body_html,
        data.body_design ?? null,
        data.status ?? 'draft',
        reimbursementUsersPk(ctx),
      ],
    );
    return (
      (await getLandingPageById(ctx, String(result.rows[0].id))) ??
      mapLandingPage(result.rows[0] as Record<string, unknown>)
    );
  });
}

export async function updateLandingPage(
  ctx: CallerContext,
  id: string,
  data: UpdateLandingPageInput,
): Promise<LandingPage> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for updateLandingPage');

  const fields: Array<[string, unknown]> = [
    ['name', data.name],
    ['slug', data.slug === undefined ? undefined : data.slug?.trim() ? data.slug.trim() : null],
    ['body_html', data.body_html],
    ['body_design', data.body_design],
    ['status', data.status],
  ];

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
  const idPlaceholder = idx;
  const orgPlaceholder = idx + 1;
  params.push(id, tenantId);

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `UPDATE marketing_landing_pages
       SET ${sets.join(', ')}
       WHERE id = $${idPlaceholder} AND organization_id = $${orgPlaceholder}
       RETURNING *`,
      params,
    );
    if (!result.rows[0]) throw new Error('Landing page not found');
    return (await getLandingPageById(ctx, id)) ?? mapLandingPage(result.rows[0] as Record<string, unknown>);
  });
}
