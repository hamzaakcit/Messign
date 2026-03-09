import type { CallerContext } from './types.js';

/**
 * Generates a WHERE clause that enforces RBAC based on the caller's role.
 * - employee: only own records
 * - manager: own + direct reports (via reimbursement_users.manager_id)
 * - dept_head: department records
 * - finance_admin / system_admin: unrestricted
 * - unknown: deny all
 */
export function rbacWhereClause(
  ctx: CallerContext,
  userIdColumn: string = 'user_id',
  departmentColumn: string = 'department_id',
  paramOffset: number = 1,
): { clause: string; params: unknown[] } {
  switch (ctx.role) {
    case 'employee':
      return { clause: `${userIdColumn} = $${paramOffset}`, params: [ctx.userId] };
    case 'manager':
      return {
        clause: `(${userIdColumn} = $${paramOffset} OR ${userIdColumn} IN (SELECT id FROM reimbursement_users WHERE manager_id = $${paramOffset}))`,
        params: [ctx.userId],
      };
    case 'dept_head':
      return { clause: `${departmentColumn} = $${paramOffset}`, params: [ctx.departmentId] };
    case 'finance_admin':
    case 'system_admin':
      return { clause: '1=1', params: [] };
    default:
      return { clause: '1=0', params: [] };
  }
}

/**
 * Generates LIMIT / OFFSET SQL for pagination.
 */
export function paginationClause(
  page: number = 1,
  pageSize: number = 20,
  paramOffset: number = 1,
): { clause: string; params: unknown[] } {
  const offset = (page - 1) * pageSize;
  return { clause: `LIMIT $${paramOffset} OFFSET $${paramOffset + 1}`, params: [pageSize, offset] };
}
