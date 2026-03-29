/**
 * Short plain-text summaries for `finance:get_financial_summary`.
 */

/**
 * One-line summary for chat (no markdown).
 */
export function buildShortFinancialSummarySummary(
  reimbursementStats: Record<string, unknown> | null,
  invoiceStats: Record<string, unknown> | null,
  timePeriod: string,
  options: { scope: string; scopeDowngraded: boolean; teamScopeMissing?: boolean; reimbursementsError?: string },
): string {
  const pl = timePeriod.replace(/_/g, ' ');
  let prefix = 'Company';
  if (options.scope === 'my' || options.scopeDowngraded) {
    prefix = 'Your';
  } else if (options.scope === 'team' && !options.teamScopeMissing) {
    prefix = 'Team';
  } else if (options.scope === 'team' && options.teamScopeMissing) {
    prefix = 'Company';
  }

  const parts: string[] = [];
  if (reimbursementStats && !reimbursementStats.error) {
    const total = parseFloat(String(reimbursementStats.total_amount ?? 0));
    const cnt = Number(reimbursementStats.total_count ?? 0);
    parts.push(`${cnt} reimbursement claims (${formatUsd(total)})`);
  }
  if (invoiceStats && (Number(invoiceStats.total ?? 0) > 0 || parseFloat(String(invoiceStats.total_amount ?? 0)) > 0)) {
    const invTotal = parseFloat(String(invoiceStats.total_amount ?? 0));
    const invCnt = Number(invoiceStats.total ?? 0);
    parts.push(`${invCnt} invoices (${formatUsd(invTotal)})`);
  }

  const reErrSuffix = options.reimbursementsError ? ' Reimbursement totals could not be loaded.' : '';
  const tail =
    options.scope === 'team' && options.teamScopeMissing
      ? ' (organization-wide totals — no team context on your profile to filter).'
      : '';
  if (parts.length === 0) {
    return `${prefix} financial summary (${pl}): no reimbursable or invoice activity in this period.${reErrSuffix}${tail}`;
  }
  return `${prefix} financial summary (${pl}): ${parts.join('; ')}.${tail}${reErrSuffix}`;
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? n : 0,
  );
}
