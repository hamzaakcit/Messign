/**
 * Dora v2 pipeline types (see ~/.cursor/plans/dora_v2_brain_architecture.plan.md).
 */

import type OpenAI from 'openai';
import type { ModelTier } from '../gateway.js';
import type { ActiveViewStateV1 } from '../agent/activeViewState.js';
import type { DoraRequestContext } from '../dora/types.js';
import type { ToolResult as V1ToolResult, ToolContext } from '../types.js';

/** Re-use v1 tool result shape — executeTool returns this. */
export type ToolResult = V1ToolResult;

export type AppRole = string;

export type AIMode = 'ask' | 'analyze' | 'act';

export type Domain =
  | 'crm'
  | 'hr'
  | 'finance'
  | 'support'
  | 'marketing'
  | 'time'
  | 'okr'
  | 'assets'
  | 'contracts'
  | 'culture'
  | 'knowledge'
  | 'analytics'
  | 'settings'
  | 'executive'
  | 'conversation'
  | 'unknown';

export interface DoraContext {
  organizationId: string;
  organizationSlug: string;
  userId: string;
  userName: string;
  userRole: AppRole;
  knowledgeRole?: string;
  teamId?: string;
  department?: string;
  sessionId: string;
  pagePath: string;
  mode: AIMode;
  concise: boolean;
  today: string;
  timezone: string;
  /** Frozen v1-style context for prompts / user refs */
  doraRequest: DoraRequestContext;
}

export interface ClassifiedRequest {
  domain: Domain;
  confidence: number;
  directIntent?: string;
  flags: {
    isKbOnly: boolean;
    isGreeting: boolean;
    isWebSearch: boolean;
    requiresAct: boolean;
    isPresentation: boolean;
  };
}

export type PlanOutcome =
  | { type: 'direct'; intentId: string }
  | { type: 'kb_search' }
  | { type: 'greeting' }
  | { type: 'web_search' }
  | { type: 'engine'; domain: Domain; toolNames: string[]; usedPlanning: boolean };

export interface ExecutionPlan {
  outcome: PlanOutcome;
}

export interface ToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface StepRecord {
  step: number;
  toolCalls: ToolCall[];
  results: ToolResult[];
}

export interface ExecutionTrace {
  steps: StepRecord[];
  toolResults: ToolResult[];
  toolsUsed: string[];
  finalAssistantContent: string | null;
  dataPoints: number;
  sources: Array<{ id: string; title: string; slug?: string; document_type?: string }>;
}

export interface EngineConfig {
  maxSteps: 3;
  maxTokensPerStep: number;
  maxToolOutputChars: number;
  enableDeduplication: boolean;
}

export type SSEEventType =
  | 'text'
  | 'progress'
  | 'widget_data'
  | 'pending_action'
  | 'sources'
  | 'metadata'
  | 'error'
  | 'done';

export interface ProgressStep {
  phase: string;
  label: string;
  step: number;
  maxSteps: number;
  status?: 'active' | 'completed';
}

export interface PipelineRequest {
  query: string;
  history: Array<{ role: string; content: string }>;
  sessionId: string;
  currentPath: string;
  concise: boolean;
  mode: AIMode;
  /** When true, always run Marketing Sub-Orchestrator flow (v2). */
  marketingAgentMode?: boolean;
  intent?: string;
  searchMode?: boolean;
  /** Sanitized from `confirmed` on the request body */
  confirmed?: boolean;
  confirmation?: { action?: string; params?: Record<string, unknown> };
  /** Zod-validated client view state (optional). */
  activeViewState?: ActiveViewStateV1;
  traceId?: string;
  idempotencyKey?: string;
}

export interface PipelineTelemetry {
  startedAt: number;
  endedAt?: number;
  stages: string[];
  errorCode?: string;
}

export type ModelTask = 'agent' | 'synthesis' | 'planning' | 'greeting' | 'kb';

export interface ModelConfig {
  primary: ModelTier;
  fallback: ModelTier;
}

export type PromptLayerKind =
  | 'identity'
  | 'session'
  | 'policy'
  | 'moduleHint'
  | 'kbRules'
  | 'outputFormats'
  | 'guardrails';

export interface PromptSpec {
  task: 'agent' | 'synthesis' | 'kb_synthesis' | 'greeting' | 'planning' | 'extraction';
  layers: PromptLayerKind[];
}

/** OpenAI-compatible chat message */
export type Message = OpenAI.ChatCompletionMessageParam;

export interface FormatOptions {
  maxChars: number;
  style: 'compact' | 'structured';
}

export interface ToolDefinitionV2 {
  name: string;
  domain: Domain;
  descriptionShort: string;
  description: string;
  parameters: import('../types.js').ToolParameterSchema;
  llmTool: OpenAI.ChatCompletionTool;
}

export type { ToolContext };
