import type { PoolClient } from 'pg';
import { query } from '../db/index.js';
import { withTenantQuery } from '../middleware/tenantContext.js';
import type { CallerContext } from './types.js';
import { eventBus } from '../events/index.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

export type DoraInsightSeverity = 'info' | 'warning' | 'critical' | 'success';

export interface DoraInsight {
  id: string;
  module: string;
  severity: DoraInsightSeverity;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  sourceEvent?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  isRead: boolean;
  isDismissed: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface DoraInsightRow {
  id: string;
  module: string;
  severity: DoraInsightSeverity;
  title: string;
  message: string;
  action_url: string | null;
  action_label: string | null;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  is_read: boolean;
  is_dismissed: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface CreateInsightInput {
  organizationId?: string;
  module: string;
  severity: DoraInsightSeverity;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  sourceEvent?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  targetUserId?: string;
  targetRole?: string;
  targetDepartment?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

function mapInsight(row: DoraInsightRow): DoraInsight {
  return {
    id: row.id,
    module: row.module,
    severity: row.severity,
    title: row.title,
    message: row.message,
    actionUrl: row.action_url ?? undefined,
    actionLabel: row.action_label ?? undefined,
    sourceEvent: row.source_event ?? undefined,
    sourceEntityType: row.source_entity_type ?? undefined,
    sourceEntityId: row.source_entity_id ?? undefined,
    isRead: row.is_read,
    isDismissed: row.is_dismissed,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

function buildAudienceClause(
  ctx: CallerContext,
  startIndex: number = 1,
  alias: string = 'di',
): { clause: string; params: unknown[] } {
  const audience: string[] = [
    `${alias}.target_user_id = $${startIndex}::uuid`,
    `${alias}.target_role = $${startIndex + 1}`,
  ];
  const params: unknown[] = [ctx.userId, ctx.role];

  if (ctx.departmentId) {
    audience.push(`${alias}.target_department = $${startIndex + 2}`);
    params.push(ctx.departmentId);
  }

  audience.push(
    `(${alias}.target_user_id IS NULL AND ${alias}.target_role IS NULL AND ${alias}.target_department IS NULL)`,
  );

  return {
    clause: `(${audience.join(' OR ')})`,
    params,
  };
}

function buildBaseFilters(
  ctx: CallerContext,
  filters?: { module?: string; severity?: string; unreadOnly?: boolean },
  alias: string = 'di',
  startIndex: number = 1,
): { whereSQL: string; params: unknown[] } {
  const conditions = [`${alias}.is_dismissed = FALSE`, `(${alias}.expires_at IS NULL OR ${alias}.expires_at > NOW())`];
  const params: unknown[] = [];
  let idx = startIndex;

  const audience = buildAudienceClause(ctx, idx, alias);
  conditions.push(audience.clause);
  params.push(...audience.params);
  idx += audience.params.length;

  if (filters?.module) {
    conditions.push(`${alias}.module = $${idx++}`);
    params.push(filters.module);
  }
  if (filters?.severity) {
    conditions.push(`${alias}.severity = $${idx++}`);
    params.push(filters.severity);
  }
  if (filters?.unreadOnly) {
    conditions.push(`${alias}.is_read = FALSE`);
  }

  return { whereSQL: conditions.join(' AND '), params };
}

function emitCountsRefresh(
  input: Pick<CreateInsightInput, 'organizationId' | 'targetUserId' | 'targetRole' | 'targetDepartment'>,
  module?: string,
): void {
  eventBus.emit('dora.insight.counts-refresh', {
    targetUserId: input.targetUserId,
    targetRole: input.targetRole,
    targetDepartment: input.targetDepartment,
    organizationId: input.organizationId ?? undefined,
    module: module ?? null,
  });
}

export async function createInsight(data: CreateInsightInput): Promise<DoraInsight> {
  const tenantId = data.organizationId;
  if (!tenantId) throw new Error('Organization context required for createInsight');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query<DoraInsightRow>(
    `INSERT INTO dora_insights (
       organization_id,
       module,
       severity,
       title,
       message,
       action_url,
       action_label,
       source_event,
       source_entity_type,
       source_entity_id,
       target_user_id,
       target_role,
       target_department,
       expires_at,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING
       id::text,
       module,
       severity,
       title,
       message,
       action_url,
       action_label,
       source_event,
       source_entity_type,
       source_entity_id,
       is_read,
       is_dismissed,
       metadata,
       created_at::text`,
    [
      data.organizationId ?? null,
      data.module,
      data.severity,
      data.title,
      data.message,
      data.actionUrl ?? null,
      data.actionLabel ?? null,
      data.sourceEvent ?? null,
      data.sourceEntityType ?? null,
      data.sourceEntityId ?? null,
      data.targetUserId ?? null,
      data.targetRole ?? null,
      data.targetDepartment ?? null,
      data.expiresAt ?? null,
      JSON.stringify(data.metadata ?? {}),
    ],
  );

    const insight = mapInsight(result.rows[0]!);

    eventBus.emit('dora.insight.created', {
      insight: insight as unknown as Record<string, unknown>,
      targetUserId: data.targetUserId,
      targetRole: data.targetRole,
      targetDepartment: data.targetDepartment,
      organizationId: data.organizationId ?? undefined,
    });
    emitCountsRefresh(data, insight.module);
    return insight;
  });
}

export async function getInsightsForUser(
  ctx: CallerContext,
  filters?: { module?: string; severity?: string; unreadOnly?: boolean; limit?: number },
): Promise<DoraInsight[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getInsightsForUser');

  const { whereSQL, params } = buildBaseFilters(ctx, filters, 'di');
  const limit = Math.min(Math.max(filters?.limit ?? 10, 1), 50);

  return runInTenant(tenantId, async (client) => {
    const result = await client.query<DoraInsightRow>(
    `SELECT
       di.id::text,
       di.module,
       di.severity,
       di.title,
       di.message,
       di.action_url,
       di.action_label,
       di.source_event,
       di.source_entity_type,
       di.source_entity_id,
       di.is_read,
       di.is_dismissed,
       di.metadata,
       di.created_at::text
     FROM dora_insights di
     WHERE ${whereSQL}
     ORDER BY CASE di.severity
       WHEN 'critical' THEN 1
       WHEN 'warning' THEN 2
       WHEN 'success' THEN 3
       ELSE 4
     END, di.created_at DESC
     LIMIT ${limit}`,
    params,
  );

    return result.rows.map(mapInsight);
  });
}

export async function getInsightsForModule(
  ctx: CallerContext,
  module: string,
  limit?: number,
): Promise<DoraInsight[]> {
  return getInsightsForUser(ctx, { module, limit });
}

export async function markRead(ctx: CallerContext, insightId: string): Promise<void> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for markRead');

  const base = buildBaseFilters(ctx, undefined, 'di', 2);
  await runInTenant(tenantId, async (client) => {
    await client.query(
      `UPDATE dora_insights di
       SET is_read = TRUE
       WHERE di.id = $1::uuid
         AND ${base.whereSQL}`,
      [insightId, ...base.params],
    );
  });
  eventBus.emit('dora.insight.counts-refresh', {
    targetUserId: ctx.userId,
    module: null,
  });
}

export async function dismiss(ctx: CallerContext, insightId: string): Promise<void> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for dismiss');

  const base = buildBaseFilters(ctx, undefined, 'di', 2);
  await runInTenant(tenantId, async (client) => {
    await client.query(
      `UPDATE dora_insights di
       SET is_dismissed = TRUE,
           dismissed_at = NOW()
       WHERE di.id = $1::uuid
         AND ${base.whereSQL}`,
      [insightId, ...base.params],
    );
  });
  eventBus.emit('dora.insight.counts-refresh', {
    targetUserId: ctx.userId,
    module: null,
  });
}

export async function dismissAll(ctx: CallerContext, module?: string): Promise<number> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for dismissAll');

  const base = buildBaseFilters(ctx, module ? { module } : undefined, 'di');
  const count = await runInTenant(tenantId, async (client) => {
    const result = await client.query<{ count: string }>(
      `WITH updated AS (
         UPDATE dora_insights di
         SET is_dismissed = TRUE,
             dismissed_at = NOW()
         WHERE ${base.whereSQL}
         RETURNING 1
       )
       SELECT COUNT(*)::text AS count FROM updated`,
      base.params,
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  });
  eventBus.emit('dora.insight.counts-refresh', {
    targetUserId: ctx.userId,
    module: module ?? null,
  });
  return count;
}

export async function getUnreadCounts(ctx: CallerContext): Promise<Record<string, number>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getUnreadCounts');

  const { whereSQL, params } = buildBaseFilters(ctx, { unreadOnly: true }, 'di');
  return runInTenant(tenantId, async (client) => {
    const result = await client.query<{ module: string; count: string }>(
      `SELECT di.module, COUNT(*)::text AS count
       FROM dora_insights di
       WHERE ${whereSQL}
       GROUP BY di.module`,
      params,
    );

    return result.rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.module] = parseInt(row.count, 10);
      return acc;
    }, {});
  });
}

export async function cleanupOldInsights(): Promise<number> {
  const result = await query<{ count: string }>(
    `WITH deleted AS (
       DELETE FROM dora_insights
       WHERE (expires_at IS NOT NULL AND expires_at < NOW())
          OR (is_dismissed = TRUE AND dismissed_at < NOW() - INTERVAL '7 days')
          OR (created_at < NOW() - INTERVAL '30 days')
       RETURNING 1
     )
     SELECT COUNT(*)::text AS count FROM deleted`,
  );

  return parseInt(result.rows[0]?.count ?? '0', 10);
}
