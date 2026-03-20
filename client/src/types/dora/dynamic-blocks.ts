import type { AIWidgetType } from '@/types/knowledge-hub/ai';

/**
 * Universal dynamic block host contract for Dora chat widgets.
 *
 * ## Logical JSON envelope (docs / future SSE)
 * Prefer server-normalized payloads only — do not trust raw LLM JSON without validation.
 *
 * ```json
 * {
 *   "schemaVersion": 1,
 *   "blocks": [
 *     {
 *       "id": "blk_01",
 *       "type": "invoice_preview",
 *       "title": "Invoice INV-1042",
 *       "data": {},
 *       "actions": [
 *         { "id": "open", "label": "Open in Finance", "kind": "navigate", "to": "/finance" }
 *       ],
 *       "risk": "none"
 *     }
 *   ]
 * }
 * ```
 *
 * Wire format today: `AIWidgetPayload` (+ optional `schemaVersion`, `id`, `actions`) per `widget_data` SSE event.
 */

export type BlockInteractiveState = 'idle' | 'pending' | 'submitting' | 'error';

export type BlockHostAction =
  | { kind: 'send_message'; text: string; intentId?: string }
  | { kind: 'navigate'; to: string; state?: unknown }
  | { kind: 'approve_action'; token: string; payload: Record<string, unknown> }
  | { kind: 'reject_action'; token: string }
  | { kind: 'open_editor'; entity: string; id: string }
  | { kind: 'export_widget'; widgetType: AIWidgetType; format: 'pdf' };

export interface DoraBlockHost {
  dispatch(action: BlockHostAction): void | Promise<void>;
}

export interface DoraBlockProps<TData = unknown> {
  blockId: string;
  title: string;
  data: TData;
  state?: BlockInteractiveState;
  host: DoraBlockHost;
  /** Declarative affordances the shell may render (toolbar); merged with client registry actions */
  primaryActions?: Array<{ id: string; label: string; action: BlockHostAction }>;
}
