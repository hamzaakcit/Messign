/**
 * Direct intent execution: run preset tools without LLM orchestration or synthesis.
 * Used when POST /ai/answer includes a registered `intent` id (chip clicks).
 */

import { executeTool } from './toolRegistry.js';
import { getPresetCallsForIntentId } from './intentIdPresets.js';
import { getCachedResponse, setCachedResponse, type CachedDirectIntentPayload } from './response-cache.js';
import { resolveWidgetPayloadsForTool, type WidgetPayload } from './widgetResolve.js';
import type { SourceDocument, ToolContext, ToolResult } from './types.js';

/** Cache TTL (seconds) per intent; default 60 */
const INTENT_TTL_SECONDS: Record<string, number> = {
  'knowledge.health': 120,
  'knowledge.stats': 120,
  'quick.open_tasks': 45,
  'finance.revenue_quarter': 90,
  'finance.company_summary': 120,
  'dashboard.metrics': 90,
  'admin.system_overview': 120,
};

function ttlForIntent(intentId: string): number {
  return INTENT_TTL_SECONDS[intentId] ?? 60;
}

function extractSourcesFromResults(toolResults: ToolResult[]): SourceDocument[] {
  const sources: SourceDocument[] = [];
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();

  for (const result of toolResults) {
    if (!result.success || !result.data || !Array.isArray(result.data)) continue;
    for (const item of result.data as Record<string, unknown>[]) {
      if (item.title && item.id && (item.slug != null || item.document_type != null)) {
        const id = String(item.id);
        const titleKey = String(item.title).toLowerCase().trim();
        if (seenIds.has(id)) continue;
        if (seenTitles.has(titleKey)) continue;
        seenIds.add(id);
        seenTitles.add(titleKey);
        sources.push({
          id,
          title: String(item.title),
          slug: item.slug != null ? String(item.slug) : undefined,
          document_type: item.document_type != null ? String(item.document_type) : undefined,
        });
      }
    }
  }
  return sources;
}

function buildWidgets(
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
      const key = `${toolName}:${p.widgetType}`;
      if (emitted.has(key)) continue;
      emitted.add(key);
      widgets.push(p);
    }
  }
  return widgets;
}

/**
 * Returns formatted payload for instant JSON response, or null to fall through to full AI pipeline.
 */
export async function executeDirectIntent(
  intentId: string,
  legacyContext: ToolContext,
): Promise<CachedDirectIntentPayload | null> {
  const trimmed = intentId.trim();
  if (!trimmed) return null;

  const preset = getPresetCallsForIntentId(trimmed);
  if (!preset?.length) return null;

  const orgId = legacyContext.organizationId ?? null;
  const cached = getCachedResponse(trimmed, legacyContext.userId, orgId);
  if (cached) return cached;

  const results: ToolResult[] = await Promise.all(
    preset.map((c) => executeTool(c.name, c.args as Record<string, unknown>, legacyContext)),
  );

  const toolsUsed = preset.map((c) => c.name);
  const anySuccess = results.some((r) => r.success);
  if (!anySuccess) return null;

  const parts: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const name = toolsUsed[i] ?? 'tool';
    if (r.success && r.summary) parts.push(r.summary);
    else if (!r.success && r.summary) parts.push(`*${name}:* ${r.summary}`);
  }
  const text = parts.join('\n\n').trim() || 'Here is what I found.';

  const failures = results.filter((r) => !r.success);
  let finalText = text;
  if (failures.length > 0 && failures.length < results.length) {
    finalText += `\n\n⚠️ Some data sources did not respond; the rest is shown above.`;
  }

  const widgets = buildWidgets(toolsUsed, results, legacyContext.userRole);
  const hasCommandCenterWidget = widgets.some((w) => w.widgetType === 'command_center');
  if (hasCommandCenterWidget) {
    finalText =
      'Here is your live Command Center snapshot — Pulse, Brain, Growth, and Future are in the panels below.';
  }
  const dataPoints = results.filter((r) => r.success && r.data != null).length;
  const sources = extractSourcesFromResults(results);

  const payload: CachedDirectIntentPayload = {
    text: finalText,
    widgets,
    toolsUsed,
    dataPoints,
    ...(sources.length > 0 ? { sources } : {}),
  };

  setCachedResponse(trimmed, legacyContext.userId, payload, orgId, ttlForIntent(trimmed));
  return payload;
}
