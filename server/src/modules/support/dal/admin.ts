import { query } from '../../../db/index.js';
import type { CallerContext } from '../../../dal/types.js';
import { toNumber } from './shared.js';

export interface SupportSlaPolicy {
  id: string;
  organization_id: string;
  name: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  first_response_hours: number;
  resolution_hours: number;
  escalation_after_hours: number | null;
  escalate_to_role: string | null;
  business_hours_only: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSupportSlaPolicyInput {
  name: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  first_response_hours: number;
  resolution_hours: number;
  escalation_after_hours?: number | null;
  escalate_to_role?: string | null;
  business_hours_only?: boolean;
  is_active?: boolean;
}

export type UpdateSupportSlaPolicyInput = Partial<CreateSupportSlaPolicyInput>;

export interface SupportCategory {
  id: string;
  organization_id: string;
  name: string;
  parent_id: string | null;
  description: string | null;
  auto_assign_to: string | null;
  auto_assign_to_name?: string | null;
  default_priority: 'critical' | 'high' | 'medium' | 'low';
  is_active: boolean;
  created_at: string;
}

export interface CreateSupportCategoryInput {
  name: string;
  parent_id?: string | null;
  description?: string | null;
  auto_assign_to?: string | null;
  default_priority?: 'critical' | 'high' | 'medium' | 'low';
  is_active?: boolean;
}

export type UpdateSupportCategoryInput = Partial<CreateSupportCategoryInput>;

function requireOrgId(ctx: CallerContext): string {
  const orgId = ctx.organizationId ?? '';
  if (!orgId) throw new Error('Organization context is required');
  return orgId;
}

function mapPolicy(row: Record<string, unknown>): SupportSlaPolicy {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    name: String(row.name ?? ''),
    priority: String(row.priority ?? 'medium') as SupportSlaPolicy['priority'],
    first_response_hours: toNumber(row.first_response_hours),
    resolution_hours: toNumber(row.resolution_hours),
    escalation_after_hours: row.escalation_after_hours == null ? null : toNumber(row.escalation_after_hours),
    escalate_to_role: row.escalate_to_role ? String(row.escalate_to_role) : null,
    business_hours_only: Boolean(row.business_hours_only),
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

function mapCategory(row: Record<string, unknown>): SupportCategory {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    name: String(row.name ?? ''),
    parent_id: row.parent_id ? String(row.parent_id) : null,
    description: row.description ? String(row.description) : null,
    auto_assign_to: row.auto_assign_to ? String(row.auto_assign_to) : null,
    auto_assign_to_name: row.auto_assign_to_name ? String(row.auto_assign_to_name) : null,
    default_priority: String(row.default_priority ?? 'medium') as SupportCategory['default_priority'],
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at ?? ''),
  };
}

export async function listPolicies(ctx: CallerContext): Promise<SupportSlaPolicy[]> {
  const orgId = requireOrgId(ctx);
  const result = await query(
    `SELECT id::text AS id, organization_id::text AS organization_id, name, priority,
            first_response_hours::text AS first_response_hours,
            resolution_hours::text AS resolution_hours,
            escalation_after_hours::text AS escalation_after_hours,
            escalate_to_role, business_hours_only, is_active,
            created_at::text AS created_at, updated_at::text AS updated_at
     FROM support_sla_policies
     WHERE organization_id = $1
     ORDER BY CASE priority
       WHEN 'critical' THEN 1
       WHEN 'high' THEN 2
       WHEN 'medium' THEN 3
       ELSE 4
     END ASC, created_at ASC`,
    [orgId],
  );
  return result.rows.map((row) => mapPolicy(row as Record<string, unknown>));
}

export async function createPolicy(
  ctx: CallerContext,
  data: CreateSupportSlaPolicyInput,
): Promise<SupportSlaPolicy> {
  const orgId = requireOrgId(ctx);
  const result = await query(
    `INSERT INTO support_sla_policies (
       organization_id, name, priority, first_response_hours, resolution_hours,
       escalation_after_hours, escalate_to_role, business_hours_only, is_active
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id::text AS id, organization_id::text AS organization_id, name, priority,
               first_response_hours::text AS first_response_hours,
               resolution_hours::text AS resolution_hours,
               escalation_after_hours::text AS escalation_after_hours,
               escalate_to_role, business_hours_only, is_active,
               created_at::text AS created_at, updated_at::text AS updated_at`,
    [
      orgId,
      data.name,
      data.priority,
      data.first_response_hours,
      data.resolution_hours,
      data.escalation_after_hours ?? null,
      data.escalate_to_role ?? 'manager',
      data.business_hours_only ?? true,
      data.is_active ?? true,
    ],
  );
  return mapPolicy(result.rows[0] as Record<string, unknown>);
}

export async function updatePolicy(
  ctx: CallerContext,
  policyId: string,
  data: UpdateSupportSlaPolicyInput,
): Promise<SupportSlaPolicy> {
  const orgId = requireOrgId(ctx);
  const fields: Array<[string, unknown]> = [
    ['name', data.name],
    ['priority', data.priority],
    ['first_response_hours', data.first_response_hours],
    ['resolution_hours', data.resolution_hours],
    ['escalation_after_hours', data.escalation_after_hours],
    ['escalate_to_role', data.escalate_to_role],
    ['business_hours_only', data.business_hours_only],
    ['is_active', data.is_active],
  ];

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  for (const [column, value] of fields) {
    if (value !== undefined) {
      sets.push(`${column} = $${idx++}`);
      params.push(value);
    }
  }
  sets.push('updated_at = NOW()');
  params.push(policyId, orgId);

  const result = await query(
    `UPDATE support_sla_policies
     SET ${sets.join(', ')}
     WHERE id = $${idx++} AND organization_id = $${idx}
     RETURNING id::text AS id, organization_id::text AS organization_id, name, priority,
               first_response_hours::text AS first_response_hours,
               resolution_hours::text AS resolution_hours,
               escalation_after_hours::text AS escalation_after_hours,
               escalate_to_role, business_hours_only, is_active,
               created_at::text AS created_at, updated_at::text AS updated_at`,
    params,
  );
  if (!result.rows[0]) throw new Error('SLA policy not found');
  return mapPolicy(result.rows[0] as Record<string, unknown>);
}

export async function listCategories(
  ctx: CallerContext,
  includeInactive: boolean = false,
): Promise<SupportCategory[]> {
  const orgId = requireOrgId(ctx);
  const params: unknown[] = [orgId];
  const inactiveClause = includeInactive ? '' : 'AND c.is_active = TRUE';
  const result = await query(
    `SELECT c.id::text AS id, c.organization_id::text AS organization_id, c.name,
            c.parent_id::text AS parent_id, c.description, c.auto_assign_to::text AS auto_assign_to,
            ru.full_name AS auto_assign_to_name, c.default_priority, c.is_active, c.created_at::text AS created_at
     FROM support_categories c
     LEFT JOIN reimbursement_users ru ON ru.id = c.auto_assign_to
     WHERE c.organization_id = $1 ${inactiveClause}
     ORDER BY c.name ASC`,
    params,
  );
  return result.rows.map((row) => mapCategory(row as Record<string, unknown>));
}

export async function createCategory(
  ctx: CallerContext,
  data: CreateSupportCategoryInput,
): Promise<SupportCategory> {
  const orgId = requireOrgId(ctx);
  const result = await query(
    `INSERT INTO support_categories (
       organization_id, name, parent_id, description, auto_assign_to, default_priority, is_active
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id::text AS id, organization_id::text AS organization_id, name,
               parent_id::text AS parent_id, description, auto_assign_to::text AS auto_assign_to,
               default_priority, is_active, created_at::text AS created_at`,
    [
      orgId,
      data.name,
      data.parent_id ?? null,
      data.description ?? null,
      data.auto_assign_to ?? null,
      data.default_priority ?? 'medium',
      data.is_active ?? true,
    ],
  );
  const category = mapCategory(result.rows[0] as Record<string, unknown>);
  if (category.auto_assign_to) {
    const assignee = await query<{ full_name: string | null }>(
      `SELECT full_name FROM reimbursement_users WHERE id = $1 LIMIT 1`,
      [category.auto_assign_to],
    );
    category.auto_assign_to_name = assignee.rows[0]?.full_name ?? null;
  }
  return category;
}

export async function updateCategory(
  ctx: CallerContext,
  categoryId: string,
  data: UpdateSupportCategoryInput,
): Promise<SupportCategory> {
  const orgId = requireOrgId(ctx);
  const fields: Array<[string, unknown]> = [
    ['name', data.name],
    ['parent_id', data.parent_id],
    ['description', data.description],
    ['auto_assign_to', data.auto_assign_to],
    ['default_priority', data.default_priority],
    ['is_active', data.is_active],
  ];

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  for (const [column, value] of fields) {
    if (value !== undefined) {
      sets.push(`${column} = $${idx++}`);
      params.push(value);
    }
  }
  if (sets.length === 0) {
    throw new Error('No category fields provided');
  }
  params.push(categoryId, orgId);

  const result = await query(
    `UPDATE support_categories
     SET ${sets.join(', ')}
     WHERE id = $${idx++} AND organization_id = $${idx}
     RETURNING id::text AS id, organization_id::text AS organization_id, name,
               parent_id::text AS parent_id, description, auto_assign_to::text AS auto_assign_to,
               default_priority, is_active, created_at::text AS created_at`,
    params,
  );
  if (!result.rows[0]) throw new Error('Support category not found');
  const category = mapCategory(result.rows[0] as Record<string, unknown>);
  if (category.auto_assign_to) {
    const assignee = await query<{ full_name: string | null }>(
      `SELECT full_name FROM reimbursement_users WHERE id = $1 LIMIT 1`,
      [category.auto_assign_to],
    );
    category.auto_assign_to_name = assignee.rows[0]?.full_name ?? null;
  }
  return category;
}

export async function deleteCategory(ctx: CallerContext, categoryId: string): Promise<void> {
  const orgId = requireOrgId(ctx);
  const result = await query(
    `UPDATE support_categories
     SET is_active = FALSE
     WHERE id = $1 AND organization_id = $2
     RETURNING id`,
    [categoryId, orgId],
  );
  if (!result.rows[0]) throw new Error('Support category not found');
}
