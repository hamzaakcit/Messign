/**
 * Dora AI Brain — Core Type Definitions
 *
 * Shared types for Dora's context-aware AI pipeline.
 * Used across prompts, context builder, and the main AI route.
 */

export interface DoraUserContext {
  /** auth_user_id (e.g. "user-1") — use for tools, display */
  userId: string;
  /** reimbursement_users.id UUID — use for telemetry/DB columns that require UUID */
  userUuid?: string;
  userName: string;
  userRole: 'admin' | 'manager' | 'employee' | 'cpo' | 'hr' | 'finance';
  organizationId: string | null;
  department: string;
  teamId: string | null;
  knowledgeRole: string | null;
  level: string;
  mpPoints: number;
}

import type { ActiveViewStateV1 } from '../agent/activeViewState.js';

/**
 * Captures where the user is in the app when they ask a question.
 * Lets Dora give contextually relevant answers without being asked.
 */
export interface DoraPageContext {
  currentPath: string;
  currentModule: DoraModule;
  activeFilters?: Record<string, string>;
  /** Structured, Zod-validated client view (entity, filters, etc.). */
  activeView?: ActiveViewStateV1 | null;
  /** Hybrid RAG snippets injected during hydration (server-side). */
  retrievalCitations?: string;
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
  /** Optional request-scoped metadata (trace id, idempotency for HITL / tools). */
  requestMeta?: {
    traceId?: string;
    idempotencyKey?: string;
  };
}
