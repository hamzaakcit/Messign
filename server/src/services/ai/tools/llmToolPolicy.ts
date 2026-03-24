/**
 * Policy for which tools may appear in Dora v2 planning, search_tools, and activate_tool.
 * Write / HITL tools are excluded from discovery and planner overrides; domain-curated lists
 * in {@link ../v2/tools/toolSelector.js} may still include specific tools (e.g. brand voice proposal).
 */

import { HITL_MANAGED_TOOL_NAMES } from '../agents/governance.js';
import { WRITE_TOOL_NAMES } from './writeDefinitions.js';

/**
 * Returns true if the tool must not be injected by the planner, returned by search_tools,
 * or activated via core:activate_tool (main Dora assistant).
 *
 * @param toolName — namespaced tool id (e.g. finance:draft_invoice)
 */
export function isDisallowedToolForLlmDiscovery(toolName: string): boolean {
  const n = toolName.trim();
  if (!n) return true;
  if (WRITE_TOOL_NAMES.has(n)) return true;
  if (HITL_MANAGED_TOOL_NAMES.has(n)) return true;
  return false;
}
