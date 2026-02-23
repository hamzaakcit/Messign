/**
 * Messign AI Brain — Tool Registry
 *
 * Central registry for all AI tools. Tools self-register on import.
 * The Intent Router reads the registry to tell the LLM what's available.
 */

import { getCached, setCache } from './queryCache.js';
import type {
  Tool,
  ToolContext,
  ToolResult,
  LLMToolDefinition,
} from './types.js';

// ============================================================
// REGISTRY STATE
// ============================================================

const registry: Map<string, Tool> = new Map();

// ============================================================
// REGISTRATION
// ============================================================

/**
 * Register a tool in the global registry.
 * Called by each tool file at module level.
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
  console.log(`[AI Registry] Registered tool: ${tool.name} (${tool.category})`);
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

export function getToolCount(): number {
  return registry.size;
}

/**
 * Format all registered tools for the LLM function calling schema.
 */
export function getToolsForLLM(): LLMToolDefinition[] {
  return Array.from(registry.values()).map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

// ============================================================
// EXECUTION
// ============================================================

/**
 * Execute a tool by name with the given arguments and auth context.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const tool = registry.get(name);

  if (!tool) {
    console.warn(`[AI Registry] Tool not found: "${name}"`);
    return {
      success: false,
      data: null,
      summary: `I tried to access a data source called "${name}" but it doesn't exist. Let me try answering with what I have.`,
    };
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

  // Check cache first
  const cached = getCached(name, args, context.userId) as ToolResult | null;
  if (cached) {
    console.log(`[AI Registry] Tool "${name}" cache HIT`);
    return cached;
  }

  const startTime = Date.now();
  try {
    const result = await tool.execute(args, context);
    const elapsed = Date.now() - startTime;
    console.log(`[AI Registry] Tool "${name}" executed in ${elapsed}ms (success: ${result.success}, records: ${result.metadata?.count ?? 'N/A'})`);

    // Cache successful results
    if (result.success && result.data) {
      setCache(name, tool.category, args, context.userId, result);
    }

    return result;
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[AI Registry] Tool "${name}" FAILED after ${elapsed}ms:`, message);
    return {
      success: false,
      data: null,
      summary: `The data source "${name}" encountered a temporary issue. Please try again in a moment.`,
    };
  }
}
