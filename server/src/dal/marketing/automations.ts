import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../middleware/tenantContext.js';
import type { CallerContext } from '../types.js';

export type AutomationTriggerType = 'schedule' | 'event' | 'threshold' | 'manual';
export type AutomationHitlMode = 'autopilot' | 'draft_and_wait' | 'escalation';
export type AutomationRunStatus = 'success' | 'partial' | 'failed' | 'skipped';

export interface Automation {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown>;
  condition: Record<string, unknown> | null;
  actions: unknown[];
  hitl_mode: AutomationHitlMode;
  enabled: boolean;
  last_fired_at: string | null;
  fire_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface AutomationRun {
  id: string;
  organization_id: string;
  automation_id: string;
  trigger_event: Record<string, unknown> | null;
  actions_executed: unknown[] | null;
  content_ids: string[] | null;
  status: AutomationRunStatus;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface CreateAutomationInput {
  name: string;
  description?: string | null;
  trigger_type: AutomationTriggerType;
  trigger_config?: Record<string, unknown>;
  condition?: Record<string, unknown> | null;
  actions?: unknown[];
  hitl_mode?: AutomationHitlMode;
  enabled?: boolean;
  created_by?: string | null;
}

export interface CreateRunInput {
  automation_id: string;
  trigger_event?: Record<string, unknown> | null;
  actions_executed?: unknown[] | null;
  content_ids?: string[];
  status: AutomationRunStatus;
  error?: string | null;
  duration_ms?: number | null;
}

function mapAutomation(row: Record<string, unknown>): Automation {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    name: String(row.name),
    description: row.description != null ? String(row.description) : null,
    trigger_type: row.trigger_type as AutomationTriggerType,
    trigger_config: (row.trigger_config as Record<string, unknown>) ?? {},
    condition: (row.condition as Record<string, unknown> | null) ?? null,
    actions: Array.isArray(row.actions) ? row.actions : [],
    hitl_mode: (row.hitl_mode as AutomationHitlMode) ?? 'draft_and_wait',
    enabled: Boolean(row.enabled),
    last_fired_at: row.last_fired_at != null ? String(row.last_fired_at) : null,
    fire_count: Number(row.fire_count ?? 0),
    last_error: row.last_error != null ? String(row.last_error) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    created_by: row.created_by != null ? String(row.created_by) : null,
  };
}

function mapRun(row: Record<string, unknown>): AutomationRun {
  const rawIds = row.content_ids as unknown;
  const content_ids =
    Array.isArray(rawIds) && rawIds.every((x) => typeof x === 'string')
      ? (rawIds as string[])
      : rawIds == null
        ? null
        : [];
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    automation_id: String(row.automation_id),
    trigger_event: (row.trigger_event as Record<string, unknown> | null) ?? null,
    actions_executed: Array.isArray(row.actions_executed) ? row.actions_executed : null,
    content_ids,
    status: row.status as AutomationRunStatus,
    error: row.error != null ? String(row.error) : null,
    duration_ms: row.duration_ms != null ? Number(row.duration_ms) : null,
    created_at: String(row.created_at),
  };
}

export async function listAutomations(
  ctx: CallerContext,
  filters?: { trigger_type?: string; enabled?: boolean },
): Promise<Automation[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required');

  const clauses: string[] = ['organization_id = $1'];
  const params: unknown[] = [tenantId];
  let i = 2;
  if (filters?.trigger_type) {
    clauses.push(`trigger_type = $${i++}`);
    params.push(filters.trigger_type);
  }
  if (filters?.enabled !== undefined) {
    clauses.push(`enabled = $${i++}`);
    params.push(filters.enabled);
  }

  return withTenantQuery(tenantId, async (client: PoolClient) => {
    const result = await client.query(
      `SELECT * FROM marketing_automations WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC LIMIT 200`,
      params,
    );
    return result.rows.map((r) => mapAutomation(r as Record<string, unknown>));
  });
}

export async function getAutomationById(ctx: CallerContext, id: string): Promise<Automation | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required');

  return withTenantQuery(tenantId, async (client: PoolClient) => {
    const result = await client.query(
      `SELECT * FROM marketing_automations WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [id, tenantId],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapAutomation(row) : null;
  });
}

export async function createAutomation(ctx: CallerContext, input: CreateAutomationInput): Promise<string> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required');

  return withTenantQuery(tenantId, async (client: PoolClient) => {
    const result = await client.query(
      `INSERT INTO marketing_automations (
         organization_id, name, description, trigger_type, trigger_config, condition, actions, hitl_mode, enabled, created_by
       )
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10)
       RETURNING id`,
      [
        tenantId,
        input.name,
        input.description ?? null,
        input.trigger_type,
        JSON.stringify(input.trigger_config ?? {}),
        input.condition != null ? JSON.stringify(input.condition) : null,
        JSON.stringify(input.actions ?? []),
        input.hitl_mode ?? 'draft_and_wait',
        input.enabled ?? true,
        input.created_by ?? ctx.userUuid ?? ctx.userId,
      ],
    );
    return String(result.rows[0].id);
  });
}

export async function updateAutomation(
  ctx: CallerContext,
  id: string,
  updates: Partial<
    Pick<
      Automation,
      | 'name'
      | 'description'
      | 'trigger_type'
      | 'trigger_config'
      | 'condition'
      | 'actions'
      | 'hitl_mode'
      | 'enabled'
      | 'last_fired_at'
      | 'fire_count'
      | 'last_error'
    >
  >,
): Promise<boolean> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required');

  const keys = Object.keys(updates).filter((k) => updates[k as keyof typeof updates] !== undefined);
  if (keys.length === 0) return true;

  return withTenantQuery(tenantId, async (client: PoolClient) => {
    const sets: string[] = [];
    const params: unknown[] = [];
    let pi = 1;
    for (const key of keys) {
      const val = updates[key as keyof typeof updates];
      if (key === 'trigger_config' || key === 'condition' || key === 'actions') {
        sets.push(`${key} = $${pi++}::jsonb`);
        params.push(JSON.stringify(val ?? (key === 'actions' ? [] : {})));
      } else {
        sets.push(`${key} = $${pi++}`);
        params.push(val);
      }
    }
    sets.push(`updated_at = NOW()`);
    params.push(id, tenantId);
    const idPlaceholder = pi++;
    const orgPlaceholder = pi;
    const result = await client.query(
      `UPDATE marketing_automations SET ${sets.join(', ')} WHERE id = $${idPlaceholder} AND organization_id = $${orgPlaceholder}`,
      params,
    );
    return (result.rowCount ?? 0) > 0;
  });
}

export async function deleteAutomation(ctx: CallerContext, id: string): Promise<boolean> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required');

  return withTenantQuery(tenantId, async (client: PoolClient) => {
    const result = await client.query(
      `DELETE FROM marketing_automations WHERE id = $1 AND organization_id = $2`,
      [id, tenantId],
    );
    return (result.rowCount ?? 0) > 0;
  });
}

export async function recordRun(ctx: CallerContext, input: CreateRunInput): Promise<string> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required');

  return withTenantQuery(tenantId, async (client: PoolClient) => {
    const result = await client.query(
      `INSERT INTO marketing_automation_runs (
         organization_id, automation_id, trigger_event, actions_executed, content_ids, status, error, duration_ms
       )
       VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8)
       RETURNING id`,
      [
        tenantId,
        input.automation_id,
        input.trigger_event != null ? JSON.stringify(input.trigger_event) : null,
        input.actions_executed != null ? JSON.stringify(input.actions_executed) : null,
        input.content_ids ?? [],
        input.status,
        input.error ?? null,
        input.duration_ms ?? null,
      ],
    );
    return String(result.rows[0].id);
  });
}

export async function listRuns(automationId: string, ctx: CallerContext, limit = 20): Promise<AutomationRun[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required');

  return withTenantQuery(tenantId, async (client: PoolClient) => {
    const result = await client.query(
      `SELECT * FROM marketing_automation_runs
       WHERE automation_id = $1 AND organization_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [automationId, tenantId, Math.min(100, Math.max(1, limit))],
    );
    return result.rows.map((r) => mapRun(r as Record<string, unknown>));
  });
}

/** Resolve acting reimbursement user for automation (creator or first user in org). */
export async function getAutomationActorRow(
  orgId: string,
  createdByRuId: string | null,
): Promise<{ id: string; auth_user_id: string | null; full_name: string; role: string } | null> {
  return withTenantQuery(orgId, async (client: PoolClient) => {
    if (createdByRuId) {
      const r = await client.query(
        `SELECT id, auth_user_id, full_name, role FROM reimbursement_users WHERE id = $1 AND organization_id = $2 LIMIT 1`,
        [createdByRuId, orgId],
      );
      if (r.rows[0]) return r.rows[0] as { id: string; auth_user_id: string | null; full_name: string; role: string };
    }
    const r2 = await client.query(
      `SELECT id, auth_user_id, full_name, role FROM reimbursement_users
       WHERE organization_id = $1 AND auth_user_id IS NOT NULL
       ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, created_at ASC
       LIMIT 1`,
      [orgId],
    );
    return r2.rows[0] ? (r2.rows[0] as { id: string; auth_user_id: string | null; full_name: string; role: string }) : null;
  });
}
