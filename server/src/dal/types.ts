export interface CallerContext {
  userId: string;
  role: 'employee' | 'manager' | 'dept_head' | 'finance_admin' | 'system_admin';
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
