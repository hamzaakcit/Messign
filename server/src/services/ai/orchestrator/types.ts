import type { ToolResult } from '../types.js';
import type { PendingActionSSEEvent } from '../actions/types.js';

export interface StepTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ResolvedToolCall {
  id: string;
  toolName: string;
  rawArguments: string;
  parsedArguments: Record<string, unknown>;
  wasCached: boolean;
}

export interface AgentStep {
  index: number;
  thought: string | null;
  toolCalls: ResolvedToolCall[];
  observations: Array<ToolResult & { toolName: string; executionTimeMs: number }>;
  success: boolean;
  tokensUsed: StepTokenUsage;
  durationMs: number;
  startedAt: string;
}

export interface OrchestratorConfig {
  maxSteps: number;
  maxTotalTokens: number;
  tokenBudgetThreshold: number;
  totalTimeoutMs: number;
  stepTimeoutMs: number;
  enableDeduplication: boolean;
  logThoughts: boolean;
  model: string;
  reasoningTemperature: number;
  synthesisTemperature: number;
}

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  maxSteps: 6,
  maxTotalTokens: 16_000,
  tokenBudgetThreshold: 0.8,
  totalTimeoutMs: 30_000,
  stepTimeoutMs: 10_000,
  enableDeduplication: true,
  logThoughts: true,
  model: 'llama-3.3-70b-versatile',
  reasoningTemperature: 0.1,
  synthesisTemperature: 0.3,
};

export type TerminationReason =
  | 'complete'
  | 'max_steps'
  | 'token_budget'
  | 'timeout'
  | 'error'
  | 'no_tools'
  | 'cascade_failure';

export interface OrchestrationResult {
  success: boolean;
  finalAnswer: string;
  steps: AgentStep[];
  stepCount: number;
  terminationReason: TerminationReason;
  toolsUsed: string[];
  totalDataPoints: number;
  totalTokens: StepTokenUsage;
  totalDurationMs: number;
  error?: string;
  pendingActions?: PendingActionSSEEvent[];
}

export interface CrossModuleLink {
  sourceModule: string;
  targetModule: string;
  linkField: string;
  linkValue: string;
  description: string;
}

export interface QueryTelemetryRecord {
  id?: string;
  sessionId: string;
  userId: string;
  userName: string;
  userRole: string;
  query: string;
  queryLength: number;
  currentPage: string;
  conciseMode: boolean;
  stepCount: number;
  toolsUsed: string[];
  toolCallCount: number;
  terminationReason: TerminationReason;
  success: boolean;
  totalDurationMs: number;
  llmDurationMs: number;
  toolDurationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  feedbackScore: 'up' | 'down' | null;
  feedbackComment: string | null;
  thoughtTrace: string[];
  errorMessage: string | null;
  createdAt: string;
}
