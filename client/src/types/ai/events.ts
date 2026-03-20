/** SSE payloads for Dora v2 — must match server StreamController JSON shape. */

export interface ProgressPayload {
  step?: number;
  maxSteps?: number;
  phase?: string;
  tool?: string;
}

export interface WidgetPayload {
  widgets: Array<{ widgetType: string; data: unknown; title: string }>;
}

/** Matches server `pending_action` SSE `data` (token-backed, same as v1 `content`). */
export interface PendingActionPayload {
  token: string;
  actionType: string;
  description: string;
  displayFields: Array<{
    key: string;
    label: string;
    type: string;
    value: unknown;
    editable?: boolean;
    options?: Array<{ label: string; value: string }>;
  }>;
  editableFields: string[];
  expiresAt: string;
  payload: Record<string, unknown>;
  riskLevel?: 'write' | 'irreversible';
}

export interface MetadataPayload {
  toolsUsed: string[];
  dataPoints: number;
  responseTimeMs: number;
  steps: number;
  terminationReason?: string;
  intentId?: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type SSEEvent =
  | { type: 'text'; data: string }
  | { type: 'progress'; data: ProgressPayload }
  | { type: 'widget_data'; data: WidgetPayload }
  | { type: 'pending_action'; data: PendingActionPayload }
  | { type: 'sources'; data: Array<{ id: string; title: string; slug?: string; document_type?: string }> }
  | { type: 'metadata'; data: MetadataPayload }
  | { type: 'error'; data: ErrorPayload }
  | { type: 'done'; data: null };
