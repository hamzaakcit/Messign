/**
 * Core: activate_tool — Dynamically load a tool's full definition
 *
 * Dora calls this after core:search_tools to add a tool to the current session.
 * The activated tool then becomes available for the conversation.
 */

import { registerTool } from '../../toolRegistry.js';
import { getFullToolDefinition } from '../../toolRegistry.js';
import { isDisallowedToolForLlmDiscovery } from '../llmToolPolicy.js';
import { buildParameterHints } from '../toolIndex.js';
import type { Tool, ToolContext, ToolResult } from '../../types.js';

// Per-session activated tools (stored in the agentic loop context)
export interface ToolSession {
  activatedTools: Map<string, object>; // name -> full LLM schema
}

export function createToolSession(): ToolSession {
  return { activatedTools: new Map() };
}

export function activateTool(
  toolName: string,
  session: ToolSession,
  userRoles: string[],
): { success: boolean; tool?: object; error?: string } {
  if (isDisallowedToolForLlmDiscovery(toolName)) {
    return {
      success: false,
      error:
        `Tool "${toolName}" is not available from chat. Use the Finance or Marketing hub for actions (invoices, campaigns, publishing).`,
    };
  }
  const fullDef = getFullToolDefinition(toolName);
  if (!fullDef) {
    return { success: false, error: `Tool "${toolName}" not found.` };
  }

  if (fullDef.requiredRoles.length > 0) {
    const hasRole = fullDef.requiredRoles.some((r) => userRoles.includes(r));
    if (!hasRole) {
      return { success: false, error: `Insufficient permissions for "${toolName}".` };
    }
  }

  session.activatedTools.set(toolName, fullDef.llmSchema);
  return { success: true, tool: fullDef.llmSchema };
}

const activateToolDef: Tool = {
  name: 'core:activate_tool',
  metadata: {
    namespace: 'core',
    name: 'activate_tool',
    summary: 'Load a tool so you can use it. Call after core:search_tools.',
    tags: ['core', 'activation', 'discovery'],
    alwaysLoaded: true,
    parameterHints: buildParameterHints({
      properties: { tool_name: { type: 'string' } },
      required: ['tool_name'],
    }),
    requiredRoles: [],
  },
  category: 'system',
  description: `Load a tool's full definition so you can use it.
Call this after core:search_tools returns the tool you need.
The tool will then appear in your available tools for this conversation.`,
  parameters: {
    type: 'object',
    properties: {
      tool_name: {
        type: 'string',
        description: "The exact namespaced tool name, e.g. 'crm:get_pipeline_status'",
      },
    },
    required: ['tool_name'],
  },
  async execute(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const toolName = String(args.tool_name ?? '').trim();
    const userRoles = [
      context.userRole,
      'employee',
      'manager',
      'admin',
      'cpo',
      'hr',
      'finance',
      'finance_admin',
      'system_admin',
    ].filter(Boolean);

    const session = context.toolSession ?? createToolSession();
    const result = activateTool(toolName, session, userRoles);

    if (!result.success) {
      return {
        success: false,
        data: null,
        summary: result.error ?? 'Failed to activate tool.',
      };
    }

    return {
      success: true,
      data: result.tool,
      summary: `Tool "${toolName}" is now available. You can call it with the appropriate parameters.`,
      metadata: { source: 'tool_registry', count: 1 },
    };
  },
};

registerTool(activateToolDef);
