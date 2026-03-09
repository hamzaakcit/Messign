import { query, getClient } from './index.js';

export interface BudgetRow {
  id: string;
  organization_id: string;
  department: string;
  name: string | null;
  description: string | null;
  period_start: string;
  period_end: string;
  allocated_amount: string;
  currency: string;
  alert_threshold: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  organizationId: string;
  department: string;
  name?: string;
  description?: string;
  periodStart: string;
  periodEnd: string;
  allocatedAmount: number;
  currency: string;
  alertThreshold: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetWithSpent extends Budget {
  spent: number;
  remaining: number;
  utilizationPct: number;
}

function mapRowToBudget(row: BudgetRow): Budget {
  return {
    id: row.id,
    organizationId: row.organization_id,
    department: row.department,
    name: row.name ?? undefined,
    description: row.description ?? undefined,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    allocatedAmount: parseFloat(row.allocated_amount),
    currency: row.currency,
    alertThreshold: parseFloat(row.alert_threshold),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getAllBudgets(orgId: string): Promise<BudgetWithSpent[]> {
  const result = await query<BudgetRow>(
    `SELECT * FROM finance_budgets WHERE organization_id = $1 ORDER BY period_start DESC`,
    [orgId],
  );
  const budgets = result.rows.map(mapRowToBudget);
  return Promise.all(budgets.map((b) => attachSpent(b, orgId)));
}

export async function getBudgetById(id: string, orgId: string): Promise<BudgetWithSpent | null> {
  const result = await query<BudgetRow>(
    `SELECT * FROM finance_budgets WHERE id = $1 AND organization_id = $2`,
    [id, orgId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return attachSpent(mapRowToBudget(row), orgId);
}

export async function getBudgetsByDepartment(department: string, orgId: string): Promise<BudgetWithSpent[]> {
  const result = await query<BudgetRow>(
    `SELECT * FROM finance_budgets WHERE department = $1 AND organization_id = $2 ORDER BY period_start DESC`,
    [department, orgId],
  );
  const budgets = result.rows.map(mapRowToBudget);
  return Promise.all(budgets.map((b) => attachSpent(b, orgId)));
}

export async function getActiveBudgets(orgId: string): Promise<BudgetWithSpent[]> {
  const result = await query<BudgetRow>(
    `SELECT * FROM finance_budgets
     WHERE organization_id = $1 AND period_start <= CURRENT_DATE AND period_end >= CURRENT_DATE
     ORDER BY department`,
    [orgId],
  );
  const budgets = result.rows.map(mapRowToBudget);
  return Promise.all(budgets.map((b) => attachSpent(b, orgId)));
}

export async function createBudget(
  orgId: string,
  data: {
    department: string;
    periodStart: string;
    periodEnd: string;
    allocatedAmount: number;
    currency?: string;
    alertThreshold?: number;
    createdBy?: string;
    name?: string;
    description?: string;
  },
): Promise<Budget> {
  const existing = await query<BudgetRow>(
    `SELECT * FROM finance_budgets
     WHERE organization_id = $1 AND department = $2
       AND period_start = $3 AND period_end = $4`,
    [orgId, data.department, data.periodStart, data.periodEnd],
  );
  if (existing.rows[0]) {
    throw new Error(`A budget already exists for ${data.department} in this period`);
  }

  const result = await query<BudgetRow>(
    `INSERT INTO finance_budgets (organization_id, department, name, description, period_start, period_end, allocated_amount, currency, alert_threshold, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      orgId,
      data.department,
      data.name || null,
      data.description || null,
      data.periodStart,
      data.periodEnd,
      data.allocatedAmount,
      data.currency || 'EUR',
      data.alertThreshold ?? 0.8,
      data.createdBy || null,
    ],
  );
  return mapRowToBudget(result.rows[0]);
}

export async function updateBudget(
  id: string,
  orgId: string,
  data: Partial<{
    department: string;
    periodStart: string;
    periodEnd: string;
    allocatedAmount: number;
    currency: string;
    alertThreshold: number;
  }>,
): Promise<Budget | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.department !== undefined) { sets.push(`department = $${idx++}`); values.push(data.department); }
  if (data.periodStart !== undefined) { sets.push(`period_start = $${idx++}`); values.push(data.periodStart); }
  if (data.periodEnd !== undefined) { sets.push(`period_end = $${idx++}`); values.push(data.periodEnd); }
  if (data.allocatedAmount !== undefined) { sets.push(`allocated_amount = $${idx++}`); values.push(data.allocatedAmount); }
  if (data.currency !== undefined) { sets.push(`currency = $${idx++}`); values.push(data.currency); }
  if (data.alertThreshold !== undefined) { sets.push(`alert_threshold = $${idx++}`); values.push(data.alertThreshold); }

  if (sets.length === 0) return getBudgetById(id, orgId) as Promise<Budget | null>;

  sets.push(`updated_at = NOW()`);
  values.push(id, orgId);

  const result = await query<BudgetRow>(
    `UPDATE finance_budgets SET ${sets.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx} RETURNING *`,
    values,
  );
  if (!result.rows[0]) return null;
  return mapRowToBudget(result.rows[0]);
}

export async function deleteBudget(id: string, orgId: string): Promise<boolean> {
  const result = await query(`DELETE FROM finance_budgets WHERE id = $1 AND organization_id = $2`, [id, orgId]);
  return (result.rowCount ?? 0) > 0;
}

async function attachSpent(budget: Budget, orgId: string): Promise<BudgetWithSpent> {
  const spentResult = await query<{ total: string }>(
    `SELECT COALESCE(SUM(converted_amount), 0) AS total
     FROM reimbursement_requests
     WHERE organization_id = $1
       AND budget_id = $2
       AND status NOT IN ('draft', 'rejected', 'cancelled')
       AND is_deleted = FALSE`,
    [orgId, budget.id],
  );
  const spent = parseFloat(spentResult.rows[0]?.total || '0');
  const remaining = Math.max(0, budget.allocatedAmount - spent);
  const utilizationPct = budget.allocatedAmount > 0 ? spent / budget.allocatedAmount : 0;
  return { ...budget, spent, remaining, utilizationPct };
}

export async function getBudgetsExceedingThreshold(orgId: string): Promise<BudgetWithSpent[]> {
  const active = await getActiveBudgets(orgId);
  return active.filter((b) => b.utilizationPct >= b.alertThreshold);
}

export async function logFinancialAction(data: {
  actionType: string;
  relatedEntityType: string;
  relatedEntityId: string;
  userId?: string;
  reasoning: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO ai_financial_action_log (action_type, related_entity_type, related_entity_id, user_id, reasoning, confidence, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      data.actionType,
      data.relatedEntityType,
      data.relatedEntityId,
      data.userId || null,
      data.reasoning,
      data.confidence ?? null,
      data.metadata ? JSON.stringify(data.metadata) : null,
    ],
  );
}
