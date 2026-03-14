import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../../middleware/tenantContext.js';
import type { CallerContext } from '../../../dal/types.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

// ── Interfaces ──

export interface Pipeline {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  team_id: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  stages?: DealStage[];
}

export interface DealStage {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  probability_default: number;
  is_won: boolean;
  is_lost: boolean;
  color: string;
  created_at: string;
  deal_count?: number;
  total_value?: number;
}

// ── Functions ──

export async function listPipelines(ctx: CallerContext): Promise<Pipeline[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listPipelines');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT p.* FROM crm_pipelines p ORDER BY p.is_default DESC, p.name`,
    );
    return result.rows as Pipeline[];
  });
}

export async function getPipelineById(ctx: CallerContext, pipelineId: string): Promise<Pipeline | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getPipelineById');

  return runInTenant(tenantId, async (client) => {
    const pipelineResult = await client.query(
      `SELECT p.* FROM crm_pipelines p WHERE p.id = $1`,
      [pipelineId],
    );
    if (!pipelineResult.rows[0]) return null;

    const stagesResult = await client.query(
      `SELECT s.*,
              COUNT(d.id)::int as deal_count,
              COALESCE(SUM(d.amount), 0)::numeric as total_value
       FROM crm_deal_stages s
       LEFT JOIN crm_deals d ON d.stage_id = s.id
       WHERE s.pipeline_id = $1
       GROUP BY s.id
       ORDER BY s.position`,
      [pipelineId],
    );

    return {
      ...pipelineResult.rows[0],
      stages: stagesResult.rows,
    } as Pipeline;
  });
}

export async function createPipeline(
  ctx: CallerContext,
  data: { name: string; description?: string; team_id?: string },
): Promise<Pipeline> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for createPipeline');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `INSERT INTO crm_pipelines (organization_id, name, description, team_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [tenantId, data.name, data.description ?? null, data.team_id ?? null],
    );
    return result.rows[0] as Pipeline;
  });
}

export async function updatePipeline(
  ctx: CallerContext,
  pipelineId: string,
  data: { name?: string; description?: string; team_id?: string },
): Promise<Pipeline> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for updatePipeline');

  return runInTenant(tenantId, async (client) => {
    const fields: [string, unknown][] = [
      ['name', data.name], ['description', data.description], ['team_id', data.team_id],
    ];
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const [col, val] of fields) {
      if (val !== undefined) {
        sets.push(`${col} = $${idx++}`);
        params.push(val);
      }
    }
    sets.push('updated_at = NOW()');
    params.push(pipelineId);

    const result = await client.query(
      `UPDATE crm_pipelines SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );
    if (!result.rows[0]) throw new Error('Pipeline not found');
    return result.rows[0] as Pipeline;
  });
}

// ── Stage Functions ──

export async function listStages(ctx: CallerContext, pipelineId: string): Promise<DealStage[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listStages');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT s.*,
              COUNT(d.id)::int as deal_count,
              COALESCE(SUM(d.amount), 0)::numeric as total_value
       FROM crm_deal_stages s
       LEFT JOIN crm_deals d ON d.stage_id = s.id
       WHERE s.pipeline_id = $1
       GROUP BY s.id
       ORDER BY s.position`,
      [pipelineId],
    );
    return result.rows as DealStage[];
  });
}

export async function createStage(
  ctx: CallerContext,
  pipelineId: string,
  data: { name: string; position?: number; probability_default?: number; color?: string; is_won?: boolean; is_lost?: boolean },
): Promise<DealStage> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for createStage');

  return runInTenant(tenantId, async (client) => {
    const posResult = await client.query(
      'SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM crm_deal_stages WHERE pipeline_id = $1',
      [pipelineId],
    );
    const position = data.position ?? posResult.rows[0].next_pos;

    const result = await client.query(
      `INSERT INTO crm_deal_stages (pipeline_id, name, position, probability_default, color, is_won, is_lost)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [pipelineId, data.name, position, data.probability_default ?? 0, data.color ?? '#3B82F6', data.is_won ?? false, data.is_lost ?? false],
    );
    return result.rows[0] as DealStage;
  });
}

export async function updateStage(
  ctx: CallerContext,
  stageId: string,
  data: { name?: string; position?: number; probability_default?: number; color?: string; is_won?: boolean; is_lost?: boolean },
): Promise<DealStage> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for updateStage');

  return runInTenant(tenantId, async (client) => {
    const fields: [string, unknown][] = [
      ['name', data.name], ['position', data.position], ['probability_default', data.probability_default],
      ['color', data.color], ['is_won', data.is_won], ['is_lost', data.is_lost],
    ];
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const [col, val] of fields) {
      if (val !== undefined) {
        sets.push(`${col} = $${idx++}`);
        params.push(val);
      }
    }
    if (sets.length === 0) throw new Error('No fields to update');
    params.push(stageId);

    const result = await client.query(
      `UPDATE crm_deal_stages SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );
    if (!result.rows[0]) throw new Error('Stage not found');
    return result.rows[0] as DealStage;
  });
}

export async function deleteStage(ctx: CallerContext, stageId: string): Promise<void> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for deleteStage');

  return runInTenant(tenantId, async (client) => {
    const deals = await client.query('SELECT COUNT(*) as count FROM crm_deals WHERE stage_id = $1', [stageId]);
    if (parseInt(deals.rows[0].count, 10) > 0) {
      throw new Error('Cannot delete stage with active deals');
    }
    await client.query('DELETE FROM crm_deal_stages WHERE id = $1', [stageId]);
  });
}

export async function reorderStages(
  ctx: CallerContext,
  pipelineId: string,
  stageIds: string[],
): Promise<void> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for reorderStages');

  return runInTenant(tenantId, async (client) => {
    const existing = await client.query(
      'SELECT id FROM crm_deal_stages WHERE pipeline_id = $1',
      [pipelineId],
    );
    const existingIds = new Set(existing.rows.map((r: { id: string }) => r.id));
    for (const id of stageIds) {
      if (!existingIds.has(id)) throw new Error(`Stage ${id} does not belong to pipeline ${pipelineId}`);
    }

    for (let i = 0; i < stageIds.length; i++) {
      await client.query(
        'UPDATE crm_deal_stages SET position = $1 WHERE id = $2',
        [i, stageIds[i]],
      );
    }
  });
}
