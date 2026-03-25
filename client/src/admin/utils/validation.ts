import { z } from 'zod';

export const employmentTypeEnum = z.enum(['full_time', 'part_time', 'contract', 'intern']);
export const userRoleEnum = z.enum([
  'employee', 'manager', 'dept_head', 'finance', 'finance_admin', 'admin', 'system_admin', 'member',
]);
export const userStatusEnum = z.enum(['online', 'away', 'busy', 'offline', 'deep_work']);

export const employeeFormSchema = z.object({
  // Basic Info
  avatar: z.string().url().optional().or(z.literal('')),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email').min(1, 'Email is required'),
  phone: z.string().max(50).optional().or(z.literal('')),
  dateOfBirth: z.string().optional().or(z.literal('')),
  pronouns: z.string().max(50).optional().or(z.literal('')),

  // Employment
  employeeId: z.string().max(50).optional().or(z.literal('')),
  departmentId: z.string().min(1, 'Department is required'),
  role: userRoleEnum,
  managerId: z.string().optional().nullable(),
  employmentType: employmentTypeEnum.optional(),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().optional().nullable(),
  officeLocation: z.string().max(100).optional().or(z.literal('')),
  schedule: z.string().max(200).optional().or(z.literal('')),

  // Initial Setup
  level: z.number().int().min(1).max(100).default(1),
  xp: z.number().int().min(0).default(0),
  initialBadges: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),

  // Access
  status: userStatusEnum.default('offline'),
  welcomeEmail: z.boolean().default(true),
  tempPassword: z.string().max(100).optional().or(z.literal('')),

  // Additional
  jobTitle: z.string().min(1, 'Job title is required').max(200),
  skills: z.string().max(500).optional().or(z.literal('')),
  bio: z.string().max(2000).optional().or(z.literal('')),
  socialLinks: z.record(z.string().url()).optional().default({}),
  emergencyContact: z.string().max(200).optional().or(z.literal('')),
});

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

export const departmentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  icon: z.string().max(50).optional(),
  headId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  description: z.string().max(500).optional(),
  capacity: z.number().int().min(0).default(20),
  costCenter: z.string().max(50).optional(),
  tags: z.array(z.string()).optional(),
});

export const roleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  permissions: z.array(z.object({
    module: z.string(),
    actions: z.array(z.enum(['view', 'create', 'edit', 'delete', 'approve'])),
    scope: z.enum(['all', 'own', 'department', 'none']),
  })),
});
