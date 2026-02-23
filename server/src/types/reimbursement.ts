export type ReimbursementUserRole = 'employee' | 'manager' | 'finance' | 'admin';

export interface ReimbursementUserRow {
  id: string;
  organization_id: string;
  auth_user_id: string | null;
  email: string;
  full_name: string;
  role: ReimbursementUserRole;
  manager_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ReimbursementUser {
  id: string;
  organizationId: string;
  authUserId: string | null;
  email: string;
  fullName: string;
  role: ReimbursementUserRole;
  managerId: string | null;
}

export type ReimbursementStatus =
  | 'draft'
  | 'submitted'
  | 'manager_review'
  | 'finance_review'
  | 'approved'
  | 'rejected'
  | 'paid';

export type ApprovalStepStatus = 'pending' | 'approved' | 'rejected' | 'skipped';

export type ApprovalStepType = 'manager_approval' | 'finance_approval';

export function mapReimbursementUser(row: ReimbursementUserRow): ReimbursementUser {
  return {
    id: row.id,
    organizationId: row.organization_id,
    authUserId: row.auth_user_id,
    email: row.email,
    fullName: row.full_name,
    role: row.role as ReimbursementUserRole,
    managerId: row.manager_id,
  };
}
