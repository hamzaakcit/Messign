/**
 * Aggregates for finance:get_reimbursement_details (reimbursement claims widget).
 */

export interface ReimbursementAggregates {
  count: number;
  totalAmount: number;
  byStatus: Record<string, number>;
  /** ISO month key YYYY-MM -> count of claims with created_at in that month */
  byMonth: Record<string, number>;
}

/**
 * Computes status counts, total amount, and per-month claim counts from reimbursement rows.
 */
export function computeReimbursementAggregates(rows: Record<string, unknown>[]): ReimbursementAggregates {
  const byStatus: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  let totalAmount = 0;

  for (const r of rows) {
    const st = String(r.status ?? 'unknown');
    byStatus[st] = (byStatus[st] ?? 0) + 1;
    const amt = parseFloat(String(r.amount ?? r.original_amount ?? 0));
    if (Number.isFinite(amt)) totalAmount += amt;
    const raw = r.created_at;
    if (raw == null) continue;
    const d = new Date(raw as string);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byMonth[key] = (byMonth[key] ?? 0) + 1;
  }

  return { count: rows.length, totalAmount, byStatus, byMonth };
}
