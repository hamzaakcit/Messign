import type { User } from '@/types';

/**
 * Employee extends User with admin-specific fields.
 * department is stored as department ID; resolve to Department in UI.
 */
export interface Employee extends Omit<User, 'managerId'> {
  employeeId?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  managerId?: string | null;
  joinDate?: string;
  endDate?: string | null;
  employmentType?: EmploymentType;
  officeLocation?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'intern';

export interface Department {
  id: string;
  name: string;
  icon?: string;
  headId: string | null;
  parentId: string | null;
  description?: string;
  capacity: number;
  tags?: string[];
  costCenter?: string;
}

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'approve';
export type PermissionScope = 'all' | 'own' | 'department' | 'none';

export interface Permission {
  module: string;
  actions: PermissionAction[];
  scope: PermissionScope;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: Permission[];
  memberCount: number;
  isSystem: boolean;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  adminId: string;
  action: string;
  entityType: string;
  entityId: string;
  description: string;
  ipAddress?: string;
  userAgent?: string;
  changes?: Record<string, { before: unknown; after: unknown }>;
}

export interface ImportResult {
  total: number;
  successful: number;
  failed: number;
  warnings: number;
  errors: Array<{ row?: number; message: string }>;
}
