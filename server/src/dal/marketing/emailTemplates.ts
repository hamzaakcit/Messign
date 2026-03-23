import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../middleware/tenantContext.js';
import type { CallerContext, PaginatedResult } from '../types.js';
import { reimbursementUsersPk } from '../reimbursementUsersPk.js';
import { paginationClause } from '../helpers.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

export interface EmailTemplate {
  id: string;
  organization_id: string;
  name: string;
  category: string;
  description: string | null;
  theme: string;
  section_types: string[];
  manifest_json: Record<string, unknown>;
  usage_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailTemplateFilters {
  category?: string;
}

export interface CreateEmailTemplateInput {
  name: string;
  category?: string;
  description?: string;
  theme: string;
  section_types?: string[];
  manifest_json: Record<string, unknown>;
}

function mapTemplate(row: Record<string, unknown>): EmailTemplate {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    name: String(row.name),
    category: String(row.category ?? 'custom'),
    description: row.description ? String(row.description) : null,
    theme: String(row.theme),
    section_types: Array.isArray(row.section_types) ? row.section_types.map(String) : [],
    manifest_json:
      row.manifest_json != null && typeof row.manifest_json === 'object'
        ? (row.manifest_json as Record<string, unknown>)
        : {},
    usage_count: Number(row.usage_count ?? 0),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listEmailTemplates(
  ctx: CallerContext,
  filters?: EmailTemplateFilters,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<EmailTemplate>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listEmailTemplates');

  return runInTenant(tenantId, async (client) => {
    const conditions: string[] = ['t.organization_id = $1'];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (filters?.category) {
      conditions.push(`t.category = $${idx++}`);
      params.push(filters.category);
    }

    const whereSQL = conditions.join(' AND ');
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM marketing_email_templates t WHERE ${whereSQL}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const pg = paginationClause(page, pageSize, idx);
    const result = await client.query(
      `SELECT t.*
       FROM marketing_email_templates t
       WHERE ${whereSQL}
       ORDER BY t.updated_at DESC
       ${pg.clause}`,
      [...params, ...pg.params],
    );

    return {
      data: result.rows.map((row) => mapTemplate(row as Record<string, unknown>)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });
}

export async function getEmailTemplateById(ctx: CallerContext, id: string): Promise<EmailTemplate | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getEmailTemplateById');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT * FROM marketing_email_templates t
       WHERE t.id = $1 AND t.organization_id = $2
       LIMIT 1`,
      [id, tenantId],
    );
    return result.rows[0] ? mapTemplate(result.rows[0] as Record<string, unknown>) : null;
  });
}

export async function createEmailTemplate(ctx: CallerContext, data: CreateEmailTemplateInput): Promise<EmailTemplate> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for createEmailTemplate');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `INSERT INTO marketing_email_templates (
         organization_id, name, category, description, theme,
         section_types, manifest_json, created_by
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        tenantId,
        data.name,
        data.category ?? 'custom',
        data.description?.trim() || null,
        data.theme,
        data.section_types ?? [],
        JSON.stringify(data.manifest_json),
        reimbursementUsersPk(ctx),
      ],
    );
    return (
      (await getEmailTemplateById(ctx, String(result.rows[0].id))) ??
      mapTemplate(result.rows[0] as Record<string, unknown>)
    );
  });
}

export async function deleteEmailTemplate(ctx: CallerContext, id: string): Promise<boolean> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for deleteEmailTemplate');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `DELETE FROM marketing_email_templates
       WHERE id = $1 AND organization_id = $2`,
      [id, tenantId],
    );
    return (result.rowCount ?? 0) > 0;
  });
}

/** Increment usage_count and return the manifest_json for loading into the editor. */
export async function useEmailTemplate(
  ctx: CallerContext,
  id: string,
): Promise<{ manifest_json: Record<string, unknown> } | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for useEmailTemplate');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `UPDATE marketing_email_templates
       SET usage_count = usage_count + 1, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING manifest_json`,
      [id, tenantId],
    );
    if (!result.rows[0]) return null;
    const raw = result.rows[0].manifest_json;
    return {
      manifest_json:
        raw != null && typeof raw === 'object'
          ? (raw as Record<string, unknown>)
          : {},
    };
  });
}
