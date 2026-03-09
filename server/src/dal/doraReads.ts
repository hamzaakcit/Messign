import { query } from '../db/index.js';
import type { CallerContext } from './types.js';

// ── Department Spending ──
export async function getDepartmentSpend(_ctx: CallerContext) {
  const result = await query('SELECT * FROM mv_department_spend ORDER BY total_spend_eur DESC');
  return result.rows;
}

// ── Budget Health ──
export async function getBudgetHealth(_ctx: CallerContext) {
  const result = await query('SELECT * FROM mv_budget_health ORDER BY percent_consumed DESC');
  return result.rows;
}

export async function getCriticalBudgets(_ctx: CallerContext) {
  const result = await query(
    "SELECT * FROM mv_budget_health WHERE health_status IN ('critical', 'warning') ORDER BY percent_consumed DESC"
  );
  return result.rows;
}

// ── Approval Pipeline ──
export async function getApprovalPipeline(_ctx: CallerContext) {
  const result = await query('SELECT * FROM mv_approval_pipeline ORDER BY hours_pending DESC');
  return result.rows;
}

export async function getSLABreaches(_ctx: CallerContext) {
  const result = await query(
    "SELECT * FROM mv_approval_pipeline WHERE sla_status = 'breached' ORDER BY hours_pending DESC"
  );
  return result.rows;
}

// ── Team Performance ──
export async function getTeamPerformance(ctx: CallerContext, departmentId?: string) {
  if (departmentId) {
    const result = await query(
      'SELECT * FROM mv_team_performance WHERE department = $1 ORDER BY total_xp DESC',
      [departmentId]
    );
    return result.rows;
  }
  const result = await query('SELECT * FROM mv_team_performance ORDER BY total_xp DESC');
  return result.rows;
}

// ── Project Velocity ──
export async function getProjectVelocity(_ctx: CallerContext) {
  const result = await query('SELECT * FROM mv_project_velocity ORDER BY completion_rate DESC');
  return result.rows;
}

export async function getBlockedProjects(_ctx: CallerContext) {
  const result = await query(
    'SELECT * FROM mv_project_velocity WHERE blocked_tasks > 0 ORDER BY blocked_tasks DESC'
  );
  return result.rows;
}
