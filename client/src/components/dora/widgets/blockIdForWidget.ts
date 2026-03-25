import type { AIWidgetPayload } from '@/types/knowledge-hub/ai';

/**
 * Stable id for widget blocks (invoice preview, leaderboard, etc.).
 * Lives in a .ts file so `blockRegistry.tsx` can stay Fast Refresh–friendly.
 */
export function blockIdForWidget(widget: AIWidgetPayload): string {
  if (widget.id) return widget.id;
  const slug = `${widget.widgetType}-${widget.title}`.replace(/\s+/g, '-').slice(0, 80);
  return slug || widget.widgetType;
}
