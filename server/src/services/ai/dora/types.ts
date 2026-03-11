/**
 * Dora AI Brain — Core Type Definitions
 *
 * Shared types for Dora's context-aware AI pipeline.
 * Used across prompts, context builder, and the main AI route.
 */

export interface DoraUserContext {
  userId: string;
  userName: string;
  userRole: 'admin' | 'manager' | 'employee' | 'cpo' | 'hr' | 'finance';
  organizationId: string | null;
  department: string;
  teamId: string | null;
  knowledgeRole: string | null;
  level: string;
  mpPoints: number;
}

/**
 * Captures where the user is in the app when they ask a question.
 * Lets Dora give contextually relevant answers without being asked.
 */
export interface DoraPageContext {
  currentPath: string;
  currentModule: DoraModule;
  activeFilters?: Record<string, string>;
}

export type DoraModule =
  | 'dashboard'
  | 'chat'
  | 'projects'
  | 'knowledge-hub'
  | 'achievements'
  | 'team-directory'
  | 'reimbursements'
  | 'invoices'
  | 'settings'
  | 'admin'
  | 'dora'
  | 'crm'
  | 'marketing'
  | 'recruitment'
  | 'assets'
  | 'contracts'
  | 'support'
  | 'time'
  | 'culture'
  | 'unknown';

/**
 * Full context object injected into every Dora request.
 * Frozen after construction — no mutations during the request lifecycle.
 */
export interface DoraRequestContext {
  user: DoraUserContext;
  page: DoraPageContext;
  timestamp: string;
  todayDate: string;
  conciseMode: boolean;
}
