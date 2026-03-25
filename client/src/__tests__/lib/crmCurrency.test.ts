import { describe, it, expect } from 'vitest';
import { formatCrmCurrencyCompact } from '@/lib/crmCurrency';

describe('formatCrmCurrencyCompact', () => {
  it('formats EUR with compact suffixes', () => {
    expect(formatCrmCurrencyCompact(1_500_000, 'EUR')).toContain('€');
    expect(formatCrmCurrencyCompact(1_500_000, 'EUR')).toMatch(/1\.5M/);
    expect(formatCrmCurrencyCompact(12_000, 'EUR')).toMatch(/12K/);
  });

  it('defaults to EUR', () => {
    expect(formatCrmCurrencyCompact(5000)).toContain('€');
  });
});
