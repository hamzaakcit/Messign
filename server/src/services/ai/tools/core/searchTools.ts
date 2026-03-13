/**
 * Core: search_tools — Fuzzy search over registered tools
 *
 * Dora uses this to discover tools by capability before loading them.
 * Always loaded so Dora can find and activate deferred tools.
 */

import Fuse from 'fuse.js';
import { registerTool } from '../../toolRegistry.js';
import { toolIndex, buildParameterHints, type ToolMetadata } from '../toolIndex.js';
import type { Tool, ToolContext, ToolResult } from '../../types.js';

let fuse: Fuse<ToolMetadata>;

export function rebuildSearchIndex(): void {
  const entries = Array.from(toolIndex.values());
  fuse = new Fuse(entries, {
    keys: [
      { name: 'name', weight: 0.3 },
      { name: 'summary', weight: 0.35 },
      { name: 'tags', weight: 0.25 },
      { name: 'namespace', weight: 0.1 },
    ],
    threshold: 0.4,
    includeScore: true,
  });
}

export function searchTools(
  query: string,
  userRoles: string[],
  limit = 5,
  namespaceFilter?: string,
): ToolMetadata[] {
  if (!fuse) return [];

  let entries = Array.from(toolIndex.values());
  if (namespaceFilter) {
    entries = entries.filter((t) => t.namespace === namespaceFilter);
  }

  const tempFuse =
    entries.length < toolIndex.size
      ? new Fuse(entries, {
          keys: [
            { name: 'name', weight: 0.3 },
            { name: 'summary', weight: 0.35 },
            { name: 'tags', weight: 0.25 },
            { name: 'namespace', weight: 0.1 },
          ],
          threshold: 0.4,
          includeScore: true,
        })
      : fuse;

  const results = tempFuse.search(query, { limit: limit * 2 });
  return results
    .map((r) => r.item)
    .filter((tool) => {
      const roles = tool.requiredRoles ?? [];
      if (roles.length === 0) return true;
      return roles.some((role) => userRoles.includes(role));
    })
    .slice(0, limit);
}

const searchTool: Tool = {
  name: 'core:search_tools',
  metadata: {
    namespace: 'core',
    name: 'search_tools',
    summary: 'Search available tools by capability. Use before calling unknown tools.',
    tags: ['core', 'search', 'discovery'],
    alwaysLoaded: true,
    parameterHints: buildParameterHints({
      properties: {
        query: { type: 'string' },
        namespace: { type: 'string' },
      },
      required: ['query'],
    }),
    requiredRoles: [],
  },
  category: 'system',
  description: `Search for available tools by capability description.
Use this BEFORE attempting to call any tool you don't see in your current tool list.
Returns tool names, summaries, and parameter hints.
After finding the right tool, call it by name (e.g. crm:get_pipeline_status).`,
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          "Natural language description of what you need to do, e.g. 'create a new expense report' or 'find overdue support tickets'",
      },
      namespace: {
        type: 'string',
        description:
          'Optional: filter by module namespace (crm, support, finance, hr, marketing, knowledge, time, okr, executive, heart)',
      },
    },
    required: ['query'],
  },
  async execute(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const query = String(args.query ?? '').trim();
    const namespace = typeof args.namespace === 'string' ? args.namespace.trim() || undefined : undefined;
    const userRoles = [context.userRole, 'employee', 'manager', 'admin', 'cpo', 'hr', 'finance', 'finance_admin', 'system_admin'].filter(Boolean);

    const matches = searchTools(query, userRoles, 5, namespace);
    const summary =
      matches.length === 0
        ? `No tools found matching "${query}". Try a different description or omit the namespace filter.`
        : `**Tools matching "${query}"**\n\n` +
          matches
            .map(
              (t) =>
                `- **${t.namespace}:${t.name}** — ${t.summary}\n  Params: ${t.parameterHints}`,
            )
            .join('\n\n');

    return {
      success: true,
      data: matches,
      summary,
      metadata: { source: 'tool_index', count: matches.length },
    };
  },
};

registerTool(searchTool);
