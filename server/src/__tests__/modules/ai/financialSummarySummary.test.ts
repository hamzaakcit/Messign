import { describe, expect, it } from 'vitest';
import { buildShortFinancialSummarySummary } from '../../../services/ai/tools/financialSummarySummary.js';

describe('buildShortFinancialSummarySummary', () => {
  it('formats company scope without markdown', () => {
    const s = buildShortFinancialSummarySummary(
      { total_count: 2, total_amount: '1500', error: undefined },
      { total: 3, total_amount: '900' },
      'this_month',
      { scope: 'company', scopeDowngraded: false },
    );
    expect(s).toMatch(/Company financial summary \(this month\)/);
    expect(s).not.toContain('**');
  });

  it('handles empty activity', () => {
    const s = buildShortFinancialSummarySummary(null, null, 'this_quarter', { scope: 'my', scopeDowngraded: false });
    expect(s).toContain('no reimbursable');
  });

  it('includes reimbursement and invoice lines when both present', () => {
    const s = buildShortFinancialSummarySummary(
      { total_count: 1, total_amount: '2400' },
      { total: 1, total_amount: '100' },
      'this_month',
      { scope: 'company', scopeDowngraded: false },
    );
    expect(s).toContain('reimbursement claims');
    expect(s).toContain('invoices');
  });

  it('uses Company prefix when team scope lacks team context', () => {
    const s = buildShortFinancialSummarySummary(
      { total_count: 1, total_amount: '100' },
      null,
      'this_month',
      { scope: 'team', scopeDowngraded: false, teamScopeMissing: true },
    );
    expect(s).toMatch(/Company financial summary \(this month\)/);
    expect(s).toContain('organization-wide totals');
  });

  it('appends reimbursement error notice when reimbursements query failed', () => {
    const s = buildShortFinancialSummarySummary(
      null,
      { total: 1, total_amount: '50' },
      'this_month',
      { scope: 'company', scopeDowngraded: false, reimbursementsError: 'connection reset' },
    );
    expect(s).toContain('invoices');
    expect(s).toContain('Reimbursement totals could not be loaded');
  });
});
