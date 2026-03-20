/**
 * Messign AI Brain — Core Type Definitions
 *
 * These types are used by the Tool Registry, Intent Router,
 * all individual tools, and the AI route handlers.
 */

// ============================================================
// TOOL SYSTEM TYPES
// ============================================================

/**
 * Context passed to every tool execution.
 * Built from the authenticated JWT payload in the Express request.
 * Every tool uses this to enforce permissions.
 */
export interface ToolContext {
  /** The authenticated user's auth_user_id (from JWT sub) */
  userId: string;

  /**
   * The user's system-wide role.
   * Maps to whatever role field exists in reimbursement_users.
   * Common values: 'admin', 'manager', 'employee', 'viewer'
   */
  userRole: string;

  /**
   * The user's Knowledge Hub-specific role (if assigned).
   * From knowledge_user_roles table.
   * Values: 'admin', 'cpo', 'editor', 'reviewer', 'viewer'
   */
  knowledgeRole?: string;

  /** The user's team ID (from performance_team_members) */
  teamId?: string;

  /** Active organization ID for tenant-scoped tools */
  organizationId?: string;

  /** The user's full name (for display in responses) */
  userName?: string;

  /** Correlates logs and SSE for this AI request. */
  traceId?: string;

  /** Client-supplied idempotency for tool/HITL deduplication. */
  idempotencyKey?: string;

  /** Per-session activated tools (core:activate_tool). Set by agentic loop. */
  toolSession?: { activatedTools: Map<string, object> };
}

/**
 * The result returned by every tool after execution.
 * The Intent Router collects these and formats them for the synthesis LLM.
 */
export interface ToolResult {
  /** Whether the tool executed successfully */
  success: boolean;

  /**
   * The raw data from the database query.
   * Can be an array of rows, a single object, a number, etc.
   * This gets sanitized before being sent to the LLM.
   */
  data: unknown;

  /**
   * Human-readable summary of the data.
   * This is what the LLM actually reads in most cases.
   * Should be formatted as readable text with key metrics highlighted.
   */
  summary: string;

  /**
   * Metadata about the query for transparency.
   * Shown to the user in the UI: "Queried: tasks, users (47 records)"
   */
  metadata?: {
    /** Which database tables were queried */
    source: string;
    /** How many records were returned */
    count?: number;
    /** What time period the data covers */
    timeRange?: string;
    /** Retrieval confidence 0–1 (for search_knowledge_base) */
    confidence?: number;
    /** Chunk count returned (search_knowledge_base RAG) */
    chunksReturned?: number;
    avgVectorScore?: number;
    avgKeywordScore?: number;
    /** Tool argument validation (Zod) — model may retry with fixed args */
    validationError?: boolean;
    idempotentReplay?: boolean;
  };
}

/**
 * JSON Schema definition for a tool's parameters.
 * This schema is sent to the LLM so it knows what arguments to provide.
 * Must follow the OpenAI/Groq function calling parameter format.
 */
export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required: string[];
}

export interface ToolParameterProperty {
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  enum?: string[];
  items?: { type: string };
  default?: unknown;
}

import type { ToolMetadata } from './tools/toolIndex.js';

/**
 * A single tool definition.
 */
export interface Tool {
  /** Unique identifier. Used by the LLM to call this tool. Format: namespace:action_noun (e.g. crm:get_pipeline_status). */
  name: string;

  /** Category for organizational purposes. */
  category: 'knowledge' | 'people' | 'projects' | 'finance' | 'communication' | 'achievements' | 'analytics' | 'system' | 'fun';

  /** Description the LLM reads to decide when to use this tool. */
  description: string;

  /** JSON Schema for the tool's arguments */
  parameters: ToolParameterSchema;

  /** Which system roles are allowed to trigger this tool. */
  requiredRoles?: string[];

  /** Metadata for tool index (namespace, summary, tags, etc.). */
  metadata?: ToolMetadata;

  /** The actual execution function. */
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}

export type { ToolMetadata };

// ============================================================
// INTENT ROUTER TYPES
// ============================================================

/**
 * A single tool call extracted from the LLM's routing response.
 */
export interface ParsedToolCall {
  name: string;
  args: Record<string, unknown>;
  callId?: string;
}

/**
 * The complete result of the Intent Router.
 */
export interface RouterResult {
  toolResults: ToolResult[];
  toolsUsed: string[];
  combinedContext: string;
  isConversational: boolean;
}

// ============================================================
// LLM INTERACTION TYPES
// ============================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
}

export interface LLMRouterResponse {
  content: string | null;
  toolCalls: ParsedToolCall[] | null;
}

export interface LLMToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: ToolParameterSchema;
  };
}

// ============================================================
// SSE EVENT TYPES (sent to frontend)
// ============================================================

export interface SourceDocument {
  id: string;
  title: string;
  slug?: string;
  document_type?: string;
}

export interface ResponseMetadata {
  toolsUsed: string[];
  dataPoints: number;
  responseTimeMs: number;
  steps?: number;
  terminationReason?: string;
  telemetryId?: string;
}

export interface ChartPayload {
  chartType: 'bar' | 'line' | 'pie' | 'radar';
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  dataKeys: string[];
  colors?: string[];
}

export interface TablePayload {
  title: string;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
}

/** SSE events - sources uses documents key for client compatibility */
export type SSEEvent =
  | { type: 'text'; content: string }
  | { type: 'sources'; documents: SourceDocument[] }
  | { type: 'metadata'; content: ResponseMetadata }
  | { type: 'chart_data'; content: ChartPayload }
  | { type: 'table_data'; content: TablePayload }
  | { type: 'pending_action'; content: { token: string; actionType: string; description: string; displayFields: unknown[]; editableFields: string[]; expiresAt: string; payload: Record<string, unknown> } }
  | { type: 'error'; message: string }
  | { type: 'done' };
