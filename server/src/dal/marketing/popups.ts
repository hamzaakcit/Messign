import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../middleware/tenantContext.js';
import type { CallerContext, PaginatedResult } from '../types.js';
import { reimbursementUsersPk } from '../reimbursementUsersPk.js';
import { paginationClause } from '../helpers.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

export interface MarketingPopup {
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

export interface MarketingPopupFilters {
  status?: string;
}

export interface CreateMarketingPopupInput {
  name: string;
  slug?: string | null;
  body_html: string;
  body_design?: Record<string, unknown> | null;
  status?: string;
}

export type UpdateMarketingPopupInput = Partial<CreateMarketingPopupInput>;

function mapPopup(row: Record<string, unknown>): MarketingPopup {
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

export async function listMarketingPopups(
  ctx: CallerContext,
  filters?: MarketingPopupFilters,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<MarketingPopup>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listMarketingPopups');

  return runInTenant(tenantId, async (client) => {
    const conditions: string[] = ['mp.organization_id = $1'];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (filters?.status) {
      conditions.push(`mp.status = $${idx++}`);
      params.push(filters.status);
    }

    const whereSQL = conditions.join(' AND ');
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM marketing_popups mp WHERE ${whereSQL}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const pg = paginationClause(page, pageSize, idx);
    const result = await client.query(
      `SELECT mp.*
       FROM marketing_popups mp
       WHERE ${whereSQL}
       ORDER BY mp.updated_at DESC
       ${pg.clause}`,
      [...params, ...pg.params],
    );

    return {
      data: result.rows.map((row) => mapPopup(row as Record<string, unknown>)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });
}

export async function getMarketingPopupById(ctx: CallerContext, id: string): Promise<MarketingPopup | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getMarketingPopupById');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT * FROM marketing_popups mp
       WHERE mp.id = $1 AND mp.organization_id = $2
       LIMIT 1`,
      [id, tenantId],
    );
    return result.rows[0] ? mapPopup(result.rows[0] as Record<string, unknown>) : null;
  });
}

export async function createMarketingPopup(ctx: CallerContext, data: CreateMarketingPopupInput): Promise<MarketingPopup> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for createMarketingPopup');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `INSERT INTO marketing_popups (
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
      (await getMarketingPopupById(ctx, String(result.rows[0].id))) ??
      mapPopup(result.rows[0] as Record<string, unknown>)
    );
  });
}

export async function updateMarketingPopup(
  ctx: CallerContext,
  id: string,
  data: UpdateMarketingPopupInput,
): Promise<MarketingPopup> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for updateMarketingPopup');

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
      `UPDATE marketing_popups
       SET ${sets.join(', ')}
       WHERE id = $${idPlaceholder} AND organization_id = $${orgPlaceholder}
       RETURNING *`,
      params,
    );
    if (!result.rows[0]) throw new Error('Popup not found');
    return (await getMarketingPopupById(ctx, id)) ?? mapPopup(result.rows[0] as Record<string, unknown>);
  });
}
