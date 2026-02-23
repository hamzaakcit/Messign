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

export interface AppSettings {
  general: {
    companyName: string;
    timezone: string;
    primaryColor: string;
    accentColor: string;
  };
  xp: {
    globalMultiplier: number;
    leaderboardEnabled: boolean;
    dailyCap: number | null;
    levelUpNotifications: boolean;
    xpDecayEnabled: boolean;
    xpDecayAfterDays: number;
  };
  notifications: {
    emailEnabled: boolean;
    inAppEnabled: boolean;
    digestFrequency: 'daily' | 'weekly' | 'never';
  };
  security: {
    requireMFA: boolean;
    sessionTimeoutMinutes: number;
    ipWhitelist: string[];
  };
}
