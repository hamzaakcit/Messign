const DEFAULT_CRM_CCY = 'EUR';

/**
 * Compact currency for KPIs and charts (e.g. €1.2M, $400K). Defaults to EUR for `amount_eur`-aligned UI.
 */
export function formatCrmCurrencyCompact(amount: number, currency: string = DEFAULT_CRM_CCY): string {
  const abs = Math.abs(amount);
  const sym =
    currency === 'EUR'
      ? '€'
      : currency === 'USD'
        ? '$'
        : currency === 'GBP'
          ? '£'
          : '';
  if (sym) {
    if (abs >= 1_000_000) return `${sym}${(amount / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sym}${(amount / 1_000).toFixed(0)}K`;
    return `${sym}${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
