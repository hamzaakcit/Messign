/**
 * Aggregates for `analytics:get_approval_queue` tool payloads.
 */

export interface ApprovalQueueItemShape {
  type: string;
  id: string;
  title: string;
  detail: string;
  date: string;
}

export interface ApprovalQueueAggregates {
  total: number;
  byType: { reimbursement: number; document: number; invoice: number };
}

/**
 * Computes per-type counts from pending approval rows.
 */
export function computeApprovalQueueAggregates(
  items: ReadonlyArray<ApprovalQueueItemShape>,
): ApprovalQueueAggregates {
  const byType = { reimbursement: 0, document: 0, invoice: 0 };
  for (const it of items) {
    const t = (it.type || '').toLowerCase();
    if (t === 'reimbursement') byType.reimbursement += 1;
    else if (t === 'document') byType.document += 1;
    else if (t === 'invoice') byType.invoice += 1;
  }
  return { total: items.length, byType };
}

/**
 * Normalizes legacy array payload or `{ items, aggregates }` object.
 */
export function itemsFromApprovalQueueData(data: unknown): {
  items: ApprovalQueueItemShape[];
  aggregates: ApprovalQueueAggregates;
} {
  if (Array.isArray(data)) {
    const items = data as ApprovalQueueItemShape[];
    return { items, aggregates: computeApprovalQueueAggregates(items) };
  }
  if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).items)) {
    const o = data as Record<string, unknown>;
    const items = o.items as ApprovalQueueItemShape[];
    const agg = o.aggregates as ApprovalQueueAggregates | undefined;
    return { items, aggregates: agg ?? computeApprovalQueueAggregates(items) };
  }
  return { items: [], aggregates: computeApprovalQueueAggregates([]) };
}

/**
 * One-line summary for chat surfaces (no markdown bullets).
 */
export function buildShortApprovalQueueSummary(
  _items: ReadonlyArray<ApprovalQueueItemShape>,
  aggregates: ApprovalQueueAggregates,
): string {
  if (aggregates.total === 0) {
    return "No pending approvals — you're all caught up.";
  }
  const { byType } = aggregates;
  const parts: string[] = [];
  if (byType.reimbursement) parts.push(`${byType.reimbursement} reimbursement${byType.reimbursement === 1 ? '' : 's'}`);
  if (byType.document) parts.push(`${byType.document} document${byType.document === 1 ? '' : 's'}`);
  if (byType.invoice) parts.push(`${byType.invoice} invoice${byType.invoice === 1 ? '' : 's'}`);
  const detail = parts.length ? ` (${parts.join(', ')})` : '';
  return `${aggregates.total} pending item${aggregates.total === 1 ? '' : 's'}${detail}.`;
}
