import { describe, it, expect } from 'vitest';
import { resolveSalesMetricsPeriodStart } from '../../../modules/crm/dal/deals.js';

describe('resolveSalesMetricsPeriodStart', () => {
  it('returns undefined for default and empty', () => {
    expect(resolveSalesMetricsPeriodStart(undefined)).toBeUndefined();
    expect(resolveSalesMetricsPeriodStart('')).toBeUndefined();
    expect(resolveSalesMetricsPeriodStart('default')).toBeUndefined();
  });

  it('maps month, monthly to first day of current month (ISO date)', () => {
    const r = resolveSalesMetricsPeriodStart('month');
    expect(r).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(resolveSalesMetricsPeriodStart('monthly')).toBe(r);
  });

  it('maps quarter and year to ISO dates', () => {
    expect(resolveSalesMetricsPeriodStart('quarter')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(resolveSalesMetricsPeriodStart('quarterly')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(resolveSalesMetricsPeriodStart('year')).toMatch(/^\d{4}-01-01$/);
    expect(resolveSalesMetricsPeriodStart('yearly')).toMatch(/^\d{4}-01-01$/);
  });

  it('passes through YYYY-MM-DD', () => {
    expect(resolveSalesMetricsPeriodStart('2024-06-15')).toBe('2024-06-15');
  });
});
