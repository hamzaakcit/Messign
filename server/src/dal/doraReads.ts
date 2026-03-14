import type { PoolClient } from 'pg';
import { withTenantQuery } from '../middleware/tenantContext.js';
import type { CallerContext } from './types.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

// ── Department Spending ──
export async function getDepartmentSpend(ctx: CallerContext) {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getDepartmentSpend');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query('SELECT * FROM mv_department_spend ORDER BY total_spend_eur DESC');
    return result.rows;
  });
}

// ── Budget Health ──
export async function getBudgetHealth(ctx: CallerContext) {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getBudgetHealth');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query('SELECT * FROM mv_budget_health ORDER BY percent_consumed DESC');
    return result.rows;
  });
}

export async function getCriticalBudgets(ctx: CallerContext) {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getCriticalBudgets');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      "SELECT * FROM mv_budget_health WHERE health_status IN ('critical', 'warning') ORDER BY percent_consumed DESC"
    );
    return result.rows;
  });
}

// ── Approval Pipeline ──
export async function getApprovalPipeline(ctx: CallerContext) {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getApprovalPipeline');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query('SELECT * FROM mv_approval_pipeline ORDER BY hours_pending DESC');
    return result.rows;
  });
}

export async function getSLABreaches(ctx: CallerContext) {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getSLABreaches');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      "SELECT * FROM mv_approval_pipeline WHERE sla_status = 'breached' ORDER BY hours_pending DESC"
    );
    return result.rows;
  });
}

// ── Team Performance ──
export async function getTeamPerformance(ctx: CallerContext, departmentId?: string) {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getTeamPerformance');

  return runInTenant(tenantId, async (client) => {
    if (departmentId) {
      const result = await client.query(
        'SELECT * FROM mv_team_performance WHERE department = $1 ORDER BY total_xp DESC',
        [departmentId]
      );
      return result.rows;
    }
    const result = await client.query('SELECT * FROM mv_team_performance ORDER BY total_xp DESC');
    return result.rows;
  });
}

// ── Project Velocity ──
export async function getProjectVelocity(ctx: CallerContext) {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getProjectVelocity');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query('SELECT * FROM mv_project_velocity ORDER BY completion_rate DESC');
    return result.rows;
  });
}

export async function getBlockedProjects(ctx: CallerContext) {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getBlockedProjects');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      'SELECT * FROM mv_project_velocity WHERE blocked_tasks > 0 ORDER BY blocked_tasks DESC'
    );
    return result.rows;
  });
}

// ── Time Utilization ──
export async function getTimeUtilization(ctx: CallerContext) {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getTimeUtilization');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      'SELECT * FROM mv_time_utilization ORDER BY utilization_percent DESC, full_name ASC'
    );
    return result.rows;
  });
}
