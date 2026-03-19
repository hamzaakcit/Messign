/**
 * Orchestrator + Specialist Agent Architecture — Shared Types
 */

/** Context passed to all agents (orchestrator and specialists) */
export interface AgentContext {
  tenantId: string;
  userId: string;
  userRoles: string[];
  userName: string;
  userRole: string;
  conversationId: string;
  currentPage: string;
  currentModule: string;
  todayDate: string;
  conciseMode: boolean;
  organizationId: string | null;
  department: string;
  teamId: string | null;
  /** Set by runOrchestrator for specialist execution */
  doraCtx?: import('../dora/types.js').DoraRequestContext;
  legacyContext?: import('../types.js').ToolContext;
}

/** Tool observation from specialist execution — used for widget emission */
export interface ToolObservation {
  toolName: string;
  success: boolean;
  data: unknown;
  summary?: string;
}

/** Result from a specialist or orchestrator step */
export type AgentResult =
  | { type: 'final_answer'; content: string; pendingActions?: import('../actions/types.js').PendingActionSSEEvent[]; toolObservations?: ToolObservation[] }
  | { type: 'delegate'; delegateTo: string; refinedQuery: string; priorContext?: string }
  | { type: 'needs_approval'; content?: string; approvalRequest: { toolName: string; args: Record<string, unknown> } };

/** Specialist agent contract — one per module */
export interface SpecialistAgent {
  namespace: string;
  execute(
    query: string,
    context: AgentContext,
    priorContext?: string,
  ): Promise<AgentResult>;
}

/** Orchestrator routing decision */
export interface RoutingDecision {
  action: 'respond_directly' | 'route_to_specialist';
  primaryModule?: string;
  refinedQuery?: string;
  complexity?: 'simple' | 'moderate' | 'complex';
  directResponse?: string;
}

/** HITL approval request (used by approvalFlow) */
export interface ActionApproval {
  toolName?: string;
  actionType: string;
  riskLevel?: string;
  description?: string;
  payload: Record<string, unknown>;
  args?: Record<string, unknown>;
  token?: string;
  expiresAt: Date | string;
}
