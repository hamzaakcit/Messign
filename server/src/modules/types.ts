/**
 * Module Registry — Platform types for domain plugins
 *
 * Each module (crm, support, finance, etc.) implements PlatformModule
 * and self-registers tools, routes, and event handlers.
 */
import type { Router } from 'express';
import type { EventBus } from '../platform/eventBus.js';
import type { ToolContext } from '../services/ai/types.js';

/** JSON Schema for LLM function-calling parameters */
export interface LLMParameterSchema {
  type: 'object';
  properties: Record<string, { type?: string; description?: string; enum?: string[] }>;
  required?: string[];
}

/** Registration descriptor for a single AI tool */
export interface ToolRegistration {
  /** Namespaced tool name, e.g. "crm:search_deals" */
  name: string;
  /** Module namespace, e.g. "crm" */
  namespace: string;
  /** One-line summary for tool discovery */
  summary: string;
  /** Tags for search (e.g. ["deals", "pipeline", "forecast"]) */
  tags: string[];
  /** Roles required to use this tool. Empty = no restriction. */
  requiredRoles: string[];
  /** If true, loaded on demand via core:search_tools + core:activate_tool */
  deferLoaded: boolean;
  /** Compact param hints, e.g. "query: string, stage?: open|won|lost" */
  parameterHints: string;
  /** LLM function-calling schema (name, description, parameters) */
  llmSchema: {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: LLMParameterSchema;
    };
  };
  /** Tool execution handler */
  handler: (args: Record<string, unknown>, context: ToolContext) => Promise<unknown>;
}

/** Domain plugin contract. Each module implements this interface. */
export interface PlatformModule {
  /** Unique module identifier (e.g. "crm", "support", "finance") */
  namespace: string;

  /** Human-readable name for logs and UI */
  displayName: string;

  /** Register AI tools with the global registry. Called at startup. */
  registerTools(): ToolRegistration[];

  /** Return Express router for module-specific API routes */
  getRouter(): Router;

  /** Subscribe to domain events (e.g. crm.deal.won, finance.expense.submitted) */
  registerEventHandlers(eventBus: EventBus): void;

  /** Module-specific system prompt fragment for the specialist agent */
  getSystemPromptFragment(userRole: string): string;

  /** Roles that can access this module (for RBAC) */
  requiredRoles: string[];
}
