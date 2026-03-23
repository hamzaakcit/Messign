/**
 * Messign AI Brain — Tool Registry
 *
 * Central registry for all AI tools. Tools self-register on import.
 * The Intent Router reads the registry to tell the LLM what's available.
 *
 * Split: always-loaded tools (sent on every request) vs deferred tools
 * (loaded via core:search_tools + core:activate_tool).
 */

import { getCached, setCache } from './queryCache.js';
import { toolIndex } from './tools/toolIndex.js';
import { validateToolArgsForExecution } from './toolArgSchemas.js';
import { isWriteTool } from './actions/actionInterceptor.js';
import type {
  Tool,
  ToolContext,
  ToolResult,
  LLMToolDefinition,
} from './types.js';
import { logAuditEvent } from '../../platform/audit.js';

// ============================================================
// REGISTRY STATE
// ============================================================

const registry: Map<string, Tool> = new Map();
const shortNameIndex: Map<string, string> = new Map();
let cachedAllToolsLLM: LLMToolDefinition[] | null = null;

// ============================================================
// REGISTRATION
// ============================================================

/**
 * Register a tool in the global registry.
 * Called by each tool file at module level during startup/registration.
 * Extracts ToolMetadata from the tool configuration and populates toolIndex
 * using the tool's namespaced name as the key.
 */
export function registerTool(tool: Tool): void {
  if (registry.has(tool.name)) {
    console.warn(`[AI Registry] WARNING: Tool "${tool.name}" is already registered. Skipping duplicate.`);
    return;
  }

  if (!tool.name || !tool.description || !tool.parameters || !tool.execute) {
    console.error(`[AI Registry] ERROR: Tool "${tool.name}" is missing required fields. Not registered.`);
    return;
  }

  registry.set(tool.name, tool);
  cachedAllToolsLLM = null;

  const colonIdx = tool.name.indexOf(':');
  if (colonIdx > 0) {
    const shortName = tool.name.slice(colonIdx + 1);
    if (!shortNameIndex.has(shortName)) {
      shortNameIndex.set(shortName, tool.name);
    }
  }

  if (tool.metadata) {
    const metadata = {
      namespace: tool.metadata.namespace,
      name: tool.metadata.name,
      summary: tool.metadata.summary,
      tags: tool.metadata.tags,
      alwaysLoaded: tool.metadata.alwaysLoaded,
      parameterHints: tool.metadata.parameterHints,
      requiredRoles: tool.requiredRoles ?? [],
    };
    toolIndex.set(tool.name, metadata);
  }
}

// ============================================================
// RETRIEVAL
// ============================================================

export function getAllTools(): Tool[] {
  return Array.from(registry.values());
}

export function getTool(name: string): Tool | undefined {
  return registry.get(name);
}

export interface FullToolDefinition {
  requiredRoles: string[];
  llmSchema: LLMToolDefinition;
}

/**
 * Get a tool's full definition for dynamic activation (core:activate_tool).
 * Returns the LLM schema and required roles for RBAC.
 */
export function getFullToolDefinition(name: string): FullToolDefinition | null {
  const tool = registry.get(name);
  if (!tool) return null;
  return {
    requiredRoles: tool.requiredRoles ?? [],
    llmSchema: {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    },
  };
}

export function getToolCount(): number {
  return registry.size;
}

/**
 * Format all registered tools for the LLM function calling schema.
 */
export function getToolsForLLM(): LLMToolDefinition[] {
  if (cachedAllToolsLLM) return cachedAllToolsLLM;
  cachedAllToolsLLM = Array.from(registry.values()).map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
  return cachedAllToolsLLM;
}

/**
 * Specialists can access tools from related namespaces.
 * Fixes the mismatch where hr specialist needs people:* tools
 * and time specialist needs projects:* tools.
 */
const NAMESPACE_ALIASES: Record<string, string[]> = {
  hr: ['hr', 'people'],
  time: ['time', 'projects'],
  finance: ['finance'],
  executive: ['executive', 'analytics'],
  crm: ['crm'],
  support: ['support'],
  marketing: ['marketing', 'creative', 'seo', 'conversion', 'automation'],
  okr: ['okr'],
  assets: ['assets'],
  contracts: ['contracts'],
  heart: ['heart'],
};

/**
 * Get all tools for a given namespace (for specialist agents).
 * Uses NAMESPACE_ALIASES so hr gets people:* and time gets projects:*.
 * Filters by userRoles for RBAC.
 */
export function getToolsForNamespace(namespace: string, userRoles: string[]): LLMToolDefinition[] {
  const namespaces = NAMESPACE_ALIASES[namespace] ?? [namespace];
  const tools: LLMToolDefinition[] = [];
  for (const [name, metadata] of toolIndex) {
    const toolNs = metadata.namespace;
    if (!namespaces.includes(toolNs)) continue;
    const tool = registry.get(name);
    if (!tool) continue;
    const requiredRoles = metadata.requiredRoles ?? tool.requiredRoles ?? [];
    if (requiredRoles.length > 0) {
      const hasRole = requiredRoles.some((r) => userRoles.includes(r));
      if (!hasRole) continue;
    }
    tools.push({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    });
  }
  return tools;
}

/**
 * LLM schemas for an explicit allowlist of tool names (any namespace).
 * Respects RBAC via each tool's requiredRoles / toolIndex metadata.
 */
export function getLLMToolsForExactNames(names: string[], userRoles: string[]): LLMToolDefinition[] {
  const out: LLMToolDefinition[] = [];
  for (const name of names) {
    const tool = registry.get(name);
    if (!tool) continue;
    const metadata = toolIndex.get(name);
    const requiredRoles = metadata?.requiredRoles ?? tool.requiredRoles ?? [];
    if (requiredRoles.length > 0) {
      const hasRole = requiredRoles.some((r) => userRoles.includes(r));
      if (!hasRole) continue;
    }
    out.push({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    });
  }
  return out;
}

/**
 * Returns ONLY always-loaded tool schemas for the initial LLM call.
 * Use this for a reduced token payload; deferred tools are loaded via core:search_tools + core:activate_tool.
 * Filters by userRoles for RBAC.
 */
export function getBaseToolsForLLM(userRoles: string[]): LLMToolDefinition[] {
  const tools: LLMToolDefinition[] = [];
  for (const [name, metadata] of toolIndex) {
    if (!metadata.alwaysLoaded) continue;
    const tool = registry.get(name);
    if (!tool) continue;
    const requiredRoles = metadata.requiredRoles ?? tool.requiredRoles ?? [];
    if (requiredRoles.length > 0) {
      const hasRole = requiredRoles.some((r) => userRoles.includes(r));
      if (!hasRole) continue;
    }
    tools.push({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    });
  }
  return tools;
}

/**
 * Call once at startup after all tools register.
 * Rebuilds the search index for core:search_tools.
 * Uses dynamic import to avoid circular dependency (searchTools imports registerTool from this module).
 */
export async function finalizeRegistry(): Promise<void> {
  const { rebuildSearchIndex } = await import('./tools/core/searchTools.js');
  rebuildSearchIndex();
  const alwaysCount = Array.from(toolIndex.values()).filter((m) => m.alwaysLoaded).length;
  console.log(`[AI Registry] ${registry.size} tools registered, ${alwaysCount} always-loaded`);
}

// ============================================================
// EXECUTION
// ============================================================

/**
 * Resolve a tool name to its registered form. Handles LLM sometimes returning
 * short names (e.g. get_achievements_leaderboard) instead of namespaced
 * (achievements:get_achievements_leaderboard).
 */
function resolveToolName(name: string): string | undefined {
  if (registry.has(name)) return name;
  return shortNameIndex.get(name);
}

/** Exported for argument validation / intercept paths that run before executeTool. */
export function resolveRegisteredToolName(name: string): string | undefined {
  return resolveToolName(name);
}

/**
 * Execute a tool by name with the given arguments and auth context.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const resolvedName = resolveToolName(name);
  const tool = resolvedName ? registry.get(resolvedName) : undefined;

  if (!tool || !resolvedName) {
    console.warn(`[AI Registry] Tool not found: "${name}"`);
    return {
      success: false,
      data: null,
      summary: `I tried to access a data source called "${name}" but it doesn't exist. Let me try answering with what I have.`,
    };
  }

  const resolved = resolvedName as string;

  if (resolved !== name) {
    console.log(`[AI Registry] Resolved "${name}" → "${resolved}"`);
  }

  if (tool.requiredRoles && tool.requiredRoles.length > 0) {
    if (!tool.requiredRoles.includes(context.userRole)) {
      console.log(`[AI Registry] Access denied: user ${context.userId} (role: ${context.userRole}) tried to use tool "${name}" (requires: ${tool.requiredRoles.join(', ')})`);
      return {
        success: false,
        data: null,
        summary: `You don't have permission to access this data. This requires one of these roles: ${tool.requiredRoles.join(', ')}.`,
      };
    }
  }

  const validated = validateToolArgsForExecution(resolved, args);
  if (!validated.ok) {
    if (context.traceId) {
      console.warn(`[AI Registry] tool_args_invalid trace=${context.traceId} tool=${resolved}`);
    }
    return {
      success: false,
      data: null,
      summary: validated.summary,
      metadata: { source: 'tool_validation', validationError: true },
    };
  }
  args = validated.args;

  // Check cache first (use resolved name for cache key consistency)
  const idem = context.idempotencyKey?.trim() || undefined;
  const cached = getCached(resolved, args, context.userId, idem) as ToolResult | null;
  if (cached) {
    console.log(`[AI Registry] Tool "${resolved}" cache HIT`);
    return cached;
  }

  const startTime = Date.now();
  const tenantId = context.organizationId ?? null;
  const redactKeys = ['password', 'token', 'secret', 'apiKey', 'api_key'];
  const redactedArgs = Object.fromEntries(
    Object.entries(args).map(([k, v]) => [
      k,
      redactKeys.some((r) => k.toLowerCase().includes(r)) ? '[REDACTED]' : v,
    ]),
  );

  try {
    const result = await tool.execute(args, context);
    const elapsed = Date.now() - startTime;
    console.log(`[AI Registry] Tool "${resolved}" executed in ${elapsed}ms (success: ${result.success}, records: ${result.metadata?.count ?? 'N/A'})`);

    logAuditEvent({
      tenantId: tenantId ?? undefined,
      userId: context.userId,
      action: 'ai.tool.executed',
      resourceType: resolved,
      details: {
        tool: resolved,
        args: redactedArgs,
        success: result.success,
        elapsedMs: elapsed,
        recordCount: result.metadata?.count,
      },
    });

    // Cache successful results (use resolved name for cache key consistency)
    if (result.success && result.data && !isWriteTool(resolved)) {
      setCache(resolved, tool.category, args, context.userId, result, idem);
    }

    return result;
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[AI Registry] Tool "${name}" FAILED after ${elapsed}ms:`, message);

    logAuditEvent({
      tenantId: tenantId ?? undefined,
      userId: context.userId,
      action: 'ai.tool.executed',
      resourceType: resolved,
      details: {
        tool: resolved,
        args: redactedArgs,
        success: false,
        elapsedMs: elapsed,
        error: message,
      },
    });

    return {
      success: false,
      data: null,
      summary: `The data source "${name}" encountered a temporary issue. Please try again in a moment.`,
    };
  }
}
