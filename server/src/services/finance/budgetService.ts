import { query, getClient } from '../../db/index.js';
import { auditService } from './auditService.js';

export interface CreateBudgetInput {
  name: string;
  description?: string;
  department: string;
  budget_code?: string;
  team_id?: string;
  project_id?: string;
  owner_id: string;
  allocated_amount: number;
  currency?: string;
  period_start: string;
  period_end: string;
  period_type?: string;
  warning_threshold?: number;
  critical_threshold?: number;
  hard_limit?: boolean;
  requires_approval?: boolean;
  approval_threshold?: number;
}

export const budgetService = {
  async create(data: CreateBudgetInput, userId: string, orgId: string) {
    const result = await query(
      `INSERT INTO finance_budgets
       (organization_id, name, description, department, budget_code,
        team_id, project_id, owner_id, allocated_amount, currency,
        period_start, period_end, period_type,
        warning_threshold, critical_threshold, hard_limit,
        requires_approval, approval_threshold, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'active')
       RETURNING *`,
      [
        orgId, data.name, data.description ?? null, data.department,
        data.budget_code ?? null, data.team_id ?? null, data.project_id ?? null,
        data.owner_id, data.allocated_amount, data.currency ?? 'USD',
        data.period_start, data.period_end, data.period_type ?? 'monthly',
        data.warning_threshold ?? 80, data.critical_threshold ?? 95,
        data.hard_limit ?? false, data.requires_approval ?? true,
        data.approval_threshold ?? null,
      ],
    );

    await auditService.log({
      organization_id: orgId,
      event_type: 'budget.created',
      event_category: 'budget',
      actor_type: 'user',
      actor_id: userId,
      entity_type: 'budget',
      entity_id: result.rows[0].id,
      changes: { amount: data.allocated_amount, department: data.department },
    });

    return result.rows[0];
  },

  async list(orgId: string, filters: { status?: string; team_id?: string } = {}) {
    const conditions = ['b.organization_id = $1'];
    const params: unknown[] = [orgId];
    let idx = 2;

    if (filters.status) {
      conditions.push(`b.status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters.team_id) {
      conditions.push(`b.team_id = $${idx++}`);
      params.push(filters.team_id);
    }

    const result = await query(
      `SELECT b.*,
              u.full_name as owner_name,
              CASE WHEN b.allocated_amount > 0
                THEN ROUND((COALESCE(b.spent_amount,0) / b.allocated_amount * 100)::numeric, 1)
                ELSE 0 END as utilization_pct,
              b.allocated_amount - COALESCE(b.spent_amount, 0) as remaining
       FROM finance_budgets b
       LEFT JOIN reimbursement_users u ON u.id = b.owner_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY b.created_at DESC`,
      params,
    );
    return result.rows;
  },

  async getById(budgetId: string, orgId: string): Promise<Record<string, any> | null> {
    const budget = await query(
      `SELECT b.*,
              u.full_name as owner_name,
              CASE WHEN b.allocated_amount > 0
                THEN ROUND((COALESCE(b.spent_amount,0) / b.allocated_amount * 100)::numeric, 1)
                ELSE 0 END as utilization_pct,
              b.allocated_amount - COALESCE(b.spent_amount, 0) as remaining
       FROM finance_budgets b
       LEFT JOIN reimbursement_users u ON u.id = b.owner_id
       WHERE b.id = $1 AND b.organization_id = $2`,
      [budgetId, orgId],
    );
    if (!budget.rows[0]) return null;

    const [allocations, snapshots] = await Promise.all([
      query('SELECT * FROM finance_budget_allocations WHERE budget_id = $1 ORDER BY category_slug', [budgetId]),
      query('SELECT * FROM finance_budget_snapshots WHERE budget_id = $1 ORDER BY snapshot_date DESC LIMIT 90', [budgetId]),
    ]);

    return {
      ...(budget.rows[0] as Record<string, any>),
      allocations: allocations.rows,
      snapshots: snapshots.rows,
    };
  },

  async update(budgetId: string, data: Partial<CreateBudgetInput>, userId: string, orgId: string) {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const fields: [string, unknown][] = [
      ['name', data.name],
      ['description', data.description],
      ['allocated_amount', data.allocated_amount],
      ['warning_threshold', data.warning_threshold],
      ['critical_threshold', data.critical_threshold],
      ['hard_limit', data.hard_limit],
      ['period_start', data.period_start],
      ['period_end', data.period_end],
    ];

    for (const [col, val] of fields) {
      if (val !== undefined) {
        sets.push(`${col} = $${idx++}`);
        params.push(val);
      }
    }

    if (sets.length === 0) return this.getById(budgetId, orgId);

    params.push(budgetId, orgId);
    const result = await query(
      `UPDATE finance_budgets SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${idx++} AND organization_id = $${idx++} RETURNING *`,
      params,
    );

    if (result.rows[0]) {
      await auditService.log({
        organization_id: orgId,
        event_type: 'budget.updated',
        event_category: 'budget',
        actor_type: 'user',
        actor_id: userId,
        entity_type: 'budget',
        entity_id: budgetId,
        changes: data as Record<string, unknown>,
      });
    }

    return result.rows[0];
  },

  async checkHealth(budgetId: string, orgId: string) {
    const budget = await this.getById(budgetId, orgId);
    if (!budget) return null;

    const spent = parseFloat(budget.spent_amount ?? '0');
    const allocated = parseFloat(budget.allocated_amount ?? '0');
    const pct = allocated > 0 ? (spent / allocated) * 100 : 0;
    const warning = parseFloat(budget.warning_threshold ?? '80');
    const critical = parseFloat(budget.critical_threshold ?? '95');

    let status: 'healthy' | 'warning' | 'critical' | 'exceeded' = 'healthy';
    if (pct >= 100) status = 'exceeded';
    else if (pct >= critical) status = 'critical';
    else if (pct >= warning) status = 'warning';

    return {
      id: budget.id,
      name: budget.name ?? budget.department,
      status,
      utilization_pct: pct,
      spent,
      allocated,
      remaining: allocated - spent,
      days_remaining: Math.max(0, Math.ceil(
        (new Date(budget.period_end).getTime() - Date.now()) / 86400000,
      )),
    };
  },

  async setAllocations(budgetId: string, allocations: Array<{ category_slug: string; amount: number }>, userId: string, orgId: string) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      await client.query('DELETE FROM finance_budget_allocations WHERE budget_id = $1', [budgetId]);

      for (const a of allocations) {
        await client.query(
          `INSERT INTO finance_budget_allocations (budget_id, category_slug, allocated_amount)
           VALUES ($1, $2, $3)`,
          [budgetId, a.category_slug, a.amount],
        );
      }

      await client.query('COMMIT');

      await auditService.log({
        organization_id: orgId,
        event_type: 'budget.allocations_updated',
        event_category: 'budget',
        actor_type: 'user',
        actor_id: userId,
        entity_type: 'budget',
        entity_id: budgetId,
        changes: { allocations },
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async takeSnapshot(budgetId: string) {
    const budget = await query('SELECT * FROM finance_budgets WHERE id = $1', [budgetId]);
    if (!budget.rows[0]) return;

    const b = budget.rows[0];
    await query(
      `INSERT INTO finance_budget_snapshots
       (budget_id, snapshot_date, total_amount, spent_amount, forecast_amount, health_score)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [
        budgetId,
        b.allocated_amount,
        b.spent_amount ?? 0,
        b.ai_forecast_amount ?? null,
        b.ai_health_score ?? null,
      ],
    );
  },
};
