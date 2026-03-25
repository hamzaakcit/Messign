import { resolveWidgetPayloadsForTool, type WidgetPayload } from '../../widgetResolve.js';
import type { ToolResult } from '../../types.js';

export function buildWidgetsFromTrace(
  toolNames: string[],
  results: ToolResult[],
  userRole: string,
): WidgetPayload[] {
  const widgets: WidgetPayload[] = [];
  /** Per-tool + widgetType — multiple tools may legitimately emit `data_table`. */
  const emitted = new Set<string>();

  for (let i = 0; i < results.length; i++) {
    const obs = results[i];
    const toolName = toolNames[i] ?? 'unknown';
    if (!obs?.success || !obs.data) continue;
    const payloads = resolveWidgetPayloadsForTool(toolName, obs, userRole);
    for (const p of payloads) {
      const key = `${toolName}:${p.widgetType}`;
      if (emitted.has(key)) continue;
      emitted.add(key);
      widgets.push(p);
    }
  }
  return widgets;
}
