import { sanitizeData } from '../../dataSanitizer.js';
import { AI_WIDGET_TOOL_MAP } from '../../widgetToolMap.js';
import type { ToolResult } from '../../types.js';

export function buildWidgetsFromTrace(
  toolNames: string[],
  results: ToolResult[],
  userRole: string,
): Array<{ widgetType: string; data: unknown; title: string }> {
  const isAdmin = userRole === 'admin';
  const widgets: Array<{ widgetType: string; data: unknown; title: string }> = [];
  const emitted = new Set<string>();

  for (let i = 0; i < results.length; i++) {
    const obs = results[i];
    const toolName = toolNames[i] ?? 'unknown';
    if (!obs?.success || !obs.data) continue;
    const widgetType = AI_WIDGET_TOOL_MAP[toolName];
    if (!widgetType || emitted.has(widgetType)) continue;
    emitted.add(widgetType);
    widgets.push({
      widgetType,
      data: sanitizeData(obs.data, isAdmin),
      title: obs.summary ?? '',
    });
  }
  return widgets;
}
