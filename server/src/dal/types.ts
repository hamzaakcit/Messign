/**
 * Canonical role union — every layer (auth middleware, DAL, client types) should
 * reference this single source of truth. Add new roles here only.
 */
export type AppRole =
  | 'employee'
  | 'manager'
  | 'dept_head'
  | 'finance'
  | 'finance_admin'
  | 'admin'
  | 'system_admin';

export interface CallerContext {
  userId: string;
  /** reimbursement_users.id — set when auth user_id maps to a row (use for FK to reimbursement_users) */
  userUuid?: string;
  role: AppRole;
  departmentId?: string;
  teamId?: string;
  organizationId?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DateRange {
  from?: string;
  to?: string;
}

export interface SortOptions {
  field: string;
  direction: 'asc' | 'desc';
}
