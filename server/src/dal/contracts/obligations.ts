import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../middleware/tenantContext.js';
import type { CallerContext } from '../types.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

export interface Obligation {
  id: string;
  contract_id: string;
  description: string;
  obligation_type: string | null;
  responsible_party: string | null;
  due_date: string | null;
  recurring: string | null;
  status: string;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  contract_title?: string | null;
}

function mapObligation(row: Record<string, unknown>): Obligation {
  return {
    id: String(row.id),
    contract_id: String(row.contract_id),
    description: String(row.description ?? ''),
    obligation_type: row.obligation_type ? String(row.obligation_type) : null,
    responsible_party: row.responsible_party ? String(row.responsible_party) : null,
    due_date: row.due_date ? String(row.due_date) : null,
    recurring: row.recurring ? String(row.recurring) : null,
    status: String(row.status ?? 'pending'),
    completed_at: row.completed_at ? String(row.completed_at) : null,
    notes: row.notes ? String(row.notes) : null,
    created_at: String(row.created_at),
    contract_title: row.contract_title ? String(row.contract_title) : null,
  };
}

export async function listObligations(
  ctx: CallerContext,
  contractId?: string,
  status?: string,
  dueSoon?: boolean,
): Promise<Obligation[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listObligations');

  return runInTenant(tenantId, async (client) => {
    const conditions = ['1=1'];
    const params: unknown[] = [];
    let idx = 1;
    if (contractId) {
      conditions.push(`co.contract_id = $${idx++}::uuid`);
      params.push(contractId);
    }
    if (status) {
      conditions.push(`co.status = $${idx++}`);
      params.push(status);
    }
    if (dueSoon) {
      conditions.push(`co.due_date <= CURRENT_DATE + INTERVAL '7 days'`);
    }
    const result = await client.query<Record<string, unknown>>(
      `SELECT co.*, c.title AS contract_title
       FROM contract_obligations co
       JOIN contracts c ON c.id = co.contract_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY co.due_date ASC NULLS LAST, co.created_at DESC`,
      params,
    );
    return result.rows.map(mapObligation);
  });
}

export async function createObligation(
  ctx: CallerContext,
  contractId: string,
  data: {
    description: string;
    obligation_type?: string;
    responsible_party?: string;
    due_date?: string;
    recurring?: string;
    notes?: string;
  },
): Promise<Obligation> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for createObligation');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query<Record<string, unknown>>(
      `INSERT INTO contract_obligations (
       contract_id, description, obligation_type, responsible_party, due_date, recurring, notes
      ) VALUES ($1::uuid, $2, $3, $4, $5::date, $6, $7)
      RETURNING *`,
      [
      contractId,
      data.description,
      data.obligation_type ?? null,
      data.responsible_party ?? null,
      data.due_date ?? null,
      data.recurring ?? null,
      data.notes ?? null,
    ],
    );
    return mapObligation(result.rows[0]);
  });
}

export async function completeObligation(ctx: CallerContext, obligationId: string): Promise<Obligation> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for completeObligation');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query<Record<string, unknown>>(
      `UPDATE contract_obligations
       SET status = 'completed', completed_at = NOW()
       WHERE id = $1::uuid
       RETURNING *`,
      [obligationId],
    );
    if (!result.rows[0]) throw new Error('Obligation not found');
    return mapObligation(result.rows[0]);
  });
}

export async function getOverdueObligations(ctx: CallerContext): Promise<Obligation[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getOverdueObligations');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query<Record<string, unknown>>(
      `SELECT co.*, c.title AS contract_title
       FROM contract_obligations co
       JOIN contracts c ON c.id = co.contract_id
       WHERE co.status = 'overdue'
       ORDER BY co.due_date ASC`,
      [],
    );
    return result.rows.map(mapObligation);
  });
}
