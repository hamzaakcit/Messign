import type { FinanceView } from '@/stores/financeStore';

/** Valid second segment for `/finance/:section` routes. */
export const FINANCE_SECTIONS: readonly FinanceView[] = [
  'overview',
  'expenses',
  'invoices',
  'budgets',
  'vendors',
  'payments',
  'accounting',
  'reports',
  'settings',
  'audit',
] as const;

/**
 * Returns the location pathname for a finance shell view (`/finance` for overview).
 */
export function financePathForView(view: FinanceView): string {
  if (view === 'overview') return '/finance';
  return `/finance/${view}`;
}

/**
 * Parses `/finance` and `/finance/:section` into a {@link FinanceView}. Unknown segments fall back to overview.
 */
export function parseFinanceViewFromPathname(pathname: string): FinanceView {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'finance') return 'overview';
  const seg = parts[1];
  if (!seg || seg === 'overview') return 'overview';
  if ((FINANCE_SECTIONS as readonly string[]).includes(seg)) {
    return seg as FinanceView;
  }
  return 'overview';
}
