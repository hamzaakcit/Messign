/**
 * Orchestrator + Specialist Agent Architecture
 *
 * Types for the routing orchestrator ("traffic cop") and isolated
 * specialist agents per module.
 */

export interface AgentContext {
  tenantId: string;
  userId: string;
  userRoles: string[];
  conversationId: string;
  currentPage?: string;
}

export interface AgentResult {
  type: 'final_answer' | 'delegate' | 'needs_approval';
  content?: string;
  delegateTo?: string;
  delegateQuery?: string;
  approvalRequest?: ActionApproval;
  toolCallsUsed: number;
  tokensUsed: { input: number; output: number };
}

export interface ActionApproval {
  actionType: string;
  riskLevel: 'read' | 'write' | 'irreversible' | 'cross_module';
  description: string;
  payload: Record<string, unknown>;
  expiresAt: Date;
}

export interface SpecialistAgent {
  namespace: string;
  execute(query: string, context: AgentContext, priorContext?: string): Promise<AgentResult>;
}
