import { resolveWidgetPayloadsForTool, type WidgetPayload } from '../../widgetResolve.js';
import type { ToolResult } from '../../types.js';

export function buildWidgetsFromTrace(
  toolNames: string[],
  results: ToolResult[],
  userRole: string,
): WidgetPayload[] {
  const widgets: WidgetPayload[] = [];
  const emitted = new Set<string>();

  for (let i = 0; i < results.length; i++) {
    const obs = results[i];
    const toolName = toolNames[i] ?? 'unknown';
    if (!obs?.success || !obs.data) continue;
    const payloads = resolveWidgetPayloadsForTool(toolName, obs, userRole);
    for (const p of payloads) {
      if (emitted.has(p.widgetType)) continue;
      emitted.add(p.widgetType);
      widgets.push(p);
    }
  }
  return widgets;
}
